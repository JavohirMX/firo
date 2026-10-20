import http from "node:http";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";

import { Storage } from "../src/db/storage.js";
import { WebSocketRelay } from "../src/ws/relay.js";
import { MESSAGE_SYNC } from "../src/ws/room.js";

// A browser seeds local metadata before connecting. Its standard Yjs handshake
// uploads that state if the server sends SyncStep1, even without user edits.
describe("read-only relay handshake", () => {
  let storage: Storage;
  let server: http.Server;
  let relay: WebSocketRelay;
  let port: number;
  const sockets: WebSocket[] = [];
  const docs: Y.Doc[] = [];

  beforeEach(async () => {
    storage = new Storage(new Database(":memory:"));
    storage.createBoard("read-board", "Read board");
    server = http.createServer();
    relay = new WebSocketRelay({ storage, server });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((ws) => ws.terminate());
    relay.close();
    await new Promise<void>((r) => server.close(() => r()));
    docs.splice(0).forEach((doc) => doc.destroy());
    storage.close();
  });

  it.each(["viewer", "commenter"] as const)(
    "%s stays connected with local metadata and receives later board updates",
    async (role) => {
      storage.createShare({
        id: `share-${role}`,
        boardId: "read-board",
        token: `token-${role}`,
        role,
      });
      const doc = new Y.Doc();
      docs.push(doc);
      doc.getMap("meta").set("local-name", "Shared Board");
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/ws?boardId=read-board&shareToken=token-${role}`,
      );
      sockets.push(ws);
      const syncKinds: number[] = [];
      ws.on("message", (raw) => {
        const decoder = decoding.createDecoder(new Uint8Array(raw as Buffer));
        if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) {
          return;
        }
        const kind = decoding.readVarUint(decoder);
        syncKinds.push(kind);
        if (kind === syncProtocol.messageYjsSyncStep1) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MESSAGE_SYNC);
          syncProtocol.readSyncStep1(decoder, reply, doc);
          ws.send(encoding.toUint8Array(reply));
        } else {
          Y.applyUpdate(doc, decoding.readVarUint8Array(decoder));
        }
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(syncKinds).toContain(syncProtocol.messageYjsSyncStep2);
      expect(syncKinds).not.toContain(syncProtocol.messageYjsSyncStep1);
      const room = relay.rooms.get("read-board")!;
      expect(room.doc.getMap("meta").has("local-name")).toBe(false);

      const received = new Promise<void>((resolve) => {
        doc.getMap("elements").observe(() => resolve());
      });
      storage.createUser({
        id: "owner",
        username: "owner",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });
      storage.setBoardMember("read-board", "owner", "editor");
      storage.createSession("editor-session", "owner", 60000);
      const editor = new WebSocket(
        `ws://127.0.0.1:${port}/ws?boardId=read-board`,
        {
          headers: { Cookie: "firo_session=editor-session" },
        },
      );
      sockets.push(editor);
      await new Promise<void>((resolve, reject) => {
        editor.once("open", resolve);
        editor.once("error", reject);
      });
      const editorDoc = new Y.Doc();
      docs.push(editorDoc);
      editorDoc.getMap("elements").set("owner-shape", { type: "rectangle" });
      const message = encoding.createEncoder();
      encoding.writeVarUint(message, MESSAGE_SYNC);
      syncProtocol.writeUpdate(message, Y.encodeStateAsUpdate(editorDoc));
      editor.send(encoding.toUint8Array(message));
      await received;
      expect(doc.getMap("elements").has("owner-shape")).toBe(true);
      expect(ws.readyState).toBe(WebSocket.OPEN);
    },
  );
});
