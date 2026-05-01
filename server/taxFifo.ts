import type { Trade } from "@shared/schema";

const LT_HOLD_MS = 365 * 86400000;

type Lot = { qty: number; costBasisTotal: number; buyTs: number };

/** FIFO cost basis for long equity lots; classifies short-term vs long-term when selling. */
export function computeEquityRealizedForYear(trades: Trade[], taxYear: number): {
  shortTermNet: number;
  longTermNet: number;
  sellMatches: number;
  equityRowsInYear: number;
} {
  const yStart = Date.UTC(taxYear, 0, 1);
  const yEnd = Date.UTC(taxYear + 1, 0, 1);

  const equityTrades = trades
    .filter((t) => t.status === "executed" && (t.tradeType === "equity" || t.tradeType == null))
    .filter((t) => {
      const ts = new Date(t.timestamp).getTime();
      return ts >= yStart && ts < yEnd;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const lotsBySymbol = new Map<string, Lot[]>();
  let shortTermNet = 0;
  let longTermNet = 0;
  let sellMatches = 0;

  for (const t of equityTrades) {
    const sym = t.symbol.trim().toUpperCase();
    const qty = Math.abs(Number(t.qty));
    const price = Number(t.price);
    const ts = new Date(t.timestamp).getTime();
    if (!(qty > 0) || !Number.isFinite(price) || price < 0) continue;

    if (t.side === "buy") {
      const lots = lotsBySymbol.get(sym) ?? [];
      lots.push({ qty, costBasisTotal: qty * price, buyTs: ts });
      lotsBySymbol.set(sym, lots);
      continue;
    }

    if (t.side !== "sell") continue;

    let remaining = qty;
    const lots = lotsBySymbol.get(sym) ?? [];
    while (remaining > 1e-9 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(remaining, lot.qty);
      const costPortion = lot.costBasisTotal * (take / lot.qty);
      const proceeds = take * price;
      const gain = proceeds - costPortion;
      const holdingMs = ts - lot.buyTs;
      const isLT = holdingMs >= LT_HOLD_MS;
      if (isLT) longTermNet += gain;
      else shortTermNet += gain;
      sellMatches += 1;

      lot.qty -= take;
      lot.costBasisTotal -= costPortion;
      remaining -= take;
      if (lot.qty <= 1e-9) lots.shift();
    }
    lotsBySymbol.set(sym, lots);
  }

  return {
    shortTermNet,
    longTermNet,
    sellMatches,
    equityRowsInYear: equityTrades.length,
  };
}

export function estimateTaxLiabilityUsd(params: {
  shortTermNet: number;
  longTermNet: number;
  federalMarginalRate: number;
  longTermFedRate: number;
  stateShortTermRate: number;
  stateLongTermRate: number;
}): {
  estimatedFederal: number;
  estimatedState: number;
  federalOnShortTerm: number;
  federalOnLongTerm: number;
  stateOnShortTerm: number;
  stateOnLongTerm: number;
} {
  const { shortTermNet, longTermNet, federalMarginalRate, longTermFedRate, stateShortTermRate, stateLongTermRate } =
    params;
  const stPos = Math.max(0, shortTermNet);
  const ltPos = Math.max(0, longTermNet);
  const federalOnShortTerm = stPos * federalMarginalRate;
  const federalOnLongTerm = ltPos * longTermFedRate;
  const estimatedFederal = federalOnShortTerm + federalOnLongTerm;
  const stateOnShortTerm = stPos * stateShortTermRate;
  const stateOnLongTerm = ltPos * stateLongTermRate;
  const estimatedState = stateOnShortTerm + stateOnLongTerm;
  return {
    estimatedFederal,
    estimatedState,
    federalOnShortTerm,
    federalOnLongTerm,
    stateOnShortTerm,
    stateOnLongTerm,
  };
}

export const TAX_DISCLAIMER =
  "Educational estimate only, not tax advice. FIFO on logged equity sells (calendar-year); federal ST/LT and state ST/LT use your Settings rates and residency defaults. Excludes wash sales, NIIT, AMT, municipal bonds, options, crypto specifics, and multi-state apportionment. Align amounts with IRS Form 8949 / Schedule D and your state instructions or a tax professional.";

