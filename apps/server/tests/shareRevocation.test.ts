import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Board share revocation", () => {
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

    server = http.createServer(handler);
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

  describe("Board share revocation", () => {
    it.each(["POST", "DELETE"])(
      "does not revoke another board's share via %s",
      async (method) => {
        const owner = storage.createUser({
          id: "board-owner",
          username: "owner",
          password_hash: "unused",
          salt: "unused",
          is_admin: 0,
        });
        storage.createBoard("owned-board", "Owned board", owner.id);
        storage.createBoard("other-board", "Other board");
        storage.createSession("owner-session", owner.id, 60_000);
        const share = storage.createShare({
          id: "other-share",
          boardId: "other-board",
          token: "other-token",
          role: "viewer",
        });
        const suffix = method === "POST" ? "/revoke" : "";
        const response = await fetch(
          `${serverUrl}/api/boards/owned-board/shares/${share.id}${suffix}`,
          { method, headers: { Cookie: "firo_session=owner-session" } },
        );
        expect(response.status).toBe(404);
        expect(storage.getShareById(share.id)?.revoked).toBe(0);
      },
    );

    it.each(["POST", "DELETE"])(
      "revokes a share belonging to the owned board via %s",
      async (method) => {
        const owner = storage.createUser({
          id: "board-owner",
          username: "owner",
          password_hash: "unused",
          salt: "unused",
          is_admin: 0,
        });
        storage.createBoard("owned-board", "Owned board", owner.id);
        storage.createSession("owner-session", owner.id, 60_000);
        const share = storage.createShare({
          id: "owned-share",
          boardId: "owned-board",
          token: "owned-token",
          role: "viewer",
        });
        const suffix = method === "POST" ? "/revoke" : "";
        const response = await fetch(
          `${serverUrl}/api/boards/owned-board/shares/${share.id}${suffix}`,
          { method, headers: { Cookie: "firo_session=owner-session" } },
        );
        expect(response.status).toBe(200);
        expect(storage.getShareById(share.id)?.revoked).toBe(1);
      },
    );
  });
});
