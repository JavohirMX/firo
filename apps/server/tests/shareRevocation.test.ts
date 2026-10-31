import http from "node:http";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import WebSocket from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding.js";

import { Storage } from "../src/db/storage.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { createHttpHandler } from "../src/http/routes.js";
import { loadConfig } from "../src/config.js";
import { hashPassword } from "../src/auth/crypto.js";
import { createShareProof } from "../src/auth/shareProof.js";
import { WebSocketRelay } from "../src/ws/relay.js";
const SHARE_PASSWORD = "correct horse battery staple";

describe("Board share revocation", () => {
  let db: Database.Database;
  let storage: Storage;
  let rateLimiter: RateLimiter;
  let server: http.Server;
  let serverUrl: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    storage = new Storage(db);
    rateLimiter = new RateLimiter(5, 60_000); // 5 requests per min for testing limit
    const config = loadConfig({ sessionTtlMs: 3600_000 });

    const handler = createHttpHandler({
      storage,
      config,
      authRateLimiter: rateLimiter,
    });

    server = http.createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  describe("Board share revocation", () => {
    it.each(["POST", "DELETE"])(
      "does not revoke another board's share via %s",
      async (method) => {
        const owner = storage.createUser({
          id: "board-owner",
          username: "owner",
          password_hash: "unused",
          salt: "unused",
          is_admin: 0,
        });
        storage.createBoard("owned-board", "Owned board", owner.id);
        storage.createBoard("other-board", "Other board");
        storage.createSession("owner-session", owner.id, 60_000);
        const share = storage.createShare({
          id: "other-share",
          boardId: "other-board",
          token: "other-token",
          role: "viewer",
        });
        const suffix = method === "POST" ? "/revoke" : "";
        const response = await fetch(
          `${serverUrl}/api/boards/owned-board/shares/${share.id}${suffix}`,
          { method, headers: { Cookie: "firo_session=owner-session" } },
        );
        expect(response.status).toBe(404);
        expect(storage.getShareById(share.id)?.revoked).toBe(0);
      },
    );

    it.each(["POST", "DELETE"])(
      "revokes a share belonging to the owned board via %s",
      async (method) => {
        const owner = storage.createUser({
          id: "board-owner",
          username: "owner",
          password_hash: "unused",
          salt: "unused",
          is_admin: 0,
        });
        storage.createBoard("owned-board", "Owned board", owner.id);
        storage.createSession("owner-session", owner.id, 60_000);
        const share = storage.createShare({
          id: "owned-share",
          boardId: "owned-board",
          token: "owned-token",
          role: "viewer",
        });
        const suffix = method === "POST" ? "/revoke" : "";
        const response = await fetch(
          `${serverUrl}/api/boards/owned-board/shares/${share.id}${suffix}`,
          { method, headers: { Cookie: "firo_session=owner-session" } },
        );
        expect(response.status).toBe(200);
        expect(storage.getShareById(share.id)?.revoked).toBe(1);
      },
    );
  });
});

