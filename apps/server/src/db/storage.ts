import Database from "better-sqlite3";
import * as Y from "yjs";

import {
  initSchema,
  type BoardRecord,
  type Role,
  type SessionRecord,
  type ShareRecord,
  type SnapshotRecord,
  type UpdateRecord,
  type UserRecord,
} from "./schema.js";

export class Storage {
  public readonly db: Database.Database;
  private readonly shareRevokedListeners: ((share: ShareRecord) => void)[] = [];

  constructor(dbOrPath: Database.Database | string) {
    if (typeof dbOrPath === "string") {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }

    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    initSchema(this.db);
  }

  public close(): void {
    this.db.close();
  }

  // --- Users ---

  public createUser(user: {
    id: string;
    username: string;
    password_hash: string;
    salt: string;
    is_admin: number;
    created_at?: number;
  }): UserRecord {
    const record: UserRecord = {
      id: user.id,
      username: user.username.trim(),
      password_hash: user.password_hash,
      salt: user.salt,
      is_admin: user.is_admin,
      created_at: user.created_at ?? Date.now(),
    };

    const stmt = this.db.prepare(
      `INSERT INTO users (id, username, password_hash, salt, is_admin, created_at)
       VALUES (@id, @username, @password_hash, @salt, @is_admin, @created_at)`,
    );
    stmt.run(record);
    return record;
  }

  public getUserById(id: string): UserRecord | null {
    const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?");
    return (stmt.get(id) as UserRecord) ?? null;
  }

  public getUserByUsername(username: string): UserRecord | null {
    const stmt = this.db.prepare(
      "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
    );
    return (stmt.get(username.trim()) as UserRecord) ?? null;
  }

  public countUsers(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM users");
    const row = stmt.get() as { count: number };
    return row.count;
  }

  public listUsers(): UserRecord[] {
    const stmt = this.db.prepare("SELECT * FROM users ORDER BY created_at ASC");
    return stmt.all() as UserRecord[];
  }

  // --- Sessions ---

