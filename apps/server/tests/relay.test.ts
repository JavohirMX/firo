import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";
import { MESSAGE_AWARENESS, MESSAGE_SYNC } from "../src/ws/room.js";
import { createSession } from "../src/auth/session.js";

interface TestClient {
  ws: WebSocket;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  receivedUpdates: Uint8Array[];
  close: () => Promise<void>;
  sendUpdate: (update: Uint8Array) => void;
  sendAwareness: (states: number[]) => void;
  waitForMessage: () => Promise<void>;
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Condition not met within timeout");
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("WebSocket Relay & Permission Gates", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let relay: WebSocketRelay;
  let serverPort: number;

  beforeEach(async () => {
    db = new Database(":memory:");
    storage = new Storage(db);

    server = http.createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });

    relay = new WebSocketRelay({ storage, server });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    serverPort = addr.port;
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  function createClient(
    path: string,
    options: { headers?: Record<string, string> } = {},
  ): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${serverPort}${path}`;
      const ws = new WebSocket(url, { headers: options.headers });
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      const receivedUpdates: Uint8Array[] = [];
      let messageResolvers: (() => void)[] = [];

      ws.on("open", () => {
        resolve({
          ws,
          doc,
          awareness,
          receivedUpdates,
          close: () =>
            new Promise((res) => {
              ws.once("close", () => res());
              ws.close();
            }),
          sendUpdate: (update: Uint8Array) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
            encoding.writeVarUint8Array(encoder, update);
            ws.send(encoding.toUint8Array(encoder));
          },
          sendAwareness: (clients: number[]) => {
            const update = awarenessProtocol.encodeAwarenessUpdate(
              awareness,
              clients,
            );
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(encoder, update);
            ws.send(encoding.toUint8Array(encoder));
          },
          waitForMessage: () =>
            new Promise<void>((res) => {
              messageResolvers.push(res);
            }),
        });
      });

      ws.on("message", (data: WebSocket.RawData) => {
        const uint8 = new Uint8Array(data as Buffer);
        const decoder = decoding.createDecoder(uint8);
        const msgType = decoding.readVarUint(decoder);

        if (msgType === MESSAGE_SYNC) {
          const syncType = decoding.readVarUint(decoder);
          if (syncType === syncProtocol.messageYjsSyncStep1) {
            // Server asks for missing state: reply with syncStep2
            const respEncoder = encoding.createEncoder();
            encoding.writeVarUint(respEncoder, MESSAGE_SYNC);
            syncProtocol.readSyncStep1(decoder, respEncoder, doc);
            ws.send(encoding.toUint8Array(respEncoder));
          } else if (
            syncType === syncProtocol.messageYjsSyncStep2 ||
            syncType === syncProtocol.messageYjsUpdate
          ) {
            const update = decoding.readVarUint8Array(decoder);
            receivedUpdates.push(update);
            Y.applyUpdate(doc, update);
          }
        } else if (msgType === MESSAGE_AWARENESS) {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
        }

        const notify = messageResolvers;
        messageResolvers = [];
        for (const res of notify) {
          res();
        }
      });

      ws.on("error", (err) => {
        reject(err);
      });
    });
  }

  it("rejects unauthenticated connection to a protected board", async () => {
    const owner = storage.createUser({
      id: "u-owner-priv",
      username: "owner_priv",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("private-board", "Secret", owner.id);

    await expect(createClient("/boards/private-board")).rejects.toThrow();
  });

  it("broadcasts element updates between two editors", async () => {
    const alice = storage.createUser({
      id: "u-alice",
      username: "alice",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("board-collab", "Collab", alice.id);

    const bob = storage.createUser({
      id: "u-bob",
      username: "bob",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.setBoardMember("board-collab", bob.id, "editor");

    const sessionAlice = createSession(storage, alice.id, 60_000);
    const sessionBob = createSession(storage, bob.id, 60_000);

    const clientAlice = await createClient("/boards/board-collab", {
      headers: { Cookie: `firo_session=${sessionAlice.token}` },
    });
    const clientBob = await createClient("/boards/board-collab", {
      headers: { Cookie: `firo_session=${sessionBob.token}` },
    });

    // Alice creates an element
    let updateAlice: Uint8Array;
    clientAlice.doc.on("update", (u) => (updateAlice = u));
    clientAlice.doc
      .getMap("elements")
      .set("note-1", { text: "Hello from Alice" });

    clientAlice.sendUpdate(updateAlice!);

    // Bob receives update
    await waitUntil(
      () => clientBob.doc.getMap("elements").get("note-1") !== undefined,
    );

    expect(clientBob.doc.getMap("elements").get("note-1")).toEqual({
      text: "Hello from Alice",
    });

    // Check update was persisted to SQLite
    const room = relay.getRoom("board-collab");
    expect(room?.doc.getMap("elements").get("note-1")).toEqual({
      text: "Hello from Alice",
    });
    expect(storage.getUpdates("board-collab").length).toBeGreaterThan(0);

    await clientAlice.close();
    await clientBob.close();
  });

  it("broadcasts awareness between connected peers", async () => {
    const owner = storage.createUser({
      id: "u-owner",
      username: "owner",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("board-aware", "Awareness Test", owner.id);
    const session = createSession(storage, owner.id, 60_000);

    const client1 = await createClient("/boards/board-aware", {
      headers: { Cookie: `firo_session=${session.token}` },
    });
    const client2 = await createClient("/boards/board-aware", {
      headers: { Cookie: `firo_session=${session.token}` },
    });

    client1.awareness.setLocalStateField("cursor", { x: 100, y: 200 });
    client1.sendAwareness([client1.awareness.clientID]);

    await waitUntil(() => {
      const states = Array.from(client2.awareness.getStates().values());
      return states.some((s) => s.cursor?.x === 100 && s.cursor?.y === 200);
    });

    await client1.close();
    await client2.close();
  });

  describe("Commenter permission gate (ADR-0027)", () => {
    it("allows commenter to write comments, but REJECTS writes to elements or collections", async () => {
      const owner = storage.createUser({
        id: "u-owner-2",
        username: "owner2",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });
      storage.createBoard("board-comment-gate", "Gate Test", owner.id);
      const ownerSession = createSession(storage, owner.id, 60_000);

      // Create a commenter share token
      const share = storage.createShare({
        id: "share-commenter",
        boardId: "board-comment-gate",
        token: "commenter-token-abc",
        role: "commenter",
      });

      const clientOwner = await createClient("/boards/board-comment-gate", {
        headers: { Cookie: `firo_session=${ownerSession.token}` },
      });
      const clientCommenter = await createClient(
        `/boards/board-comment-gate?share=${share.token}`,
      );

      // 1. VALID WRITE: Commenter adds a thread to comments partition
      let commentUpdate: Uint8Array;
      clientCommenter.doc.on("update", (u) => (commentUpdate = u));
      clientCommenter.doc.getMap("comments").set("thread-101", {
        id: "thread-101",
        body: "A helpful review comment",
      });

      clientCommenter.sendUpdate(commentUpdate!);

      // Owner should receive this comment
      await waitUntil(
        () =>
          clientOwner.doc.getMap("comments").get("thread-101") !== undefined,
      );

      expect(clientOwner.doc.getMap("comments").get("thread-101")).toEqual({
        id: "thread-101",
        body: "A helpful review comment",
      });

      // 2. INVALID WRITE: Commenter attempts to add or modify elements
      let elementUpdate: Uint8Array;
      clientCommenter.doc.on("update", (u) => (elementUpdate = u));
      clientCommenter.doc
        .getMap("elements")
        .set("malicious-el", { x: 999, y: 999 });

      const closePromise = new Promise<number>((resolve) => {
        clientCommenter.ws.on("close", (code) => resolve(code));
      });

      clientCommenter.sendUpdate(elementUpdate!);

      const closeCode = await closePromise;
      expect(closeCode).toBe(4403);

      // Assert that room doc on server does NOT have malicious element
      const room = relay.getRoom("board-comment-gate");
      expect(room?.doc.getMap("elements").get("malicious-el")).toBeUndefined();

      // Assert that Owner never received malicious element
      expect(
        clientOwner.doc.getMap("elements").get("malicious-el"),
      ).toBeUndefined();

      // 3. INVALID WRITE: Commenter connects again and attempts to add collection record
      const clientCommenter2 = await createClient(
        `/boards/board-comment-gate?share=${share.token}`,
      );

      let recordUpdate: Uint8Array;
      clientCommenter2.doc.on("update", (u) => (recordUpdate = u));
      clientCommenter2.doc
        .getMap("records")
        .set("rec-1", { title: "Hacked Record" });

      const closePromise2 = new Promise<number>((resolve) => {
        clientCommenter2.ws.on("close", (code) => resolve(code));
      });

      clientCommenter2.sendUpdate(recordUpdate!);
      const closeCode2 = await closePromise2;
      expect(closeCode2).toBe(4403);

      expect(room?.doc.getMap("records").get("rec-1")).toBeUndefined();
      expect(clientOwner.doc.getMap("records").get("rec-1")).toBeUndefined();

      await clientOwner.close();
    });

    it("disconnects an editor immediately if demoted mid-session upon write", async () => {
      const owner = storage.createUser({
        id: "u-demote-owner",
        username: "d_owner",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });
      storage.createBoard("board-demote", "Demotion Test", owner.id);

      const editorUser = storage.createUser({
        id: "u-demote-editor",
        username: "d_editor",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });
      storage.setBoardMember("board-demote", editorUser.id, "editor");
      const editorSession = createSession(storage, editorUser.id, 60_000);

      const client = await createClient("/boards/board-demote", {
        headers: { Cookie: `firo_session=${editorSession.token}` },
      });

      // Demote editor to viewer in SQLite
      storage.setBoardMember("board-demote", editorUser.id, "viewer");

      // Editor attempts write
      let update: Uint8Array;
      client.doc.on("update", (u) => (update = u));
      client.doc.getMap("elements").set("el-after-demote", "bad");

      client.sendUpdate(update!);

      // Client socket must be closed by server with 4403
      await new Promise<void>((resolve) => {
        client.ws.on("close", (code) => {
          expect(code).toBe(4403);
          resolve();
        });
      });
    });
  });
});
