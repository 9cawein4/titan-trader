import { storage } from "../server/storage";
import { getStockBars } from "../server/alpaca";
import { decryptSecret } from "../server/secrets";
import { resolveAlpacaTradingBaseUrl, type AlpacaCredentials } from "../server/alpaca";
import { resolveDbPath } from "../server/paths";
import {
  zScoreReturn,
  normalizeZ,
  normalizeRsi,
  rsi,
  macdHistogram,
  normalizeMacd,
  normalizeEmaCross,
  scoreToLabel,
} from "../server/indicators";
import "dotenv/config";
import fs from "fs/promises";
import path from "path";


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
    console.error("Set TITAN_PAPER_KEY/SECRET or add paper keys in app Settings. DB:", resolveDbPath());
    process.exit(1);
  }
  const bars = await getStockBars(creds, sym, "15Min", 200);
  const closes = bars.map((b) => b.c);
  if (closes.length < 20) {
    console.error("Not enough bars for", sym);
    process.exit(1);
  }
  const out: string[] = [];
  for (let i = 20; i < closes.length; i++) {
    const w = closes.slice(i - 20, i + 1);
    const rz = normalizeZ(zScoreReturn(w));
    const rr = normalizeRsi(rsi(w));
    const mn = normalizeMacd(macdHistogram(w));
    const label = scoreToLabel((rz + rr + mn + normalizeEmaCross(w)) / 4);
    out.push(`${bars[i]?.t ?? ""}\t${label}`);
  }
  console.log(out.slice(-40).join("\n"));
  const tally: Record<string, number> = {};
  for (const line of out) {
    const lab = line.split("\t")[1] ?? "";
    tally[lab] = (tally[lab] ?? 0) + 1;
  }
  const report = {
    symbol: sym,
    bars: closes.length,
    window: 20,
    timeframe: "15Min",
    labelCounts: tally,
    generatedAt: new Date().toISOString(),
  };
  const dir = path.join(process.cwd(), "data");
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `backtest-${sym}-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.error("Wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

