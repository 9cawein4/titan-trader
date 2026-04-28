import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";

/** When TITAN_API_TOKEN is set, require matching X-Titan-Token on /api (local LAN hardening). */
export function attachOptionalApiTokenAuth(app: Express): void {
  const tok = process.env.TITAN_API_TOKEN?.trim();
  if (!tok) return;
  const expected = Buffer.from(tok);

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers["x-titan-token"];
    const got = typeof h === "string" ? h : Array.isArray(h) ? h[0] : "";
    const provided = Buffer.from(got);

    const validLength = provided.length === expected.length;
    const validToken = validLength && crypto.timingSafeEqual(provided, expected);
    if (!validToken) {
      return res.status(401).json({ error: "Unauthorized", message: "Missing or invalid X-Titan-Token" });
    }
    next();
  });
}
