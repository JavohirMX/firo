import http from "node:http";

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import WebSocket from "ws";

import { loadConfig } from "../src/config.js";
import { buildSessionCookie, createSession } from "../src/auth/session.js";
import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";

const ENV_KEYS = ["FIRO_SECURE_COOKIES", "FIRO_WS_MAX_PAYLOAD"] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  savedEnv[key] = process.env[key];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("security config", () => {
  it("defaults secureCookies to false", () => {
    delete process.env.FIRO_SECURE_COOKIES;
    expect(loadConfig().secureCookies).toBe(false);
  });

  it("enables secureCookies only on explicit true", () => {
    process.env.FIRO_SECURE_COOKIES = "true";
    expect(loadConfig().secureCookies).toBe(true);
    process.env.FIRO_SECURE_COOKIES = "1";
    expect(loadConfig().secureCookies).toBe(false);
  });

  it("defaults wsMaxPayloadBytes to undefined (ws default applies)", () => {
    delete process.env.FIRO_WS_MAX_PAYLOAD;
    expect(loadConfig().wsMaxPayloadBytes).toBeUndefined();
  });

  it("parses a positive FIRO_WS_MAX_PAYLOAD", () => {
    process.env.FIRO_WS_MAX_PAYLOAD = "16777216";
    expect(loadConfig().wsMaxPayloadBytes).toBe(16777216);
  });

  it("ignores invalid FIRO_WS_MAX_PAYLOAD values", () => {
    for (const raw of ["abc", "0", "-5", ""]) {
      process.env.FIRO_WS_MAX_PAYLOAD = raw;
      expect(loadConfig().wsMaxPayloadBytes).toBeUndefined();
    }
  });

  it("omits the Secure flag by default and sets it when enabled", () => {
    const plain = buildSessionCookie("tok", 1000);
    expect(plain).toContain("HttpOnly");
    expect(plain).toContain("SameSite=Strict");
    expect(plain).not.toContain("Secure");
    const secure = buildSessionCookie("tok", 1000, true);
    expect(secure).toContain("Secure");
  });
});

describe("relay maxPayload", () => {
  it("keeps the ws default cap when none is configured", () => {
    const db = new Database(":memory:");
    const storage = new Storage(db);
    const relay = new WebSocketRelay({ storage });
    expect(relay.wss.options.maxPayload).toBe(104857600);
    relay.close();
    storage.close();
  });

  it("passes a configured cap to the WebSocket server", () => {
    const db = new Database(":memory:");
    const storage = new Storage(db);
    const relay = new WebSocketRelay({ storage, maxPayload: 4096 });
    expect(relay.wss.options.maxPayload).toBe(4096);
    relay.close();
    storage.close();
  });

  it("closes an over-cap message with 1009", async () => {
    const db = new Database(":memory:");
    const storage = new Storage(db);
    const server = http.createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });
    const relay = new WebSocketRelay({ storage, server, maxPayload: 1024 });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const { port } = server.address() as { port: number };

    const owner = storage.createUser({
      id: "u-maxpayload",
      username: "maxpayload",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("board-maxpayload", "Cap", owner.id);
    const { token } = createSession(storage, owner.id, 60 * 1000);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/boards/board-maxpayload`, {
      headers: { Cookie: `firo_session=${token}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.send(Buffer.alloc(64 * 1024));
    const code = await new Promise<number>((resolve) =>
      ws.once("close", (closeCode) => resolve(closeCode)),
    );
    expect(code).toBe(1009);

    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });
});
