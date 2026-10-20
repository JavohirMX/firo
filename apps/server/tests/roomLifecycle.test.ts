import http from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import WebSocket from "ws";

import { createSession } from "../src/auth/session.js";
import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";

async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Condition not met within timeout");
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("Room lifecycle", () => {
  let storage: Storage;
  let server: http.Server;
  let relay: WebSocketRelay;
  let port: number;
  let token: string;

  beforeEach(async () => {
    storage = new Storage(new Database(":memory:"));
    server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    relay = new WebSocketRelay({ storage, server });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
    const user = storage.createUser({
      id: "u1",
      username: "owner",
      password_hash: "x",
      salt: "x",
      is_admin: 0,
    });
    storage.createBoard("life-board", "Board", user.id);
    token = createSession(storage, user.id, 60_000).token;
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((r) => server.close(() => r()));
    storage.close();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/life-board`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  it("releases a room from memory when its last client leaves", async () => {
    const a = await connect();
    const b = await connect();
    await waitUntil(() => relay.getRoom("life-board")?.clients.size === 2);
    a.close();
    await waitUntil(() => relay.getRoom("life-board")?.clients.size === 1);
    expect(relay.getRoom("life-board")).toBeDefined();
    b.close();
    await waitUntil(() => relay.getRoom("life-board") === undefined);
    expect(relay.rooms.size).toBe(0);
  });

  it("loads a fresh room when someone reconnects", async () => {
    const a = await connect();
    await waitUntil(() => relay.getRoom("life-board") !== undefined);
    a.close();
    await waitUntil(() => relay.getRoom("life-board") === undefined);
    const b = await connect();
    await waitUntil(() => relay.getRoom("life-board")?.clients.size === 1);
    b.close();
  });
});
