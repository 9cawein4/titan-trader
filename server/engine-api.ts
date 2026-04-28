import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "./storage";
import {
  startEngine,
  stopEngine,
  getEngineState,
  cancelAllOrdersForCurrentMode,
} from "./trading-engine";

export function registerEngineRoutes(
  app: Express,
  logAudit: (action: string, details: string, req: Request) => Promise<void>,
): void {
  app.post("/api/engine/control", async (req, res) => {
    try {
      const parsed = z.object({ action: z.enum(["start", "stop"]) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (parsed.data.action === "start") startEngine();
      else stopEngine();
      await logAudit("engine_control", parsed.data.action, req);
      res.json({ success: true, state: getEngineState() });
    } catch {
      res.status(500).json({ error: "engine control failed" });
    }
  });

  app.get("/api/engine", (_req, res) => {
    res.json(getEngineState());
  });

  app.patch("/api/strategies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
      if (!parsed.success || !Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid request" });
      }
      const updated = await storage.updateStrategy(id, { enabled: parsed.data.enabled ? 1 : 0 });
      res.json(updated ?? null);
    } catch {
      res.status(500).json({ error: "Strategy update failed" });
    }
  });
}

export async function onKillSwitchActivate(): Promise<void> {
  await cancelAllOrdersForCurrentMode();
  stopEngine();
}
