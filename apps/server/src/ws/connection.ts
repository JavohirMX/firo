import { verifyShareProof } from "../auth/shareProof.js";

import type { WebSocket } from "ws";
import type { Role, UserRecord } from "../db/schema.js";
import type { Storage } from "../db/storage.js";

export class ClientConnection {
  public readonly ws: WebSocket;
  public readonly boardId: string;
  public readonly userId: string | null;
  public user: UserRecord | null;
  public readonly shareToken: string | null;
  public readonly shareProof: string | null;
  public role: Role;
  private readonly storage: Storage;
  public isClosed: boolean = false;
  /*
   * The awareness clientIDs this connection has published. Tracked so a
   * disconnect can drop them immediately (ADR-0039: the relay drops a
   * peer's awareness on disconnect) instead of leaving them for the
   * 30-second y-protocols stale timeout.
   */
  public readonly awarenessIds: Set<number> = new Set();

  constructor(options: {
    ws: WebSocket;
    boardId: string;
    userId: string | null;
    user: UserRecord | null;
    shareToken: string | null;
    shareProof: string | null;
    role: Role;
    storage: Storage;
  }) {
    this.ws = options.ws;
    this.boardId = options.boardId;
    this.userId = options.userId;
    this.user = options.user;
    this.shareToken = options.shareToken;
    this.shareProof = options.shareProof;
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

    let shareProofValid = false;
    if (this.shareToken) {
      const share = this.storage.getShareByToken(this.shareToken);
      if (share) {
        shareProofValid = verifyShareProof(share, this.shareProof);
      }
    }

    const currentRole = this.storage.resolveRole(
      this.boardId,
      this.user,
      this.shareToken,
      shareProofValid,
    );
    if (currentRole) {
      this.role = currentRole;
    }
    return currentRole;
  }
}
