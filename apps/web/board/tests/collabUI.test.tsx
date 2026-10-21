import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { AWARENESS_KEY } from "@firo/doc";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  RemoteCursorLayer,
  getCollaboratorColor,
  type RemoteCollaborator,
} from "../../components/RemoteCursorLayer";
import {
  CollabBar,
  getInitials,
  type CollabBarCollaborator,
} from "../../components/CollabBar";
import {
  ShareModal,
  generateCapabilityToken,
  type ShareLink,
  type ShareRole,
} from "../../components/ShareModal";

const fakeEditor = (opts?: {
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
}): ExcalidrawImperativeAPI => {
  const scrollX = opts?.scrollX ?? 0;
  const scrollY = opts?.scrollY ?? 0;
  const zoomVal = opts?.zoom ?? 1;

  return {
    getAppState: () => ({
      scrollX,
      scrollY,
      zoom: { value: zoomVal },
    }),
    onScrollChange: () => () => {},
  } as unknown as ExcalidrawImperativeAPI;
};

describe("Client Collaboration and Presence UI", () => {
  describe("RemoteCursorLayer", () => {
    it("renders multiple remote collaborators at transformed viewport coordinates", () => {
      // scrollX: 100, scrollY: 50, zoom: 2
      // board coords:
      // User 1: (10, 20) -> viewport: ((10 + 100) * 2, (20 + 50) * 2) = (220, 140)
      // User 2: (50, 60) -> viewport: ((50 + 100) * 2, (60 + 50) * 2) = (300, 220)
      const editor = fakeEditor({ scrollX: 100, scrollY: 50, zoom: 2 });

      const testCollaborators: RemoteCollaborator[] = [
        {
          clientId: 1,
          name: "Alice",
          color: "#0090FF",
          cursor: { x: 10, y: 20 },
        },
        {
          clientId: 2,
          name: "Bob",
          color: "#E5484D",
          cursor: { x: 50, y: 60 },
        },
      ];

      render(
        <RemoteCursorLayer
          excalidrawAPI={editor}
          collaborators={testCollaborators}
        />,
      );

      const aliceCursor = screen.getByTestId("remote-cursor-1");
      expect(aliceCursor).toBeDefined();
      expect(aliceCursor.style.transform).toBe("translate(220px, 140px)");
      expect(aliceCursor.textContent).toContain("Alice");

      const bobCursor = screen.getByTestId("remote-cursor-2");
      expect(bobCursor).toBeDefined();
      expect(bobCursor.style.transform).toBe("translate(300px, 220px)");
      expect(bobCursor.textContent).toContain("Bob");
    });

    it("does not render cursor if cursor coordinate is null", () => {
      const editor = fakeEditor();
      const testCollaborators: RemoteCollaborator[] = [
        {
          clientId: 1,
          name: "Hidden Cursor User",
          cursor: null,
        },
      ];

      render(
        <RemoteCursorLayer
          excalidrawAPI={editor}
          collaborators={testCollaborators}
        />,
      );

      expect(screen.queryByTestId("remote-cursor-1")).toBeNull();
    });

    it("applies idle / inactive fading class when collaborator is inactive", () => {
      const editor = fakeEditor();
      const testCollaborators: RemoteCollaborator[] = [
        {
          clientId: 1,
          name: "Active User",
          cursor: { x: 10, y: 10 },
          isIdle: false,
        },
        {
          clientId: 2,
          name: "Idle User",
          cursor: { x: 50, y: 50 },
          isIdle: true,
        },
      ];

      render(
        <RemoteCursorLayer
          excalidrawAPI={editor}
          collaborators={testCollaborators}
        />,
      );

      const activeEl = screen.getByTestId("remote-cursor-1");
      expect(activeEl.className).not.toContain("is-idle");

      const idleEl = screen.getByTestId("remote-cursor-2");
      expect(idleEl.className).toContain("is-idle");
    });

    it("renders laser pointer heads and trails when laser is active", () => {
      const editor = fakeEditor({ scrollX: 0, scrollY: 0, zoom: 1 });
      const testCollaborators: RemoteCollaborator[] = [
        {
          clientId: 3,
          name: "Laser User",
          color: "#30A46C",
          cursor: null,
          laser: { x: 120, y: 240 },
        },
      ];

      render(
        <RemoteCursorLayer
          excalidrawAPI={editor}
          collaborators={testCollaborators}
        />,
      );

      const laserHead = screen.getByTestId("laser-pointer-3");
      expect(laserHead).toBeDefined();

      const laserTrail = screen.getByTestId("laser-trail-3");
      expect(laserTrail).toBeDefined();
      expect(laserTrail.getAttribute("points")).toContain("120,240");
    });

    it("reads collaborator awareness states dynamically from Yjs Awareness", () => {
      const ydoc = new Y.Doc();
      const awareness = new Awareness(ydoc);
      awareness.setLocalState({ [AWARENESS_KEY]: { cursor: null } });

      // Add a remote peer state (clientId 99)
      const remoteStates = new Map<number, unknown>();
      remoteStates.set(99, {
        [AWARENESS_KEY]: {
          cursor: { x: 40, y: 80 },
          laser: null,
          idleSince: null,
        },
        user: {
          name: "Carol",
          color: "#8E4EC6",
        },
      });

      // Mock awareness getStates
      vi.spyOn(awareness, "getStates").mockImplementation(
        () => remoteStates as any,
      );

      const editor = fakeEditor({ scrollX: 0, scrollY: 0, zoom: 1 });

      render(
        <RemoteCursorLayer excalidrawAPI={editor} awareness={awareness} />,
      );

      const carolCursor = screen.getByTestId("remote-cursor-99");
      expect(carolCursor).toBeDefined();
      expect(carolCursor.textContent).toContain("Carol");
      expect(carolCursor.style.transform).toBe("translate(40px, 80px)");
    });
  });

  describe("CollabBar", () => {
    it("shows a view-only badge only for read-only share roles", () => {
      const { rerender } = render(<CollabBar readOnlyRole="viewer" />);
      expect(screen.getByTestId("view-only-badge").textContent).toContain(
        "View only",
      );
      rerender(<CollabBar readOnlyRole="commenter" />);
      expect(screen.getByTestId("view-only-badge").textContent).toContain(
        "Comment only",
      );
      rerender(<CollabBar readOnlyRole={null} />);
      expect(screen.queryByTestId("view-only-badge")).toBeNull();
    });

    it("renders connection status pill with appropriate dot indicator", () => {
      const { rerender } = render(<CollabBar connectionStatus="connected" />);
      expect(screen.getByTestId("connection-dot-connected")).toBeDefined();
      expect(
        screen.getByTestId("connection-status-pill").textContent,
      ).toContain("Connected");

      rerender(<CollabBar connectionStatus="connecting" />);
      expect(screen.getByTestId("connection-dot-connecting")).toBeDefined();
      expect(
        screen.getByTestId("connection-status-pill").textContent,
      ).toContain("Connecting");

      rerender(<CollabBar connectionStatus="offline" />);
      expect(screen.getByTestId("connection-dot-offline")).toBeDefined();
      expect(
        screen.getByTestId("connection-status-pill").textContent,
      ).toContain("Offline");
    });

    it("renders collaborator avatars with initials and tooltips", () => {
      const testCollabs: CollabBarCollaborator[] = [
        {
          clientId: 1,
          name: "Alice Wonderland",
          color: "#0090FF",
          role: "editor",
        },
        { clientId: 2, name: "Bob", color: "#E5484D", role: "viewer" },
      ];

      render(<CollabBar collaborators={testCollabs} />);

      const avatar1 = screen.getByTestId("collab-avatar-1");
      expect(avatar1.textContent).toBe("AW");
      expect(avatar1.getAttribute("title")).toContain(
        "Alice Wonderland (editor)",
      );

      const avatar2 = screen.getByTestId("collab-avatar-2");
      expect(avatar2.textContent).toBe("BO");
      expect(avatar2.getAttribute("title")).toContain("Bob (viewer)");
    });

    it("shows overflow indicator when there are more than 4 collaborators", () => {
      const testCollabs: CollabBarCollaborator[] = [
        { clientId: 1, name: "User 1" },
        { clientId: 2, name: "User 2" },
        { clientId: 3, name: "User 3" },
        { clientId: 4, name: "User 4" },
        { clientId: 5, name: "User 5" },
        { clientId: 6, name: "User 6" },
      ];

      render(<CollabBar collaborators={testCollabs} />);

      const overflow = screen.getByTestId("collab-avatar-overflow");
      expect(overflow).toBeDefined();
      expect(overflow.textContent).toBe("+2");
    });

    it("triggers onOpenShare when Share button is clicked", () => {
      const onOpenShare = vi.fn();
      render(<CollabBar onOpenShare={onOpenShare} />);

      const shareBtn = screen.getByTestId("share-button");
      fireEvent.click(shareBtn);
      expect(onOpenShare).toHaveBeenCalledTimes(1);
    });
  });

  describe("ShareModal", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("generates a 128-bit CSPRNG capability token", () => {
      const token1 = generateCapabilityToken();
      const token2 = generateCapabilityToken();
      // 16 bytes = 32 hex chars
      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2);
    });

    it("does not render when isOpen is false", () => {
      render(<ShareModal isOpen={false} onClose={() => {}} />);
      expect(screen.queryByTestId("share-modal")).toBeNull();
    });

    it("renders modal dialog and handles role selection and link creation", async () => {
      const onGenerateLink = vi.fn((role: ShareRole): ShareLink => {
        return {
          id: "custom-token-123",
          token: "custom-token-123",
          role,
          createdAt: Date.now(),
          url: `https://firo.app/s/custom-token-123`,
        };
      });

      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          onGenerateLink={onGenerateLink}
        />,
      );

      expect(screen.getByTestId("share-modal")).toBeDefined();
      expect(screen.getByTestId("no-share-links")).toBeDefined();

      // Change role to 'commenter'
      const roleSelect = screen.getByTestId("share-role-select");
      fireEvent.change(roleSelect, { target: { value: "commenter" } });

      // Click create link
      const createBtn = screen.getByTestId("create-link-button");
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(onGenerateLink).toHaveBeenCalledWith("commenter", {
        expiresAt: null,
      });

      // Verify link item rendered
      const roleBadge = screen.getByTestId("share-link-role-custom-token-123");
      expect(roleBadge.textContent).toBe("commenter");
      expect(
        screen.getByTestId("share-link-url-custom-token-123"),
      ).toBeDefined();
    });

    it("copies link to clipboard and displays feedback", async () => {
      const initialLinks: ShareLink[] = [
        {
          id: "token-abc-456",
          token: "token-abc-456",
          role: "viewer",
          createdAt: Date.now(),
          url: "https://firo.app/s/token-abc-456",
        },
      ];

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          initialLinks={initialLinks}
        />,
      );

      const copyBtn = screen.getByTestId("copy-link-token-abc-456");
      expect(copyBtn.textContent).toContain("Copy");

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith(
        "https://firo.app/s/token-abc-456",
      );
      expect(copyBtn.textContent).toContain("Copied!");
    });

    it("revokes active link and calls revocation callback", async () => {
      const onRevokeLink = vi.fn();
      const initialLinks: ShareLink[] = [
        {
          id: "token-to-revoke",
          token: "token-to-revoke",
          role: "editor",
          createdAt: Date.now(),
          url: "https://firo.app/s/token-to-revoke",
        },
      ];

      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          initialLinks={initialLinks}
          onRevokeLink={onRevokeLink}
        />,
      );

      expect(
        screen.getByTestId("share-link-item-token-to-revoke"),
      ).toBeDefined();

      const revokeBtn = screen.getByTestId("revoke-link-token-to-revoke");
      await act(async () => {
        fireEvent.click(revokeBtn);
      });

      expect(onRevokeLink).toHaveBeenCalledWith("token-to-revoke");
      expect(
        screen.queryByTestId("share-link-item-token-to-revoke"),
      ).toBeNull();
      expect(screen.getByTestId("no-share-links")).toBeDefined();
    });

    it("closes modal on close button click or Escape key press", () => {
      const onClose = vi.fn();
      render(<ShareModal isOpen={true} onClose={onClose} />);

      const closeBtn = screen.getByTestId("share-modal-close");
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe("Utility functions", () => {
    it("getInitials formats single and multiple words properly", () => {
      expect(getInitials("Alice")).toBe("AL");
      expect(getInitials("Alice Smith")).toBe("AS");
      expect(getInitials("Alice Middle Smith")).toBe("AS");
      expect(getInitials("")).toBe("?");
      expect(getInitials(undefined)).toBe("?");
    });

    it("getCollaboratorColor returns deterministic distinct colors", () => {
      const c1 = getCollaboratorColor(101);
      const c2 = getCollaboratorColor(101);
      expect(c1).toBe(c2);
      expect(c1.startsWith("#")).toBe(true);
    });
  });
});
