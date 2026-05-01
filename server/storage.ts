import {
  type TradingConfig, type InsertTradingConfig, tradingConfig,
  type PortfolioSnapshot, type InsertPortfolioSnapshot, portfolioSnapshots,
  type Position, type InsertPosition, positions,
  type Trade, type InsertTrade, trades,
  type Strategy, type InsertStrategy, strategies,
  type OptionsPosition, type InsertOptionsPosition, optionsPositions,
  type RiskEvent, type InsertRiskEvent, riskEvents,
  type SentimentEntry, type InsertSentimentEntry, sentimentEntries,
  type AuditLog, type InsertAuditLog, auditLog,
  type DecisionLog, type InsertDecisionLog, decisionLogs,
  type SystemStatus, type InsertSystemStatus, systemStatus,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc, and, gte, lte } from "drizzle-orm";

import { resolveDbPath } from "./paths";
const sqlite = new Database(resolveDbPath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

function ensureDecisionLogsTable(): void {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'decision_logs'")
    .get() as { name: string } | undefined;
  if (row) return;
  sqlite.exec(`
    CREATE TABLE decision_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      timestamp TEXT NOT NULL,
      trading_mode TEXT NOT NULL,
      category TEXT NOT NULL,
      underlying_symbol TEXT NOT NULL,
      strategy TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      hmac_signature TEXT
    );
  `);
}
function ensureTradingConfigTaxColumns(): void {
  const cols = sqlite.prepare("PRAGMA table_info(trading_config)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("tax_federal_marginal_rate")) {
    sqlite.exec("ALTER TABLE trading_config ADD COLUMN tax_federal_marginal_rate REAL DEFAULT 0.22;");
  }
  if (!names.has("tax_state_rate")) {
    sqlite.exec("ALTER TABLE trading_config ADD COLUMN tax_state_rate REAL DEFAULT 0.05;");
  }
  if (!names.has("tax_long_term_fed_rate")) {
    sqlite.exec("ALTER TABLE trading_config ADD COLUMN tax_long_term_fed_rate REAL DEFAULT 0.15;");
  }
  if (!names.has("tax_state_long_term_rate")) {
    sqlite.exec("ALTER TABLE trading_config ADD COLUMN tax_state_long_term_rate REAL;");
    sqlite.exec("UPDATE trading_config SET tax_state_long_term_rate = tax_state_rate WHERE tax_state_long_term_rate IS NULL;");
  }
  if (!names.has("tax_residency_state")) {
    sqlite.exec("ALTER TABLE trading_config ADD COLUMN tax_residency_state TEXT DEFAULT '';");
  }
}
ensureTradingConfigTaxColumns();

export const db = drizzle(sqlite);

export interface IStorage {
  // Trading Config
  getTradingConfig(): Promise<TradingConfig | undefined>;
  upsertTradingConfig(config: InsertTradingConfig): Promise<TradingConfig>;

  // Portfolio
  getLatestSnapshot(mode: string): Promise<PortfolioSnapshot | undefined>;
  getSnapshots(mode: string, limit?: number): Promise<PortfolioSnapshot[]>;
  createSnapshot(snapshot: InsertPortfolioSnapshot): Promise<PortfolioSnapshot>;

  // Positions
  getPositions(mode: string): Promise<Position[]>;
  upsertPosition(position: InsertPosition): Promise<Position>;
  deletePosition(id: number): Promise<void>;
  clearPositions(mode: string): Promise<void>;

  // Trades
  getTrades(mode: string, limit?: number, status?: string): Promise<Trade[]>;
  getAllTradesForMode(mode: string): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;

  // Strategies
  getStrategies(): Promise<Strategy[]>;
  upsertStrategy(strategy: InsertStrategy): Promise<Strategy>;
  updateStrategy(id: number, patch: Partial<InsertStrategy>): Promise<Strategy | undefined>;

  // Options
  getOptionsPositions(mode: string): Promise<OptionsPosition[]>;
  createOptionsPosition(pos: InsertOptionsPosition): Promise<OptionsPosition>;
  updateOptionsPosition(id: number, data: Partial<InsertOptionsPosition>): Promise<void>;
  clearOptionsPositions(mode: string): Promise<void>;

  // Risk
  getRiskEvents(limit?: number): Promise<RiskEvent[]>;
  getActiveRiskEvents(): Promise<RiskEvent[]>;
  createRiskEvent(event: InsertRiskEvent): Promise<RiskEvent>;
  resolveRiskEvent(id: number): Promise<void>;

  // Sentiment
  getSentimentEntries(limit?: number): Promise<SentimentEntry[]>;
  createSentimentEntry(entry: InsertSentimentEntry): Promise<SentimentEntry>;

  // Audit
  getAuditLog(limit?: number): Promise<AuditLog[]>;
  createAuditEntry(entry: InsertAuditLog): Promise<AuditLog>;

  getDecisionLogs(mode: string, limit?: number, category?: string): Promise<DecisionLog[]>;
  createDecisionLog(entry: InsertDecisionLog): Promise<DecisionLog>;

  // System Status
  getSystemStatuses(): Promise<SystemStatus[]>;
  upsertSystemStatus(status: InsertSystemStatus): Promise<SystemStatus>;
}

export class DatabaseStorage implements IStorage {
  // ─── Trading Config ───
  async getTradingConfig(): Promise<TradingConfig | undefined> {
    return db.select().from(tradingConfig).get();
  }
  async upsertTradingConfig(config: InsertTradingConfig): Promise<TradingConfig> {
    const existing = await this.getTradingConfig();
    if (existing) {
      db.update(tradingConfig).set(config).where(eq(tradingConfig.id, existing.id)).run();
      return db.select().from(tradingConfig).where(eq(tradingConfig.id, existing.id)).get()!;
    }
    return db.insert(tradingConfig).values(config).returning().get();
  }

  // ─── Portfolio ───
  async getLatestSnapshot(mode: string): Promise<PortfolioSnapshot | undefined> {
    return db.select().from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.tradingMode, mode))
      .orderBy(desc(portfolioSnapshots.timestamp))
      .limit(1).get();
  }
  async getSnapshots(mode: string, limit = 100): Promise<PortfolioSnapshot[]> {
    return db.select().from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.tradingMode, mode))
      .orderBy(desc(portfolioSnapshots.timestamp))
      .limit(limit).all();
  }
  async createSnapshot(snapshot: InsertPortfolioSnapshot): Promise<PortfolioSnapshot> {
    return db.insert(portfolioSnapshots).values(snapshot).returning().get();
  }

  // ─── Positions ───
  async getPositions(mode: string): Promise<Position[]> {
    return db.select().from(positions)
      .where(eq(positions.tradingMode, mode)).all();
  }
  async upsertPosition(position: InsertPosition): Promise<Position> {
    return db.insert(positions).values(position).returning().get();
  }
  async deletePosition(id: number): Promise<void> {
    db.delete(positions).where(eq(positions.id, id)).run();
  }
  async clearPositions(mode: string): Promise<void> {
    db.delete(positions).where(eq(positions.tradingMode, mode)).run();
  }

  // ─── Trades ───
  async getTrades(mode: string, limit = 100, status?: string): Promise<Trade[]> {
    if (status) {
      return db.select().from(trades)
        .where(and(eq(trades.tradingMode, mode), eq(trades.status, status)))
        .orderBy(desc(trades.timestamp)).limit(limit).all();
    }
    return db.select().from(trades)
      .where(eq(trades.tradingMode, mode))
      .orderBy(desc(trades.timestamp)).limit(limit).all();
  }
  async getAllTradesForMode(mode: string): Promise<Trade[]> {
    return db
      .select()
      .from(trades)
      .where(eq(trades.tradingMode, mode))
      .orderBy(asc(trades.timestamp))
      .all();
  }
  async createTrade(trade: InsertTrade): Promise<Trade> {
    return db.insert(trades).values(trade).returning().get();
  }

  // ─── Strategies ───
  async getStrategies(): Promise<Strategy[]> {
    return db.select().from(strategies).all();
  }
  async upsertStrategy(strategy: InsertStrategy): Promise<Strategy> {
    return db.insert(strategies).values(strategy).returning().get();
  }

  async updateStrategy(id: number, patch: Partial<InsertStrategy>): Promise<Strategy | undefined> {
    db.update(strategies).set(patch).where(eq(strategies.id, id)).run();
    return db.select().from(strategies).where(eq(strategies.id, id)).get();
  }

  // ─── Options ───
  async getOptionsPositions(mode: string): Promise<OptionsPosition[]> {
    return db.select().from(optionsPositions)
      .where(eq(optionsPositions.tradingMode, mode)).all();
  }
  async createOptionsPosition(pos: InsertOptionsPosition): Promise<OptionsPosition> {
    return db.insert(optionsPositions).values(pos).returning().get();
  }
  async updateOptionsPosition(id: number, data: Partial<InsertOptionsPosition>): Promise<void> {
    db.update(optionsPositions).set(data).where(eq(optionsPositions.id, id)).run();
  }

  async clearOptionsPositions(mode: string): Promise<void> {
    db.delete(optionsPositions).where(eq(optionsPositions.tradingMode, mode)).run();
  }

  // ─── Risk ───
  async getRiskEvents(limit = 50): Promise<RiskEvent[]> {
    return db.select().from(riskEvents)
      .orderBy(desc(riskEvents.timestamp)).limit(limit).all();
  }
  async getActiveRiskEvents(): Promise<RiskEvent[]> {
    return db.select().from(riskEvents)
      .where(eq(riskEvents.resolved, 0))
      .orderBy(desc(riskEvents.timestamp)).all();
  }
  async createRiskEvent(event: InsertRiskEvent): Promise<RiskEvent> {
    return db.insert(riskEvents).values(event).returning().get();
  }
  async resolveRiskEvent(id: number): Promise<void> {
    db.update(riskEvents).set({ resolved: 1 }).where(eq(riskEvents.id, id)).run();
  }

  // ─── Sentiment ───
  async getSentimentEntries(limit = 50): Promise<SentimentEntry[]> {
    return db.select().from(sentimentEntries)
      .orderBy(desc(sentimentEntries.timestamp)).limit(limit).all();
  }
  async createSentimentEntry(entry: InsertSentimentEntry): Promise<SentimentEntry> {
    return db.insert(sentimentEntries).values(entry).returning().get();
  }

  // ─── Audit ───
  async getAuditLog(limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLog)
      .orderBy(desc(auditLog.timestamp)).limit(limit).all();
  }
  async createAuditEntry(entry: InsertAuditLog): Promise<AuditLog> {
    return db.insert(auditLog).values(entry).returning().get();
  }
  async getDecisionLogs(mode: string, limit = 200, category?: string): Promise<DecisionLog[]> {
    if (category) {
      return db
        .select()
        .from(decisionLogs)
        .where(and(eq(decisionLogs.tradingMode, mode), eq(decisionLogs.category, category)))
        .orderBy(desc(decisionLogs.timestamp))
        .limit(limit)
        .all();
    }
    return db
      .select()
      .from(decisionLogs)
      .where(eq(decisionLogs.tradingMode, mode))
      .orderBy(desc(decisionLogs.timestamp))
      .limit(limit)
      .all();
  }
  async createDecisionLog(entry: InsertDecisionLog): Promise<DecisionLog> {
    return db.insert(decisionLogs).values(entry).returning().get();
  }

  // ─── System Status ───
  async getSystemStatuses(): Promise<SystemStatus[]> {
    return db.select().from(systemStatus).all();
  }
  async upsertSystemStatus(status: InsertSystemStatus): Promise<SystemStatus> {
    const existing = db.select().from(systemStatus)
      .where(eq(systemStatus.component, status.component)).get();
    if (existing) {
      db.update(systemStatus).set(status).where(eq(systemStatus.id, existing.id)).run();
      return db.select().from(systemStatus).where(eq(systemStatus.id, existing.id)).get()!;
    }
    return db.insert(systemStatus).values(status).returning().get();
  }
}

export const storage = new DatabaseStorage();

