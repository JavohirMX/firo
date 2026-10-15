import http from "node:http";
import fs from "node:fs";

import { loadConfig, type ServerConfig } from "./config.js";
import { Storage } from "./db/storage.js";
import { RateLimiter } from "./http/rateLimit.js";
import { createHttpHandler } from "./http/routes.js";
import { WebSocketRelay } from "./ws/relay.js";

export class FiroServer {
  public readonly config: ServerConfig;
  public readonly storage: Storage;
  public readonly httpServer: http.Server;
  public readonly relay: WebSocketRelay;
  public readonly authRateLimiter: RateLimiter;

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

    const httpHandler = createHttpHandler({
      storage: this.storage,
      config: this.config,
      authRateLimiter: this.authRateLimiter,
    });

    this.httpServer = http.createServer(httpHandler);
    this.relay = new WebSocketRelay({
      storage: this.storage,
      server: this.httpServer,
    });
  }

  public async start(): Promise<{ port: number; host: string }> {
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
    return new Promise((resolve) => {
      this.relay.close();
      this.httpServer.close(() => {
        this.storage.close();
        resolve();
      });
    });
  }
}
