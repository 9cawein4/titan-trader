import type { AlpacaCredentials } from "../alpaca";
import * as alpaca from "../alpaca";
import { storage } from "../storage";
import { describeWheelPlaceholder } from "./wheel";
import { describeIronCondorPlaceholder } from "./ironCondor";

export function isLikelyOptionSymbol(symbol: string): boolean {
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol);
}

/** Root ticker before the OCC date segment (e.g. AAPL from AAPL240119C00150000). */
export function extractUnderlyingFromOcc(symbol: string): string | null {
  const idx = symbol.search(/\d{6}[CP]/);
  if (idx <= 0) return null;
  const root = symbol.slice(0, idx);
  return root.length > 0 ? root : null;
}

export function parseOccSymbol(symbol: string): { strike: number; expiration: string; optionType: "call" | "put" } {
  const idx = symbol.search(/\d{6}[CP]/);
  if (idx <= 0) return { strike: 0, expiration: "unknown", optionType: "put" };
  const datePart = symbol.slice(idx, idx + 6);
  const cp = symbol.charAt(idx + 6);
  const strikePad = symbol.slice(idx + 7);
  const yy = datePart.slice(0, 2);
  const mm = datePart.slice(2, 4);
  const dd = datePart.slice(4, 6);
  const expiration = `20${yy}-${mm}-${dd}`;
  const strike = Number(strikePad || "0") / 1000;
  const optionType = cp === "C" ? "call" : "put";
  return { strike, expiration, optionType };
}

export async function syncOptionPositionsFromBroker(mode: string, creds: AlpacaCredentials): Promise<void> {
  await storage.clearOptionsPositions(mode);
  const positions = await alpaca.getPositions(creds);
  const occSyms = positions.filter((p) => isLikelyOptionSymbol(p.symbol)).map((p) => p.symbol);
  let snaps: Record<string, alpaca.OptionSnapshot> = {};
  if (occSyms.length) {
    try {
      snaps = await alpaca.getOptionSnapshots(creds, occSyms);
    } catch {
      snaps = {};
    }
  }
  for (const pos of positions) {
    if (!isLikelyOptionSymbol(pos.symbol)) continue;
    const q = parseOccSymbol(pos.symbol);
    const qty = Math.abs(parseFloat(pos.qty));
    const short = parseFloat(pos.qty) < 0;
    const snap = snaps[pos.symbol];
    const g = snap?.greeks;
    await storage.createOptionsPosition({
      symbol: pos.symbol,
      optionType: q.optionType,
      strike: q.strike,
      expiration: q.expiration,
      contracts: Math.max(1, Math.round(qty)),
      premium: parseFloat(pos.avg_entry_price || "0"),
      currentValue: parseFloat(pos.market_value || "0"),
      strategy: short ? "iron_condor" : "wheel_csp",
      status: "open",
      delta: g?.delta ?? null,
      gamma: g?.gamma ?? null,
      theta: g?.theta ?? null,
      vega: g?.vega ?? null,
      tradingMode: mode,
    });
  }
  const msg = (describeWheelPlaceholder() + " " + describeIronCondorPlaceholder()).slice(0, 220);
  await storage.upsertSystemStatus({
    component: "options",
    status: "healthy",
    lastCheck: new Date().toISOString(),
    message: msg,
    responseTimeMs: null,
  });
}
