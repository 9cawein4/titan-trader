import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupWebSocket } from "./websocket";
import { startHealthPolling } from "./agent";
import { log } from "./log";
import { apiErrorHandler } from "./apiErrorHandler";
import { attachOptionalApiTokenAuth } from "./apiAuth";

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[titan-trader] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err: Error) => {
  console.error("[titan-trader] Uncaught exception:", err);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

setupWebSocket(httpServer);

startHealthPolling();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const o = err as { type?: string };
  if (err instanceof SyntaxError || o.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON in request body",
      message: "Invalid JSON in request body",
    });
  }
  next(err);
});

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json.bind(res);
  res.json = function (bodyJson: unknown, ...args: unknown[]) {
    capturedJsonResponse = bodyJson as Record<string, unknown>;
    return (originalResJson as (body: unknown, ...a: unknown[]) => Response)(
      bodyJson,
      ...(args as []),
    );
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  if (!process.env.TITAN_ENCRYPTION_KEY) {
    console.warn(
      "WARNING: TITAN_ENCRYPTION_KEY not set. Encrypted settings will not survive restarts — generate one for local use.",
    );
  }

  attachOptionalApiTokenAuth(app);
  await registerRoutes(httpServer, app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    } catch (e) {
      console.error("[titan-trader] Vite middleware failed:", e);
      process.exit(1);
    }
  }

  app.use(apiErrorHandler);

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "127.0.0.1";

  httpServer.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[titan-trader] Port ${port} is already in use. Stop the other process or set PORT in .env.`);
    } else {
      console.error("[titan-trader] HTTP server error:", err.message);
    }
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    log(`local app → http://${host}:${port}`, "express");
  });
})();
