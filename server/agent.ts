import { log } from "./log";
import { broadcastAgentHealth } from "./websocket";

const AGENT_URL = (process.env.TITAN_ENGINE_URL ?? "").trim();

export interface AgentHealth {
  status: "healthy" | "degraded" | "offline";
  uptime?: number;
  lastCycle?: string;
  killSwitchActive?: boolean;
  localOnly?: boolean;
  message?: string;
}

async function internalHealth(): Promise<AgentHealth> {
  try {
    const mod = await import("./trading-engine");
    const engineMod = mod as typeof import("./trading-engine");
    const st = engineMod.getEngineState?.();
    const ok = st ? !st.lastError && st.running !== undefined : false;
    return {
      status: ok || st?.lastCycleAt ? "healthy" : "degraded",
      localOnly: true,
      lastCycle: st?.lastCycleAt ?? undefined,
      message: st?.lastError ?? "Built-in Alpaca + Ollama engine",
    };
  } catch {
    return { status: "degraded", localOnly: true, message: "Engine module unavailable" };
  }
}

export async function getAgentHealth(): Promise<AgentHealth> {
  if (!AGENT_URL) {
    return internalHealth();
  }
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

export async function getAgentMetrics(): Promise<string | null> {
  if (!AGENT_URL) {
    try {
      const mod = await import("./trading-engine");
      const engineMod = mod as typeof import("./trading-engine");
      return engineMod.getPrometheusText?.() ?? null;
    } catch {
      return null;
    }
  }
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

export async function getAgentStatus(): Promise<unknown | null> {
  if (!AGENT_URL) {
    try {
      const mod = await import("./trading-engine");
      const engineMod = mod as typeof import("./trading-engine");
      return {
        engine: engineMod.getEngineState?.(),
      };
    } catch {
      return null;
    }
  }
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

let healthInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthPolling(intervalMs = 15000): void {
  if (healthInterval) return;
  healthInterval = setInterval(async () => {
    const health = await getAgentHealth();
    broadcastAgentHealth(health);
  }, intervalMs);
  void getAgentHealth().then((h) => broadcastAgentHealth(h));
  log(`Health updates every ${intervalMs / 1000}s (${AGENT_URL ? "remote engine" : "built-in"})`, "agent");
}

export function stopHealthPolling(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
    log("Agent health polling stopped", "agent");
  }
}
