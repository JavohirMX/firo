import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Share creation for a board that does not exist", () => {
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

  it("answers 404, not a crash, when an admin shares an unknown board", async () => {
    const admin = storage.createUser({
      id: "admin-user",
      username: "admin-user",
      password_hash: "unused",
      salt: "unused",
      is_admin: 1,
    });
    storage.createSession("admin-session", admin.id, 60_000);

    const response = await fetch(
      `${serverUrl}/api/boards/no-such-board/shares`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "firo_session=admin-session",
        },
        body: JSON.stringify({ role: "viewer" }),
      },
    );

    expect(response.status).toBe(404);
    expect(storage.listShares("no-such-board")).toHaveLength(0);
  });
});
