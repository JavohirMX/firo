import { describe, it, expect, vi } from "vitest";

import { SyncApiError } from "../sync/api";
import { createSyncSessionStore } from "../sync/session";

import type { SyncApi, SyncUser } from "../sync/api";

const user: SyncUser = {
  id: "u1",
  username: "ann",
  isAdmin: false,
  createdAt: 1,
};

const fakeApi = (overrides: Partial<SyncApi> = {}): SyncApi => ({
  register: vi.fn().mockResolvedValue(user),
  createBoard: vi.fn(),
  login: vi.fn().mockResolvedValue(user),
  logout: vi.fn().mockResolvedValue(undefined),
  me: vi.fn().mockResolvedValue(null),
  createShare: vi.fn(),
  listShares: vi.fn(),
  revokeShare: vi.fn(),
  getShareInfo: vi.fn(),
  ...overrides,
});

describe("sync session store", () => {
  it("starts unknown, then signedOut when the server has no session", async () => {
    const store = createSyncSessionStore(fakeApi());
    expect(store.getState()).toEqual({ status: "unknown" });
    await store.refresh();
    expect(store.getState()).toEqual({ status: "signedOut" });
  });

  it("is signedIn when the server knows the session", async () => {
    const store = createSyncSessionStore(
      fakeApi({ me: vi.fn().mockResolvedValue(user) }),
    );
    await store.refresh();
    expect(store.getState()).toEqual({ status: "signedIn", user });
  });

  it("is unavailable, not an error, when no server answers", async () => {
    const store = createSyncSessionStore(
      fakeApi({
        me: vi.fn().mockRejectedValue(new SyncApiError(502, "unexpected")),
      }),
    );
    await store.refresh();
    expect(store.getState()).toEqual({ status: "unavailable" });
  });

  it("signs in and out and notifies subscribers", async () => {
    const store = createSyncSessionStore(fakeApi());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await store.signIn("ann", "secret1");
    expect(store.getState()).toEqual({ status: "signedIn", user });
    await store.signOut();
    expect(store.getState()).toEqual({ status: "signedOut" });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await store.register("ann", "secret1");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous state and throws when sign-in fails", async () => {
    const store = createSyncSessionStore(
      fakeApi({
        login: vi
          .fn()
          .mockRejectedValue(
            new SyncApiError(401, "Invalid username or password."),
          ),
      }),
    );
    await store.refresh();
    await expect(store.signIn("ann", "bad")).rejects.toMatchObject({
      status: 401,
    });
    expect(store.getState()).toEqual({ status: "signedOut" });
  });

  it("treats a 401 on sign-out as already signed out, but not other errors", async () => {
    const dead = createSyncSessionStore(
      fakeApi({
        logout: vi.fn().mockRejectedValue(new SyncApiError(401, "no")),
      }),
    );
    await dead.signIn("ann", "secret1");
    await dead.signOut();
    expect(dead.getState()).toEqual({ status: "signedOut" });

    const broken = createSyncSessionStore(
      fakeApi({
        logout: vi.fn().mockRejectedValue(new SyncApiError(500, "boom")),
      }),
    );
    await broken.signIn("ann", "secret1");
    await expect(broken.signOut()).rejects.toMatchObject({ status: 500 });
    expect(broken.getState()).toEqual({ status: "signedIn", user });
  });
});
