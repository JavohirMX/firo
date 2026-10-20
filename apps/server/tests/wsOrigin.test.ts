import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import WebSocket from "ws";

import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";
import { createSession } from "../src/auth/session.js";

describe("WebSocket Origin check", () => {
  let storage: Storage;
  let server: http.Server;
  let relay: WebSocketRelay;
  let port: number;
  let cookie: string;

  beforeEach(async () => {
    storage = new Storage(new Database(":memory:"));
    server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    relay = new WebSocketRelay({
      storage,
      server,
      allowedOrigins: ["https://app.example.com"],
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;

    const user = storage.createUser({
      id: "u-ws",
      username: "ws_user",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("b-ws", "WS", user.id);
    cookie = `firo_session=${createSession(storage, user.id, 60_000).token}`;
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((r) => server.close(() => r()));
    storage.close();
  });

  const connect = (origin?: string): Promise<"open" | number> =>
    new Promise((resolve) => {
      const headers: Record<string, string> = { Cookie: cookie };
      if (origin) {
        headers.Origin = origin;
      }
      const ws = new WebSocket(`ws://127.0.0.1:${port}/boards/b-ws`, {
        headers,
      });
      ws.on("open", () => {
        ws.close();
        resolve("open");
      });
      ws.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
      ws.on("error", () => {
        /* handled via unexpected-response or close */
      });
      ws.on("close", () => resolve(0));
    });

  it("accepts a client with no Origin header", async () => {
    expect(await connect()).toBe("open");
  });

  it("accepts the same origin", async () => {
    expect(await connect(`http://127.0.0.1:${port}`)).toBe("open");
  });

  it("accepts a configured origin", async () => {
    expect(await connect("https://app.example.com")).toBe("open");
  });

  it("rejects a cross-site origin even with a valid session cookie", async () => {
    expect(await connect("https://evil.example")).not.toBe("open");
  });
});
