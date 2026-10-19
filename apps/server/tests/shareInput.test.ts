import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { hashPassword, verifyPassword } from "../src/auth/crypto.js";
import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Share input validation", () => {
  let db: Database.Database;
  let storage: Storage;
  let rateLimiter: RateLimiter;
  let server: http.Server;
  let serverUrl: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    storage = new Storage(db);
    rateLimiter = new RateLimiter(5, 60_000); // 5 requests per min for testing limit
    const config = loadConfig({ sessionTtlMs: 3600_000 });

    const handler = createHttpHandler({
      storage,
      config,
      authRateLimiter: rateLimiter,
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

    const addr = server.address() as { port: number };
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  describe("Share input validation", () => {
    async function createShareRequest(body: string) {
      const owner = storage.createUser({
        id: "share-owner",
        username: "share-owner",
        password_hash: "unused",
        salt: "unused",
        is_admin: 0,
      });
      storage.createBoard("share-board", "Board", owner.id);
      storage.createSession("share-session", owner.id, 60_000);
      return fetch(`${serverUrl}/api/boards/share-board/shares`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "firo_session=share-session",
        },
        body,
      });
    }

    it.each([
      "{",
      "null",
      "[]",
      "true",
      '"text"',
      '{"password":123}',
      '{"password":{}}',
      '{"password":[]}',
      '{"expiresAt":"tomorrow"}',
      '{"expiresAt":{}}',
      '{"expiresAt":1e999}',
      '{"expiresAt":-1}',
      '{"expiresAt":1.5}',
      '{"role":123}',
      '{"role":{}}',
    ])("rejects invalid share body %s without a write", async (body) => {
      const response = await createShareRequest(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
      expect(storage.listShares("share-board")).toHaveLength(0);
    });

    it.each([
      {},
      { role: "viewer", expiresAt: null },
      { role: "commenter", expiresAt: 2000000000000, password: "secret" },
    ])("accepts valid share options %j", async (body) => {
      const response = await createShareRequest(JSON.stringify(body));
      expect(response.status).toBe(201);
      expect(storage.listShares("share-board")).toHaveLength(1);
    });
  });
});
