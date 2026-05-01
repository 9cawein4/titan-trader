import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Trading Configuration ───
export const tradingConfig = sqliteTable("trading_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tradingMode: text("trading_mode").notNull().default("paper"), // "paper" | "live"
  paperApiKey: text("paper_api_key"), // encrypted
  paperApiSecret: text("paper_api_secret"), // encrypted
  liveApiKey: text("live_api_key"), // encrypted
  liveApiSecret: text("live_api_secret"), // encrypted
  ollamaUrl: text("ollama_url").default("http://localhost:11434"),
  ollamaModel: text("ollama_model").default("deepseek-r1:latest"),
  watchlist: text("watchlist").default("AAPL,MSFT,GOOGL,AMZN,TSLA,NVDA,META,SPY,QQQ,IWM"),
  maxRiskPerTrade: real("max_risk_per_trade").default(0.02),
  maxPortfolioExposure: real("max_portfolio_exposure").default(0.60),
  maxOptionsAllocation: real("max_options_allocation").default(0.40),
  dailyLossLimit: real("daily_loss_limit").default(0.03),
  weeklyLossLimit: real("weekly_loss_limit").default(0.07),
  maxDrawdown: real("max_drawdown").default(0.15),
  ensembleThreshold: real("ensemble_threshold").default(0.60),
  taxFederalMarginalRate: real("tax_federal_marginal_rate").default(0.22),
  taxStateRate: real("tax_state_rate").default(0.05),
  taxStateLongTermRate: real("tax_state_long_term_rate"),
  taxLongTermFedRate: real("tax_long_term_fed_rate").default(0.15),
  taxResidencyState: text("tax_residency_state").default(""),
});

export const insertTradingConfigSchema = createInsertSchema(tradingConfig).omit({ id: true }).extend({
  tradingMode: z.enum(["paper", "live"]),
  maxRiskPerTrade: z.number().min(0.001).max(0.05), // hard cap 5%
  maxPortfolioExposure: z.number().min(0.1).max(0.8),
  maxOptionsAllocation: z.number().min(0).max(0.5),
  dailyLossLimit: z.number().min(0.01).max(0.05),
  weeklyLossLimit: z.number().min(0.01).max(0.10),
  maxDrawdown: z.number().min(0.05).max(0.20),
  ensembleThreshold: z.number().min(0.5).max(1.0),
  taxFederalMarginalRate: z.number().min(0).max(0.37),
  taxStateRate: z.number().min(0).max(0.15),
  taxStateLongTermRate: z.number().min(0).max(0.15).optional(),
  taxLongTermFedRate: z.number().min(0).max(0.24),
  taxResidencyState: z.union([z.literal(""), z.string().length(2)]).optional(),
});
export type InsertTradingConfig = z.infer<typeof insertTradingConfigSchema>;
export type TradingConfig = typeof tradingConfig.$inferSelect;

// ─── Portfolio Snapshots ───
export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  equity: real("equity").notNull(),
  cash: real("cash").notNull(),
  buyingPower: real("buying_power"),
  dayPnl: real("day_pnl"),
  totalPnl: real("total_pnl"),
  drawdown: real("drawdown"),
  tradingMode: text("trading_mode").notNull(),
});

export const insertPortfolioSnapshotSchema = createInsertSchema(portfolioSnapshots).omit({ id: true });
export type InsertPortfolioSnapshot = z.infer<typeof insertPortfolioSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;

// ─── Positions ───
export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // "long" | "short"
  qty: real("qty").notNull(),
  avgEntryPrice: real("avg_entry_price").notNull(),
  currentPrice: real("current_price"),
  marketValue: real("market_value"),
  unrealizedPnl: real("unrealized_pnl"),
  unrealizedPnlPct: real("unrealized_pnl_pct"),
  tradingMode: text("trading_mode").notNull(),
});

export const insertPositionSchema = createInsertSchema(positions).omit({ id: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

// ─── Trade Log ───
export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // "buy" | "sell"
  orderType: text("order_type").notNull(), // "market" | "limit" | "stop"
  qty: real("qty").notNull(),
  price: real("price").notNull(),
  status: text("status").notNull(), // "executed" | "rejected" | "cancelled" | "pending"
  strategy: text("strategy"), // which strategy triggered this
  reason: text("reason"), // why rejected / risk note
  pnl: real("pnl"),
  tradingMode: text("trading_mode").notNull(),
  tradeType: text("trade_type").default("equity"), // "equity" | "option"
  hmacSignature: text("hmac_signature"), // audit trail integrity
});

export const insertTradeSchema = createInsertSchema(trades).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

