import type { TradingConfig } from "@shared/schema";
import { storage } from "./storage";
import { decryptSecret, hmacSignPayload } from "./secrets";
import * as alpaca from "./alpaca";
import type { AlpacaCredentials } from "./alpaca";
import {
  rsi,
  zScoreReturn,
  macdHistogram,
  normalizeRsi,
  normalizeZ,
  normalizeMacd,
  normalizeEmaCross,
  scoreToLabel,
} from "./indicators";
import { fetchOllamaSentiment } from "./ollama";
import { log } from "./log";
import { broadcastPortfolio, broadcastTrade } from "./websocket";

import { refreshStrategyPerformance } from "./strategyMetrics";
import { syncOptionPositionsFromBroker } from "./strategies/optionsSync";
import { manageOptionsExits } from "./strategies/optionsExit";
import { logTradeDecision } from "./strategies/optionsDecision";
import { runOptionsAutonomy } from "./strategies/optionsAutonomy";

const CYCLE_MS = Math.max(30_000, parseInt(process.env.TITAN_CYCLE_SECONDS || "90", 10) * 1000);

export type EnginePublicState = {
  running: boolean;
  lastCycleAt: string | null;
  lastCycleMs: number;
  lastError: string | null;
  cyclesCompleted: number;
  peakEquity: number;
};

const state: EnginePublicState = {
  running: false,
  lastCycleAt: null,
  lastCycleMs: 0,
  lastError: null,
  cyclesCompleted: 0,
  peakEquity: 0,
};

let timer: ReturnType<typeof setInterval> | null = null;
let rrIndex = 0;

function getCreds(cfg: TradingConfig): AlpacaCredentials | null {
  const paper = cfg.tradingMode === "paper";
  const ek = paper ? cfg.paperApiKey : cfg.liveApiKey;
  const es = paper ? cfg.paperApiSecret : cfg.liveApiSecret;
  if (!ek || !es) return null;
  const keyId = decryptSecret(ek);
  const secretKey = decryptSecret(es);
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey, paper };
}

async function killSwitchEngaged(): Promise<boolean> {
  const events = await storage.getActiveRiskEvents();
  return events.some((e) => e.eventType === "kill_switch" && e.severity === "halt");
}

async function syncFromBroker(mode: string, creds: AlpacaCredentials): Promise<number> {
  const acct = await alpaca.getAccount(creds);
  if (!acct) return 0;
  const equity = parseFloat(acct.equity);
  const cash = parseFloat(acct.cash);
  const bp = parseFloat(acct.buying_power);
  const lastEq = parseFloat(acct.last_equity || acct.equity);
  const dayPnl = equity - lastEq;
  const portfolioValue = parseFloat(acct.portfolio_value || acct.equity);
  let drawdown = 0;
  if (equity > state.peakEquity) state.peakEquity = equity;
  if (state.peakEquity > 0) drawdown = Math.max(0, (state.peakEquity - equity) / state.peakEquity);

  await storage.createSnapshot({
    timestamp: new Date().toISOString(),
    equity,
    cash,
    buyingPower: bp,
    dayPnl,
    totalPnl: equity - portfolioValue,
    drawdown,
    tradingMode: mode,
  });
  await storage.clearPositions(mode);
  const positions = await alpaca.getPositions(creds);
  for (const pos of positions) {
    await storage.upsertPosition({
      symbol: pos.symbol,
      side: pos.side === "short" ? "short" : "long",
      qty: Math.abs(parseFloat(pos.qty)),
      avgEntryPrice: parseFloat(pos.avg_entry_price),
      currentPrice: parseFloat(pos.current_price),
      marketValue: parseFloat(pos.market_value),
      unrealizedPnl: parseFloat(pos.unrealized_pl),
      unrealizedPnlPct: parseFloat(pos.unrealized_plpc) * 100,
      tradingMode: mode,
    });
  }
  await broadcastPortfolioSnapshot(mode);
  return equity;
}

async function broadcastPortfolioSnapshot(mode: string): Promise<void> {
  const snap = await storage.getLatestSnapshot(mode);
  if (snap) broadcastPortfolio(snap);
}

function strategyScore(name: string, closes: number[]): number {
  const lower = name.toLowerCase();
  if (lower.includes("bollinger")) return normalizeRsi(rsi(closes));
  if (lower.includes("z-score")) return normalizeZ(zScoreReturn(closes));
  if (lower.includes("ema")) return normalizeEmaCross(closes);
  if (lower.includes("macd")) return normalizeMacd(macdHistogram(closes));
  return 0;
}


