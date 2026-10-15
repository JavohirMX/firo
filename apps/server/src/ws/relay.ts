import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import { parseCookies } from "../auth/session.js";

import { ClientConnection } from "./connection.js";

import { Room } from "./room.js";

import type { Role, UserRecord } from "../db/schema.js";
import type { Storage } from "../db/storage.js";

import type { Socket } from "node:net";
import type http from "node:http";

export interface RelayOptions {
  storage: Storage;
  server?: http.Server;
}

export class WebSocketRelay {
  public readonly storage: Storage;
  public readonly wss: WebSocketServer;
  public readonly rooms: Map<string, Room> = new Map();

  constructor(options: RelayOptions) {
    this.storage = options.storage;
    this.wss = new WebSocketServer({ noServer: true });

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
    const parsed = this.parseConnectionRequest(req);
    if (!parsed) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const { boardId, user, shareToken, role } = parsed;

    this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      this.handleConnection(ws, boardId, user, shareToken, role);
    });
  }

  public handleConnection(
    ws: WebSocket,
    boardId: string,
    user: UserRecord | null,
    shareToken: string | null,
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
      role,
      storage: this.storage,
    });

    room.addClient(client);

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
      if (room && room.clients.size === 0) {
        // Optionally compact on room empty
        try {
          this.storage.compactBoard(boardId);
        } catch {
          // ignore
        }
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

      if (!boardId) {
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

      const role = this.storage.resolveRole(boardId, user, shareToken);
      if (!role) {
        return null;
      }

      return {
        boardId,
        user,
        shareToken,
        role,
      };
    } catch {
      return null;
    }
  }

  public getRoom(boardId: string): Room | undefined {
    return this.rooms.get(boardId);
  }

  public close(): void {
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
    this.wss.close();
  }
}
