export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period - 1;
  for (let i = start + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaPrev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaPrev = values[i]! * k + emaPrev * (1 - k);
  }
  return emaPrev;
}

export function macdHistogram(closes: number[]): number | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  if (ema12 == null || ema26 == null) return null;
  const macdLine = ema12 - ema26;
  const signal = macdLine * 0.85;
  return macdLine - signal;
}

export function zScoreReturn(closes: number[], lookback = 20): number | null {
  if (closes.length < lookback + 1) return null;
  const recent = closes.slice(-lookback);
  const ret = (closes.at(-1)! - closes.at(-2)!) / (closes.at(-2)! || 1);
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    rets.push((recent[i]! - recent[i - 1]!) / (recent[i - 1]! || 1));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const sd = Math.sqrt(variance) || 1e-9;
  return (ret - mean) / sd;
}

export function scoreToLabel(score: number): string {
  if (score >= 0.6) return "STRONG_BUY";
  if (score >= 0.25) return "BUY";
  if (score <= -0.6) return "STRONG_SELL";
  if (score <= -0.25) return "SELL";
  return "HOLD";
}

export function normalizeRsi(rsiVal: number | null): number {
  if (rsiVal == null) return 0;
  return Math.max(-1, Math.min(1, (50 - rsiVal) / 50));
}

export function normalizeZ(z: number | null): number {
  if (z == null) return 0;
  return Math.max(-1, Math.min(1, -z / 3));
}

export function normalizeMacd(h: number | null): number {
  if (h == null || !Number.isFinite(h)) return 0;
  const x = Math.tanh(h / (Math.abs(h) + 1e-6));
  return Math.max(-1, Math.min(1, x));
}

export function normalizeEmaCross(closes: number[]): number {
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  if (e20 == null || e50 == null) return 0;
  const last = closes.at(-1) ?? 0;
  const spread = (e20 - e50) / (last || 1);
  return Math.max(-1, Math.min(1, spread * 20));
}
