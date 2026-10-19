import { useSyncExternalStore } from "react";

import { createSyncApi, SyncApiError } from "./api";

import type { SyncApi, SyncUser } from "./api";

/**
 * Sign-in state for the optional sync server.
 *
 * "unknown": not asked yet. "signedOut": the server answered and there is no
 * session. "signedIn": there is one. "unavailable": no sync server answered
 * (a local-only build, or the server is down). The app works the same in every
 * state; only the menu and the share dialog look at it.
 */
export type SyncSessionState =
  | { status: "unknown" }
  | { status: "signedOut" }
  | { status: "unavailable" }
  | { status: "signedIn"; user: SyncUser };

export interface SyncSessionStore {
  getState(): SyncSessionState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  signIn(username: string, password: string): Promise<void>;
  register(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export const createSyncSessionStore = (api: SyncApi): SyncSessionStore => {
  let state: SyncSessionState = { status: "unknown" };
  const listeners = new Set<() => void>();

  const set = (next: SyncSessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async refresh() {
      try {
        const user = await api.me();
        set(user ? { status: "signedIn", user } : { status: "signedOut" });
      } catch {
        // No JSON from /api/auth/me means no sync server is behind this
        // origin (for example the Vite dev server). That is not an error.
        set({ status: "unavailable" });
      }
    },

    async signIn(username, password) {
      set({ status: "signedIn", user: await api.login(username, password) });
    },

    async register(username, password) {
      set({ status: "signedIn", user: await api.register(username, password) });
    },

    async signOut() {
      try {
        await api.logout();
      } catch (error) {
        // A dead session is already signed out. Anything else the user should
        // see, because the cookie may still be valid.
        if (!(error instanceof SyncApiError && error.status === 401)) {
          throw error;
        }
      }
      set({ status: "signedOut" });
    },
  };
};

export const syncApi: SyncApi = createSyncApi();

export const syncSession = createSyncSessionStore(syncApi);

export const useSyncSession = (): SyncSessionState =>
  useSyncExternalStore(syncSession.subscribe, syncSession.getState);
