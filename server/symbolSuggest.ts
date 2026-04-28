import { storage } from "./storage";
import { credsFromTradingConfig } from "./brokerCreds";
import * as alpaca from "./alpaca";
import { log } from "./log";

let cache: { fetchedAt: number; entries: { symbol: string; name: string }[] } | null = null;
const TTL_MS = 45 * 60 * 1000;

export async function getEquitySymbolUniverse(): Promise<
  | { ok: true; entries: { symbol: string; name: string }[] }
  | { ok: false; error: string }
> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return { ok: true, entries: cache.entries };
  }
  const cfg = await storage.getTradingConfig();
  const credsR = credsFromTradingConfig(cfg);
  if (!credsR.ok) {
    return { ok: false, error: credsR.error };
  }
  try {
    const rows = await alpaca.fetchTradableUsEquityAssets(credsR.creds);
    const entries = rows.map((r) => ({ symbol: r.symbol, name: r.name }));
    cache = { fetchedAt: Date.now(), entries };
    return { ok: true, entries };
  } catch (e) {
    log(`symbol universe fetch: ${e instanceof Error ? e.message : String(e)}`, "express");
    return { ok: false, error: "Could not load symbol list from Alpaca" };
  }
}

export function filterSymbolSuggestions(
  entries: { symbol: string; name: string }[],
  q: string,
  limit: number,
): { symbol: string; name: string }[] {
  const raw = q.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  type Scored = { symbol: string; name: string; score: number };
  const scored: Scored[] = [];

  for (const it of entries) {
    const sym = it.symbol;
    const nu = sym.toUpperCase();
    const nn = it.name.toLowerCase();
    let score = -1;
    if (nu === upper) score = 0;
    else if (nu.startsWith(upper)) score = 10 + nu.length;
    else if (nu.includes(upper)) score = 1000 + nu.length;
    else if (lower.length >= 2 && nn.includes(lower)) score = 2000;
    if (score < 0) continue;
    scored.push({ ...it, score });
  }

  scored.sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol));
  return scored.slice(0, limit).map(({ symbol, name }) => ({ symbol, name }));
}

export function invalidateSymbolUniverseCache(): void {
  cache = null;
}

