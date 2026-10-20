import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("POST /api/boards", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;

  const post = (body: unknown, session?: string) =>
    fetch(`${serverUrl}/api/boards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Cookie: `firo_session=${session}` } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
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

    for (const id of ["ann", "bob"]) {
      storage.createUser({
        id,
        username: id,
        password_hash: "unused",
        salt: "unused",
        is_admin: 0,
      });
      storage.createSession(`${id}-session`, id, 60_000);
    }
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  it("requires a session", async () => {
    expect((await post({ id: "b1" })).status).toBe(401);
    expect(storage.getBoard("b1")).toBeNull();
  });

  it("creates a board owned by the caller, then lets them share it", async () => {
    const res = await post({ id: "b1", name: "Retro" }, "ann-session");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ board: { id: "b1", name: "Retro" } });
    expect(storage.getBoard("b1")?.owner_id).toBe("ann");

    const share = await fetch(`${serverUrl}/api/boards/b1/shares`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "firo_session=ann-session",
      },
      body: JSON.stringify({ role: "viewer" }),
    });
    expect(share.status).toBe(201);
  });

  it("defaults the name", async () => {
    const res = await post({ id: "b2" }, "ann-session");
    expect((await res.json()).board.name).toBe("Untitled Board");
  });

  it("is idempotent for the owner and does not rename the board", async () => {
    await post({ id: "b3", name: "First" }, "ann-session");
    const again = await post({ id: "b3", name: "Second" }, "ann-session");
    expect(again.status).toBe(200);
    expect((await again.json()).board.name).toBe("First");
    expect(storage.getBoard("b3")?.name).toBe("First");
  });

  it("refuses a board that belongs to someone else without changing it", async () => {
    await post({ id: "b4", name: "Ann's" }, "ann-session");
    const res = await post({ id: "b4", name: "Hijack" }, "bob-session");
    expect(res.status).toBe(403);
    expect(storage.getBoard("b4")).toMatchObject({
      owner_id: "ann",
      name: "Ann's",
    });
  });

  it.each([
    ["missing id", {}],
    ["non-string id", { id: 5 }],
    ["empty id", { id: "" }],
    ["id with a slash", { id: "a/b" }],
    ["id too long", { id: "x".repeat(129) }],
    ["empty name", { id: "ok", name: "" }],
    ["non-string name", { id: "ok", name: 7 }],
    ["name too long", { id: "ok", name: "n".repeat(201) }],
    ["invalid JSON", "{not json"],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await post(body, "ann-session");
    expect(res.status).toBe(400);
    expect(storage.getBoard("ok")).toBeNull();
  });
});
