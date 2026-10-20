import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ShareModal } from "../components/ShareModal";

import type { ShareLink } from "../components/ShareModal";

const link = (token: string, expiresAt: number | null = null): ShareLink => ({
  id: `id-${token}`,
  token,
  role: "viewer",
  createdAt: 1,
  expiresAt,
  url: `http://x/s/${token}`,
});

describe("ShareModal with a sync server", () => {
  it("passes the chosen role and an expiry time to onGenerateLink", async () => {
    const onGenerateLink = vi.fn().mockResolvedValue(link("abc123abc123"));
    render(
      <ShareModal isOpen onClose={vi.fn()} onGenerateLink={onGenerateLink} />,
    );

    fireEvent.change(screen.getByTestId("share-role-select"), {
      target: { value: "viewer" },
    });
    fireEvent.change(screen.getByTestId("share-expiry-select"), {
      target: { value: "1d" },
    });
    const before = Date.now();
    fireEvent.click(screen.getByTestId("create-link-button"));

    await waitFor(() => expect(onGenerateLink).toHaveBeenCalled());
    const [role, options] = onGenerateLink.mock.calls[0];
    expect(role).toBe("viewer");
    expect(options.expiresAt).toBeGreaterThanOrEqual(before + 24 * 3600_000);
    expect(options.expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 3600_000);
    expect(
      await screen.findByTestId("share-link-item-abc123abc123"),
    ).toBeTruthy();
  });

  it("sends a null expiry when the link never expires", async () => {
    const onGenerateLink = vi.fn().mockResolvedValue(link("t1t1t1t1t1t1"));
    render(
      <ShareModal isOpen onClose={vi.fn()} onGenerateLink={onGenerateLink} />,
    );
    fireEvent.click(screen.getByTestId("create-link-button"));
    await waitFor(() => expect(onGenerateLink).toHaveBeenCalled());
    expect(onGenerateLink.mock.calls[0][1]).toEqual({ expiresAt: null });
  });

  it("shows the error and adds no link when creating fails", async () => {
    const onGenerateLink = vi
      .fn()
      .mockRejectedValue(new Error("Only board owners can manage shares."));
    render(
      <ShareModal isOpen onClose={vi.fn()} onGenerateLink={onGenerateLink} />,
    );
    fireEvent.click(screen.getByTestId("create-link-button"));

    expect((await screen.findByTestId("share-error")).textContent).toBe(
      "Only board owners can manage shares.",
    );
    expect(screen.getByTestId("no-share-links")).toBeTruthy();
    expect(
      (screen.getByTestId("create-link-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("keeps the link and shows an error when revoking fails", async () => {
    const onRevokeLink = vi
      .fn()
      .mockRejectedValue(new Error("Not authenticated."));
    render(
      <ShareModal
        isOpen
        onClose={vi.fn()}
        initialLinks={[link("keepme12345")]}
        onRevokeLink={onRevokeLink}
      />,
    );
    fireEvent.click(screen.getByTestId("revoke-link-keepme12345"));
    expect((await screen.findByTestId("share-error")).textContent).toBe(
      "Not authenticated.",
    );
    expect(screen.getByTestId("share-link-item-keepme12345")).toBeTruthy();
  });

  it("removes the link once revoking succeeds", async () => {
    const onRevokeLink = vi.fn().mockResolvedValue(undefined);
    render(
      <ShareModal
        isOpen
        onClose={vi.fn()}
        initialLinks={[link("gone1234567")]}
        onRevokeLink={onRevokeLink}
      />,
    );
    fireEvent.click(screen.getByTestId("revoke-link-gone1234567"));
    await waitFor(() =>
      expect(screen.queryByTestId("share-link-item-gone1234567")).toBeNull(),
    );
  });

  it("shows each link's expiry", () => {
    render(
      <ShareModal
        isOpen
        onClose={vi.fn()}
        initialLinks={[
          link("never123456"),
          link("soon1234567", 4_102_444_800_000),
        ]}
      />,
    );
    expect(
      screen.getByTestId("share-link-expiry-never123456").textContent,
    ).toBe("Never expires");
    expect(
      screen.getByTestId("share-link-expiry-soon1234567").textContent,
    ).toMatch(/^Expires /);
  });

  it("replaces the create controls with the unavailable message and action", () => {
    const onSelect = vi.fn();
    render(
      <ShareModal
        isOpen
        onClose={vi.fn()}
        unavailableMessage="Sign in to create share links that work for other people."
        unavailableAction={{ label: "Sign in", onSelect }}
      />,
    );
    expect(screen.getByTestId("share-unavailable").textContent).toContain(
      "Sign in to create share links",
    );
    expect(screen.queryByTestId("create-link-button")).toBeNull();
    fireEvent.click(screen.getByTestId("share-unavailable-action"));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("ConnectedShareModal", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const load = async (state: unknown, api: Record<string, unknown> = {}) => {
    vi.doMock("../sync/session", () => ({
      useSyncSession: () => state,
      syncApi: api,
      syncSession: {},
    }));
    return (await import("../components/ConnectedShareModal"))
      .ConnectedShareModal;
  };

  it("offers sign-in when signed out", async () => {
    const Modal = await load({ status: "signedOut" });
    const onSignIn = vi.fn();
    render(<Modal isOpen onClose={vi.fn()} boardId="b1" onSignIn={onSignIn} />);
    fireEvent.click(screen.getByTestId("share-unavailable-action"));
    expect(onSignIn).toHaveBeenCalled();
  });

  it("explains that sharing needs a server when none answers", async () => {
    const Modal = await load({ status: "unavailable" });
    render(<Modal isOpen onClose={vi.fn()} boardId="b1" onSignIn={vi.fn()} />);
    expect(screen.getByTestId("share-unavailable").textContent).toContain(
      "needs a Firo sync server",
    );
  });

  it("registers the board, then lists only live links", async () => {
    const now = Date.now();
    const share = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      boardId: "b1",
      token: `${id}token12345`,
      role: "viewer",
      expiresAt: null,
      createdAt: now,
      revoked: false,
      ...over,
    });
    const api = {
      createBoard: vi.fn().mockResolvedValue(undefined),
      listShares: vi
        .fn()
        .mockResolvedValue([
          share("live"),
          share("revoked", { revoked: true }),
          share("expired", { expiresAt: now - 1000 }),
        ]),
    };
    const Modal = await load(
      { status: "signedIn", user: { id: "u", username: "ann" } },
      api,
    );
    render(<Modal isOpen onClose={vi.fn()} boardId="b1" onSignIn={vi.fn()} />);

    expect(
      await screen.findByTestId("share-link-item-livetoken12345"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("share-link-item-revokedtoken12345"),
    ).toBeNull();
    expect(
      screen.queryByTestId("share-link-item-expiredtoken12345"),
    ).toBeNull();
    expect(api.createBoard).toHaveBeenCalledWith("b1");
    expect(api.listShares).toHaveBeenCalledWith("b1");
  });

  it("creates a real share through the API with the expiry", async () => {
    const api = {
      createBoard: vi.fn().mockResolvedValue(undefined),
      listShares: vi.fn().mockResolvedValue([]),
      createShare: vi.fn().mockResolvedValue({
        id: "s1",
        boardId: "b1",
        token: "newtoken12345",
        role: "commenter",
        expiresAt: 123,
        createdAt: 1,
        revoked: false,
      }),
    };
    const Modal = await load(
      { status: "signedIn", user: { id: "u", username: "ann" } },
      api,
    );
    render(<Modal isOpen onClose={vi.fn()} boardId="b1" onSignIn={vi.fn()} />);

    await screen.findByTestId("create-link-button");
    fireEvent.change(screen.getByTestId("share-role-select"), {
      target: { value: "commenter" },
    });
    fireEvent.change(screen.getByTestId("share-expiry-select"), {
      target: { value: "1h" },
    });
    fireEvent.click(screen.getByTestId("create-link-button"));

    expect(
      await screen.findByTestId("share-link-item-newtoken12345"),
    ).toBeTruthy();
    const [boardId, opts] = api.createShare.mock.calls[0];
    expect(boardId).toBe("b1");
    expect(opts.role).toBe("commenter");
    expect(typeof opts.expiresAt).toBe("number");
  });

  it("shows the server's message when loading fails", async () => {
    const api = {
      createBoard: vi
        .fn()
        .mockRejectedValue(new Error("That board belongs to someone else.")),
      listShares: vi.fn(),
    };
    const Modal = await load(
      { status: "signedIn", user: { id: "u", username: "ann" } },
      api,
    );
    render(<Modal isOpen onClose={vi.fn()} boardId="b1" onSignIn={vi.fn()} />);
    expect(
      (await screen.findByTestId("share-unavailable")).textContent,
    ).toContain("belongs to someone else");
  });
});
