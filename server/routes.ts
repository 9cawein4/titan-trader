import { broadcastTrade, broadcastPortfolio, broadcastRiskEvent, broadcastKillSwitch } from "./websocket";
import { getAgentHealth, getAgentMetrics, getAgentStatus } from "./agent";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerEngineRoutes, onKillSwitchActivate } from "./engine-api";
import { z } from "zod";
import { encryptSecret as encrypt, hmacSignPayload as hmacSign } from "./secrets";
import { log } from "./log";
import * as alpaca from "./alpaca";
import { credsFromTradingConfig } from "./brokerCreds";
import { filterSymbolSuggestions, getEquitySymbolUniverse, invalidateSymbolUniverseCache } from "./symbolSuggest";
import { getEngineState } from "./trading-engine";
import { runExecuteAdvisor, streamExecuteAdvisor } from "./executeAdvisor";
import type { AdvisorMessage } from "./executeAdvisor";
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

// ─── Security: Rate limiter ───
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60_000; // 1 minute
const chatRateMap = new Map<string, { count: number; resetTime: number }>();
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW = 60_000;

function checkAdvisorChatRate(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = chatRateMap.get(ip);
  if (!entry || now > entry.resetTime) {
    chatRateMap.set(ip, { count: 1, resetTime: now + CHAT_RATE_WINDOW });
    return true;
  }
  entry.count++;
  if (entry.count > CHAT_RATE_LIMIT) {
    res.status(429).json({ error: "Advisor chat rate limit. Try again shortly." });
    return false;
  }
  return true;
}
const configPatchSchema = insertTradingConfigSchema.partial().strict();

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
      const parsed = configPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const data = parsed.data;
      if (typeof data.watchlist === "string") {
        data.watchlist = data.watchlist
          .split(",")
          .map((s) => sanitizeString(s.toUpperCase()))
          .filter(Boolean)
          .slice(0, 64)
          .join(",");
      }

      const config = await storage.upsertTradingConfig(data as any);
      await logAudit("config_update", JSON.stringify(redactSensitive(data as Record<string, unknown>)), req);
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
      invalidateSymbolUniverseCache();
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

      if (action === "activate") {
        try {
          await onKillSwitchActivate();
        } catch (e) {
          log(`Kill switch broker/engine step: ${e instanceof Error ? e.message : String(e)}`, "express");
        }
      }

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

  app.get("/api/symbols/suggest", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "15"), 10) || 15, 1), 40);
      if (q.trim().length < 1) {
        return res.json([]);
      }
      const uni = await getEquitySymbolUniverse();
      if (!uni.ok) {
        return res.status(400).json({ error: uni.error });
      }
      const items = filterSymbolSuggestions(uni.entries, q, limit);
      res.json(items);
    } catch (e) {
      log(`GET /api/symbols/suggest: ${e instanceof Error ? e.message : String(e)}`, "express");
      res.status(500).json({ error: "Symbol suggest failed" });
    }
  });

  const manualEquityOrderSchema = z.object({
    symbol: z
      .string()
      .min(1)
      .max(32)
      .transform((x) => x.trim().toUpperCase())
      .refine((x) => /^[A-Z0-9.-]+$/.test(x), "Invalid symbol"),
    qty: z.number().int().positive().max(500_000),
    side: z.enum(["buy", "sell"]),
  });

  app.post("/api/orders/equity", async (req, res) => {
    try {
      const parsed = manualEquityOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid order", details: parsed.error.flatten() });
      }

      const risk = await storage.getActiveRiskEvents();
      if (risk.some((e) => e.eventType === "kill_switch" && e.severity === "halt")) {
        return res.status(403).json({ error: "Kill switch is active — orders are blocked" });
      }

      const cfg = await storage.getTradingConfig();
      const credsR = credsFromTradingConfig(cfg);
      if (!credsR.ok) {
        return res.status(400).json({ error: credsR.error });
      }
      const { creds, mode } = credsR;

      const { symbol, qty, side } = parsed.data;
      const bars = await alpaca.getStockBars(creds, symbol, "15Min", 2);
      const price = bars.length ? (bars[bars.length - 1]?.c ?? 0) : 0;

      const order = await alpaca.submitMarketOrder(creds, symbol, qty, side);
      const ts = new Date().toISOString();
      const sig = hmacSign(`${ts}:${symbol}:${side}:${order?.id ?? "none"}`);
      await storage.createTrade({
        timestamp: ts,
        symbol,
        side,
        orderType: "market",
        qty,
        price,
        status: order?.id ? "executed" : "rejected",
        strategy: "manual_ui",
        reason: order?.id ? `Manual ${side} from dashboard` : "Order not accepted by broker",
        pnl: null,
        tradingMode: mode,
        tradeType: "equity",
        hmacSignature: sig,
      });

      if (order?.id) {
        broadcastTrade({ symbol, side, qty });
      }

      await logAudit(
        "manual_equity_order",
        `${side} ${qty} ${symbol} ${mode} ok=${Boolean(order?.id)}`,
        req,
      );

      res.json({
        success: Boolean(order?.id),
        orderId: order?.id ?? null,
        symbol,
        qty,
        side,
        tradingMode: mode,
      });
    } catch (e) {
      log(`POST /api/orders/equity: ${e instanceof Error ? e.message : String(e)}`, "express");
      res.status(500).json({ error: "Order failed" });
    }
  });


  // ═══════════════════════════════════════════════
  // STRATEGIES
  // ═══════════════════════════════════════════════

  const executeAdvisorSchema = z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
        }),
      )
      .min(1)
      .max(24),
    draft: z
      .object({
        symbol: z.string().max(32).optional(),
        qty: z.number().int().positive().max(500_000).optional(),
        side: z.enum(["buy", "sell"]).optional(),
      })
      .optional(),
  });

  app.post("/api/execute/advisor", async (req, res) => {
    if (!checkAdvisorChatRate(req, res)) return;
    try {
      const parsed = executeAdvisorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const last = parsed.data.messages[parsed.data.messages.length - 1];
      if (last.role !== "user") {
        return res.status(400).json({ error: "Last message must be from the user" });
      }

      const [cfg, strats, risk] = await Promise.all([
        storage.getTradingConfig(),
        storage.getStrategies(),
        storage.getActiveRiskEvents(),
      ]);
      if (!cfg) {
        return res.status(400).json({ error: "Configure Settings first" });
      }

      const strategies = strats.map((x) => ({
        name: x.name,
        enabled: Boolean(x.enabled),
      }));

      const killSwitchActive = risk.some((e) => e.eventType === "kill_switch" && e.severity === "halt");

      const engine = getEngineState();

      const clientAbort = new AbortController();
      const onClose = () => clientAbort.abort();
      req.on("close", onClose);
      const advisorSignal = AbortSignal.any([AbortSignal.timeout(115_000), clientAbort.signal]);

      const msgs: AdvisorMessage[] = parsed.data.messages.map((m) => ({
        role: m.role,
        content: sanitizeString(m.content).slice(0, 8000),
      }));

      try {
        const out = await runExecuteAdvisor(
          {
            cfg,
            strategies,
            engineRunning: engine.running,
            killSwitchActive,
            draft: parsed.data.draft,
          },
          msgs,
          { signal: advisorSignal },
        );

        await logAudit(
          "execute_advisor_chat",
          sanitizeString(msgs.filter((m) => m.role === "user").pop()?.content ?? "").slice(0, 220),
          req,
        );

        res.json({ reply: out.reply });
      } finally {
        req.off("close", onClose);
      }
    } catch (e) {
      log(`POST /api/execute/advisor: ${e instanceof Error ? e.message : String(e)}`, "express");
      res.status(500).json({ error: "Advisor request failed" });
    }
  });



  app.post("/api/execute/advisor/stream", async (req, res) => {
    if (!checkAdvisorChatRate(req, res)) return;
    try {
      const parsed = executeAdvisorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const last = parsed.data.messages[parsed.data.messages.length - 1];
      if (last.role !== "user") {
        return res.status(400).json({ error: "Last message must be from the user" });
      }

      const [cfg, strats, risk] = await Promise.all([
        storage.getTradingConfig(),
        storage.getStrategies(),
        storage.getActiveRiskEvents(),
      ]);
      if (!cfg) {
        return res.status(400).json({ error: "Configure Settings first" });
      }

      const strategies = strats.map((x) => ({
        name: x.name,
        enabled: Boolean(x.enabled),
      }));

      const killSwitchActive = risk.some((e) => e.eventType === "kill_switch" && e.severity === "halt");

      const engine = getEngineState();

      const clientAbort = new AbortController();
      const onClose = () => clientAbort.abort();
      req.on("close", onClose);
      const advisorSignal = AbortSignal.any([AbortSignal.timeout(115_000), clientAbort.signal]);

      const msgs: AdvisorMessage[] = parsed.data.messages.map((m) => ({
        role: m.role,
        content: sanitizeString(m.content).slice(0, 8000),
      }));

      let fullReply = "";
      try {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");

        for await (const delta of streamExecuteAdvisor(
          {
            cfg,
            strategies,
            engineRunning: engine.running,
            killSwitchActive,
            draft: parsed.data.draft,
          },
          msgs,
          { signal: advisorSignal },
        )) {
          res.write(`${JSON.stringify({ d: delta })}\n`);
        }
        res.write(`${JSON.stringify({ done: true })}\n`);

        await logAudit(
          "execute_advisor_chat",
          sanitizeString(msgs.filter((m) => m.role === "user").pop()?.content ?? "").slice(0, 220),
          req,
        );

        res.end();
      } catch (streamErr) {
        if (!res.headersSent) {
          res.status(502).json({
            error: streamErr instanceof Error ? streamErr.message : "Advisor stream failed",
          });
        } else {
          try {
            res.write(
              `${JSON.stringify({
                error: streamErr instanceof Error ? streamErr.message : "Advisor stream failed",
              })}\n`,
            );
          } catch {
            /* ignore */
          }
          res.end();
        }
      } finally {
        req.off("close", onClose);
      }
    } catch (e) {
      log(`POST /api/execute/advisor/stream: ${e instanceof Error ? e.message : String(e)}`, "express");
      if (!res.headersSent) {
        res.status(500).json({ error: "Advisor request failed" });
      }
    }
  });
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

  app.get("/api/decisions/:mode", async (req, res) => {
    const mode = req.params.mode;
    if (mode !== "paper" && mode !== "live") {
      return res.status(400).json({ error: "Mode must be paper or live" });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const catRaw = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const category = /^[a-z][a-z0-9_]{0,31}$/.test(catRaw) ? catRaw : undefined;
    const rows = await storage.getDecisionLogs(mode, limit, category);
    res.json(rows);
  });

  // ═══════════════════════════════════════════════
  // SEED DATA (for demo purposes)
  // ═══════════════════════════════════════════════

  app.post("/api/seed", async (req, res) => {
    try {
      const allow = process.env.NODE_ENV !== "production" || process.env.TITAN_ALLOW_SEED === "true";
      if (!allow) {
        return res.status(403).json({ error: "Seeding disabled in production (set TITAN_ALLOW_SEED=true)" });
      }
      await seedDemoData();
      await logAudit("seed_data", "Demo data seeded", req);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // Bootstrap defaults; full demo portfolio only if TITAN_SEED_DEMO=true
  try {
    let config = await storage.getTradingConfig();
    if (!config) {
      await storage.upsertTradingConfig({
        tradingMode: "paper",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "deepseek-r1:latest",
        watchlist: "AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,SPY,QQQ,IWM",
        maxRiskPerTrade: 0.02,
        maxPortfolioExposure: 0.6,
        maxOptionsAllocation: 0.4,
        dailyLossLimit: 0.03,
        weeklyLossLimit: 0.07,
        maxDrawdown: 0.15,
        ensembleThreshold: 0.6,
      });
      config = await storage.getTradingConfig();
    }
    if (process.env.TITAN_SEED_DEMO === "true") {
      await seedDemoData();
    } else {
      await ensureRuntimeDefaults();
    }
  } catch (e) {
    log(`Startup bootstrap skipped: ${e instanceof Error ? e.message : String(e)}`, "express");
  }

  registerEngineRoutes(app, logAudit);

  // ═══════════════════════════════════════════════
  // AGENT PROXY (Python engine)
  // ═══════════════════════════════════════════════

  app.get("/api/agent/health", async (_req, res) => {
    const health = await getAgentHealth();
    res.json(health);
  });

  app.get("/api/agent/metrics", async (_req, res) => {
    const metrics = await getAgentMetrics();
    if (metrics) {
      res.type("text/plain").send(metrics);
    } else {
      res.status(503).json({ error: "Agent metrics unavailable" });
    }
  });

  app.get("/api/agent/status", async (_req, res) => {
    const status = await getAgentStatus();
    if (status) {
      res.json(status);
    } else {
      res.status(503).json({ error: "Agent status unavailable" });
    }
  });

  return httpServer;
}

async function ensureRuntimeDefaults() {
  const rows = await storage.getStrategies();
  if (rows.length > 0) return;
  const minimal = [
    { name: "Bollinger Mean Reversion", type: "mean_reversion", weight: 0.3, sharpeRatio: null, winRate: null, totalTrades: 0, profitFactor: null, enabled: 1, lastSignal: "HOLD", lastSignalTime: new Date().toISOString(), confidence: 0 },
    { name: "Z-Score Mean Reversion", type: "mean_reversion", weight: 0.25, sharpeRatio: null, winRate: null, totalTrades: 0, profitFactor: null, enabled: 1, lastSignal: "HOLD", lastSignalTime: new Date().toISOString(), confidence: 0 },
    { name: "EMA Crossover", type: "trend_following", weight: 0.25, sharpeRatio: null, winRate: null, totalTrades: 0, profitFactor: null, enabled: 1, lastSignal: "HOLD", lastSignalTime: new Date().toISOString(), confidence: 0 },
    { name: "MACD Momentum", type: "trend_following", weight: 0.2, sharpeRatio: null, winRate: null, totalTrades: 0, profitFactor: null, enabled: 1, lastSignal: "HOLD", lastSignalTime: new Date().toISOString(), confidence: 0 },
  ];
  for (const s of minimal) await storage.upsertStrategy(s);
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

