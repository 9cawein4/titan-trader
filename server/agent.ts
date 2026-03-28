import { log } from "./index";
import { broadcastAgentHealth } from "./websocket";

// Python engine endpoint — configured via env var
const AGENT_URL = process.env.TITAN_ENGINE_URL || "http://titan-engine:9090";

export interface AgentHealth {
  status: "healthy" | "degraded" | "offline";
  uptime?: number;
  lastCycle?: string;
  killSwitchActive?: boolean;
}

// Proxy health check to Python engine
export async function getAgentHealth(): Promise<AgentHealth> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${AGENT_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return { status: "healthy", ...data };
    }
    return { status: "degraded" };
  } catch {
    return { status: "offline" };
  }
}

// Proxy metrics from Python engine
export async function getAgentMetrics(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${AGENT_URL}/metrics`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
    return null;
  } catch {
    return null;
  }
}

// Proxy status from Python engine
export async function getAgentStatus(): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${AGENT_URL}/status`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}

// Poll agent health and broadcast to WS clients
let healthInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthPolling(intervalMs = 15000): void {
  if (healthInterval) return;
  healthInterval = setInterval(async () => {
    const health = await getAgentHealth();
    broadcastAgentHealth(health);
  }, intervalMs);
  log(`Agent health polling started (every ${intervalMs / 1000}s)`, "agent");
}

export function stopHealthPolling(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
    log("Agent health polling stopped", "agent");
  }
}
