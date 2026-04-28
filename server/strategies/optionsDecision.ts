import type { InsertDecisionLog } from "@shared/schema";
import { storage } from "../storage";
import { hmacSignPayload } from "../secrets";

export type DecisionCategory = "options_open" | "options_close" | "options_skip" | "equity_signal";

export async function logTradeDecision(
  mode: string,
  category: DecisionCategory,
  underlyingSymbol: string,
  strategy: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const row: InsertDecisionLog = {
    timestamp,
    tradingMode: mode,
    category,
    underlyingSymbol,
    strategy,
    payloadJson,
    hmacSignature: hmacSignPayload(`${timestamp}:${category}:${underlyingSymbol}:${payloadJson}`),
  };
  await storage.createDecisionLog(row);
}

