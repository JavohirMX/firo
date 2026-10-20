import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Share link expiry over HTTP", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    storage = new Storage(db);
    const handler = createHttpHandler({
      storage,
      config: loadConfig({ sessionTtlMs: 3600_000 }),
      authRateLimiter: new RateLimiter(100, 60_000),
    });
    server = http.createServer((req, res) => {
      void handler(req, res).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    serverUrl = `http://127.0.0.1:${
      (server.address() as { port: number }).port
    }`;

    storage.createUser({
      id: "exp-owner",
      username: "exp-owner",
      password_hash: "unused",
      salt: "unused",
      is_admin: 0,
    });
    storage.createBoard("exp-board", "Board", "exp-owner");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  const addShare = (token: string, expiresAt: number | null) =>
    storage.createShare({
      id: `id-${token}`,
      boardId: "exp-board",
      token,
      role: "viewer",
      expires_at: expiresAt,
    });

  it("returns 410 for an expired share token", async () => {
    addShare("expired-tok", Date.now() - 5_000);
    const res = await fetch(`${serverUrl}/api/shares/expired-tok`);
    expect(res.status).toBe(410);
  });

  it("returns 200 for a share that has not expired yet", async () => {
    addShare("future-tok", Date.now() + 60_000);
    const res = await fetch(`${serverUrl}/api/shares/future-tok`);
    expect(res.status).toBe(200);
  });

  it("returns 200 for a share with no expiry", async () => {
    addShare("forever-tok", null);
    const res = await fetch(`${serverUrl}/s/forever-tok`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await fetch(`${serverUrl}/api/shares/nope`);
    expect(res.status).toBe(404);
  });
});
