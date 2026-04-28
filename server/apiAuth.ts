import type { Express, NextFunction, Request, Response } from "express";

/** When TITAN_API_TOKEN is set, require matching X-Titan-Token on /api (local LAN hardening). */
export function attachOptionalApiTokenAuth(app: Express): void {
  const tok = process.env.TITAN_API_TOKEN?.trim();
  if (!tok) return;
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers["x-titan-token"];
    const got = typeof h === "string" ? h : Array.isArray(h) ? h[0] : "";
    if (got !== tok) {
      return res.status(401).json({ error: "Unauthorized", message: "Missing or invalid X-Titan-Token" });
    }
    next();
  });
}

