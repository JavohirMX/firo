import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

import type { ServerConfig } from "../src/config.js";

describe("Auth route validation", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;

  const start = async (config: Partial<ServerConfig> = {}) => {
    db = new Database(":memory:");
    storage = new Storage(db);
    const handler = createHttpHandler({
      storage,
      config: loadConfig({ sessionTtlMs: 3600_000, ...config }),
      authRateLimiter: new RateLimiter(1000, 60_000),
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
  };

  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${serverUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  describe("register", () => {
    beforeEach(() => start());

    it.each([
      ["username too short", { username: "ab", password: "secret1" }],
      ["username too long", { username: "u".repeat(51), password: "secret1" }],
      ["blank username", { username: "   ", password: "secret1" }],
      ["password too short", { username: "ann", password: "12345" }],
      ["missing password", { username: "ann" }],
      ["missing username", { password: "secret1" }],
      ["empty body", {}],
      ["invalid JSON", "{nope"],
    ])("rejects %s with 400 and creates no user", async (_label, body) => {
      const res = await post("/api/auth/register", body);
      expect(res.status).toBe(400);
      expect(storage.countUsers()).toBe(0);
    });

    it("trims the username before storing it", async () => {
      const res = await post("/api/auth/register", {
        username: "  ann  ",
        password: "secret1",
      });
      expect(res.status).toBe(201);
      expect(storage.getUserByUsername("ann")).not.toBeNull();
    });

    it("sets an HttpOnly session cookie", async () => {
      const res = await post("/api/auth/register", {
        username: "ann",
        password: "secret1",
      });
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("firo_session=");
      expect(cookie).toMatch(/HttpOnly/i);
    });

    it("never returns the password hash or salt", async () => {
      const res = await post("/api/auth/register", {
        username: "ann",
        password: "secret1",
      });
      const text = await res.text();
      expect(text).not.toMatch(/hash|salt|secret1/i);
    });
  });

  describe("login", () => {
    beforeEach(() => start());

    const register = () =>
      post("/api/auth/register", { username: "ann", password: "secret1" });

    it("rejects a wrong password and an unknown user with the same 401", async () => {
      await register();
      const wrong = await post("/api/auth/login", {
        username: "ann",
        password: "nope-nope",
      });
      const unknown = await post("/api/auth/login", {
        username: "ghost",
        password: "secret1",
      });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(await wrong.json()).toEqual(await unknown.json());
    });

    it.each([
      ["missing password", { username: "ann" }],
      ["missing username", { password: "secret1" }],
      ["empty body", {}],
    ])("rejects %s with 400", async (_label, body) => {
      const res = await post("/api/auth/login", body);
      expect(res.status).toBe(400);
    });

    it("invalidates the session on logout", async () => {
      const reg = await register();
      const cookie = (reg.headers.get("set-cookie") ?? "").split(";")[0];
      const before = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { Cookie: cookie },
      });
      expect(before.status).toBe(200);

      const out = await post("/api/auth/logout", {}, cookie);
      expect(out.status).toBe(200);

      const after = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { Cookie: cookie },
      });
      expect(after.status).toBe(401);
    });

    it("answers /api/auth/me with 401 and no cookie", async () => {
      const res = await fetch(`${serverUrl}/api/auth/me`);
      expect(res.status).toBe(401);
    });
    it("does not reveal unknown usernames through response timing", async () => {
      // Baseline: one real scrypt verification in this process.
      const { hashPassword, verifyPassword } = await import(
        "../src/auth/crypto.js"
      );
      const creds = hashPassword("baseline-password");
      const t0 = performance.now();
      verifyPassword("candidate", creds.hash, creds.salt);
      const scryptMs = performance.now() - t0;

      const t1 = performance.now();
      const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "no-such-user",
          password: "whatever1",
        }),
      });
      const elapsed = performance.now() - t1;
      expect(res.status).toBe(401);
      // Unknown user must still pay a full scrypt; allow a wide margin for
      // loaded CI machines, but a skipped verify would be ~instant.
      expect(elapsed).toBeGreaterThan(scryptMs * 0.5);
    });
  });
  describe("closed registration", () => {
    beforeEach(() => start({ allowOpenRegistration: false }));

    it("allows the first account, then refuses further sign-ups", async () => {
      const first = await post("/api/auth/register", {
        username: "admin",
        password: "secret1",
      });
      expect(first.status).toBe(201);

      const second = await post("/api/auth/register", {
        username: "bob",
        password: "secret1",
      });
      expect(second.status).toBe(403);
      expect(storage.getUserByUsername("bob")).toBeNull();
    });
  });
});
