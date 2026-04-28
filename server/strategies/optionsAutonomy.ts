import type { TradingConfig } from "@shared/schema";
import * as alpaca from "../alpaca";
import type { AlpacaCredentials } from "../alpaca";
import { storage } from "../storage";
import { hmacSignPayload } from "../secrets";
import { logTradeDecision } from "./optionsDecision";

type OptionCandidate = {
  contract: alpaca.AlpacaOptionContract;
  snapshot: alpaca.OptionSnapshot;
  strike: number;
  expiration: string;
  delta: number;
  iv: number;
};

function isoDateDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function hasOpenOptionForUnderlying(
  rows: Awaited<ReturnType<typeof storage.getOptionsPositions>>,
  underlying: string,
): boolean {
  return rows.some((o) => o.status === "open" && o.symbol.startsWith(underlying));
}

function toNumber(value: string | number | undefined | null): number {
  const n = typeof value === "number" ? value : Number(value ?? "NaN");
  return Number.isFinite(n) ? n : NaN;
}

function estimateMid(snap: alpaca.OptionSnapshot): number {
  const ask = snap.latestQuote?.ap;
  const bid = snap.latestQuote?.bp;
  if (ask != null && bid != null && ask >= bid && bid > 0) return (ask + bid) / 2;
  const trade = snap.latestTrade?.p;
  if (trade != null && Number.isFinite(trade) && trade > 0) return trade;
  return 0;
}

function spreadPct(snap: alpaca.OptionSnapshot): number {
  const ask = snap.latestQuote?.ap;
  const bid = snap.latestQuote?.bp;
  if (ask == null || bid == null || ask <= 0 || bid < 0 || ask < bid) return 1;
  const mid = (ask + bid) / 2;
  if (mid <= 0) return 1;
  return (ask - bid) / mid;
}

function candidateLiquid(c: OptionCandidate): boolean {
  const mid = estimateMid(c.snapshot);
  if (mid < 0.08) return false;
  return spreadPct(c.snapshot) <= 0.35;
}

async function updateOptionsStatus(status: "healthy" | "degraded", message: string): Promise<void> {
  await storage.upsertSystemStatus({
    component: "options",
    status,
    lastCheck: new Date().toISOString(),
    message: message.slice(0, 220),
    responseTimeMs: null,
  });
}

async function loadCandidates(
  creds: AlpacaCredentials,
  symbol: string,
  optionType: "call" | "put",
): Promise<OptionCandidate[]> {
  const contracts = await alpaca.getOptionContracts(
    creds,
    symbol,
    optionType,
    isoDateDaysFromNow(7),
    isoDateDaysFromNow(45),
    100,
  );
  if (!contracts.length) return [];
  const symbols = contracts.map((c) => c.symbol).filter(Boolean).slice(0, 80);
  const snapshots = await alpaca.getOptionSnapshots(creds, symbols);
  const out: OptionCandidate[] = [];
  for (const c of contracts) {
    const strike = toNumber(c.strike_price);
    const expiration = c.expiration_date ?? "";
    const snap = snapshots[c.symbol];
    const delta = snap?.greeks?.delta;
    const iv = snap?.impliedVolatility;
    if (!snap || !Number.isFinite(strike) || !expiration || delta == null || iv == null) continue;
    out.push({
      contract: c,
      snapshot: snap,
      strike,
      expiration,
      delta,
      iv,
    });
  }
  return out;
}

function chooseByTargetDelta(cands: OptionCandidate[], targetAbsDelta: number): OptionCandidate | null {
  if (!cands.length) return null;
  const sorted = [...cands].sort(
    (a, b) => Math.abs(Math.abs(a.delta) - targetAbsDelta) - Math.abs(Math.abs(b.delta) - targetAbsDelta),
  );
  return sorted[0] ?? null;
}

async function placeOptionTradeRecord(
  mode: string,
  symbol: string,
  side: "buy" | "sell",
  strategy: string,
  reason: string,
  status: "executed" | "rejected",
  orderId?: string,
): Promise<void> {
  const ts = new Date().toISOString();
  const sig = hmacSignPayload(`${ts}:${symbol}:${side}:${orderId ?? "none"}`);
  await storage.createTrade({
    timestamp: ts,
    symbol,
    side,
    orderType: "market",
    qty: 1,
    price: 0,
    status,
    strategy,
    reason,
    pnl: null,
    tradingMode: mode,
    tradeType: "option",
    hmacSignature: sig,
  });
}

