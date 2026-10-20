import { URL } from "node:url";

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSession,
  parseSessionToken,
  revokeSession,
  validateSession,
} from "../auth/session.js";
import {
  generateId,
  generateShareToken,
  hashPassword,
  verifyPassword,
} from "../auth/crypto.js";

import type http from "node:http";
import type { ServerConfig } from "../config.js";
import type { Role, UserRecord } from "../db/schema.js";
import type { Storage } from "../db/storage.js";
import type { RateLimiter } from "./rateLimit.js";

export interface HttpContext {
  storage: Storage;
  config: ServerConfig;
  authRateLimiter: RateLimiter;
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
  headers: Record<string, string> = {},
): void {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

function sendText(
  res: http.ServerResponse,
  statusCode: number,
  text: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        // Limit to 1MB
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function getClientIp(req: http.IncomingMessage): string {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

function authenticateUser(
  req: http.IncomingMessage,
  storage: Storage,
): UserRecord | null {
  const token = parseSessionToken(req.headers);
  if (!token) {
    return null;
  }
  const result = validateSession(storage, token);
  return result?.user ?? null;
}

export function createHttpHandler(
  ctx: HttpContext,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const { storage, config, authRateLimiter } = ctx;

  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    // CORS headers
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || "localhost";
    const parsedUrl = new URL(req.url || "/", `http://${host}`);
    const pathname = parsedUrl.pathname;
    const method = (req.method || "GET").toUpperCase();

    // 1. Health check: /healthz
    if (pathname === "/healthz" && method === "GET") {
      sendText(res, 200, "OK");
      return;
    }

    // 2. Auth: POST /api/auth/register
    if (pathname === "/api/auth/register" && method === "POST") {
      const ip = getClientIp(req);
      if (!authRateLimiter.check(ip)) {
        sendJson(res, 429, {
          error: "Too many requests. Please try again later.",
        });
        return;
      }

      const count = storage.countUsers();
      if (!config.allowOpenRegistration && count > 0) {
        sendJson(res, 403, { error: "Open registration is disabled." });
        return;
      }

      const body = await readJsonBody<{ username?: string; password?: string }>(
        req,
      );
      const username =
        typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!username || username.length < 3 || username.length > 50) {
        sendJson(res, 400, {
          error: "Username must be between 3 and 50 characters.",
        });
        return;
      }

      if (!password || password.length < 6) {
        sendJson(res, 400, {
          error: "Password must be at least 6 characters.",
        });
        return;
      }

      const existing = storage.getUserByUsername(username);
      if (existing) {
        sendJson(res, 409, { error: "Username already taken." });
        return;
      }

      const { hash, salt } = hashPassword(password);
      const isAdmin = count === 0 ? 1 : 0; // First user is Admin / Owner
      const userId = generateId();

      const user = storage.createUser({
        id: userId,
        username,
        password_hash: hash,
        salt,
        is_admin: isAdmin,
      });

      const { token } = createSession(storage, user.id, config.sessionTtlMs);
      const cookie = buildSessionCookie(token, config.sessionTtlMs, false);

      sendJson(
        res,
        201,
        {
          user: {
            id: user.id,
            username: user.username,
            isAdmin: Boolean(user.is_admin),
            createdAt: user.created_at,
          },
        },
        { "Set-Cookie": cookie },
      );
      return;
    }

    // 3. Auth: POST /api/auth/login
    if (pathname === "/api/auth/login" && method === "POST") {
      const ip = getClientIp(req);
      if (!authRateLimiter.check(ip)) {
        sendJson(res, 429, {
          error: "Too many requests. Please try again later.",
        });
        return;
      }

      const body = await readJsonBody<{ username?: string; password?: string }>(
        req,
      );
      const username =
        typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!username || !password) {
        sendJson(res, 400, { error: "Username and password are required." });
        return;
      }

      const user = storage.getUserByUsername(username);
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        sendJson(res, 401, { error: "Invalid username or password." });
        return;
      }

      const { token } = createSession(storage, user.id, config.sessionTtlMs);
      const cookie = buildSessionCookie(token, config.sessionTtlMs, false);

      sendJson(
        res,
        200,
        {
          user: {
            id: user.id,
            username: user.username,
            isAdmin: Boolean(user.is_admin),
            createdAt: user.created_at,
          },
        },
        { "Set-Cookie": cookie },
      );
      return;
    }

    // 4. Auth: POST /api/auth/logout
    if (pathname === "/api/auth/logout" && method === "POST") {
      const token = parseSessionToken(req.headers);
      if (token) {
        revokeSession(storage, token);
      }
      const cookie = buildExpiredSessionCookie();
      sendJson(res, 200, { ok: true }, { "Set-Cookie": cookie });
      return;
    }

    // 5. Auth: GET /api/auth/me
    if (pathname === "/api/auth/me" && method === "GET") {
      const user = authenticateUser(req, storage);
      if (!user) {
        sendJson(res, 401, { error: "Not authenticated." });
        return;
      }

      sendJson(res, 200, {
        user: {
          id: user.id,
          username: user.username,
          isAdmin: Boolean(user.is_admin),
          createdAt: user.created_at,
        },
      });
      return;
    }

    // 6. Shares: POST /api/boards/:id/shares
    const sharesMatch = pathname.match(/^\/api\/boards\/([^/]+)\/shares$/);
    if (sharesMatch && method === "POST") {
      const boardId = decodeURIComponent(sharesMatch[1]);
      const user = authenticateUser(req, storage);
      if (!user) {
        sendJson(res, 401, { error: "Not authenticated." });
        return;
      }

      const role = storage.resolveRole(boardId, user);
      if (role !== "owner" && user.is_admin !== 1) {
        sendJson(res, 403, { error: "Only board owners can manage shares." });
        return;
      }

      const body = await readJsonBody<{
        role?: Role;
        expiresAt?: number;
        password?: string;
      }>(req);

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        sendJson(res, 400, { error: "A JSON object is required." });
        return;
      }
      if (body.password !== undefined && typeof body.password !== "string") {
        sendJson(res, 400, { error: "Share password must be a string." });
        return;
      }
      if (
        body.expiresAt !== undefined &&
        body.expiresAt !== null &&
        (!Number.isSafeInteger(body.expiresAt) || body.expiresAt < 0)
      ) {
        sendJson(res, 400, {
          error:
            "Share expiry must be a non-negative integer timestamp or null.",
        });
        return;
      }

      const targetRole: Role = body.role ?? "editor";
      if (!["owner", "editor", "commenter", "viewer"].includes(targetRole)) {
        sendJson(res, 400, { error: "Invalid share role." });
        return;
      }

      let passwordHash: string | null = null;
      let salt: string | null = null;
      if (body?.password) {
        const hashed = hashPassword(body.password);
        passwordHash = hashed.hash;
        salt = hashed.salt;
      }

      const token = generateShareToken();
      const share = storage.createShare({
        id: generateId(),
        boardId,
        token,
        role: targetRole,
        password_hash: passwordHash,
        salt,
        expires_at: body?.expiresAt ?? null,
        created_by: user.id,
      });

      sendJson(res, 201, {
        share: {
          id: share.id,
          boardId: share.board_id,
          token: share.token,
          role: share.role,
          expiresAt: share.expires_at,
          createdAt: share.created_at,
          revoked: Boolean(share.revoked),
        },
      });
      return;
    }

    // 7. Shares: GET /api/boards/:id/shares
    if (sharesMatch && method === "GET") {
      const boardId = decodeURIComponent(sharesMatch[1]);
      const user = authenticateUser(req, storage);
      if (!user) {
        sendJson(res, 401, { error: "Not authenticated." });
        return;
      }

      const role = storage.resolveRole(boardId, user);
      if (role !== "owner" && user.is_admin !== 1) {
        sendJson(res, 403, { error: "Only board owners can view shares." });
        return;
      }

      const shares = storage.listShares(boardId).map((s) => ({
        id: s.id,
        boardId: s.board_id,
        token: s.token,
        role: s.role,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        revoked: Boolean(s.revoked),
      }));

      sendJson(res, 200, { shares });
      return;
    }

    // 8. Shares: POST /api/boards/:id/shares/:shareId/revoke or DELETE /api/boards/:id/shares/:shareId
    const revokeMatch = pathname.match(
      /^\/api\/boards\/([^/]+)\/shares\/([^/]+)(\/revoke)?$/,
    );
    if (revokeMatch && (method === "POST" || method === "DELETE")) {
      const boardId = decodeURIComponent(revokeMatch[1]);
      const shareId = decodeURIComponent(revokeMatch[2]);
      const user = authenticateUser(req, storage);
      if (!user) {
        sendJson(res, 401, { error: "Not authenticated." });
        return;
      }

      const role = storage.resolveRole(boardId, user);
      if (role !== "owner" && user.is_admin !== 1) {
        sendJson(res, 403, { error: "Only board owners can revoke shares." });
        return;
      }

      const share = storage.getShareById(shareId);
      if (!share || share.board_id !== boardId) {
        sendJson(res, 404, { error: "Share link not found." });
        return;
      }

      storage.revokeShare(share.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    // 9. Public share info: GET /s/:token or GET /api/shares/:token
    const publicShareMatch =
      pathname.match(/^\/s\/([^/]+)$/) ||
      pathname.match(/^\/api\/shares\/([^/]+)$/);
    if (publicShareMatch && method === "GET") {
      const token = decodeURIComponent(publicShareMatch[1]);
      const share = storage.getShareByToken(token);
      if (!share || share.revoked === 1) {
        sendJson(res, 404, { error: "Share link not found or revoked." });
        return;
      }

      if (share.expires_at && share.expires_at < Date.now()) {
        sendJson(res, 410, { error: "Share link has expired." });
        return;
      }

      sendJson(res, 200, {
        share: {
          boardId: share.board_id,
          role: share.role,
          requiresPassword: Boolean(share.password_hash),
        },
      });
      return;
    }

    // Not found
    sendJson(res, 404, { error: "Not found." });
  };
}
