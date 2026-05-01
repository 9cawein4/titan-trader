import type { TradingConfig } from "@shared/schema";
import { resolveAlpacaTradingBaseUrl, type AlpacaCredentials } from "./alpaca";
import { decryptSecret } from "./secrets";

export type BrokerCredsResult =
  | { ok: true; creds: AlpacaCredentials; mode: "paper" | "live" }
  | { ok: false; error: string };

export function credsFromTradingConfig(cfg: TradingConfig | undefined): BrokerCredsResult {
  if (!cfg) {
    return { ok: false, error: "Save trading settings first" };
  }
  const mode = cfg.tradingMode === "live" ? "live" : "paper";
  const paper = mode === "paper";
  const ek = paper ? cfg.paperApiKey : cfg.liveApiKey;
  const es = paper ? cfg.paperApiSecret : cfg.liveApiSecret;
  if (!ek || !es) {
    return {
      ok: false,
      error: `${paper ? "Paper" : "Live"} Alpaca API keys are not set in Settings`,
    };
  }
  const keyId = decryptSecret(ek);
  const secretKey = decryptSecret(es);
  if (!keyId || !secretKey) {
    return {
      ok: false,
      error: "Could not decrypt API keys — set TITAN_ENCRYPTION_KEY and re-save keys in Settings",
    };
  }
  const stored = paper ? cfg.paperTradingApiBaseUrl : cfg.liveTradingApiBaseUrl;
  const tradingBaseUrl = resolveAlpacaTradingBaseUrl(stored ?? undefined, paper);
  return { ok: true, creds: { keyId, secretKey, paper, tradingBaseUrl }, mode };
}