async function updateBrokerStatus(ok: boolean, ms: number): Promise<void> {
  await storage.upsertSystemStatus({
    component: "broker",
    status: ok ? "healthy" : "degraded",
    lastCheck: new Date().toISOString(),
    message: ok ? "Alpaca API reachable" : "Alpaca API error",
    responseTimeMs: ms,
  });
}

async function updateOllamaStatus(ok: boolean, ms: number, msg: string): Promise<void> {
  await storage.upsertSystemStatus({
    component: "ollama",
    status: ok ? "healthy" : "degraded",
    lastCheck: new Date().toISOString(),
    message: msg.slice(0, 200),
    responseTimeMs: ms,
  });
}

async function updateOrchestrator(msg: string, ms: number): Promise<void> {
  await storage.upsertSystemStatus({
    component: "orchestrator",
    status: state.running ? "healthy" : "degraded",
    lastCheck: new Date().toISOString(),
    message: msg.slice(0, 240),
    responseTimeMs: ms,
  });
}

async function updateDatabaseStatus(): Promise<void> {
  await storage.upsertSystemStatus({
    component: "database",
    status: "healthy",
    lastCheck: new Date().toISOString(),
    message: "SQLite WAL",
    responseTimeMs: 1,
  });
}


async function weeklyEquityDropBreach(mode: string, cfg: TradingConfig): Promise<boolean> {
  const snaps = await storage.getSnapshots(mode, 400);
  if (snaps.length < 2) return false;
  const now = Date.now();
  const cutoff = now - 7 * 86400000;
  let refEq: number | null = null;
  for (let i = snaps.length - 1; i >= 0; i--) {
    const t = new Date(snaps[i].timestamp).getTime();
    if (t <= cutoff) {
      refEq = snaps[i].equity;
      break;
    }
  }
  if (refEq == null || refEq <= 0) return false;
  const latest = snaps[0]?.equity ?? refEq;
  const chg = (latest - refEq) / refEq;
  return chg < -(cfg.weeklyLossLimit ?? 0.07);
}

