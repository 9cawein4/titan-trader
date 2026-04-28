/** Minimal Alpaca Trading API v2 + Data API client (fetch). */

export type AlpacaCredentials = { keyId: string; secretKey: string; paper: boolean };

function baseTradeUrl(paper: boolean): string {
  return paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
}

const DATA_URL = "https://data.alpaca.markets";

export type AlpacaAccount = {
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  last_equity?: string;
};

export type AlpacaPosition = {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
};

export type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number };

async function tradeJson<T>(
  creds: AlpacaCredentials,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: T }> {
  const url = `${baseTradeUrl(creds.paper)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": creds.keyId,
      "APCA-API-SECRET-KEY": creds.secretKey,
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data };
}

async function dataJson<T>(creds: AlpacaCredentials, path: string): Promise<{ ok: boolean; data?: T }> {
  const url = `${DATA_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": creds.keyId,
      "APCA-API-SECRET-KEY": creds.secretKey,
    },
  });
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, data };
}

export async function getAccount(creds: AlpacaCredentials): Promise<AlpacaAccount | null> {
  const r = await tradeJson<AlpacaAccount>(creds, "/v2/account");
  return r.ok && r.data ? r.data : null;
}

export async function getPositions(creds: AlpacaCredentials): Promise<AlpacaPosition[]> {
  const r = await tradeJson<AlpacaPosition[]>(creds, "/v2/positions");
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data;
}

export async function cancelAllOrders(creds: AlpacaCredentials): Promise<boolean> {
  const r = await tradeJson(creds, "/v2/orders", { method: "DELETE" });
  return r.ok || r.status === 207;
}

export async function getStockBars(
  creds: AlpacaCredentials,
  symbol: string,
  timeframe: "15Min" | "1Hour" | "1Day",
  limit = 80,
): Promise<AlpacaBar[]> {
  const sym = encodeURIComponent(symbol);
  const path = `/v2/stocks/${sym}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw&feed=iex`;
  const r = await dataJson<{ bars?: Record<string, AlpacaBar[]> }>(creds, path);
  if (!r.ok || !r.data?.bars) return [];
  const bars = r.data.bars[symbol];
  return Array.isArray(bars) ? bars : [];
}

export async function submitMarketOrder(
  creds: AlpacaCredentials,
  symbol: string,
  qty: number,
  side: "buy" | "sell",
): Promise<{ id?: string; status?: string } | null> {
  const body = {
    symbol,
    qty: String(Math.max(0.0001, Math.round(qty * 10000) / 10000)),
    side,
    type: "market",
    time_in_force: "day",
  };
  const r = await tradeJson<{ id: string; status: string }>(creds, "/v2/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.ok ? (r.data ?? null) : null;
}

export type MlegLeg = { symbol: string; side: "buy" | "sell"; qty: number };

/** Multi-leg options (options-enabled Alpaca accounts). */
export async function submitMultilegOrder(
  creds: AlpacaCredentials,
  legs: MlegLeg[],
): Promise<{ id?: string; status?: string } | null> {
  if (!legs.length) return null;
  const body = {
    order_class: "mleg",
    qty: "1",
    type: "market",
    time_in_force: "day",
    legs: legs.map((l) => ({
      symbol: l.symbol,
      side: l.side,
      qty: String(Math.max(1, Math.round(l.qty))),
    })),
  };
  const r = await tradeJson<{ id: string; status: string }>(creds, "/v2/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.ok ? (r.data ?? null) : null;
}


export type OptionGreeks = { delta?: number; gamma?: number; theta?: number; vega?: number };
export type OptionSnapshot = {
  impliedVolatility?: number;
  greeks?: OptionGreeks;
  latestQuote?: { ap?: number; bp?: number; as?: number; bs?: number };
  latestTrade?: { p?: number };
};

/** Latest option contract snapshots (indicative feed; use OPRA if entitled). Max 100 symbols per request. */
export async function getOptionSnapshots(
  creds: AlpacaCredentials,
  symbols: string[],
): Promise<Record<string, OptionSnapshot>> {
  const uniq = [...Array.from(new Set(symbols.filter(Boolean)))].slice(0, 100);
  if (!uniq.length) return {};
  const q = encodeURIComponent(uniq.join(","));
  const r = await dataJson<{ snapshots?: Record<string, OptionSnapshot> }>(
    creds,
    "/v1beta1/options/snapshots?symbols=" + q + "&feed=indicative",
  );
  return r.ok && r.data?.snapshots ? r.data.snapshots : {};
}


