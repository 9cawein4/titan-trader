import type { IStorage } from "./storage";

/**
 * Derive rolling performance from executed equity trades (ensemble path).
 * All strategy rows get the same pool stats until per-strategy trade tags exist.
 */
export async function refreshStrategyPerformance(storage: IStorage, mode: string): Promise<void> {
  const list = await storage.getTrades(mode, 500, "executed");
  const equity = list.filter((t) => (t.tradeType ?? "equity") === "equity");
  if (equity.length < 1) return;
  const wins = equity.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = wins / equity.length;
  const rets = equity.map((t) => (t.pnl ?? 0) / 1000);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const var_ = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const std = Math.sqrt(var_) || 1e-6;
  const sharpeProxy = mean / std;
  const posPnl = equity.filter((t) => (t.pnl ?? 0) > 0).map((t) => t.pnl ?? 0);
  const negPnl = equity.filter((t) => (t.pnl ?? 0) < 0).map((t) => Math.abs(t.pnl ?? 0));
  const sumPos = posPnl.reduce((a, b) => a + b, 0);
  const sumNeg = negPnl.reduce((a, b) => a + b, 0) || 1e-6;
  const profitFactor = sumPos / sumNeg;
  const strats = await storage.getStrategies();
  for (const s of strats) {
    await storage.updateStrategy(s.id, {
      winRate,
      totalTrades: equity.length,
      sharpeRatio: Math.max(-3, Math.min(3, sharpeProxy)),
      profitFactor: Math.max(0, Math.min(5, profitFactor)),
    } as never);
  }
}