async function syncRiskEvent(
  eventType: "daily_limit" | "weekly_limit" | "drawdown" | "position_limit",
  breached: boolean,
  severity: "warning" | "critical" | "halt",
  message: string,
  currentValue: number,
  threshold: number,
): Promise<void> {
  const active = await storage.getActiveRiskEvents();
  const existing = active.find((e) => e.eventType === eventType);
  if (breached && !existing) {
    await storage.createRiskEvent({
      timestamp: new Date().toISOString(),
      eventType,
      severity,
      message,
      currentValue,
      threshold,
      resolved: 0,
    });
    return;
  }
  if (!breached && existing) {
    await storage.resolveRiskEvent(existing.id);
  }
}
async function processCycle(): Promise<void> {
  const t0 = Date.now();
  try {
    const cfg = await storage.getTradingConfig();
    if (!cfg) return;
    const mode = cfg.tradingMode === "live" ? "live" : "paper";
    const creds = getCreds(cfg);
    if (!creds) {
      state.lastError = "Configure Alpaca API keys in Settings";
      await updateOrchestrator(state.lastError, Date.now() - t0);
      return;
    }

    const tBroker = Date.now();
    const equity = await syncFromBroker(mode, creds);
    await updateBrokerStatus(equity > 0, Date.now() - tBroker);
    await updateDatabaseStatus();

    try {
      await syncOptionPositionsFromBroker(mode, creds);
    } catch (e) {
      log(`options sync: ${e instanceof Error ? e.message : String(e)}`, "engine");
    }

    try {
      await manageOptionsExits(mode, creds, cfg);
    } catch (e) {
      log(`options exits: ${e instanceof Error ? e.message : String(e)}`, "engine");
    }

    if (await killSwitchEngaged()) {
      await updateOrchestrator("Kill switch active - skipping signals", Date.now() - t0);
      state.lastCycleAt = new Date().toISOString();
      state.lastCycleMs = Date.now() - t0;
      state.cyclesCompleted++;
      return;
    }

    const cfgLimits = cfg;
    const snap = await storage.getLatestSnapshot(mode);
    const eq = snap?.equity ?? equity;
    const dayLossPct = snap?.dayPnl != null && snap.dayPnl < 0 && eq > 0 ? -snap.dayPnl / eq : 0;
    const dayBreach = dayLossPct > (cfgLimits.dailyLossLimit ?? 0.03);
    const weekBreach = await weeklyEquityDropBreach(mode, cfgLimits);
    const ddBreach = (snap?.drawdown ?? 0) > (cfgLimits.maxDrawdown ?? 0.15);

    const symbols = (cfg.watchlist ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (symbols.length === 0) return;

    rrIndex = rrIndex % symbols.length;
    const symbol = symbols[rrIndex]!;
    rrIndex++;

    const bars = await alpaca.getStockBars(creds, symbol, "15Min", 80);
    const closes = bars.map((b) => b.c).filter((n) => Number.isFinite(n));
    const strats = await storage.getStrategies();

    if (closes.length >= 10) {
      for (const s of strats) {
        if (!s.enabled) continue;
        const raw = strategyScore(s.name, closes);
        await storage.updateStrategy(s.id, {
          lastSignal: scoreToLabel(raw),
          lastSignalTime: new Date().toISOString(),
          confidence: Math.min(1, Math.abs(raw)),
        });
      }
    }

    let ensemble = 0;
    let wsum = 0;
    const enabled = strats.filter((s) => s.enabled);
    for (const s of enabled) {
      const raw = strategyScore(s.name, closes);
      ensemble += (s.weight ?? 0) * raw;
      wsum += s.weight ?? 0;
    }
    const ensNorm = wsum > 0 ? ensemble / wsum : 0;
    const threshold = cfg.ensembleThreshold ?? 0.6;

    const oStart = Date.now();
    const sent = await fetchOllamaSentiment(cfg.ollamaUrl ?? "http://localhost:11434", cfg.ollamaModel ?? "llama3.2", symbol);
    await updateOllamaStatus(true, Date.now() - oStart, sent.summary || "ok");
    await storage.createSentimentEntry({
      timestamp: new Date().toISOString(),
      symbol,
      sentiment: sent.score > 0.15 ? "bullish" : sent.score < -0.15 ? "bearish" : "neutral",
      score: sent.score,
      source: "ollama",
      summary: sent.summary,
    });

    const positions = await storage.getPositions(mode);
    const pos = positions.find((p) => p.symbol === symbol);
    const exposure =
      eq > 0 ? positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0) / eq : 0;

    const overExpose = exposure > (cfg.maxPortfolioExposure ?? 0.6);
    const posPct = eq > 0 && pos ? (pos.marketValue ?? 0) / eq : 0;
    const overPos = posPct > 0.1;

    await syncRiskEvent(
      "daily_limit",
      dayBreach,
      "halt",
      `Daily loss limit breached (${(dayLossPct * 100).toFixed(2)}%)`,
      dayLossPct,
      cfgLimits.dailyLossLimit ?? 0.03,
    );
    await syncRiskEvent(
      "weekly_limit",
      weekBreach,
      "halt",
      "Weekly rolling equity drop breached",
      snap?.drawdown ?? 0,
      cfgLimits.weeklyLossLimit ?? 0.07,
    );
    await syncRiskEvent(
      "drawdown",
      ddBreach,
      "halt",
      `Max drawdown breached (${((snap?.drawdown ?? 0) * 100).toFixed(2)}%)`,
      snap?.drawdown ?? 0,
      cfgLimits.maxDrawdown ?? 0.15,
    );
    await syncRiskEvent(
      "position_limit",
      overExpose,
      "critical",
      `Portfolio exposure too high (${(exposure * 100).toFixed(2)}%)`,
      exposure,
      cfg.maxPortfolioExposure ?? 0.6,
    );

    const canTrade = state.running && !overExpose && !dayBreach && !weekBreach && !ddBreach;


    await runOptionsAutonomy(
      mode,
      cfg,
      creds,
      symbol,
      closes,
      ensNorm,
      sent.score,
      canTrade,
    );

    if (canTrade && ensNorm > threshold && sent.score > -0.35 && !pos && !overPos) {
      const riskCash = eq * (cfg.maxRiskPerTrade ?? 0.02);
      const price = closes.at(-1) ?? 0;
      let qty = price > 0 ? Math.floor(riskCash / price) : 0;
      if (qty < 1 && riskCash >= price * 0.99) qty = 1;

      if (qty >= 1 && price > 1) {
        await logTradeDecision(mode, "equity_signal", symbol, "ensemble", {
          phase: "pre",
          side: "buy",
          ensNorm,
          sentiment: sent.score,
          threshold,
          qty,
          price,
        });
        const order = await alpaca.submitMarketOrder(creds, symbol, qty, "buy");
        const ts = new Date().toISOString();
        const sig = hmacSignPayload(`${ts}:${symbol}:buy:${order?.id}`);
        await storage.createTrade({
          timestamp: ts,
          symbol,
          side: "buy",
          orderType: "market",
          qty,
          price,
          status: order?.id ? "executed" : "rejected",
          strategy: "ensemble",
          reason: order?.id ? null : "order rejected",
          pnl: null,
          tradingMode: mode,
          tradeType: "equity",
          hmacSignature: sig,
        });
        if (order?.id) broadcastTrade({ symbol, side: "buy", qty });
        await logTradeDecision(mode, "equity_signal", symbol, "ensemble", {
          phase: "post",
          side: "buy",
          ok: Boolean(order?.id),
          orderId: order?.id ?? null,
          qty,
        });
      }
    } else if (canTrade && ensNorm < -threshold && sent.score < 0.25 && pos && pos.qty > 0) {
      await logTradeDecision(mode, "equity_signal", symbol, "ensemble", {
        phase: "pre",
        side: "sell",
        ensNorm,
        sentiment: sent.score,
        threshold,
        qty: pos.qty,
        price: closes.at(-1) ?? 0,
      });
      const order = await alpaca.submitMarketOrder(creds, symbol, pos.qty, "sell");
      const ts = new Date().toISOString();
      const sig = hmacSignPayload(`${ts}:${symbol}:sell:${order?.id}`);
      await storage.createTrade({
        timestamp: ts,
        symbol,
        side: "sell",
        orderType: "market",
        qty: pos.qty,
        price: closes.at(-1) ?? 0,
        status: order?.id ? "executed" : "rejected",
        strategy: "ensemble",
        reason: order?.id ? null : "order rejected",
        pnl: null,
        tradingMode: mode,
        tradeType: "equity",
        hmacSignature: sig,
      });
      if (order?.id) broadcastTrade({ symbol, side: "sell", qty: pos.qty });
      await logTradeDecision(mode, "equity_signal", symbol, "ensemble", {
        phase: "post",
        side: "sell",
        ok: Boolean(order?.id),
        orderId: order?.id ?? null,
        qty: pos.qty,
      });
    }

    await syncFromBroker(mode, creds);
    try {
      await refreshStrategyPerformance(storage, mode);
    } catch {
      /* ignore metrics refresh errors */
    }
    await updateOrchestrator(
      `Cycle OK - ${symbol} ensemble ${ensNorm.toFixed(2)} / ${threshold}`,
      Date.now() - t0,
    );

    state.lastError = null;
    state.lastCycleAt = new Date().toISOString();
    state.lastCycleMs = Date.now() - t0;
    state.cyclesCompleted++;
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    log(state.lastError, "engine");
    await updateOrchestrator(state.lastError, Date.now() - t0);
  }
}


