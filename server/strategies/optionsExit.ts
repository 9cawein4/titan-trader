import type { TradingConfig } from "@shared/schema";
import type { AlpacaCredentials, AlpacaPosition } from "../alpaca";
import * as alpaca from "../alpaca";
import { storage } from "../storage";
import { hmacSignPayload } from "../secrets";
import { logTradeDecision } from "./optionsDecision";
import { extractUnderlyingFromOcc, isLikelyOptionSymbol, parseOccSymbol } from "./optionsSync";
import { openIronCondor, openWheelCoveredCall, openWheelCsp } from "./optionsAutonomy";

const PROFIT_TAKE_RATIO = 0.5;
const MAX_LOSS_MULT = 2;
const DTE_EXIT_DAYS = 5;

function optionsRollEnabled(): boolean {
  return process.env.TITAN_OPTIONS_ROLL === "true";
}

type OptLeg = {
  symbol: string;
  qty: number;
  avg: number;
  uPnL: number;
  parsed: ReturnType<typeof parseOccSymbol>;
  underlying: string;
};

function toLeg(p: AlpacaPosition): OptLeg | null {
  if (!isLikelyOptionSymbol(p.symbol)) return null;
  const qty = parseFloat(p.qty);
  const u = extractUnderlyingFromOcc(p.symbol);
  if (!u) return null;
  return {
    symbol: p.symbol,
    qty,
    avg: parseFloat(p.avg_entry_price || "0"),
    uPnL: parseFloat(p.unrealized_pl || "0"),
    parsed: parseOccSymbol(p.symbol),
    underlying: u,
  };
}

function calendarDte(expirationYmd: string): number {
  const t = new Date(expirationYmd + "T12:00:00Z").getTime();
  if (!Number.isFinite(t)) return 999;
  return Math.ceil((t - Date.now()) / 86400000);
}

function maxCreditSingle(l: OptLeg): number {
  const c = Math.round(Math.abs(l.qty));
  return Math.abs(l.avg) * 100 * Math.max(1, c);
}

function condorNetCredit(legs: OptLeg[]): number {
  let net = 0;
  for (const l of legs) {
    const c = Math.round(Math.abs(l.qty));
    const v = Math.abs(l.avg) * 100 * Math.max(1, c);
    if (l.qty < 0) net += v;
    else net -= v;
  }
  return Math.max(0, net);
}

function exitReason(
  uPnL: number,
  credit: number,
  dte: number,
): "profit_take" | "max_loss" | "dte" | null {
  if (dte <= DTE_EXIT_DAYS) return "dte";
  if (credit > 0 && uPnL >= PROFIT_TAKE_RATIO * credit) return "profit_take";
  if (credit > 0 && uPnL <= -MAX_LOSS_MULT * credit) return "max_loss";
  return null;
}

async function recordOptionExit(
  mode: string,
  underlying: string,
  strategy: string,
  reason: string,
  ok: boolean,
  orderId?: string,
): Promise<void> {
  const ts = new Date().toISOString();
  await storage.createTrade({
    timestamp: ts,
    symbol: underlying,
    side: "buy",
    orderType: "market",
    qty: 1,
    price: 0,
    status: ok ? "executed" : "rejected",
    strategy,
    reason,
    pnl: null,
    tradingMode: mode,
    tradeType: "option",
    hmacSignature: hmacSignPayload(`${ts}:${underlying}:close:${orderId ?? "none"}`),
  });
}

async function fetchSpot(creds: AlpacaCredentials, underlying: string): Promise<number | null> {
  const bars = await alpaca.getStockBars(creds, underlying, "15Min", 80);
  const closes = bars.map((b) => b.c).filter((n) => Number.isFinite(n));
  const spot = closes.at(-1);
  return spot != null && spot > 1 ? spot : null;
}