async function optionCooldownActive(mode: string, symbol: string): Promise<boolean> {
  const recent = await storage.getTrades(mode, 200);
  const now = Date.now();
  return recent.some((t) => {
    if ((t.tradeType ?? "equity") !== "option") return false;
    if (t.status !== "executed") return false;
    if (t.symbol !== symbol) return false;
    const age = now - new Date(t.timestamp).getTime();
    return age >= 0 && age < 6 * 3600000;
  });
}

export async function openWheelCsp(mode: string, creds: AlpacaCredentials, symbol: string, spot: number): Promise<boolean> {
  const puts = await loadCandidates(creds, symbol, "put");
  const eligible = puts.filter(
    (p) =>
      p.strike <= spot * 0.99 &&
      p.strike >= spot * 0.85 &&
      p.iv >= 0.12 &&
      p.delta <= -0.12 &&
      p.delta >= -0.38 &&
      candidateLiquid(p),
  );
  const shortPut = chooseByTargetDelta(eligible, 0.25);
  if (!shortPut) return false;

  const premium = estimateMid(shortPut.snapshot);
  if (premium < 0.1) return false;

  await logTradeDecision(mode, "options_open", symbol, "wheel_csp", {
    phase: "pre",
    spot,
    leg: {
      occ: shortPut.contract.symbol,
      strike: shortPut.strike,
      expiration: shortPut.expiration,
      delta: shortPut.delta,
      iv: shortPut.iv,
      mid: premium,
      spreadPct: spreadPct(shortPut.snapshot),
    },
  });

  const order = await alpaca.submitMultilegOrder(creds, [{ symbol: shortPut.contract.symbol, side: "sell", qty: 1 }]);
  await placeOptionTradeRecord(
    mode,
    symbol,
    "sell",
    "wheel_csp",
    order?.id ? `Sold CSP ${shortPut.contract.symbol}` : `CSP rejected ${shortPut.contract.symbol}`,
    order?.id ? "executed" : "rejected",
    order?.id,
  );
  await logTradeDecision(mode, "options_open", symbol, "wheel_csp", {
    phase: "post",
    ok: Boolean(order?.id),
    orderId: order?.id ?? null,
    occ: shortPut.contract.symbol,
  });
  return Boolean(order?.id);
}

export async function openWheelCoveredCall(mode: string, creds: AlpacaCredentials, symbol: string, spot: number): Promise<boolean> {
  const calls = await loadCandidates(creds, symbol, "call");
  const eligible = calls.filter(
    (c) =>
      c.strike >= spot * 1.02 &&
      c.strike <= spot * 1.2 &&
      c.iv >= 0.1 &&
      c.delta >= 0.12 &&
      c.delta <= 0.42 &&
      candidateLiquid(c),
  );
  const shortCall = chooseByTargetDelta(eligible, 0.25);
  if (!shortCall) return false;

  const premium = estimateMid(shortCall.snapshot);
  if (premium < 0.1) return false;

  await logTradeDecision(mode, "options_open", symbol, "wheel_cc", {
    phase: "pre",
    spot,
    leg: {
      occ: shortCall.contract.symbol,
      strike: shortCall.strike,
      expiration: shortCall.expiration,
      delta: shortCall.delta,
      iv: shortCall.iv,
      mid: premium,
      spreadPct: spreadPct(shortCall.snapshot),
    },
  });

  const order = await alpaca.submitMultilegOrder(creds, [{ symbol: shortCall.contract.symbol, side: "sell", qty: 1 }]);
  await placeOptionTradeRecord(
    mode,
    symbol,
    "sell",
    "wheel_cc",
    order?.id ? `Sold CC ${shortCall.contract.symbol}` : `CC rejected ${shortCall.contract.symbol}`,
    order?.id ? "executed" : "rejected",
    order?.id,
  );
  await logTradeDecision(mode, "options_open", symbol, "wheel_cc", {
    phase: "post",
    ok: Boolean(order?.id),
    orderId: order?.id ?? null,
    occ: shortCall.contract.symbol,
  });
  return Boolean(order?.id);
}

