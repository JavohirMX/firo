import http from "node:http";
import fs from "node:fs";

import { parseRequestUrl } from "./http/requestUrl.js";

import { loadConfig, type ServerConfig } from "./config.js";
import { Storage } from "./db/storage.js";
import { RateLimiter } from "./http/rateLimit.js";
import { createHttpHandler } from "./http/routes.js";
import { createStaticHandler } from "./http/static.js";
import { WebSocketRelay } from "./ws/relay.js";

export class FiroServer {
  public readonly config: ServerConfig;
  public readonly storage: Storage;
  public readonly httpServer: http.Server;
  public readonly relay: WebSocketRelay;
  public readonly authRateLimiter: RateLimiter;
  private maintenanceTimer: NodeJS.Timeout | null = null;

  constructor(configOverrides: Partial<ServerConfig> = {}) {
    this.config = loadConfig(configOverrides);

    // Ensure data directory exists
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }

    this.storage = new Storage(this.config.dbPath);
    this.authRateLimiter = new RateLimiter(
      this.config.authRateLimitMax,
      this.config.authRateLimitWindowMs,
    );

    const apiHandler = createHttpHandler({
      storage: this.storage,
      config: this.config,
      authRateLimiter: this.authRateLimiter,
    });
    const staticHandler = createStaticHandler(this.config.webDir);

    this.httpServer = http.createServer(async (req, res) => {
      const parsedUrl = parseRequestUrl(req.url);
      if (!parsedUrl) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Bad Request");
        return;
      }
      const pathname = parsedUrl.pathname;

      // 1. Health check and /api/* always go to API handler
      if (pathname === "/healthz" || pathname.startsWith("/api/")) {
        await apiHandler(req, res);
        return;
      }

      // 2. Try static asset serving and SPA fallback
      const handled = await staticHandler(req, res);
      if (handled) {
        return;
      }

      // 3. Fallback to API handler (which returns 404)
      await apiHandler(req, res);
    });

    this.relay = new WebSocketRelay({
      storage: this.storage,
      server: this.httpServer,
      allowedOrigins: this.config.allowedOrigins,
    });
  }

  /** Purges expired sessions and idle rate-limit keys. */
  public runMaintenance(): void {
    this.storage.deleteExpiredSessions();
    this.authRateLimiter.prune();
  }

  public async start(): Promise<{ port: number; host: string }> {
    this.runMaintenance();
    this.maintenanceTimer = setInterval(
      () => this.runMaintenance(),
      60 * 60 * 1000,
    );
    this.maintenanceTimer.unref();
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        const address = this.httpServer.address();
        const actualPort =
          typeof address === "object" && address
            ? address.port
            : this.config.port;
        resolve({ port: actualPort, host: this.config.host });
      });
      this.httpServer.once("error", reject);
    });
  }

  public async stop(): Promise<void> {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    return new Promise((resolve) => {
      this.relay.close();
      this.httpServer.close(() => {
        this.storage.close();
        resolve();
      });
    });
  }
}
