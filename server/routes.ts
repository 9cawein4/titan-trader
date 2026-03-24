import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import crypto from "crypto";
import {
  insertTradingConfigSchema,
  tradingModeSchema,
  killSwitchSchema,
  apiKeySchema,
  insertTradeSchema,
  insertPortfolioSnapshotSchema,
  insertPositionSchema,
  insertStrategySchema,
  insertOptionsPositionSchema,
  insertRiskEventSchema,
  insertSentimentEntrySchema,
  insertAuditLogSchema,
  insertSystemStatusSchema,
} from "@shared/schema";

// ─── Security: Simple encryption for API keys at rest ───
const ENCRYPTION_KEY = process.env.TITAN_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(parts[1], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "[encrypted]";
  }
}

// ─── Security: HMAC signing for audit trail ───
function hmacSign(data: string): string {
  return crypto.createHmac("sha256", ENCRYPTION_KEY.slice(0, 32)).update(data).digest("hex");
}

// ─── Security: Rate limiter ───
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
  }
  next();
}

// ─── Security: Input sanitization ───
function sanitizeString(input: string): string {
  return input.replace(/[<>]/g, "").trim();
}

// ─── Security: Redact sensitive data from logs ───
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...obj };
  const sensitiveKeys = ["apiKey", "apiSecret", "password", "paperApiKey", "paperApiSecret", "liveApiKey", "liveApiSecret"];
  for (const key of sensitiveKeys) {
    if (redacted[key]) {
      redacted[key] = "***REDACTED***";
    }
  }
  return redacted;
}

