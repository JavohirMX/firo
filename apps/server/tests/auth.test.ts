import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { hashPassword, verifyPassword } from "../src/auth/crypto.js";
import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";

describe("Auth & REST endpoints", () => {
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

  describe("Password hashing", () => {
    it("hashes and verifies passwords correctly", () => {
      const { hash, salt } = hashPassword("SuperSecret123!");
      expect(hash).toBeTypeOf("string");
      expect(salt).toBeTypeOf("string");

      expect(verifyPassword("SuperSecret123!", hash, salt)).toBe(true);
      expect(verifyPassword("WrongPassword", hash, salt)).toBe(false);
      expect(verifyPassword("", hash, salt)).toBe(false);
    });
  });

  describe("Auth endpoints", () => {
    it("handles health check at /healthz", async () => {
      const res = await fetch(`${serverUrl}/healthz`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("OK");
    });

    it("registers first user as admin, second as regular user", async () => {
      // Register Admin
      const res1 = await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "password123" }),
      });

      expect(res1.status).toBe(201);
      const data1 = (await res1.json()) as {
        user: { username: string; isAdmin: boolean };
      };
      expect(data1.user.username).toBe("alice");
      expect(data1.user.isAdmin).toBe(true);

      const cookie1 = res1.headers.get("set-cookie");
      expect(cookie1).toContain("firo_session=");
      expect(cookie1).toContain("HttpOnly");

      // Register second user
      const res2 = await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "bob", password: "password456" }),
      });

      expect(res2.status).toBe(201);
      const data2 = (await res2.json()) as {
        user: { username: string; isAdmin: boolean };
      };
      expect(data2.user.username).toBe("bob");
      expect(data2.user.isAdmin).toBe(false);
    });

    it("rejects duplicate usernames", async () => {
      await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "charlie", password: "password123" }),
      });

      const dupRes = await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Charlie", password: "password999" }),
      });

      expect(dupRes.status).toBe(409);
    });

    it("logs in, fetches /api/auth/me, and logs out", async () => {
      await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "dan", password: "password123" }),
      });

      // Login
      const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "dan", password: "password123" }),
      });
      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers.get("set-cookie")!;
      expect(setCookie).toContain("firo_session=");

      // Extract session cookie value
      const cookieVal = setCookie.split(";")[0];

      // /api/auth/me with Cookie
      const meRes = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { Cookie: cookieVal },
      });
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as { user: { username: string } };
      expect(meData.user.username).toBe("dan");

      // Logout
      const logoutRes = await fetch(`${serverUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookieVal },
      });
      expect(logoutRes.status).toBe(200);

      // Subsequent /api/auth/me should fail
      const meAfterLogout = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { Cookie: cookieVal },
      });
      expect(meAfterLogout.status).toBe(401);
    });

    it("enforces rate limits on auth requests", async () => {
      // 5 allowed requests
      for (let i = 0; i < 5; i++) {
        await fetch(`${serverUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "unknown", password: "wrong" }),
        });
      }

      // 6th request must be 429 Too Many Requests
      const rateLimited = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "unknown", password: "wrong" }),
      });

      expect(rateLimited.status).toBe(429);
      const err = (await rateLimited.json()) as { error: string };
      expect(err.error).toContain("Too many requests");
    });
  });
});
