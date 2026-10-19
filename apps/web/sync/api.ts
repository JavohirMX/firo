/**
 * Client for the Firo sync server's HTTP API (apps/server).
 *
 * The server serves the web app from the same origin, so the default base URL
 * is empty and requests go to relative paths. The session lives in an
 * HttpOnly cookie, which the browser attaches on its own.
 */

export type ShareRole = "owner" | "editor" | "commenter" | "viewer";

export interface SyncUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface SyncShare {
  id: string;
  boardId: string;
  token: string;
  role: ShareRole;
  expiresAt: number | null;
  createdAt: number;
  revoked: boolean;
}

export interface PublicShareInfo {
  boardId: string;
  role: ShareRole;
  requiresPassword: boolean;
}

/** An error response from the server, with its HTTP status. */
export class SyncApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SyncApiError";
    this.status = status;
  }
}

export interface SyncApiOptions {
  /** Origin of the sync server, without a trailing slash. Default: same origin. */
  baseUrl?: string;
  /** Injected for tests. Default: the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SyncApi {
  register(username: string, password: string): Promise<SyncUser>;
  login(username: string, password: string): Promise<SyncUser>;
  logout(): Promise<void>;
  /** The signed-in user, or null when there is no valid session. */
  me(): Promise<SyncUser | null>;
  createShare(
    boardId: string,
    options: { role: ShareRole; expiresAt?: number | null },
  ): Promise<SyncShare>;
  listShares(boardId: string): Promise<SyncShare[]>;
  revokeShare(boardId: string, shareId: string): Promise<void>;
  getShareInfo(token: string): Promise<PublicShareInfo>;
}

export const createSyncApi = (options: SyncApiOptions = {}): SyncApi => {
  const baseUrl = options.baseUrl ?? "";

  const request = async <T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T | null> => {
    const doFetch = options.fetchImpl ?? fetch;
    const hasBody = init.body !== undefined;
    const response = await doFetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed (${response.status}).`;
      throw new SyncApiError(response.status, message);
    }
    return payload as T | null;
  };

  const requireUser = (payload: { user?: SyncUser } | null): SyncUser => {
    if (!payload?.user) {
      throw new SyncApiError(502, "The server returned an unexpected reply.");
    }
    return payload.user;
  };

  const boardPath = (boardId: string) =>
    `/api/boards/${encodeURIComponent(boardId)}`;

  return {
    async register(username, password) {
      return requireUser(
        await request<{ user: SyncUser }>("/api/auth/register", {
          method: "POST",
          body: { username, password },
        }),
      );
    },

    async login(username, password) {
      return requireUser(
        await request<{ user: SyncUser }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
        }),
      );
    },

    async logout() {
      await request("/api/auth/logout", { method: "POST" });
    },

    async me() {
      try {
        return requireUser(await request<{ user: SyncUser }>("/api/auth/me"));
      } catch (error) {
        if (error instanceof SyncApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },

    async createShare(boardId, shareOptions) {
      const payload = await request<{ share: SyncShare }>(
        `${boardPath(boardId)}/shares`,
        {
          method: "POST",
          body: {
            role: shareOptions.role,
            expiresAt: shareOptions.expiresAt ?? undefined,
          },
        },
      );
      if (!payload?.share) {
        throw new SyncApiError(502, "The server returned an unexpected reply.");
      }
      return payload.share;
    },

    async listShares(boardId) {
      const payload = await request<{ shares: SyncShare[] }>(
        `${boardPath(boardId)}/shares`,
      );
      return payload?.shares ?? [];
    },

    async revokeShare(boardId, shareId) {
      await request(
        `${boardPath(boardId)}/shares/${encodeURIComponent(shareId)}`,
        { method: "DELETE" },
      );
    },

    async getShareInfo(token) {
      const payload = await request<{ share: PublicShareInfo }>(
        `/api/shares/${encodeURIComponent(token)}`,
      );
      if (!payload?.share) {
        throw new SyncApiError(502, "The server returned an unexpected reply.");
      }
      return payload.share;
    },
  };
};
