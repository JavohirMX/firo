import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";
import { hashPassword } from "../src/auth/crypto.js";
import { createShareProof, verifyShareProof } from "../src/auth/shareProof.js";
import { WebSocketRelay } from "../src/ws/relay.js";

const SHARE_PASSWORD = "correct horse battery staple";

describe("Share link password enforcement", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;
  let relay: WebSocketRelay;

  const seedPasswordShare = (
    token: string,
    overrides: { revoked?: boolean; expiresAt?: number | null } = {},
  ) => {
    const { hash, salt } = hashPassword(SHARE_PASSWORD);
    const share = storage.createShare({
      id: `id-${token}`,
      boardId: "pw-board",
      token,
      role: "editor",
      password_hash: hash,
      salt,
      expires_at: overrides.expiresAt ?? null,
    });
    if (overrides.revoked) {
      storage.revokeShare(token);
    }
    return share;
  };

  const claim = (token: string, body?: unknown) =>
    fetch(`${serverUrl}/api/shares/${token}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    serverUrl = `http://127.0.0.1:${
      (server.address() as { port: number }).port
    }`;
    relay = new WebSocketRelay({ storage });

    storage.createUser({
      id: "pw-owner",
      username: "pw-owner",
      password_hash: "unused",
      salt: "unused",
      is_admin: 0,
    });
    storage.createBoard("pw-board", "Board", "pw-owner");
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  it("still advertises requiresPassword on the public share info", async () => {
    seedPasswordShare("info-tok");
    const res = await fetch(`${serverUrl}/api/shares/info-tok`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share.requiresPassword).toBe(true);
  });

  it("rejects the password claim for an unknown token", async () => {
    const res = await claim("nope-tok", { password: SHARE_PASSWORD });
    expect(res.status).toBe(404);
  });

  it("rejects the password claim for a revoked share", async () => {
    seedPasswordShare("revoked-tok", { revoked: true });
    const res = await claim("revoked-tok", { password: SHARE_PASSWORD });
    expect(res.status).toBe(404);
  });

  it("rejects the password claim for an expired share", async () => {
    seedPasswordShare("expired-tok", { expiresAt: Date.now() - 5_000 });
    const res = await claim("expired-tok", { password: SHARE_PASSWORD });
    expect(res.status).toBe(410);
  });

  it("returns a null proof for a share without a password", async () => {
    storage.createShare({
      id: "id-open-tok",
      boardId: "pw-board",
      token: "open-tok",
      role: "viewer",
      expires_at: null,
    });
    const res = await claim("open-tok", { password: "ignored" });
    expect(res.status).toBe(200);
    expect((await res.json()).proof).toBeNull();
  });

  it("requires a non-empty password when the share has one", async () => {
    seedPasswordShare("empty-tok");
    expect((await claim("empty-tok", {})).status).toBe(400);
    expect((await claim("empty-tok", { password: "" })).status).toBe(400);
    expect((await claim("empty-tok", { password: 42 })).status).toBe(400);
  });

  it("rejects a wrong password and grants no role", async () => {
    seedPasswordShare("wrong-tok");
    const res = await claim("wrong-tok", { password: "wrong" });
    expect(res.status).toBe(401);
    expect(storage.resolveRole("pw-board", null, "wrong-tok")).toBeNull();
  });

  it("issues a proof for the correct password that unlocks the share role", async () => {
    const share = seedPasswordShare("good-tok");
    const res = await claim("good-tok", { password: SHARE_PASSWORD });
    expect(res.status).toBe(200);
    const { proof } = await res.json();
    expect(typeof proof).toBe("string");
    expect(verifyShareProof(share, proof)).toBe(true);
    expect(storage.resolveRole("pw-board", null, "good-tok", true)).toBe(
      "editor",
    );
  });

  it("resolveRole refuses a password share without a valid proof", () => {
    const share = seedPasswordShare("gate-tok");
    // No proof at all, and a proof minted for another share, both fail.
    expect(storage.resolveRole("pw-board", null, "gate-tok")).toBeNull();
    const other = seedPasswordShare("other-tok");
    const foreignProof = createShareProof(other);
    expect(verifyShareProof(share, foreignProof)).toBe(false);
    expect(storage.resolveRole("pw-board", null, "gate-tok", false)).toBeNull();
  });

  it("keeps passwordless shares independent of the proof flag", () => {
    storage.createShare({
      id: "id-plain-tok",
      boardId: "pw-board",
      token: "plain-tok",
      role: "viewer",
      expires_at: null,
    });
    expect(storage.resolveRole("pw-board", null, "plain-tok")).toBe("viewer");
    expect(storage.resolveRole("pw-board", null, "plain-tok", true)).toBe(
      "viewer",
    );
  });

  it("WS connection parsing rejects a password share without the proof", () => {
    seedPasswordShare("ws-tok");
    const reqFor = (path: string): http.IncomingMessage =>
      ({
        url: path,
        headers: { host: "localhost" },
      } as unknown as http.IncomingMessage);

    expect(
      relay.parseConnectionRequest(reqFor("/ws/pw-board?shareToken=ws-tok")),
    ).toBeNull();

    const share = storage.getShareByToken("ws-tok")!;
    const proof = createShareProof(share);
    const parsed = relay.parseConnectionRequest(
      reqFor(
        `/ws/pw-board?shareToken=ws-tok&shareProof=${encodeURIComponent(
          proof,
        )}`,
      ),
    );
    expect(parsed?.role).toBe("editor");
    expect(parsed?.shareProof).toBe(proof);
  });

  it("rate-limits password claims", async () => {
    const limitedHandler = createHttpHandler({
      storage,
      config: loadConfig({ sessionTtlMs: 3600_000 }),
      authRateLimiter: new RateLimiter(1, 60_000),
    });
    const limited = http.createServer((req, res) => {
      void limitedHandler(req, res).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      limited.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const url = `http://127.0.0.1:${
        (limited.address() as { port: number }).port
      }`;
      seedPasswordShare("rl-tok");
      const first = await fetch(`${url}/api/shares/rl-tok/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      const second = await fetch(`${url}/api/shares/rl-tok/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      expect(first.status).toBe(401);
      expect(second.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => limited.close(() => resolve()));
    }
  });
});