describe("Share revocation disconnects existing clients", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;
  let wsUrl: string;
  let relay: WebSocketRelay;

  interface TrackedSocket {
    ws: WebSocket;
    messages: number;
    closeCode: number | null;
  }

  const waitFor = async (
    predicate: () => boolean,
    timeoutMs = 3_000,
  ): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return predicate();
  };

  const connect = (query: string): Promise<TrackedSocket> =>
    new Promise((resolve, reject) => {
      const tracked: TrackedSocket = {
        ws: new WebSocket(`${wsUrl}?${query}`),
        messages: 0,
        closeCode: null,
      };
      tracked.ws.on("message", () => {
        tracked.messages += 1;
      });
      tracked.ws.on("close", (code) => {
        tracked.closeCode = code;
      });
      tracked.ws.on("open", () => resolve(tracked));
      tracked.ws.on("error", reject);
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
    const port = (server.address() as { port: number }).port;
    serverUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
    relay = new WebSocketRelay({ storage, server });

    storage.createUser({
      id: "rev-owner",
      username: "rev-owner",
      password_hash: "unused",
      salt: "unused",
      is_admin: 0,
    });
    storage.createBoard("rev-board", "Board", "rev-owner");
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  const seedPasswordShare = (token: string) => {
    const { hash, salt } = hashPassword(SHARE_PASSWORD);
    return storage.createShare({
      id: `id-${token}`,
      boardId: "rev-board",
      token,
      role: "editor",
      password_hash: hash,
      salt,
      expires_at: null,
    });
  };

  const revokeViaApi = (shareId: string, sessionToken: string) =>
    fetch(`${serverUrl}/api/boards/rev-board/shares/${shareId}/revoke`, {
      method: "POST",
      headers: { Cookie: `firo_session=${sessionToken}` },
    });

  it("disconnects an idle password-share client on revoke, before any write", async () => {
    const share = seedPasswordShare("idle-tok");
    const proof = createShareProof(share);
    storage.createSession("sess-1", "rev-owner", 60_000);

    const client = await connect(
      `boardId=rev-board&shareToken=idle-tok&shareProof=${encodeURIComponent(
        proof,
      )}`,
    );
    expect(client.closeCode).toBeNull();

    const res = await revokeViaApi(share.id, "sess-1");
    expect(res.status).toBe(200);

    // No frame from the client: the server must cut the idle connection.
    expect(await waitFor(() => client.closeCode === 4403)).toBe(true);
  });

  it("stops delivering broadcasts to a revoked client", async () => {
    const share = seedPasswordShare("feed-tok");
    const proof = createShareProof(share);
    storage.createSession("sess-2", "rev-owner", 60_000);

    const revoked = await connect(
      `boardId=rev-board&shareToken=feed-tok&shareProof=${encodeURIComponent(
        proof,
      )}`,
    );
    const other = await connect(
      `boardId=rev-board&shareToken=feed-tok&shareProof=${encodeURIComponent(
        proof,
      )}`,
    );
    const messagesBefore = revoked.messages;

    await revokeViaApi(share.id, "sess-2");
    expect(await waitFor(() => revoked.closeCode === 4403)).toBe(true);

    // A surviving client writes; the revoked one must not receive it.
    const doc = new Y.Doc();
    doc.getMap("t").set("k", "v");
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    encoding.writeVarUint(enc, 2);
    encoding.writeVarUint8Array(enc, Y.encodeStateAsUpdate(doc));
    other.ws.send(encoding.toUint8Array(enc));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(revoked.messages).toBe(messagesBefore);
    other.ws.close();
  });

  it("disconnects an idle passwordless-share client on revoke", async () => {
    const share = storage.createShare({
      id: "id-open-tok",
      boardId: "rev-board",
      token: "open-tok",
      role: "viewer",
      expires_at: null,
    });
    storage.createSession("sess-3", "rev-owner", 60_000);

    const client = await connect("boardId=rev-board&shareToken=open-tok");
    expect(client.closeCode).toBeNull();

    await revokeViaApi(share.id, "sess-3");
    expect(await waitFor(() => client.closeCode === 4403)).toBe(true);
  });

  it("leaves the owner's session and other shares connected", async () => {
    const shareA = seedPasswordShare("tok-a");
    const shareB = seedPasswordShare("tok-b");
    const proofB = createShareProof(shareB);
    storage.createSession("sess-4", "rev-owner", 60_000);

    const owner = await connect("boardId=rev-board&token=sess-4");
    const other = await connect(
      `boardId=rev-board&shareToken=tok-b&shareProof=${encodeURIComponent(
        proofB,
      )}`,
    );

    await revokeViaApi(shareA.id, "sess-4");
    // Give any wrongful disconnect a chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(owner.closeCode).toBeNull();
    expect(owner.ws.readyState).toBe(WebSocket.OPEN);
    expect(other.closeCode).toBeNull();
    expect(other.ws.readyState).toBe(WebSocket.OPEN);
    owner.ws.close();
    other.ws.close();
  });

  it("revoking an already-revoked share notifies nothing new", async () => {
    const share = seedPasswordShare("once-tok");
    const events: string[] = [];
    storage.onShareRevoked((s) => events.push(s.token));

    storage.revokeShare(share.id);
    storage.revokeShare(share.id);
    expect(events).toEqual(["once-tok"]);
  });
});

