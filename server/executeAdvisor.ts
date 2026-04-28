import type { TradingConfig } from "@shared/schema";
import { fetchOllamaChat } from "./ollama";

export type AdvisorMessage = { role: "user" | "assistant"; content: string };

export type AdvisorContext = {
  cfg: TradingConfig;
  strategies: { name: string; enabled: boolean }[];
  engineRunning: boolean;
  killSwitchActive: boolean;
  draft?: { symbol?: string; qty?: number; side?: "buy" | "sell" };
};

function buildSystemPrompt(ctx: AdvisorContext): string {
  const wl = (ctx.cfg.watchlist ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 16)
    .join(", ");
  const strats = ctx.strategies
    .filter((s) => s.enabled)
    .map((s) => s.name)
    .join("; ") || "(none enabled)";
  const mode = ctx.cfg.tradingMode === "live" ? "live" : "paper";
  const draft = ctx.draft
    ? `User Execute form draft: ${ctx.draft.side ?? "?"} ${ctx.draft.qty ?? "?"} ${ctx.draft.symbol ?? ""}`.trim()
    : "";

  const lines = [
    "You are Titan Trader Execution and Strategy advisor for a single-user local trading assistant.",
    "Stay within what this product supports. Do not invent features, brokers, or shortcuts.",
    "",
    "### Approved mechanisms",
    "- Manual US equity market orders: Execute page — symbol, whole-share qty, buy/sell — routed to Alpaca for the configured paper or live mode.",
    "- Automated loop: sidebar START runs the core cycle — Alpaca sync, rotating watchlist symbol, ensemble from weighted strategies, Ollama sentiment for that symbol, risk gates, optional equity and options automation when configured.",
    "- Options paths (wheel CSP, covered call, iron condor) run inside that engine; requires Alpaca options entitlements.",
    "- Kill switch halts trading and cancels pending broker orders.",
    "- Adjust behavior via Settings (watchlist, thresholds, risk limits, Ollama URL/model), Dashboard strategy toggles, Risk page.",
    "",
    "### Constraints",
    "- Never advise bypassing auth, extracting keys, or undocumented APIs.",
    "- Not personalized financial advice; do not promise returns or ignoring risk limits.",
    "- If asked for unsupported assets or brokers, say so and suggest the closest supported workflow.",
    "",
    "### Runtime snapshot (not live prices)",
    `Mode: ${mode}`,
    `Engine loop running: ${ctx.engineRunning ? "yes" : "no"}`,
    `Kill switch blocking orders: ${ctx.killSwitchActive ? "yes" : "no"}`,
    `Watchlist: ${wl || "(empty)"}`,
    `Enabled strategies: ${strats}`,
    `ensembleThreshold: ${ctx.cfg.ensembleThreshold ?? 0.6}`,
    `maxRiskPerTrade / maxPortfolioExposure / maxOptionsAllocation: ${ctx.cfg.maxRiskPerTrade ?? 0.02} / ${ctx.cfg.maxPortfolioExposure ?? 0.6} / ${ctx.cfg.maxOptionsAllocation ?? 0.4}`,
    `dailyLossLimit / weeklyLossLimit / maxDrawdown: ${ctx.cfg.dailyLossLimit ?? 0.03} / ${ctx.cfg.weeklyLossLimit ?? 0.07} / ${ctx.cfg.maxDrawdown ?? 0.15}`,
    draft || null,
    "",
    "### Style",
    "Concise. Name UI locations (Execute, Settings, sidebar START/STOP, Risk, Dashboard). Say when to use manual Execute vs automation.",
  ];
  return lines.filter((x) => x != null && x !== "").join("\n");
}

export async function runExecuteAdvisor(
  ctx: AdvisorContext,
  messages: AdvisorMessage[],
): Promise<{ reply: string }> {
  const url = ctx.cfg.ollamaUrl ?? "http://localhost:11434";
  const model = ctx.cfg.ollamaModel ?? "llama3.2";
  const system = buildSystemPrompt(ctx);
  const reply = await fetchOllamaChat(url, model, system, messages);
  return { reply };
}