export async function openIronCondor(mode: string, creds: AlpacaCredentials, symbol: string, spot: number): Promise<boolean> {
  const puts = await loadCandidates(creds, symbol, "put");
  const calls = await loadCandidates(creds, symbol, "call");

  const shortPut = chooseByTargetDelta(
    puts.filter(
      (p) =>
        p.strike <= spot * 0.99 &&
        p.strike >= spot * 0.85 &&
        p.iv >= 0.14 &&
        p.delta <= -0.12 &&
        p.delta >= -0.33 &&
        candidateLiquid(p),
    ),
    0.2,
  );
  const shortCall = chooseByTargetDelta(
    calls.filter(
      (c) =>
        c.strike >= spot * 1.01 &&
        c.strike <= spot * 1.18 &&
        c.iv >= 0.14 &&
        c.delta >= 0.12 &&
        c.delta <= 0.33 &&
        candidateLiquid(c),
    ),
    0.2,
  );
  if (!shortPut || !shortCall) return false;
  if (shortPut.expiration !== shortCall.expiration) return false;

  const longPut = puts
    .filter((p) => p.expiration === shortPut.expiration && p.strike < shortPut.strike && candidateLiquid(p))
    .sort((a, b) => b.strike - a.strike)[0];
  const longCall = calls
    .filter((c) => c.expiration === shortCall.expiration && c.strike > shortCall.strike && candidateLiquid(c))
    .sort((a, b) => a.strike - b.strike)[0];
  if (!longPut || !longCall) return false;

  const putWidth = shortPut.strike - longPut.strike;
  const callWidth = longCall.strike - shortCall.strike;
  const maxWidth = Math.max(putWidth, callWidth);
  if (!(putWidth >= 1 && callWidth >= 1 && maxWidth <= 15)) return false;

  const estCredit = estimateMid(shortPut.snapshot) + estimateMid(shortCall.snapshot) - estimateMid(longPut.snapshot) - estimateMid(longCall.snapshot);
  if (!(estCredit >= 0.15 && estCredit <= maxWidth * 0.8)) return false;

  await logTradeDecision(mode, "options_open", symbol, "iron_condor", {
    phase: "pre",
    spot,
    putWidth,
    callWidth,
    maxWidth,
    estCredit,
    legs: [
      { side: "short", type: "put", occ: shortPut.contract.symbol, strike: shortPut.strike, mid: estimateMid(shortPut.snapshot) },
      { side: "long", type: "put", occ: longPut.contract.symbol, strike: longPut.strike, mid: estimateMid(longPut.snapshot) },
      { side: "short", type: "call", occ: shortCall.contract.symbol, strike: shortCall.strike, mid: estimateMid(shortCall.snapshot) },
      { side: "long", type: "call", occ: longCall.contract.symbol, strike: longCall.strike, mid: estimateMid(longCall.snapshot) },
    ],
  });

  const order = await alpaca.submitMultilegOrder(creds, [
    { symbol: shortPut.contract.symbol, side: "sell", qty: 1 },
    { symbol: longPut.contract.symbol, side: "buy", qty: 1 },
    { symbol: shortCall.contract.symbol, side: "sell", qty: 1 },
    { symbol: longCall.contract.symbol, side: "buy", qty: 1 },
  ]);
  await placeOptionTradeRecord(
    mode,
    symbol,
    "sell",
    "iron_condor",
    order?.id
      ? `Opened condor ${shortPut.contract.symbol}/${shortCall.contract.symbol}`
      : `Condor rejected ${shortPut.contract.symbol}/${shortCall.contract.symbol}`,
    order?.id ? "executed" : "rejected",
    order?.id,
  );
  await logTradeDecision(mode, "options_open", symbol, "iron_condor", {
    phase: "post",
    ok: Boolean(order?.id),
    orderId: order?.id ?? null,
    shortPut: shortPut.contract.symbol,
    shortCall: shortCall.contract.symbol,
  });
  return Boolean(order?.id);
}

