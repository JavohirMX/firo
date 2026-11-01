import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import { parseCookies } from "../auth/session.js";
import { isAllowedOrigin } from "../http/routes.js";
import { verifyShareProof } from "../auth/shareProof.js";

import { ClientConnection } from "./connection.js";

import { Room } from "./room.js";

import type { Role, ShareRecord, UserRecord } from "../db/schema.js";
import type { Storage } from "../db/storage.js";

import type { Socket } from "node:net";
import type http from "node:http";

export interface RelayOptions {
  storage: Storage;
  server?: http.Server;
  /** Extra browser origins allowed to open a socket. Same-origin always is. */
  allowedOrigins?: string[];
}

export class WebSocketRelay {
  public readonly storage: Storage;
  public readonly wss: WebSocketServer;
  public readonly rooms: Map<string, Room> = new Map();
  private readonly allowedOrigins: string[];
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(options: RelayOptions) {
    this.storage = options.storage;
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.wss = new WebSocketServer({ noServer: true });

    // Revoking a share must cut off its existing connections, not only new
    // ones: without this, an idle share client kept receiving broadcasts
    // until it happened to send an update frame.
    this.storage.onShareRevoked((share) => this.disconnectShareClients(share));

    if (options.server) {
      this.attachToServer(options.server);
    }
  }

  public attachToServer(server: http.Server): void {
    server.on(
      "upgrade",
      (req: http.IncomingMessage, socket: Socket, head: Buffer) => {
        this.handleUpgrade(req, socket, head);
      },
    );
  }

