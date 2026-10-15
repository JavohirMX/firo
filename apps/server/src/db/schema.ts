import type Database from "better-sqlite3";

export type Role = "owner" | "editor" | "commenter" | "viewer";

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  is_admin: number;
  created_at: number;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface BoardRecord {
  id: string;
  owner_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface BoardMemberRecord {
  board_id: string;
  user_id: string;
  role: Role;
  created_at: number;
}

export interface ShareRecord {
  id: string;
  board_id: string;
  token: string;
  role: Role;
  password_hash: string | null;
  salt: string | null;
  expires_at: number | null;
  revoked: number;
  created_at: number;
  created_by: string | null;
}

export interface UpdateRecord {
  id: number;
  board_id: string;
  update_bytes: Buffer;
  created_at: number;
}

export interface SnapshotRecord {
  board_id: string;
  snapshot_bytes: Buffer;
  last_update_id: number;
  updated_at: number;
}

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT,
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  update_bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  snapshot_bytes BLOB NOT NULL,
  last_update_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_board_id ON shares(board_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_updates_board_id ON updates(board_id, id);
`;

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
