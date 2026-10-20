import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";

import { Storage } from "../src/db/storage.js";

describe("Storage", () => {
  let db: Database.Database;
  let storage: Storage;

  beforeEach(() => {
    db = new Database(":memory:");
    storage = new Storage(db);
  });

  afterEach(() => {
    storage.close();
  });

  describe("Users & Sessions", () => {
    it("creates users and retrieves by username or id", () => {
      expect(storage.countUsers()).toBe(0);

      const user = storage.createUser({
        id: "user-1",
        username: "Alice",
        password_hash: "hash123",
        salt: "salt123",
        is_admin: 1,
      });

      expect(user.id).toBe("user-1");
      expect(user.username).toBe("Alice");
      expect(user.is_admin).toBe(1);
      expect(storage.countUsers()).toBe(1);

      const byId = storage.getUserById("user-1");
      expect(byId?.username).toBe("Alice");

      // Case-insensitive lookup
      const byName = storage.getUserByUsername("alice");
      expect(byName?.id).toBe("user-1");
    });

    it("creates, validates, and expires sessions", () => {
      storage.createUser({
        id: "u1",
        username: "Bob",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });

      // Active session
      storage.createSession("tok-1", "u1", 60_000);
      const res = storage.getSession("tok-1");
      expect(res).not.toBeNull();
      expect(res?.user.username).toBe("Bob");

      // Expired session
      storage.createSession("tok-expired", "u1", -1000);
      expect(storage.getSession("tok-expired")).toBeNull();

      // Revoke session
      storage.deleteSession("tok-1");
      expect(storage.getSession("tok-1")).toBeNull();
    });
  });

  describe("Boards & Shares & Roles", () => {
    it("creates board and resolves role for owner, members, and shares", () => {
      const owner = storage.createUser({
        id: "owner-1",
        username: "Owner",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });
      const editor = storage.createUser({
        id: "editor-1",
        username: "Editor",
        password_hash: "h",
        salt: "s",
        is_admin: 0,
      });

      storage.createBoard("board-1", "Project Plan", owner.id);

      // Owner role
      expect(storage.resolveRole("board-1", owner)).toBe("owner");

      // Non-member
      expect(storage.resolveRole("board-1", editor)).toBeNull();

      // Add as editor member
      storage.setBoardMember("board-1", editor.id, "editor");
      expect(storage.resolveRole("board-1", editor)).toBe("editor");

      // Share token
      const share = storage.createShare({
        id: "share-1",
        boardId: "board-1",
        token: "cap-token-123",
        role: "commenter",
      });

      expect(storage.resolveRole("board-1", null, "cap-token-123")).toBe(
        "commenter",
      );

      // Revoke share token
      storage.revokeShare(share.id);
      expect(storage.resolveRole("board-1", null, "cap-token-123")).toBeNull();
    });

    it("expires share tokens properly", () => {
      storage.createBoard("b-exp");
      storage.createShare({
        id: "s-exp",
        boardId: "b-exp",
        token: "tok-expired",
        role: "viewer",
        expires_at: Date.now() - 5000,
      });

      expect(storage.resolveRole("b-exp", null, "tok-expired")).toBeNull();
    });
  });

  it("preserves a named board when an incoming update is appended", () => {
    storage.createUser({
      id: "sync-owner",
      username: "sync-owner",
      password_hash: "h",
      salt: "s",
      is_admin: 0,
    });
    storage.createBoard("named-board", "Sprint retrospective", "sync-owner");
    const original = storage.getBoard("named-board")!;
    const doc = new Y.Doc();
    doc.getMap("elements").set("note", { text: "Keep this" });
    storage.appendUpdate("named-board", Y.encodeStateAsUpdate(doc));
    const board = storage.getBoard("named-board")!;
    expect(board.name).toBe("Sprint retrospective");
    expect(board.owner_id).toBe(original.owner_id);
    expect(board.created_at).toBe(original.created_at);
    expect(storage.getUpdates("named-board")).toHaveLength(1);
    doc.destroy();
  });

  describe("Yjs updates, sequencing & compaction", () => {
    it("sequences updates and loads full document state", () => {
      const boardId = "doc-board-1";
      const doc = new Y.Doc();
      const elements = doc.getMap("elements");
      const comments = doc.getMap("comments");

      // 1st update
      let u1: Uint8Array;
      doc.on("update", (u) => (u1 = u));
      elements.set("rect-1", { x: 10, y: 20 });
      const id1 = storage.appendUpdate(boardId, u1!);
      expect(id1).toBe(1);

      // 2nd update
      let u2: Uint8Array;
      doc.on("update", (u) => (u2 = u));
      comments.set("comm-1", { text: "Look here" });
      const id2 = storage.appendUpdate(boardId, u2!);
      expect(id2).toBe(2);

      // Retrieve updates since id 1
      const laterUpdates = storage.getUpdates(boardId, 1);
      expect(laterUpdates.length).toBe(1);
      expect(laterUpdates[0].id).toBe(2);

      // Load document from storage
      const loadedDoc = storage.loadBoardDocument(boardId);
      expect(loadedDoc.getMap("elements").get("rect-1")).toEqual({
        x: 10,
        y: 20,
      });
      expect(loadedDoc.getMap("comments").get("comm-1")).toEqual({
        text: "Look here",
      });
    });

    it("compacts updates into a snapshot and continues sequencing", () => {
      const boardId = "compact-board";
      const doc = new Y.Doc();
      const elements = doc.getMap("elements");

      for (let i = 1; i <= 5; i++) {
        let u: Uint8Array;
        doc.on("update", (update) => (u = update));
        elements.set(`item-${i}`, i * 100);
        storage.appendUpdate(boardId, u!);
      }

      expect(storage.getUpdates(boardId).length).toBe(5);
      expect(storage.getSnapshot(boardId)).toBeNull();

      // Compact
      const compactResult = storage.compactBoard(boardId);
      expect(compactResult.lastUpdateId).toBe(5);
      expect(compactResult.snapshotSize).toBeGreaterThan(0);

      // Updates table should now be cleared
      expect(storage.getUpdates(boardId).length).toBe(0);

      // Snapshot exists
      const snapshot = storage.getSnapshot(boardId);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.last_update_id).toBe(5);

      // Loading doc should still have all 5 items
      const loadedDoc = storage.loadBoardDocument(boardId);
      for (let i = 1; i <= 5; i++) {
        expect(loadedDoc.getMap("elements").get(`item-${i}`)).toBe(i * 100);
      }

      // Append 6th update after compaction
      let u6: Uint8Array;
      doc.on("update", (update) => (u6 = update));
      elements.set("item-6", 600);
      const id6 = storage.appendUpdate(boardId, u6!);
      expect(id6).toBe(6);

      // Verify loadBoardDocument combines snapshot + post-compaction updates
      const reloadedDoc = storage.loadBoardDocument(boardId);
      expect(reloadedDoc.getMap("elements").get("item-6")).toBe(600);
      expect(reloadedDoc.getMap("elements").get("item-1")).toBe(100);
    });
  });
});
