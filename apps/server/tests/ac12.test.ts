import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import { FiroServer } from "../src/app.js";
import { createSession } from "../src/auth/session.js";
import { MESSAGE_AWARENESS, MESSAGE_SYNC } from "../src/ws/room.js";

interface TestClient {
  ws: WebSocket;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  receivedUpdates: Uint8Array[];
  close: () => Promise<void>;
  sendUpdate: (update: Uint8Array) => void;
  sendAwareness: (clients: number[]) => void;
  waitForMessage: () => Promise<void>;
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number = 4000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Condition not met within timeout");
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("AC-12: Single-Container Integration Test", () => {
  let tempDir: string;
  let dbPath: string;
  let webDir: string;
  let server: FiroServer;
  let serverPort: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firo-ac12-"));
    dbPath = path.join(tempDir, "firo.sqlite");
    webDir = path.join(tempDir, "web");

    // Prepare mock static assets for web hosting
    fs.mkdirSync(path.join(webDir, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(webDir, "index.html"),
      "<!DOCTYPE html><html><head><title>Firo App</title></head><body><div id='root'></div></body></html>",
    );
    fs.writeFileSync(
      path.join(webDir, "assets/app.js"),
      "console.log('Firo production bundle');",
    );

    // Boot initial sync server
    server = new FiroServer({
      port: 0,
      host: "127.0.0.1",
      dataDir: tempDir,
      dbPath,
      webDir,
    });

    const info = await server.start();
    serverPort = info.port;
  });

  afterAll(async () => {
    try {
      await server.stop();
    } catch {
      // Ignore if already stopped
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createClient(
    pathUrl: string,
    options: { headers?: Record<string, string> } = {},
  ): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${serverPort}${pathUrl}`;
      const ws = new WebSocket(url, { headers: options.headers });
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      const receivedUpdates: Uint8Array[] = [];
      let messageResolvers: (() => void)[] = [];

      ws.on("open", () => {
        // Send client's syncStep1 to request any existing updates from the server
        const syncEncoder = encoding.createEncoder();
        encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(syncEncoder, doc);
        ws.send(encoding.toUint8Array(syncEncoder));

        resolve({
          ws,
          doc,
          awareness,
          receivedUpdates,
          close: () =>
            new Promise((res) => {
              if (ws.readyState === WebSocket.CLOSED) {
                res();
                return;
              }
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

  it("serves static assets, SPA routes, and REST API from single port 8080", async () => {
    // 1. Health check
    const healthRes = await fetch(`http://127.0.0.1:${serverPort}/healthz`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.text()).toBe("OK");

    // 2. Static root index.html
    const rootRes = await fetch(`http://127.0.0.1:${serverPort}/`);
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers.get("content-type")).toContain("text/html");
    const rootHtml = await rootRes.text();
    expect(rootHtml).toContain("<title>Firo App</title>");

    // 3. Static asset file
    const jsRes = await fetch(`http://127.0.0.1:${serverPort}/assets/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get("content-type")).toContain("text/javascript");
    expect(await jsRes.text()).toContain("Firo production bundle");

    // 4. SPA route fallback (no extension, not /api/* or /ws)
    const spaBoardRes = await fetch(
      `http://127.0.0.1:${serverPort}/boards/board-ac12`,
    );
    expect(spaBoardRes.status).toBe(200);
    expect(spaBoardRes.headers.get("content-type")).toContain("text/html");
    expect(await spaBoardRes.text()).toContain("<title>Firo App</title>");

    // 5. SPA share capability URL
    const spaShareRes = await fetch(
      `http://127.0.0.1:${serverPort}/s/capability-token-xyz`,
    );
    expect(spaShareRes.status).toBe(200);
    expect(spaShareRes.headers.get("content-type")).toContain("text/html");

    // 6. Nonexistent asset with extension returns 404
    const notFoundRes = await fetch(
      `http://127.0.0.1:${serverPort}/assets/missing.png`,
    );
    expect(notFoundRes.status).toBe(404);
  });

  it("fulfills AC-12: 2 editors collaborate, commenter writes comment but rejected on elements, and 100% persisted across server restart", async () => {
    // 1. Seed accounts & board in SQLite
    const alice = server.storage.createUser({
      id: "u-alice-ac12",
      username: "alice_ac12",
      password_hash: "pw_hash",
      salt: "salt",
      is_admin: 0,
    });

    const bob = server.storage.createUser({
      id: "u-bob-ac12",
      username: "bob_ac12",
      password_hash: "pw_hash",
      salt: "salt",
      is_admin: 0,
    });

    server.storage.createBoard("board-ac12", "AC12 Demonstration", alice.id);
    server.storage.setBoardMember("board-ac12", bob.id, "editor");

    const aliceSession = createSession(server.storage, alice.id, 60_000);
    const bobSession = createSession(server.storage, bob.id, 60_000);

    // Create Commenter share capability token (128-bit CSPRNG capability link)
    const commenterShare = server.storage.createShare({
      id: "share-commenter-ac12",
      boardId: "board-ac12",
      token: "cap-commenter-token-777",
      role: "commenter",
    });

    // 2. Two WebSocket clients connect as Editors
    const clientAlice = await createClient("/boards/board-ac12", {
      headers: { Cookie: `firo_session=${aliceSession.token}` },
    });
    const clientBob = await createClient("/boards/board-ac12", {
      headers: { Cookie: `firo_session=${bobSession.token}` },
    });

    // Alice adds an element
    let aliceUpdate: Uint8Array;
    clientAlice.doc.on("update", (u) => (aliceUpdate = u));
    clientAlice.doc.getMap("elements").set("card-101", {
      id: "card-101",
      type: "card",
      x: 120,
      y: 240,
      title: "Dan's Architecture Plan",
    });
    clientAlice.sendUpdate(aliceUpdate!);

    // Bob receives Alice's element
    await waitUntil(
      () => clientBob.doc.getMap("elements").get("card-101") !== undefined,
    );
    expect(clientBob.doc.getMap("elements").get("card-101")).toEqual({
      id: "card-101",
      type: "card",
      x: 120,
      y: 240,
      title: "Dan's Architecture Plan",
    });

    // Bob adds an arrow connecting to Alice's element
    let bobUpdate: Uint8Array;
    clientBob.doc.on("update", (u) => (bobUpdate = u));
    clientBob.doc.getMap("elements").set("arrow-102", {
      id: "arrow-102",
      type: "arrow",
      startX: 120,
      startY: 240,
      endX: 300,
      endY: 400,
    });
    clientBob.sendUpdate(bobUpdate!);

    // Alice receives Bob's element
    await waitUntil(
      () => clientAlice.doc.getMap("elements").get("arrow-102") !== undefined,
    );
    expect(clientAlice.doc.getMap("elements").get("arrow-102")).toEqual({
      id: "arrow-102",
      type: "arrow",
      startX: 120,
      startY: 240,
      endX: 300,
      endY: 400,
    });

    // Live Awareness: Alice and Bob observe each other's live cursor coordinates
    clientAlice.awareness.setLocalStateField("cursor", { x: 180, y: 260 });
    clientAlice.sendAwareness([clientAlice.awareness.clientID]);

    await waitUntil(() => {
      const bobStates = Array.from(clientBob.awareness.getStates().values());
      return bobStates.some((s) => s.cursor?.x === 180 && s.cursor?.y === 260);
    });

    clientBob.awareness.setLocalStateField("cursor", { x: 320, y: 420 });
    clientBob.sendAwareness([clientBob.awareness.clientID]);

    await waitUntil(() => {
      const aliceStates = Array.from(
        clientAlice.awareness.getStates().values(),
      );
      return aliceStates.some(
        (s) => s.cursor?.x === 320 && s.cursor?.y === 420,
      );
    });

    // 3. Third WebSocket client connects using Commenter share capability token
    const clientCommenter = await createClient(
      `/boards/board-ac12?share=${commenterShare.token}`,
    );

    // Commenter receives existing elements
    await waitUntil(
      () =>
        clientCommenter.doc.getMap("elements").get("card-101") !== undefined &&
        clientCommenter.doc.getMap("elements").get("arrow-102") !== undefined,
    );

    // Commenter adds a thread successfully in doc.comments
    let commentUpdate: Uint8Array;
    clientCommenter.doc.on("update", (u) => (commentUpdate = u));
    clientCommenter.doc.getMap("comments").set("thread-review-1", {
      id: "thread-review-1",
      author: "Reviewer",
      body: "Please verify database compaction settings.",
      resolved: false,
    });
    clientCommenter.sendUpdate(commentUpdate!);

    // Both editors receive the comment thread
    await waitUntil(
      () =>
        clientAlice.doc.getMap("comments").get("thread-review-1") !==
          undefined &&
        clientBob.doc.getMap("comments").get("thread-review-1") !== undefined,
    );
    expect(
      clientAlice.doc.getMap("comments").get("thread-review-1"),
    ).toMatchObject({
      id: "thread-review-1",
      body: "Please verify database compaction settings.",
    });

    // 4. Commenter attempts unauthorized write to elements
    let unauthorizedUpdate: Uint8Array;
    clientCommenter.doc.on("update", (u) => (unauthorizedUpdate = u));
    clientCommenter.doc.getMap("elements").set("malicious-move-999", {
      x: 99999,
      y: 99999,
    });

    // Server must reject write, disconnect socket with code 4403, and log violation
    const commenterClosePromise = new Promise<{ code: number; reason: string }>(
      (resolve) => {
        clientCommenter.ws.on("close", (code, reason) =>
          resolve({ code, reason: reason.toString() }),
        );
      },
    );

    clientCommenter.sendUpdate(unauthorizedUpdate!);

    const { code, reason } = await commenterClosePromise;
    expect(code).toBe(4403);
    expect(reason).toBe("Unauthorized write attempt");

    // Give server event loop a brief window and verify neither editor nor server doc received malicious element
    await new Promise((r) => setTimeout(r, 100));

    const room = server.relay.getRoom("board-ac12");
    expect(
      room?.doc.getMap("elements").get("malicious-move-999"),
    ).toBeUndefined();
    expect(
      clientAlice.doc.getMap("elements").get("malicious-move-999"),
    ).toBeUndefined();
    expect(
      clientBob.doc.getMap("elements").get("malicious-move-999"),
    ).toBeUndefined();

    // 5. Server is shut down and restarted: verify 100% restoration without data loss
    await clientAlice.close();
    await clientBob.close();
    await server.stop();

    // Boot new server instance pointing to the exact same SQLite database
    server = new FiroServer({
      port: 0,
      host: "127.0.0.1",
      dataDir: tempDir,
      dbPath,
      webDir,
    });
    const restartedInfo = await server.start();
    serverPort = restartedInfo.port;

    // Connect a fresh client as Alice to inspect restored state from SQLite
    const clientRestored = await createClient("/boards/board-ac12", {
      headers: { Cookie: `firo_session=${aliceSession.token}` },
    });

    await waitUntil(
      () =>
        clientRestored.doc.getMap("elements").get("card-101") !== undefined &&
        clientRestored.doc.getMap("elements").get("arrow-102") !== undefined &&
        clientRestored.doc.getMap("comments").get("thread-review-1") !==
          undefined,
    );

    // Verify elements restored 100%
    expect(clientRestored.doc.getMap("elements").get("card-101")).toEqual({
      id: "card-101",
      type: "card",
      x: 120,
      y: 240,
      title: "Dan's Architecture Plan",
    });
    expect(clientRestored.doc.getMap("elements").get("arrow-102")).toEqual({
      id: "arrow-102",
      type: "arrow",
      startX: 120,
      startY: 240,
      endX: 300,
      endY: 400,
    });

    // Verify comments restored 100%
    expect(
      clientRestored.doc.getMap("comments").get("thread-review-1"),
    ).toMatchObject({
      id: "thread-review-1",
      body: "Please verify database compaction settings.",
    });

    // Verify malicious element was never stored or restored
    expect(
      clientRestored.doc.getMap("elements").get("malicious-move-999"),
    ).toBeUndefined();

    await clientRestored.close();
  });
});