  public createSession(
    token: string,
    userId: string,
    ttlMs: number,
  ): SessionRecord {
    const now = Date.now();
    const record: SessionRecord = {
      id: token,
      user_id: userId,
      created_at: now,
      expires_at: now + ttlMs,
    };

    const stmt = this.db.prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES (@id, @user_id, @created_at, @expires_at)`,
    );
    stmt.run(record);
    return record;
  }

  public getSession(
    token: string,
  ): { session: SessionRecord; user: UserRecord } | null {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT 
        s.id as s_id, s.user_id as s_user_id, s.created_at as s_created_at, s.expires_at as s_expires_at,
        u.id as u_id, u.username as u_username, u.password_hash as u_password_hash, u.salt as u_salt,
        u.is_admin as u_is_admin, u.created_at as u_created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > ?
    `);
    const row = stmt.get(token, now) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    return {
      session: {
        id: row.s_id as string,
        user_id: row.s_user_id as string,
        created_at: row.s_created_at as number,
        expires_at: row.s_expires_at as number,
      },
      user: {
        id: row.u_id as string,
        username: row.u_username as string,
        password_hash: row.u_password_hash as string,
        salt: row.u_salt as string,
        is_admin: row.u_is_admin as number,
        created_at: row.u_created_at as number,
      },
    };
  }

  public deleteSession(token: string): void {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id = ?");
    stmt.run(token);
  }

  /** Deletes expired sessions and returns how many were removed. */
  public deleteExpiredSessions(): number {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
    return stmt.run(Date.now()).changes;
  }

  // --- Boards ---

  public createBoard(
    id: string,
    name: string = "Untitled Board",
    ownerId: string | null = null,
  ): BoardRecord {
    const now = Date.now();
    const record: BoardRecord = {
      id,
      owner_id: ownerId,
      name,
      created_at: now,
      updated_at: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO boards (id, owner_id, name, created_at, updated_at)
      VALUES (@id, @owner_id, @name, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `);
    stmt.run(record);
    return record;
  }

  public getBoard(id: string): BoardRecord | null {
    const stmt = this.db.prepare("SELECT * FROM boards WHERE id = ?");
    return (stmt.get(id) as BoardRecord) ?? null;
  }

  public deleteBoard(id: string): void {
    const stmt = this.db.prepare("DELETE FROM boards WHERE id = ?");
    stmt.run(id);
  }

  public setBoardMember(boardId: string, userId: string, role: Role): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO board_members (board_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role
    `);
    stmt.run(boardId, userId, role, now);
  }

  public getBoardMember(boardId: string, userId: string): Role | null {
    const stmt = this.db.prepare(
      "SELECT role FROM board_members WHERE board_id = ? AND user_id = ?",
    );
    const row = stmt.get(boardId, userId) as { role: Role } | undefined;
    return row?.role ?? null;
  }

  public removeBoardMember(boardId: string, userId: string): void {
    const stmt = this.db.prepare(
      "DELETE FROM board_members WHERE board_id = ? AND user_id = ?",
    );
    stmt.run(boardId, userId);
  }

  // --- Shares ---

  public createShare(share: {
    id: string;
    boardId: string;
    token: string;
    role: Role;
    password_hash?: string | null;
    salt?: string | null;
    expires_at?: number | null;
    created_by?: string | null;
    created_at?: number;
  }): ShareRecord {
    const record: ShareRecord = {
      id: share.id,
      board_id: share.boardId,
      token: share.token,
      role: share.role,
      password_hash: share.password_hash ?? null,
      salt: share.salt ?? null,
      expires_at: share.expires_at ?? null,
      revoked: 0,
      created_at: share.created_at ?? Date.now(),
      created_by: share.created_by ?? null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO shares (id, board_id, token, role, password_hash, salt, expires_at, revoked, created_at, created_by)
      VALUES (@id, @board_id, @token, @role, @password_hash, @salt, @expires_at, @revoked, @created_at, @created_by)
    `);
    stmt.run(record);
    return record;
  }

  public getShareByToken(token: string): ShareRecord | null {
    const stmt = this.db.prepare("SELECT * FROM shares WHERE token = ?");
    return (stmt.get(token) as ShareRecord) ?? null;
  }

  public getShareById(id: string): ShareRecord | null {
    const stmt = this.db.prepare("SELECT * FROM shares WHERE id = ?");
    return (stmt.get(id) as ShareRecord) ?? null;
  }

  public listShares(boardId: string): ShareRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM shares WHERE board_id = ? ORDER BY created_at DESC",
    );
    return stmt.all(boardId) as ShareRecord[];
  }

  public onShareRevoked(listener: (share: ShareRecord) => void): void {
    this.shareRevokedListeners.push(listener);
  }

  public revokeShare(tokenOrId: string): void {
    // Collect the affected rows first so listeners learn which share (and
    // board) was revoked; the UPDATE alone would leave that unknown.
    const matches = this.db
      .prepare(
        "SELECT * FROM shares WHERE (id = ? OR token = ?) AND revoked = 0",
      )
      .all(tokenOrId, tokenOrId) as ShareRecord[];
    const stmt = this.db.prepare(
      "UPDATE shares SET revoked = 1 WHERE id = ? OR token = ?",
    );
    stmt.run(tokenOrId, tokenOrId);
    for (const share of matches) {
      for (const listener of this.shareRevokedListeners) {
        try {
          listener(share);
        } catch {
          // A listener failure must not break the revoke API path.
        }
      }
    }
  }

  // --- Role Resolution ---

  public resolveRole(
    boardId: string,
    user: UserRecord | null,
    shareToken: string | null = null,
    shareProofValid: boolean = false,
  ): Role | null {
    const board = this.getBoard(boardId);
    if (!board) {
      return null;
    }

    if (user) {
      if (user.is_admin === 1) {
        return "owner";
      }
      if (board.owner_id === user.id) {
        return "owner";
      }

      const memberRole = this.getBoardMember(boardId, user.id);
      if (memberRole) {
        return memberRole;
      }
    }

    if (shareToken) {
      const share = this.getShareByToken(shareToken);
      if (share && share.board_id === boardId && share.revoked === 0) {
        if (!share.expires_at || share.expires_at > Date.now()) {
          // A password-protected share grants its role only when the caller
          // has already proven the password claim; the link alone is not
          // enough. Without this the stored hash was never consulted and
          // password links were open to anyone holding the URL.
          if (share.password_hash && !shareProofValid) {
            return null;
          }
          return share.role;
        }
      }
    }

    return null;
  }

  // --- Updates & Snapshots ---

  public appendUpdate(boardId: string, updateBytes: Uint8Array): number {
    const now = Date.now();
    // Syncing content must not run createBoard's metadata upsert: its default
    // name would overwrite a board title on every incoming document update.
    this.db
      .prepare(
        "INSERT INTO boards (id, owner_id, name, created_at, updated_at) VALUES (?, NULL, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      )
      .run(boardId, "Untitled Board", now, now);

    const buffer = Buffer.from(
      updateBytes.buffer,
      updateBytes.byteOffset,
      updateBytes.byteLength,
    );
    const stmt = this.db.prepare(`
      INSERT INTO updates (board_id, update_bytes, created_at)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(boardId, buffer, now);

    this.db
      .prepare("UPDATE boards SET updated_at = ? WHERE id = ?")
      .run(now, boardId);

    return Number(info.lastInsertRowid);
  }

  public getUpdates(boardId: string, sinceId: number = 0): UpdateRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM updates WHERE board_id = ? AND id > ? ORDER BY id ASC",
    );
    return stmt.all(boardId, sinceId) as UpdateRecord[];
  }

  public getSnapshot(boardId: string): SnapshotRecord | null {
    const stmt = this.db.prepare("SELECT * FROM snapshots WHERE board_id = ?");
    return (stmt.get(boardId) as SnapshotRecord) ?? null;
  }

  public loadBoardDocument(boardId: string): Y.Doc {
    const doc = new Y.Doc();
    const snapshot = this.getSnapshot(boardId);
    let lastUpdateId = 0;

    if (snapshot) {
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot_bytes));
      lastUpdateId = snapshot.last_update_id;
    }

    const updates = this.getUpdates(boardId, lastUpdateId);
    for (const update of updates) {
      Y.applyUpdate(doc, new Uint8Array(update.update_bytes));
    }

    return doc;
  }

  public compactBoard(boardId: string): {
    lastUpdateId: number;
    snapshotSize: number;
  } {
    const doc = this.loadBoardDocument(boardId);
    const compacted = Y.encodeStateAsUpdate(doc);
    const compactedBuffer = Buffer.from(
      compacted.buffer,
      compacted.byteOffset,
      compacted.byteLength,
    );

    const maxRow = this.db
      .prepare("SELECT MAX(id) as maxId FROM updates WHERE board_id = ?")
      .get(boardId) as { maxId: number | null };

    const snapshot = this.getSnapshot(boardId);
    const maxId = maxRow?.maxId ?? snapshot?.last_update_id ?? 0;

    const now = Date.now();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO snapshots (board_id, snapshot_bytes, last_update_id, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(board_id) DO UPDATE SET
            snapshot_bytes = excluded.snapshot_bytes,
            last_update_id = excluded.last_update_id,
            updated_at = excluded.updated_at
        `,
        )
        .run(boardId, compactedBuffer, maxId, now);

      if (maxId > 0) {
        this.db
          .prepare("DELETE FROM updates WHERE board_id = ? AND id <= ?")
          .run(boardId, maxId);
      }
    });

    tx();

    return {
      lastUpdateId: maxId,
      snapshotSize: compactedBuffer.byteLength,
    };
  }
}