export function getEngineState(): EnginePublicState {
  return { ...state };
}

export function getPrometheusText(): string {
  const lines = [
    "# HELP titan_engine_running 1 if loop accepts trading",
    "# TYPE titan_engine_running gauge",
    `titan_engine_running ${state.running ? 1 : 0}`,
    "# HELP titan_cycles_total completed cycles",
    "# TYPE titan_cycles_total counter",
    `titan_cycles_total ${state.cyclesCompleted}`,
    "# HELP titan_last_cycle_ms duration",
    "# TYPE titan_last_cycle_ms gauge",
    `titan_last_cycle_ms ${state.lastCycleMs}`,
  ];
  return lines.join("\n") + "\n";
}

const startedAt = Date.now();

export function getEngineUptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}

export async function cancelAllOrdersForCurrentMode(): Promise<boolean> {
  const cfg = await storage.getTradingConfig();
  if (!cfg) return false;
  const creds = getCreds(cfg);
  if (!creds) return false;
  return alpaca.cancelAllOrders(creds);
}

export function startEngine(): void {
  if (timer) return;
  state.running = true;
  timer = setInterval(() => {
    void processCycle();
  }, CYCLE_MS);
  void processCycle();
  log(`Trading engine started - cycle ${CYCLE_MS / 1000}s`, "engine");
}

export function stopEngine(): void {
  state.running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  log("Trading engine stopped", "engine");
}









