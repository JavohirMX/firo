import type { WebSocket } from "ws";
import type { Role, UserRecord } from "../db/schema.js";
import type { Storage } from "../db/storage.js";

export class ClientConnection {
  public readonly ws: WebSocket;
  public readonly boardId: string;
  public readonly userId: string | null;
  public user: UserRecord | null;
  public readonly shareToken: string | null;
  public role: Role;
  private readonly storage: Storage;
  public isClosed: boolean = false;

  constructor(options: {
    ws: WebSocket;
    boardId: string;
    userId: string | null;
    user: UserRecord | null;
    shareToken: string | null;
    role: Role;
    storage: Storage;
  }) {
    this.ws = options.ws;
    this.boardId = options.boardId;
    this.userId = options.userId;
    this.user = options.user;
    this.shareToken = options.shareToken;
    this.role = options.role;
    this.storage = options.storage;
  }

  public send(message: Uint8Array): void {
    if (this.isClosed || this.ws.readyState !== this.ws.OPEN) {
      return;
    }
    this.ws.send(message, { binary: true });
  }

  public close(code: number = 1000, reason?: string): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    try {
      this.ws.close(code, reason);
    } catch {
      // Ignore if socket already closed
    }
  }

  /**
   * Re-evaluates authorization against SQLite.
   * If user was demoted or permissions revoked, returns the new role or null.
   */
  public refreshRole(): Role | null {
    if (this.userId) {
      const freshUser = this.storage.getUserById(this.userId);
      this.user = freshUser;
    }

    const currentRole = this.storage.resolveRole(
      this.boardId,
      this.user,
      this.shareToken,
    );
    if (currentRole) {
      this.role = currentRole;
    }
    return currentRole;
  }
}
