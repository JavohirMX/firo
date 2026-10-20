import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Board export endpoint", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;

  const get = (path: string, session?: string) =>
    fetch(`${serverUrl}${path}`, {
      headers: session ? { Cookie: `firo_session=${session}` } : {},
    });

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
    const addr = server.address() as { port: number };
    serverUrl = `http://127.0.0.1:${addr.port}`;

    for (const id of ["owner", "viewer"]) {
      storage.createUser({
        id,
        username: id,
        password_hash: "unused",
        salt: "unused",
        is_admin: 0,
      });
      storage.createSession(`${id}-session`, id, 60_000);
    }
    storage.createBoard("exp-board", "Board", "owner");
    storage.setBoardMember("exp-board", "viewer", "viewer");

    const doc = new Y.Doc();
    doc.getMap("board").set("title", "hello");
    storage.appendUpdate("exp-board", Y.encodeStateAsUpdate(doc));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  it("returns the board state to the owner", async () => {
    const res = await get("/api/boards/exp-board/export", "owner-session");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");

    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(await res.arrayBuffer()));
    expect(restored.getMap("board").get("title")).toBe("hello");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await get("/api/boards/exp-board/export");
    expect(res.status).toBe(401);
  });

  it("rejects non-owner members", async () => {
    const res = await get("/api/boards/exp-board/export", "viewer-session");
    expect(res.status).toBe(403);
  });

  it("does not reveal whether a board exists to non-owners", async () => {
    const res = await get("/api/boards/missing/export", "viewer-session");
    expect(res.status).toBe(403);
  });
});
