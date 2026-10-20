import { describe, it, expect, afterEach, vi } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";

describe("maintenance", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deleteExpiredSessions removes only expired sessions and counts them", () => {
    const storage = new Storage(new Database(":memory:"));
    storage.createUser({
      id: "u1",
      username: "u1",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createSession("old", "u1", -1000);
    storage.createSession("live", "u1", 60_000);
    expect(storage.deleteExpiredSessions()).toBe(1);
    expect(storage.getSession("live")).not.toBeNull();
    expect(storage.deleteExpiredSessions()).toBe(0);
    storage.close();
  });

  it("RateLimiter.prune drops idle keys and keeps active ones", () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(5, 1000);
    limiter.check("idle");
    vi.advanceTimersByTime(1500);
    limiter.check("active");
    expect(limiter.prune()).toBe(1);
    expect(limiter.prune()).toBe(0);
  });
});