export function optionValidationScore(closes: number[], ensNorm: number, sentScore: number): number {
  if (closes.length < 30) return 0;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && Number.isFinite(cur) && Number.isFinite(prev)) {
      rets.push((cur - prev) / prev);
    }
  }
  if (rets.length < 20) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  const vol = Math.sqrt(Math.max(0, variance));
  const trend = Math.abs((closes[closes.length - 1] - closes[0]) / closes[0]);

  const volScore = vol >= 0.003 && vol <= 0.05 ? 1 : vol < 0.003 ? 0.4 : 0.2;
  const signalScore = Math.min(1, Math.abs(ensNorm));
  const sentimentScore = 1 - Math.min(1, Math.abs(sentScore));
  const trendPenalty = Math.min(1, trend / 0.25);

  const score = 0.35 * volScore + 0.35 * signalScore + 0.2 * sentimentScore + 0.1 * (1 - trendPenalty);
  return Math.max(0, Math.min(1, score));
}
export async function runOptionsAutonomy(
  mode: string,
  cfg: TradingConfig,
  creds: AlpacaCredentials,
  symbol: string,
  closes: number[],
  ensNorm: number,
  sentScore: number,
  canTrade: boolean,
): Promise<void> {
  if (!canTrade) {
    await updateOptionsStatus("degraded", "Options skipped: global risk gate closed");
    await logTradeDecision(mode, "options_skip", symbol, "options_autonomy", { reason: "risk_gate_closed" });
    return;
  }
  const spot = closes.at(-1) ?? 0;
  const validation = optionValidationScore(closes, ensNorm, sentScore);
  if (validation < 0.35) {
    await updateOptionsStatus("degraded", `Options skipped: validation ${validation.toFixed(2)} below threshold`);
    await logTradeDecision(mode, "options_skip", symbol, "options_autonomy", { reason: "validation_below_threshold", validation });
    return;
  }

  if (!(spot > 1)) {
    await updateOptionsStatus("degraded", `Options skipped: invalid spot for ${symbol}`);
    await logTradeDecision(mode, "options_skip", symbol, "options_autonomy", { reason: "invalid_spot", spot });
    return;
  }

  const snap = await storage.getLatestSnapshot(mode);
  const eq = snap?.equity ?? 0;
  if (!(eq > 0)) {
    await updateOptionsStatus("degraded", "Options skipped: no equity snapshot");
    return;
  }

  const positions = await storage.getPositions(mode);
  const options = await storage.getOptionsPositions(mode);
  const optionExposure = options.reduce((sum, o) => sum + Math.abs(o.currentValue ?? 0), 0) / eq;
  if (optionExposure >= (cfg.maxOptionsAllocation ?? 0.4)) {
    await updateOptionsStatus("degraded", `Options skipped: allocation cap hit (${(optionExposure * 100).toFixed(1)}%)`);
    await logTradeDecision(mode, "options_skip", symbol, "options_autonomy", {
      reason: "options_allocation_cap",
      optionExposure,
      cap: cfg.maxOptionsAllocation ?? 0.4,
    });
    return;
  }

  if (hasOpenOptionForUnderlying(options, symbol)) {
    await updateOptionsStatus("healthy", `Options hold: existing open leg for ${symbol}`);
    return;
  }

  if (await optionCooldownActive(mode, symbol)) {
    await updateOptionsStatus("healthy", `Options cooldown active for ${symbol}`);
    await logTradeDecision(mode, "options_skip", symbol, "options_autonomy", { reason: "cooldown_6h" });
    return;
  }

  const underlyingPos = positions.find((p) => p.symbol === symbol);
  const threshold = cfg.ensembleThreshold ?? 0.6;

  if (!underlyingPos && ensNorm > threshold * 0.75 && sentScore > -0.2) {
    const ok = await openWheelCsp(mode, creds, symbol, spot);
    await updateOptionsStatus(ok ? "healthy" : "degraded", ok ? `Opened wheel CSP on ${symbol}` : `Wheel CSP filters failed for ${symbol}`);
    return;
  }

  if ((underlyingPos?.qty ?? 0) >= 100 && ensNorm > -threshold * 0.25 && sentScore > -0.35) {
    const ok = await openWheelCoveredCall(mode, creds, symbol, spot);
    await updateOptionsStatus(ok ? "healthy" : "degraded", ok ? `Opened covered call on ${symbol}` : `Covered call filters failed for ${symbol}`);
    return;
  }

  if (Math.abs(ensNorm) < threshold * 0.45 && Math.abs(sentScore) < 0.2) {
    const ok = await openIronCondor(mode, creds, symbol, spot);
    await updateOptionsStatus(ok ? "healthy" : "degraded", ok ? `Opened iron condor on ${symbol}` : `Iron condor filters failed for ${symbol}`);
    return;
  }

  await updateOptionsStatus("healthy", `Options idle: no setup for ${symbol}`);
}