  public handleUpgrade(
    req: http.IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): void {
    // Browsers send cookies on cross-site WebSocket handshakes, so a page on
    // another origin could ride a signed-in session. Clients with no Origin
    // header (non-browser) are not subject to that and are let through.
    const origin = req.headers.origin;
    if (
      origin &&
      !isAllowedOrigin(origin, req.headers.host, {
        allowedOrigins: this.allowedOrigins,
      })
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const parsed = this.parseConnectionRequest(req);
    if (!parsed) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const { boardId, user, shareToken, shareProof, role } = parsed;

    this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      this.handleConnection(ws, boardId, user, shareToken, shareProof, role);
    });
  }

  public handleConnection(
    ws: WebSocket,
    boardId: string,
    user: UserRecord | null,
    shareToken: string | null,
    shareProof: string | null,
    role: Role,
  ): void {
    let room = this.rooms.get(boardId);
    if (!room) {
      room = new Room(boardId, this.storage);
      this.rooms.set(boardId, room);
    }

    const client = new ClientConnection({
      ws,
      boardId,
      userId: user?.id ?? null,
      user,
      shareToken,
      shareProof,
      role,
      storage: this.storage,
    });

    room.addClient(client);
    this.scheduleExpirySweep();

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      let uint8: Uint8Array;
      if (Buffer.isBuffer(data)) {
        uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else if (Array.isArray(data)) {
        uint8 = new Uint8Array(Buffer.concat(data));
      } else {
        uint8 = new Uint8Array(data);
      }
      room?.handleMessage(client, uint8);
    });

    ws.on("close", () => {
      room?.removeClient(client);
      this.scheduleExpirySweep();
      if (room && room.clients.size === 0) {
        // Compact, then release the room so its Y.Doc and awareness state do
        // not stay in memory for every board ever opened. A later connection
        // reloads the document from storage.
        try {
          this.storage.compactBoard(boardId);
        } catch {
          // ignore
        }
        if (this.rooms.get(boardId) === room) {
          this.rooms.delete(boardId);
        }
        room.destroy();
      }
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error on board ${boardId}:`, err);
      room?.removeClient(client);
    });
  }

  public parseConnectionRequest(req: http.IncomingMessage): {
    boardId: string;
    user: UserRecord | null;
    shareToken: string | null;
    shareProof: string | null;
    role: Role;
  } | null {
    try {
      const host = req.headers.host || "localhost";
      const fullUrl = new URL(req.url || "/", `http://${host}`);
      const pathname = fullUrl.pathname;

      // Extract session token
      let sessionToken: string | null = null;
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7).trim();
      }

      if (!sessionToken && req.headers.cookie) {
        const cookies = parseCookies(req.headers.cookie);
        sessionToken = cookies.firo_session ?? null;
      }

      if (!sessionToken) {
        sessionToken =
          fullUrl.searchParams.get("token") ||
          fullUrl.searchParams.get("auth") ||
          null;
      }

      // Find user if session token exists
      let user: UserRecord | null = null;
      if (sessionToken) {
        const sessionResult = this.storage.getSession(sessionToken);
        if (sessionResult) {
          user = sessionResult.user;
        }
      }

      // Check share capability URLs (/s/:token)
      let shareToken =
        fullUrl.searchParams.get("share") ||
        fullUrl.searchParams.get("shareToken");
      const shareProof = fullUrl.searchParams.get("shareProof");
      let boardId: string | null = fullUrl.searchParams.get("boardId");

      if (pathname.startsWith("/s/")) {
        shareToken = pathname.slice(3).split("/")[0];
      } else if (pathname.startsWith("/boards/")) {
        boardId = pathname.slice(8).split("/")[0];
      } else if (pathname.startsWith("/ws/")) {
        boardId = pathname.slice(4).split("/")[0];
      } else if (!boardId) {
        // e.g. /:boardId
        const cleaned = pathname.replace(/^\/+|\/+$/g, "");
        if (cleaned && !cleaned.startsWith("api/")) {
          boardId = cleaned;
        }
      }

      // If connected via share link, resolve boardId from share
      if (shareToken && !boardId) {
        const share = this.storage.getShareByToken(shareToken);
        if (share && !share.revoked) {
          boardId = share.board_id;
        }
      }

      // Same validation as POST /api/boards: the WS path auto-creates boards
      // for authenticated users, so it must not accept ids the HTTP API
      // would reject.
      if (!boardId || !/^[A-Za-z0-9_.-]{1,128}$/.test(boardId)) {
        return null;
      }

      // Check existing board or create if authenticated user connects to fresh board
      let board = this.storage.getBoard(boardId);
      if (!board && user) {
        board = this.storage.createBoard(boardId, "Untitled Board", user.id);
      }

      if (!board) {
        // If connecting with shareToken for a board that doesn't exist yet, invalid
        return null;
      }

      // A password-protected share needs the password-claim proof, not just
      // the link: without it resolveRole refuses the share role.
      let shareProofValid = false;
      if (shareToken) {
        const share = this.storage.getShareByToken(shareToken);
        if (share) {
          shareProofValid = verifyShareProof(share, shareProof);
        }
      }

      const role = this.storage.resolveRole(
        boardId,
        user,
        shareToken,
        shareProofValid,
      );
      if (!role) {
        return null;
      }

      return {
        boardId,
        user,
        shareToken,
        shareProof,
        role,
      };
    } catch {
      return null;
    }
  }

  public getRoom(boardId: string): Room | undefined {
    return this.rooms.get(boardId);
  }

  /** Disconnect every client joined through the revoked share link. */
  public disconnectShareClients(share: ShareRecord): void {
    const room = this.rooms.get(share.board_id);
    if (room) {
      for (const client of [...room.clients]) {
        if (client.shareToken === share.token) {
          client.close(4403, "Access revoked");
          room.removeClient(client);
        }
      }
    }
    this.scheduleExpirySweep();
  }

  /**
   * Arms a one-shot timer at the earliest share expiry among connected
   * clients. Expiry is a known timestamp, so an exact timer cuts idle
   * readers at the moment the link lapses instead of polling on an
   * interval. setTimeout accepts at most ~24.8 days; longer waits clamp
   * and re-arm when they fire.
   */
  private scheduleExpirySweep(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const now = Date.now();
    let earliest: number | null = null;
    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        if (!client.shareToken) {
          continue;
        }
        const share = this.storage.getShareByToken(client.shareToken);
        if (!share || share.revoked === 1 || !share.expires_at) {
          continue;
        }
        if (earliest === null || share.expires_at < earliest) {
          earliest = share.expires_at;
        }
      }
    }
    if (earliest === null) {
      return;
    }
    const MAX_TIMER_MS = 2_147_483_647;
    const delay = Math.min(Math.max(earliest - now, 0), MAX_TIMER_MS);
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      this.sweepLapsedShareClients();
    }, delay);
    this.expiryTimer.unref();
  }

  /** Cut every share client whose link has expired, then re-arm. */
  private sweepLapsedShareClients(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const client of [...room.clients]) {
        if (!client.shareToken) {
          continue;
        }
        const share = this.storage.getShareByToken(client.shareToken);
        const lapsed =
          !share ||
          share.revoked === 1 ||
          (share.expires_at !== null && share.expires_at <= now);
        if (lapsed) {
          client.close(4403, "Share link expired");
          room.removeClient(client);
        }
      }
    }
    this.scheduleExpirySweep();
  }

  public close(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
    this.wss.close();
  }
}