// ─── Audit helper ───
async function logAudit(action: string, details: string, req: Request) {
  const timestamp = new Date().toISOString();
  const data = `${timestamp}:${action}:${details}`;
  await storage.createAuditEntry({
    timestamp,
    action,
    details: sanitizeString(details),
    ipAddress: req.ip || req.socket.remoteAddress || "unknown",
    userAgent: sanitizeString((req.headers["user-agent"] || "unknown").slice(0, 200)),
    hmacSignature: hmacSign(data),
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Apply rate limiter to all API routes
  app.use("/api", rateLimiter);

  // ─── Security headers ───
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // ═══════════════════════════════════════════════
  // TRADING CONFIG
  // ═══════════════════════════════════════════════

  app.get("/api/config", async (_req, res) => {
    try {
      let config = await storage.getTradingConfig();
      if (!config) {
        // Create default paper trading config
        config = await storage.upsertTradingConfig({
          tradingMode: "paper",
          ollamaUrl: "http://localhost:11434",
          ollamaModel: "deepseek-r1:latest",
          watchlist: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,SPY,QQQ,IWM",
          maxRiskPerTrade: 0.02,
          maxPortfolioExposure: 0.60,
          maxOptionsAllocation: 0.40,
          dailyLossLimit: 0.03,
          weeklyLossLimit: 0.07,
          maxDrawdown: 0.15,
          ensembleThreshold: 0.60,
        });
      }
      // Never send raw encrypted keys — just indicate if they're set
      const safeConfig = {
        ...config,
        paperApiKey: config.paperApiKey ? "***SET***" : null,
        paperApiSecret: config.paperApiSecret ? "***SET***" : null,
        liveApiKey: config.liveApiKey ? "***SET***" : null,
        liveApiSecret: config.liveApiSecret ? "***SET***" : null,
      };
      res.json(safeConfig);
    } catch (e) {
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  app.patch("/api/config", async (req, res) => {
    try {
      const data = req.body;
      // Validate risk limits have hard caps
      if (data.maxRiskPerTrade !== undefined && data.maxRiskPerTrade > 0.05) {
        return res.status(400).json({ error: "Max risk per trade cannot exceed 5%" });
      }
      if (data.maxDrawdown !== undefined && data.maxDrawdown > 0.20) {
        return res.status(400).json({ error: "Max drawdown cannot exceed 20%" });
      }
      const config = await storage.upsertTradingConfig(data);
      await logAudit("config_update", JSON.stringify(redactSensitive(data)), req);
      res.json(config);
    } catch (e) {
      res.status(400).json({ error: "Invalid config data" });
    }
  });

  // ─── Trading Mode Switch ───
  app.post("/api/config/trading-mode", async (req, res) => {
    try {
      const { mode, confirmation } = tradingModeSchema.parse(req.body);

      if (mode === "live") {
        if (confirmation !== "CONFIRM LIVE TRADING") {
          return res.status(400).json({
            error: "Live trading requires confirmation. Send confirmation: 'CONFIRM LIVE TRADING'",
          });
        }
        // Verify live API keys are set
        const config = await storage.getTradingConfig();
        if (!config?.liveApiKey || !config?.liveApiSecret) {
          return res.status(400).json({
            error: "Live API keys must be configured before switching to live trading",
          });
        }
      }

      await storage.upsertTradingConfig({ tradingMode: mode } as any);
      await logAudit("trading_mode_change", `Switched to ${mode} trading`, req);
      res.json({ success: true, mode });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: "Failed to switch trading mode" });
    }
  });

  // ─── API Keys (encrypted at rest) ───
  app.post("/api/config/api-keys", async (req, res) => {
    try {
      const { tradingMode, apiKey, apiSecret } = apiKeySchema.parse(req.body);

      const update: Record<string, string> = {};
      if (tradingMode === "paper") {
        update.paperApiKey = encrypt(apiKey);
        update.paperApiSecret = encrypt(apiSecret);
      } else {
        update.liveApiKey = encrypt(apiKey);
        update.liveApiSecret = encrypt(apiSecret);
      }

      await storage.upsertTradingConfig(update as any);
      await logAudit("api_keys_update", `Updated ${tradingMode} API keys`, req);
      res.json({ success: true, message: `${tradingMode} API keys saved (encrypted)` });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: "Failed to save API keys" });
    }
  });

  // ═══════════════════════════════════════════════
  // KILL SWITCH
  // ═══════════════════════════════════════════════

  app.post("/api/kill-switch", async (req, res) => {
    try {
      const { action, confirmation } = killSwitchSchema.parse(req.body);

      if (action === "deactivate" && confirmation !== "RESUME TRADING") {
        return res.status(400).json({
          error: "Deactivating kill switch requires confirmation: 'RESUME TRADING'",
        });
      }

      const event = await storage.createRiskEvent({
        timestamp: new Date().toISOString(),
        eventType: "kill_switch",
        severity: action === "activate" ? "halt" : "warning",
        message: action === "activate"
          ? "KILL SWITCH ACTIVATED — All trading halted, orders cancelled"
          : "Kill switch deactivated — Trading resumed",
        currentValue: null,
        threshold: null,
        resolved: action === "deactivate" ? 1 : 0,
      });

      await logAudit("kill_switch", `Kill switch ${action}d`, req);
      res.json({ success: true, action, event });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: "Kill switch operation failed" });
    }
  });

  // ═══════════════════════════════════════════════
  // PORTFOLIO
  // ═══════════════════════════════════════════════

  app.get("/api/portfolio/:mode", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be 'paper' or 'live'" });
    }
    const snapshot = await storage.getLatestSnapshot(mode);
    res.json(snapshot || null);
  });

  app.get("/api/portfolio/:mode/history", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be 'paper' or 'live'" });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const snapshots = await storage.getSnapshots(mode, limit);
    res.json(snapshots);
  });

  app.post("/api/portfolio/snapshot", async (req, res) => {
    try {
      const data = insertPortfolioSnapshotSchema.parse(req.body);
      const snapshot = await storage.createSnapshot(data);
      res.json(snapshot);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  // ═══════════════════════════════════════════════
  // POSITIONS
  // ═══════════════════════════════════════════════

  app.get("/api/positions/:mode", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be 'paper' or 'live'" });
    }
    const pos = await storage.getPositions(mode);
    res.json(pos);
  });

  // ═══════════════════════════════════════════════
  // TRADES
  // ═══════════════════════════════════════════════

  app.get("/api/trades/:mode", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be 'paper' or 'live'" });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const status = req.query.status as string | undefined;
    const tradeList = await storage.getTrades(mode, limit, status);
    res.json(tradeList);
  });

  // ═══════════════════════════════════════════════
  // STRATEGIES
  // ═══════════════════════════════════════════════

  app.get("/api/strategies", async (_req, res) => {
    const strats = await storage.getStrategies();
    res.json(strats);
  });

  // ═══════════════════════════════════════════════
  // OPTIONS
  // ═══════════════════════════════════════════════

  app.get("/api/options/:mode", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be 'paper' or 'live'" });
    }
    const opts = await storage.getOptionsPositions(mode);
    res.json(opts);
  });

  // ═══════════════════════════════════════════════
  // RISK
  // ═══════════════════════════════════════════════

  app.get("/api/risk/events", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const events = await storage.getRiskEvents(limit);
    res.json(events);
  });

  app.get("/api/risk/active", async (_req, res) => {
    const events = await storage.getActiveRiskEvents();
    res.json(events);
  });

  // ═══════════════════════════════════════════════
  // SENTIMENT
  // ═══════════════════════════════════════════════

  app.get("/api/sentiment", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const entries = await storage.getSentimentEntries(limit);
    res.json(entries);
  });

  // ═══════════════════════════════════════════════
  // SYSTEM STATUS
  // ═══════════════════════════════════════════════

  app.get("/api/system/status", async (_req, res) => {
    const statuses = await storage.getSystemStatuses();
    res.json(statuses);
  });

  // ═══════════════════════════════════════════════
  // AUDIT LOG
  // ═══════════════════════════════════════════════

  app.get("/api/audit", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const entries = await storage.getAuditLog(limit);
    res.json(entries);
  });

  // ═══════════════════════════════════════════════
  // SEED DATA (for demo purposes)
  // ═══════════════════════════════════════════════

  app.post("/api/seed", async (req, res) => {
    try {
      await seedDemoData();
      await logAudit("seed_data", "Demo data seeded", req);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // Auto-seed on first load
  const config = await storage.getTradingConfig();
  if (!config) {
    await seedDemoData();
  }

  return httpServer;
}

// ─── Demo Data Seeder ───
async function seedDemoData() {
  // Default config
  await storage.upsertTradingConfig({
    tradingMode: "paper",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "deepseek-r1:latest",
    watchlist: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,SPY,QQQ,IWM",
    maxRiskPerTrade: 0.02,
    maxPortfolioExposure: 0.60,
    maxOptionsAllocation: 0.40,
    dailyLossLimit: 0.03,
    weeklyLossLimit: 0.07,
    maxDrawdown: 0.15,
    ensembleThreshold: 0.60,
  });

  // Strategies
  const strategyData = [
    { name: "Bollinger Mean Reversion", type: "mean_reversion", weight: 0.30, sharpeRatio: 1.74, winRate: 0.62, totalTrades: 147, profitFactor: 1.85, enabled: 1, lastSignal: "STRONG_BUY", lastSignalTime: new Date().toISOString(), confidence: 0.85 },
    { name: "Z-Score Mean Reversion", type: "mean_reversion", weight: 0.25, sharpeRatio: 1.63, winRate: 0.58, totalTrades: 132, profitFactor: 1.72, enabled: 1, lastSignal: "BUY", lastSignalTime: new Date().toISOString(), confidence: 0.72 },
    { name: "EMA Crossover", type: "trend_following", weight: 0.25, sharpeRatio: 1.04, winRate: 0.51, totalTrades: 89, profitFactor: 1.35, enabled: 1, lastSignal: "HOLD", lastSignalTime: new Date().toISOString(), confidence: 0.30 },
    { name: "MACD Momentum", type: "trend_following", weight: 0.20, sharpeRatio: 0.82, winRate: 0.48, totalTrades: 95, profitFactor: 1.18, enabled: 1, lastSignal: "BUY", lastSignalTime: new Date().toISOString(), confidence: 0.65 },
  ];
  for (const s of strategyData) {
    await storage.upsertStrategy(s);
  }

  // Portfolio snapshots (30 days of history)
  const baseEquity = 100000;
  const now = Date.now();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    const randomReturn = (Math.random() - 0.45) * 0.015;
    const equity = baseEquity * (1 + randomReturn * (30 - i));
    await storage.createSnapshot({
      timestamp: date.toISOString(),
      equity: Math.round(equity * 100) / 100,
      cash: Math.round(equity * 0.42 * 100) / 100,
      buyingPower: Math.round(equity * 0.84 * 100) / 100,
      dayPnl: Math.round((Math.random() - 0.4) * 800 * 100) / 100,
      totalPnl: Math.round((equity - baseEquity) * 100) / 100,
      drawdown: Math.round(Math.random() * 0.04 * 10000) / 10000,
      tradingMode: "paper",
    });
  }

  // Positions
  const positionData = [
    { symbol: "AAPL", side: "long", qty: 45, avgEntryPrice: 178.50, currentPrice: 185.20, marketValue: 8334, unrealizedPnl: 301.50, unrealizedPnlPct: 3.75 },
    { symbol: "MSFT", side: "long", qty: 30, avgEntryPrice: 415.00, currentPrice: 422.80, marketValue: 12684, unrealizedPnl: 234.00, unrealizedPnlPct: 1.88 },
    { symbol: "NVDA", side: "long", qty: 20, avgEntryPrice: 875.00, currentPrice: 892.40, marketValue: 17848, unrealizedPnl: 348.00, unrealizedPnlPct: 1.99 },
    { symbol: "TSLA", side: "long", qty: 15, avgEntryPrice: 245.80, currentPrice: 238.50, marketValue: 3577.50, unrealizedPnl: -109.50, unrealizedPnlPct: -2.97 },
    { symbol: "SPY", side: "long", qty: 25, avgEntryPrice: 510.20, currentPrice: 518.90, marketValue: 12972.50, unrealizedPnl: 217.50, unrealizedPnlPct: 1.71 },
  ];
  for (const p of positionData) {
    await storage.upsertPosition({ ...p, tradingMode: "paper" });
  }

  // Recent trades
  const tradeStatuses = ["executed", "executed", "executed", "rejected", "executed"];
  const symbols = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "META", "GOOGL"];
  const strategyNames = ["Bollinger MR", "Z-Score MR", "EMA Cross", "MACD Mom"];
  for (let i = 0; i < 20; i++) {
    const date = new Date(now - i * 3600000 * (Math.random() * 4 + 1));
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const status = tradeStatuses[Math.floor(Math.random() * tradeStatuses.length)];
    await storage.createTrade({
      timestamp: date.toISOString(),
      symbol: sym,
      side: Math.random() > 0.4 ? "buy" : "sell",
      orderType: Math.random() > 0.3 ? "limit" : "market",
      qty: Math.round(Math.random() * 50 + 5),
      price: Math.round((Math.random() * 500 + 100) * 100) / 100,
      status,
      strategy: strategyNames[Math.floor(Math.random() * strategyNames.length)],
      reason: status === "rejected" ? "Position limit exceeded" : null,
      pnl: status === "executed" ? Math.round((Math.random() - 0.35) * 400 * 100) / 100 : null,
      tradingMode: "paper",
      tradeType: "equity",
      hmacSignature: hmacSign(`${date.toISOString()}:${sym}:${status}`),
    });
  }

  // Options positions
  const optionData = [
    { symbol: "AAPL", optionType: "put", strike: 175, expiration: "2026-04-18", contracts: 2, premium: 3.20, currentValue: 2.85, strategy: "wheel_csp", status: "open", delta: -0.25, gamma: 0.03, theta: -0.05, vega: 0.12 },
    { symbol: "MSFT", optionType: "call", strike: 430, expiration: "2026-04-18", contracts: 1, premium: 5.40, currentValue: 4.10, strategy: "wheel_cc", status: "open", delta: 0.35, gamma: 0.02, theta: -0.08, vega: 0.15 },
    { symbol: "SPY", optionType: "put", strike: 505, expiration: "2026-04-25", contracts: 3, premium: 2.10, currentValue: 1.40, strategy: "iron_condor", status: "open", delta: -0.15, gamma: 0.01, theta: -0.04, vega: 0.08 },
    { symbol: "SPY", optionType: "call", strike: 530, expiration: "2026-04-25", contracts: 3, premium: 1.90, currentValue: 1.20, strategy: "iron_condor", status: "open", delta: 0.12, gamma: 0.01, theta: -0.03, vega: 0.07 },
  ];
  for (const o of optionData) {
    await storage.createOptionsPosition({ ...o, tradingMode: "paper" } as any);
  }

  // Risk events
  await storage.createRiskEvent({
    timestamp: new Date(now - 7200000).toISOString(),
    eventType: "position_limit",
    severity: "warning",
    message: "Position in NVDA approaching 10% limit (9.2%)",
    currentValue: 0.092,
    threshold: 0.10,
    resolved: 0,
  });

  // Sentiment
  const sentiments = [
    { symbol: "AAPL", sentiment: "bullish", score: 0.78, source: "ollama", summary: "Strong earnings beat, services revenue growing. DeepSeek analysis: positive momentum." },
    { symbol: "TSLA", sentiment: "bearish", score: -0.45, source: "news", summary: "Delivery numbers below expectations. SEC filing shows margin compression." },
    { symbol: "NVDA", sentiment: "bullish", score: 0.82, source: "ollama", summary: "AI chip demand exceeding supply. Data center revenue up 200% YoY." },
    { symbol: "SPY", sentiment: "neutral", score: 0.05, source: "ollama", summary: "Mixed signals — inflation cooling but Fed hawkish rhetoric continues." },
  ];
  for (const s of sentiments) {
    await storage.createSentimentEntry({
      ...s,
      timestamp: new Date(now - Math.random() * 3600000).toISOString(),
    } as any);
  }

  // System status
  const systems = [
    { component: "broker", status: "healthy", message: "Alpaca API connected (paper)", responseTimeMs: 45 },
    { component: "ollama", status: "healthy", message: "DeepSeek R1 loaded, GPU acceleration active", responseTimeMs: 320 },
    { component: "database", status: "healthy", message: "SQLite WAL mode, 2.3MB", responseTimeMs: 1 },
    { component: "orchestrator", status: "healthy", message: "Last cycle: 12s, next in 47s", responseTimeMs: 12000 },
  ];
  for (const s of systems) {
    await storage.upsertSystemStatus({
      ...s,
      lastCheck: new Date().toISOString(),
    } as any);
  }
}
