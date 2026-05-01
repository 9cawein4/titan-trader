/**
 * Walk-forward: optionValidationScore over rolling windows (no live orders).
 * Usage: npx tsx script/walkforward.ts [SYMBOL]
 */
import { getStockBars } from "../server/alpaca";
import { decryptSecret } from "../server/secrets";
import { resolveAlpacaTradingBaseUrl, type AlpacaCredentials } from "../server/alpaca";
import { storage } from "../server/storage";
import { resolveDbPath } from "../server/paths";
import {
  rsi,
  zScoreReturn,
  macdHistogram,
  normalizeRsi,
  normalizeZ,
  normalizeMacd,
  normalizeEmaCross,
} from "../server/indicators";
import { optionValidationScore } from "../server/strategies/optionsAutonomy";
import "dotenv/config";

function credsFromEnv(): AlpacaCredentials | null {
  const k = process.env.TITAN_PAPER_KEY;
  const s = process.env.TITAN_PAPER_SECRET;
  if (k && s)
    return {
      keyId: k,
      secretKey: s,
      paper: true,
      tradingBaseUrl: resolveAlpacaTradingBaseUrl(process.env.TITAN_ALPACA_TRADING_BASE_URL, true),
    };
  return null;
}

function ensembleNorm(closes: number[]): number {
  const rz = normalizeZ(zScoreReturn(closes));
  const rr = normalizeRsi(rsi(closes));
  const mn = normalizeMacd(macdHistogram(closes));
  const em = normalizeEmaCross(closes);
  return (rz + rr + mn + em) / 4;
}

async function main() {
  const sym = process.argv[2] || "AAPL";
  let creds = credsFromEnv();
  if (!creds) {
    const cfg = await storage.getTradingConfig();
    if (cfg?.paperApiKey && cfg?.paperApiSecret) {
      const keyId = decryptSecret(cfg.paperApiKey);
      const secretKey = decryptSecret(cfg.paperApiSecret);
      if (keyId && secretKey)
        creds = {
          keyId,
          secretKey,
          paper: true,
          tradingBaseUrl: resolveAlpacaTradingBaseUrl(cfg.paperTradingApiBaseUrl ?? undefined, true),
        };
    }
  }
  if (!creds) {
    console.error("Set TITAN_PAPER_KEY/SECRET or paper keys in Settings. DB:", resolveDbPath());
    process.exit(1);
  }
  const bars = await getStockBars(creds, sym, "15Min", 200);
  const closes = bars.map((b) => b.c).filter((n) => Number.isFinite(n));
  if (closes.length < 45) {
    console.error("Need at least 45 closes, got", closes.length);
    process.exit(1);
  }
  const window = 40;
  let pass = 0;
  let n = 0;
  for (let i = window; i < closes.length; i++) {
    const w = closes.slice(i - window, i + 1);
    const ens = ensembleNorm(w);
    const v = optionValidationScore(w, ens, 0);
    n++;
    if (v >= 0.35) pass++;
  }
  console.log(
    JSON.stringify(
      {
        symbol: sym,
        bars: closes.length,
        window,
        threshold: 0.35,
        passRate: n ? pass / n : 0,
        samples: n,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
