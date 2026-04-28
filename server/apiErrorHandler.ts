import type { NextFunction, Request, Response } from "express";
import { log } from "./log";

/** JSON error envelope for this local app; no stack traces in production responses. */
export function apiErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.status === "number") status = o.status;
    else if (typeof o.statusCode === "number") status = o.statusCode;
  }

  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";

  const clientMessage =
    status >= 500 && process.env.NODE_ENV === "production"
      ? "Internal error — check the terminal running the server."
      : rawMessage;

  if (status >= 500) {
    log(`API ${status} ${req.method} ${req.path}: ${rawMessage}`, "express");
    if (err instanceof Error && err.stack && process.env.NODE_ENV !== "production") {
      console.error(err.stack);
    }
  }

  if (res.headersSent) return;
  res.status(status).json({
    error: clientMessage,
    message: clientMessage,
  });
}