async function tryRollAfterDteClose(
  mode: string,
  creds: AlpacaCredentials,
  underlying: string,
  kind: "iron_condor" | "csp" | "cc",
): Promise<void> {
  if (!optionsRollEnabled()) return;
  const spot = await fetchSpot(creds, underlying);
  if (spot == null) {
    await logTradeDecision(mode, "options_skip", underlying, "options_roll", { reason: "no_spot", kind });
    return;
  }
  if (kind === "iron_condor") {
    await openIronCondor(mode, creds, underlying, spot);
    return;
  }
  if (kind === "csp") {
    await openWheelCsp(mode, creds, underlying, spot);
    return;
  }
  const raw = await alpaca.getPositions(creds);
  const stock = raw.find((p) => p.symbol === underlying && p.side !== "short");
  const qty = stock ? Math.abs(parseFloat(stock.qty)) : 0;
  if (qty >= 100) await openWheelCoveredCall(mode, creds, underlying, spot);
  else
    await logTradeDecision(mode, "options_skip", underlying, "options_roll", {
      reason: "insufficient_shares_for_cc",
      qty,
    });
}

export async function manageOptionsExits(
  mode: string,
  creds: AlpacaCredentials,
  _cfg?: TradingConfig,
): Promise<void> {
  void _cfg;
  const raw = await alpaca.getPositions(creds);
  const legs = raw.map(toLeg).filter((x): x is OptLeg => x != null);
  if (!legs.length) return;

  const groups = new Map<string, OptLeg[]>();
  for (const l of legs) {
    const k = `${l.underlying}|${l.parsed.expiration}`;
    const arr = groups.get(k) ?? [];
    arr.push(l);
    groups.set(k, arr);
  }

  for (const group of Array.from(groups.values())) {
    const shorts = group.filter((l) => l.qty < 0);
    const longs = group.filter((l) => l.qty > 0);

    if (shorts.length === 2 && longs.length === 2) {
      const dte = Math.min(...group.map((l) => calendarDte(l.parsed.expiration)));
      const credit = condorNetCredit(group);
      const uPnL = group.reduce((s: number, l: OptLeg) => s + l.uPnL, 0);
      const why = exitReason(uPnL, credit, dte);
      if (!why) continue;
      const pre = {
        kind: "iron_condor" as const,
        dte,
        credit,
        uPnL,
        why,
        legs: group.map((l) => ({ sym: l.symbol, qty: l.qty, avg: l.avg })),
      };
      await logTradeDecision(mode, "options_close", group[0].underlying, "iron_condor", { phase: "pre", ...pre });
      const closeLegs = [
        ...shorts.map((l) => ({ symbol: l.symbol, side: "buy" as const, qty: Math.max(1, Math.round(Math.abs(l.qty))) })),
        ...longs.map((l) => ({ symbol: l.symbol, side: "sell" as const, qty: Math.max(1, Math.round(Math.abs(l.qty))) })),
      ];
      const order = await alpaca.submitMultilegOrder(creds, closeLegs);
      const ok = Boolean(order?.id);
      await logTradeDecision(mode, "options_close", group[0].underlying, "iron_condor", {
        phase: "post",
        ...pre,
        orderId: order?.id ?? null,
        ok,
      });
      await recordOptionExit(mode, group[0].underlying, "iron_condor_exit", `${why} condor close`, ok, order?.id);
      if (ok && why === "dte") await tryRollAfterDteClose(mode, creds, group[0].underlying, "iron_condor");
      continue;
    }

    for (const s of shorts) {
      const dte = calendarDte(s.parsed.expiration);
      const credit = maxCreditSingle(s);
      const why = exitReason(s.uPnL, credit, dte);
      if (!why) continue;
      const pre = { kind: "single_short" as const, symbol: s.symbol, dte, credit, uPnL: s.uPnL, why };
      await logTradeDecision(mode, "options_close", s.underlying, "wheel_short", { phase: "pre", ...pre });
      const qty = Math.max(1, Math.round(Math.abs(s.qty)));
      const order = await alpaca.submitMarketOrder(creds, s.symbol, qty, "buy");
      const ok = Boolean(order?.id);
      await logTradeDecision(mode, "options_close", s.underlying, "wheel_short", {
        phase: "post",
        ...pre,
        orderId: order?.id ?? null,
        ok,
      });
      await recordOptionExit(mode, s.underlying, "wheel_short_exit", `${why} ${s.symbol}`, ok, order?.id);
      if (ok && why === "dte") {
        const rollKind = s.parsed.optionType === "call" ? "cc" : "csp";
        await tryRollAfterDteClose(mode, creds, s.underlying, rollKind);
      }
    }
  }
}
