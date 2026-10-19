import { describe, it, expect, vi } from "vitest";

import { createSyncApi, SyncApiError } from "../sync/api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const user = { id: "u1", username: "ann", isAdmin: false, createdAt: 1 };

describe("sync API client", () => {
  it("logs in with a JSON body and the session cookie enabled", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { user }));
    const api = createSyncApi({ fetchImpl });

    await expect(api.login("ann", "secret1")).resolves.toEqual(user);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      username: "ann",
      password: "secret1",
    });
  });

  it("prefixes the base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { user }));
    const api = createSyncApi({ baseUrl: "http://srv:8080", fetchImpl });
    await api.register("ann", "secret1");
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "http://srv:8080/api/auth/register",
    );
  });

  it("surfaces the server's error message and status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(409, { error: "Username already taken." }));
    const api = createSyncApi({ fetchImpl });

    await expect(api.register("ann", "secret1")).rejects.toMatchObject({
      name: "SyncApiError",
      status: 409,
      message: "Username already taken.",
    });
  });

  it("falls back to a generic message for a non-JSON error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("<html>bad gateway</html>", { status: 502 }),
      );
    const api = createSyncApi({ fetchImpl });

    const error = await api.login("a", "b").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncApiError);
    expect((error as SyncApiError).message).toBe("Request failed (502).");
  });

  it("me() returns null on 401 but rethrows other errors", async () => {
    const unauthorised = vi
      .fn()
      .mockResolvedValue(json(401, { error: "Not authenticated." }));
    await expect(createSyncApi({ fetchImpl: unauthorised }).me()).resolves.toBe(
      null,
    );

    const broken = vi.fn().mockResolvedValue(json(500, { error: "boom" }));
    await expect(
      createSyncApi({ fetchImpl: broken }).me(),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects a success reply that has no user", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
    await expect(
      createSyncApi({ fetchImpl }).login("ann", "secret1"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("creates a share with role and expiry, encoding the board id", async () => {
    const share = {
      id: "s1",
      boardId: "a/b",
      token: "tok",
      role: "viewer",
      expiresAt: 5000,
      createdAt: 1,
      revoked: false,
    };
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { share }));
    const api = createSyncApi({ fetchImpl });

    await expect(
      api.createShare("a/b", { role: "viewer", expiresAt: 5000 }),
    ).resolves.toEqual(share);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/boards/a%2Fb/shares");
    expect(JSON.parse(init.body)).toEqual({ role: "viewer", expiresAt: 5000 });
  });

  it("omits expiresAt when no expiry is chosen", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(201, {
        share: {
          id: "s",
          boardId: "b",
          token: "t",
          role: "editor",
          expiresAt: null,
          createdAt: 1,
          revoked: false,
        },
      }),
    );
    await createSyncApi({ fetchImpl }).createShare("b", {
      role: "editor",
      expiresAt: null,
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      role: "editor",
    });
  });

  it("lists and revokes shares", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { shares: [] }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const api = createSyncApi({ fetchImpl });

    await expect(api.listShares("b1")).resolves.toEqual([]);
    await api.revokeShare("b1", "s 1");

    expect(fetchImpl.mock.calls[1][0]).toBe("/api/boards/b1/shares/s%201");
    expect(fetchImpl.mock.calls[1][1].method).toBe("DELETE");
  });

  it("reads public share info and reports an expired link as 410", async () => {
    const ok = vi.fn().mockResolvedValue(
      json(200, {
        share: { boardId: "b", role: "viewer", requiresPassword: false },
      }),
    );
    await expect(
      createSyncApi({ fetchImpl: ok }).getShareInfo("t"),
    ).resolves.toMatchObject({ boardId: "b" });

    const gone = vi
      .fn()
      .mockResolvedValue(json(410, { error: "Share link has expired." }));
    await expect(
      createSyncApi({ fetchImpl: gone }).getShareInfo("t"),
    ).rejects.toMatchObject({ status: 410 });
  });

  it("registers a board with its id and optional name", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(201, { board: { id: "b1", name: "Retro" } }));
    await createSyncApi({ fetchImpl }).createBoard("b1", "Retro");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/boards");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ id: "b1", name: "Retro" });
  });
});
