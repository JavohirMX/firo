import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("CORS policy", () => {
  let storage: Storage;
  let server: http.Server;
  let url: string;
  let port: number;

  beforeEach(async () => {
    storage = new Storage(new Database(":memory:"));
    const config = loadConfig({ allowedOrigins: ["https://app.example.com"] });
    const handler = createHttpHandler({
      storage,
      config,
      authRateLimiter: new RateLimiter(100, 60_000),
    });
    server = http.createServer((req, res) => {
      void handler(req, res).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    storage.close();
  });

  // fetch() forbids setting Origin, so use node:http directly.
  const get = (origin?: string, method = "GET", path = "/healthz") =>
    new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        `${url}${path}`,
        { method, headers: origin ? { Origin: origin } : {} },
        (res) => {
          res.resume();
          resolve(res);
        },
      );
      req.on("error", reject);
      req.end();
    });

  it("does not reflect an unknown origin", async () => {
    const res = await get("https://evil.example");
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers.vary).toContain("Origin");
  });

  it("sends no CORS headers without an Origin header", async () => {
    const res = await get();
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows the same origin", async () => {
    const o = `http://127.0.0.1:${port}`;
    const res = await get(o);
    expect(res.headers["access-control-allow-origin"]).toBe(o);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("allows a configured origin", async () => {
    const res = await get("https://app.example.com");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com",
    );
  });

  it("answers preflight from an unknown origin without allow headers", async () => {
    const res = await get("https://evil.example", "OPTIONS", "/api/auth/login");
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