// ─── Strategy Performance ───
export const strategies = sqliteTable("strategies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "mean_reversion" | "trend_following" | "options"
  weight: real("weight").notNull(),
  sharpeRatio: real("sharpe_ratio"),
  winRate: real("win_rate"),
  totalTrades: integer("total_trades").default(0),
  profitFactor: real("profit_factor"),
  enabled: integer("enabled").default(1),
  lastSignal: text("last_signal"), // "BUY" | "SELL" | "HOLD" | "STRONG_BUY" | "STRONG_SELL"
  lastSignalTime: text("last_signal_time"),
  confidence: real("confidence"),
});

export const insertStrategySchema = createInsertSchema(strategies).omit({ id: true });
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategies.$inferSelect;

// ─── Options Positions ───
export const optionsPositions = sqliteTable("options_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  optionType: text("option_type").notNull(), // "call" | "put"
  strike: real("strike").notNull(),
  expiration: text("expiration").notNull(),
  contracts: integer("contracts").notNull(),
  premium: real("premium"),
  currentValue: real("current_value"),
  strategy: text("strategy").notNull(), // "wheel_csp" | "wheel_cc" | "iron_condor"
  status: text("status").notNull(), // "open" | "closed" | "assigned" | "expired"
  delta: real("delta"),
  gamma: real("gamma"),
  theta: real("theta"),
  vega: real("vega"),
  tradingMode: text("trading_mode").notNull(),
});

export const insertOptionsPositionSchema = createInsertSchema(optionsPositions).omit({ id: true });
export type InsertOptionsPosition = z.infer<typeof insertOptionsPositionSchema>;
export type OptionsPosition = typeof optionsPositions.$inferSelect;

// ─── Risk Events ───
export const riskEvents = sqliteTable("risk_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(), // "daily_limit" | "weekly_limit" | "drawdown" | "kill_switch" | "position_limit"
  severity: text("severity").notNull(), // "warning" | "critical" | "halt"
  message: text("message").notNull(),
  currentValue: real("current_value"),
  threshold: real("threshold"),
  resolved: integer("resolved").default(0),
});

export const insertRiskEventSchema = createInsertSchema(riskEvents).omit({ id: true });
export type InsertRiskEvent = z.infer<typeof insertRiskEventSchema>;
export type RiskEvent = typeof riskEvents.$inferSelect;

// ─── Sentiment Feed ───
export const sentimentEntries = sqliteTable("sentiment_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  symbol: text("symbol").notNull(),
  sentiment: text("sentiment").notNull(), // "bullish" | "bearish" | "neutral"
  score: real("score").notNull(),
  source: text("source"), // "ollama" | "news" | "sec"
  summary: text("summary"),
});

export const insertSentimentEntrySchema = createInsertSchema(sentimentEntries).omit({ id: true });
export type InsertSentimentEntry = z.infer<typeof insertSentimentEntrySchema>;
export type SentimentEntry = typeof sentimentEntries.$inferSelect;

// ─── Audit Log ───
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  hmacSignature: text("hmac_signature"), // HMAC-signed for tamper detection
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

// ─── System Status ───


// Trade decision audit (structured JSON for reproducibility)
export const decisionLogs = sqliteTable("decision_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  tradingMode: text("trading_mode").notNull(),
  category: text("category").notNull(),
  underlyingSymbol: text("underlying_symbol").notNull(),
  strategy: text("strategy").notNull(),
  payloadJson: text("payload_json").notNull(),
  hmacSignature: text("hmac_signature"),
});

export const insertDecisionLogSchema = createInsertSchema(decisionLogs).omit({ id: true });
export type InsertDecisionLog = z.infer<typeof insertDecisionLogSchema>;
export type DecisionLog = typeof decisionLogs.$inferSelect;

export const systemStatus = sqliteTable("system_status", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  component: text("component").notNull(), // "broker" | "ollama" | "database" | "orchestrator"
  status: text("status").notNull(), // "healthy" | "degraded" | "down"
  lastCheck: text("last_check").notNull(),
  message: text("message"),
  responseTimeMs: integer("response_time_ms"),
});

export const insertSystemStatusSchema = createInsertSchema(systemStatus).omit({ id: true });
export type InsertSystemStatus = z.infer<typeof insertSystemStatusSchema>;
export type SystemStatus = typeof systemStatus.$inferSelect;

// ─── Validation schemas for API endpoints ───
export const tradingModeSchema = z.object({
  mode: z.enum(["paper", "live"]),
  confirmation: z.string().optional(), // required "CONFIRM LIVE TRADING" for live mode
});

export const killSwitchSchema = z.object({
  action: z.enum(["activate", "deactivate"]),
  confirmation: z.string().optional(), // required for deactivate
});

export const apiKeySchema = z.object({
  tradingMode: z.enum(["paper", "live"]),
  apiKey: z.string().min(10).max(100),
  apiSecret: z.string().min(10).max(100),
});