describe("Share expiry disconnects existing clients", () => {
  let db: Database.Database;
  let storage: Storage;
  let server: http.Server;
  let serverUrl: string;
  let wsUrl: string;
  let relay: WebSocketRelay;

  interface TrackedSocket {
    ws: WebSocket;
    messages: number;
    closeCode: number | null;
  }

  const waitFor = async (
    predicate: () => boolean,
    timeoutMs = 4_000,
  ): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return predicate();
  };

  const connect = (query: string): Promise<TrackedSocket> =>
    new Promise((resolve, reject) => {
      const tracked: TrackedSocket = {
        ws: new WebSocket(`${wsUrl}?${query}`),
        messages: 0,
        closeCode: null,
      };
      tracked.ws.on("message", () => {
        tracked.messages += 1;
      });
      tracked.ws.on("close", (code) => {
        tracked.closeCode = code;
      });
      tracked.ws.on("open", () => resolve(tracked));
      tracked.ws.on("error", reject);
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
    const port = (server.address() as { port: number }).port;
    serverUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
    relay = new WebSocketRelay({ storage, server });

    storage.createUser({
      id: "exp-owner",
      username: "exp-owner",
      password_hash: "unused",
      salt: "unused",
      is_admin: 0,
    });
    storage.createBoard("exp-board", "Board", "exp-owner");
    storage.createSession("exp-sess", "exp-owner", 60_000);
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  });

  const seedPasswordShare = (token: string, expiresAt: number | null) => {
    const { hash, salt } = hashPassword(SHARE_PASSWORD);
    return storage.createShare({
      id: `id-${token}`,
      boardId: "exp-board",
      token,
      role: "editor",
      password_hash: hash,
      salt,
      expires_at: expiresAt,
    });
  };

  it("disconnects an idle password-share client when its link expires", async () => {
    const share = seedPasswordShare("exp-tok", Date.now() + 400);
    const proof = createShareProof(share);
    const client = await connect(
      `boardId=exp-board&shareToken=exp-tok&shareProof=${encodeURIComponent(
        proof,
      )}`,
    );
    expect(client.closeCode).toBeNull();

    // No frame from the client: the server cuts it at the expiry timestamp.
    expect(await waitFor(() => client.closeCode === 4403)).toBe(true);
  });

  it("stops delivering broadcasts after expiry", async () => {
    const share = seedPasswordShare("exp-feed", Date.now() + 400);
    const proof = createShareProof(share);
    const lapsed = await connect(
      `boardId=exp-board&shareToken=exp-feed&shareProof=${encodeURIComponent(
        proof,
      )}`,
    );
    const owner = await connect("boardId=exp-board&token=exp-sess");
    expect(await waitFor(() => lapsed.closeCode === 4403)).toBe(true);
    const messagesAtCutoff = lapsed.messages;

    const doc = new Y.Doc();
    doc.getMap("t").set("k", "v");
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    encoding.writeVarUint(enc, 2);
    encoding.writeVarUint8Array(enc, Y.encodeStateAsUpdate(doc));
    owner.ws.send(encoding.toUint8Array(enc));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(lapsed.messages).toBe(messagesAtCutoff);
    owner.ws.close();
  });

  it("cuts a passwordless viewer at expiry", async () => {
    storage.createShare({
      id: "id-exp-open",
      boardId: "exp-board",
      token: "exp-open",
      role: "viewer",
      expires_at: Date.now() + 400,
    });
    const client = await connect("boardId=exp-board&shareToken=exp-open");
    expect(client.closeCode).toBeNull();
    expect(await waitFor(() => client.closeCode === 4403)).toBe(true);
  });

  it("leaves unexpired shares and the owner connected when another share expires", async () => {
    const expiring = seedPasswordShare("exp-a", Date.now() + 400);
    const proofA = createShareProof(expiring);
    const staying = seedPasswordShare("exp-b", null);
    const proofB = createShareProof(staying);

    const cut = await connect(
      `boardId=exp-board&shareToken=exp-a&shareProof=${encodeURIComponent(
        proofA,
      )}`,
    );
    const other = await connect(
      `boardId=exp-board&shareToken=exp-b&shareProof=${encodeURIComponent(
        proofB,
      )}`,
    );
    const owner = await connect("boardId=exp-board&token=exp-sess");

    expect(await waitFor(() => cut.closeCode === 4403)).toBe(true);
    // Give any wrongful disconnect a chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(other.closeCode).toBeNull();
    expect(other.ws.readyState).toBe(WebSocket.OPEN);
    expect(owner.closeCode).toBeNull();
    expect(owner.ws.readyState).toBe(WebSocket.OPEN);
    other.ws.close();
    owner.ws.close();
  });
});
