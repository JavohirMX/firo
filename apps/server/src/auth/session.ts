import { generateSessionToken } from "./crypto.js";

import type { Storage } from "../db/storage.js";
import type { SessionRecord, UserRecord } from "../db/schema.js";

export const SESSION_COOKIE_NAME = "firo_session";

export interface SessionAuthResult {
  session: SessionRecord;
  user: UserRecord;
}

export function validateSession(
  storage: Storage,
  token: string,
): SessionAuthResult | null {
  if (!token || typeof token !== "string") {
    return null;
  }
  return storage.getSession(token);
}

export function createSession(
  storage: Storage,
  userId: string,
  ttlMs: number,
): { token: string; session: SessionRecord } {
  const token = generateSessionToken();
  const session = storage.createSession(token, userId, ttlMs);
  return { token, session };
}

export function revokeSession(storage: Storage, token: string): void {
  storage.deleteSession(token);
}

export function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) {
    return out;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      out[key] = decodeURIComponent(val);
    }
  }
  return out;
}

export function parseSessionToken(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  // Check Authorization: Bearer <token>
  const authHeader = headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }

  // Check Cookie
  const cookieHeader = headers.cookie;
  if (typeof cookieHeader === "string") {
    const cookies = parseCookies(cookieHeader);
    if (cookies[SESSION_COOKIE_NAME]) {
      return cookies[SESSION_COOKIE_NAME];
    }
  }

  return null;
}

export function buildSessionCookie(
  token: string,
  maxAgeMs: number,
  secure: boolean = false,
): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildExpiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}
