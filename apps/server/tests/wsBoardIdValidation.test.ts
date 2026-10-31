import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";
import { createSession } from "../src/auth/session.js";

import type http from "node:http";

describe("WebSocket board id validation", () => {
  let db: Database.Database;
  let storage: Storage;
  let relay: WebSocketRelay;
  let sessionToken: string;

  beforeEach(() => {
    db = new Database(":memory:");
    storage = new Storage(db);
    relay = new WebSocketRelay({ storage });
    const user = storage.createUser({
      id: "u1",
      username: "board-user",
      password_hash: "x",
      salt: "y",
      is_admin: 0,
    });
    sessionToken = createSession(storage, user.id, 60_000).token;
  });

  afterEach(() => {
    relay.close();
    storage.close();
  });

  const reqFor = (path: string): http.IncomingMessage =>
    ({
      url: path,
      headers: {
        host: "localhost",
        cookie: `firo_session=${sessionToken}`,
      },
    }) as unknown as http.IncomingMessage;

  it.each([
    "/boards/has space",
    `/boards/${"a".repeat(129)}`,
    "/boards/quote'id",
  ])("rejects invalid board id without creating a board: %s", (path) => {
    expect(relay.parseConnectionRequest(reqFor(path))).toBeNull();
    expect(storage.getBoard("has space")).toBeNull();
    expect(storage.getBoard("a".repeat(129))).toBeNull();
  });

  it("accepts a valid board id and auto-creates for a signed-in user", () => {
    const parsed = relay.parseConnectionRequest(
      reqFor("/boards/Valid-Board_1.2"),
    );
    expect(parsed?.boardId).toBe("Valid-Board_1.2");
    expect(parsed?.role).toBe("owner");
    expect(storage.getBoard("Valid-Board_1.2")).not.toBeNull();
  });
});
