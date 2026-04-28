import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { log } from "./log";

// ─── Typed event system for real-time client updates ───
export type WsEventType =
  | "trade_executed"
  | "portfolio_update"
  | "risk_event"
  | "kill_switch"
  | "sentiment_update"
  | "system_status"
  | "cycle_complete"
  | "agent_health";

export interface WsEvent {
  type: WsEventType;
  data: unknown;
  timestamp: string;
}

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    log("WebSocket client connected", "ws");
    // Send initial heartbeat
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));

    ws.on("close", () => {
      log("WebSocket client disconnected", "ws");
    });

    ws.on("error", (err) => {
      log(`WebSocket error: ${err.message}`, "ws");
    });
  });

  // Heartbeat every 30s to keep connections alive
  const interval = setInterval(() => {
    wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }));
        } catch (e) {
          log(`WS heartbeat send failed: ${e instanceof Error ? e.message : String(e)}`, "ws");
        }
      }
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  log("WebSocket server initialized on /ws", "ws");
  return wss;
}

// Broadcast an event to all connected clients
export function broadcast(event: WsEvent): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (e) {
        log(`WS broadcast send failed: ${e instanceof Error ? e.message : String(e)}`, "ws");
      }
    }
  });
}

// Convenience helpers for common event types
export function broadcastTrade(trade: unknown): void {
  broadcast({ type: "trade_executed", data: trade, timestamp: new Date().toISOString() });
}

export function broadcastPortfolio(snapshot: unknown): void {
  broadcast({ type: "portfolio_update", data: snapshot, timestamp: new Date().toISOString() });
}

export function broadcastRiskEvent(event: unknown): void {
  broadcast({ type: "risk_event", data: event, timestamp: new Date().toISOString() });
}

export function broadcastKillSwitch(data: unknown): void {
  broadcast({ type: "kill_switch", data, timestamp: new Date().toISOString() });
}

export function broadcastAgentHealth(health: unknown): void {
  broadcast({ type: "agent_health", data: health, timestamp: new Date().toISOString() });
}
