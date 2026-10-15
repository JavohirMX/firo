import React, { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { useFocusTrap } from "@firo/editor";
import { ActivityFeed } from "@firo/ui";

import type { ActivityFeedItem } from "@firo/ui";

import { ShareModal } from "../components/ShareModal";

import { CollabBar } from "../components/CollabBar";
import { SaveStatusIndicator } from "../components/SaveStatusIndicator";
import { AccessibilityLayer } from "../components/AccessibilityLayer";

import type { ShareLink, ShareRole } from "../components/ShareModal";

const updateScene = vi.fn();

const mockState: {
  selectedElementIds: Record<string, true>;
  editingTextElement: { id: string; containerId?: string | null } | null;
} = {
  selectedElementIds: {},
  editingTextElement: null,
};

vi.mock("@firo/editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firo/editor")>();
  return {
    ...actual,
    useExcalidrawAPI: () => ({ updateScene }),
    useExcalidrawStateValue: (selector: (state: unknown) => unknown) =>
      selector(mockState),
  };
});

let mockSaveStatusListener: ((status: string) => void) | null = null;
let currentMockSaveStatus = "idle";

vi.mock("../board/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../board/storage")>();
  return {
    ...actual,
    getSaveStatus: () => currentMockSaveStatus,
    subscribeSaveStatus: (listener: (status: string) => void) => {
      mockSaveStatusListener = listener;
      listener(currentMockSaveStatus);
      return () => {
        mockSaveStatusListener = null;
      };
    },
  };
});

describe("Phase 9 Keyboard Parity & Focus Management", () => {
  beforeEach(() => {
    updateScene.mockClear();
    mockState.selectedElementIds = {};
    mockState.editingTextElement = null;
    currentMockSaveStatus = "idle";
  });

  describe("Share dialog (ShareModal)", () => {
    const sampleLink: ShareLink = {
      id: "token-editor-123456",
      token: "token-editor-123456",
      role: "editor",
      createdAt: Date.now() - 60000,
      url: "https://firo.app/s/token-editor-123456",
    };

    const ShareModalHarness: React.FC<{
      initialLinks?: ShareLink[];
      onGenerateLink?: (role: ShareRole) => ShareLink;
      onRevokeLink?: (tokenId: string) => void;
    }> = ({ initialLinks = [sampleLink], onGenerateLink, onRevokeLink }) => {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button
            type="button"
            data-testid="share-trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Share
          </button>
          <ShareModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            initialLinks={initialLinks}
            onGenerateLink={onGenerateLink}
            onRevokeLink={onRevokeLink}
          />
        </div>
      );
    };

    it("opening the modal traps focus inside on the first focusable control", () => {
      render(<ShareModalHarness />);
      const trigger = screen.getByTestId("share-trigger-btn");
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(trigger);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");

      const closeBtn = screen.getByTestId("share-modal-close");
      expect(document.activeElement).toBe(closeBtn);
    });

    it("tab cycles through controls and wraps at boundaries", () => {
      render(<ShareModalHarness />);
      const trigger = screen.getByTestId("share-trigger-btn");
      fireEvent.click(trigger);

      const closeBtn = screen.getByTestId("share-modal-close");
      const revokeBtn = screen.getByTestId(`revoke-link-${sampleLink.token}`);

      // Verify boundary wrap: Shift+Tab on the first element moves to the last element
      closeBtn.focus();
      fireEvent.keyDown(closeBtn, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(revokeBtn);

      // Verify boundary wrap: Tab on the last element wraps back to the first element
      revokeBtn.focus();
      fireEvent.keyDown(revokeBtn, { key: "Tab" });
      expect(document.activeElement).toBe(closeBtn);
    });

    it("escape dismisses the dialog and restores focus to the trigger", () => {
      render(<ShareModalHarness />);
      const trigger = screen.getByTestId("share-trigger-btn");
      trigger.focus();
      fireEvent.click(trigger);

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(document.activeElement).not.toBe(trigger);

      // Press Escape inside the dialog
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("supports keyboard-driven link generation and revocation", async () => {
      const onGenerate = vi.fn(
        (role: ShareRole): ShareLink => ({
          id: `tok-${role}-999`,
          token: `tok-${role}-999`,
          role,
          createdAt: Date.now(),
          url: `https://firo.app/s/tok-${role}-999`,
        }),
      );
      const onRevoke = vi.fn();

      render(
        <ShareModalHarness
          initialLinks={[sampleLink]}
          onGenerateLink={onGenerate}
          onRevokeLink={onRevoke}
        />,
      );
      fireEvent.click(screen.getByTestId("share-trigger-btn"));

      // Change role selector
      const roleSelect = screen.getByTestId("share-role-select");
      fireEvent.change(roleSelect, { target: { value: "viewer" } });

      // Activate create button via click (Enter / Space activation)
      const createBtn = screen.getByTestId("create-link-button");
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(onGenerate).toHaveBeenCalledWith("viewer");

      // Revoke the existing link
      const revokeBtn = screen.getByTestId(`revoke-link-${sampleLink.token}`);
      await act(async () => {
        fireEvent.click(revokeBtn);
      });

      expect(onRevoke).toHaveBeenCalledWith(sampleLink.token);
    });
  });

  describe("Activity feed (ActivityFeed)", () => {
    const sampleEntries: ActivityFeedItem[] = [
      {
        id: "act-1",
        boardId: "board-1",
        boardName: "Design System",
        timestamp: Date.now() - 30000,
        kind: "comment",
        summary: "Alice commented on sticky note",
      },
      {
        id: "act-2",
        boardId: "board-1",
        timestamp: Date.now() - 60000,
        kind: "create",
        summary: "Bob created rectangle",
      },
    ];

    const ActivityFeedHarness: React.FC<{
      entries?: ActivityFeedItem[];
      onClear?: () => void;
      onSelectBoard?: (id: string) => void;
    }> = ({ entries = sampleEntries, onClear = () => {}, onSelectBoard }) => {
      const [isOpen, setIsOpen] = useState(false);
      const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
      return (
        <div>
          <button
            type="button"
            data-testid="feed-trigger-btn"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
          >
            Activity
          </button>
          <ActivityFeed
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            dialogRef={trapRef}
            entries={entries}
            onClear={onClear}
            onSelectBoard={onSelectBoard}
          />
        </div>
      );
    };

    it("opening via keyboard opens the feed and traps focus inside", () => {
      render(<ActivityFeedHarness />);
      const trigger = screen.getByTestId("feed-trigger-btn");
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(trigger);

      const feed = screen.getByRole("dialog", { name: "Activity Feed" });
      expect(feed).toBeDefined();
      expect(feed.getAttribute("aria-modal")).toBe("true");

      // Focus has moved inside the feed container
      expect(feed.contains(document.activeElement)).toBe(true);
    });

    it("tab navigation stays within the feed container and wraps at ends", () => {
      render(<ActivityFeedHarness />);
      fireEvent.click(screen.getByTestId("feed-trigger-btn"));

      const clearBtn = screen.getByTestId("activity-clear-btn");
      const boardBtn = screen.getByRole("button", { name: "Design System" });

      // First focusable element is clearBtn, last is boardBtn
      clearBtn.focus();
      fireEvent.keyDown(clearBtn, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(boardBtn);

      boardBtn.focus();
      fireEvent.keyDown(boardBtn, { key: "Tab" });
      expect(document.activeElement).toBe(clearBtn);
    });

    it("escape dismisses the activity feed and restores focus to the trigger", () => {
      render(<ActivityFeedHarness />);
      const trigger = screen.getByTestId("feed-trigger-btn");
      trigger.focus();
      fireEvent.click(trigger);

      expect(screen.getByRole("dialog")).toBeDefined();

      fireEvent.keyDown(document.activeElement!, { key: "Escape" });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("activating the close button dismisses the feed and restores focus to the trigger", () => {
      render(<ActivityFeedHarness />);
      const trigger = screen.getByTestId("feed-trigger-btn");
      trigger.focus();
      fireEvent.click(trigger);

      const closeBtn = screen.getByTestId("activity-close-btn");
      fireEvent.click(closeBtn);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe("Live announcements & error/offline indicators", () => {
    it("AccessibilityLayer polite live region announces messages without interrupting speech", () => {
      const { rerender } = render(
        <AccessibilityLayer
          items={[]}
          liveMessage="Could not connect to sync server"
        />,
      );

      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.textContent).toBe("Could not connect to sync server");

      // Update message
      rerender(
        <AccessibilityLayer
          items={[]}
          liveMessage="Offline mode: changes will sync upon reconnection"
        />,
      );
      expect(status.textContent).toBe(
        "Offline mode: changes will sync upon reconnection",
      );
    });

    it("CollabBar connection status pill provides polite announcements on status changes", () => {
      const { rerender } = render(<CollabBar connectionStatus="offline" />);

      const pill = screen.getByTestId("connection-status-pill");
      expect(pill.getAttribute("role")).toBe("status");
      expect(pill.getAttribute("aria-live")).toBe("polite");
      expect(pill.textContent).toContain("Offline");

      rerender(<CollabBar connectionStatus="connecting" />);
      expect(pill.textContent).toContain("Connecting...");

      rerender(<CollabBar connectionStatus="connected" />);
      expect(pill.textContent).toContain("Connected");
    });

    it("SaveStatusIndicator provides polite live updates across save states", () => {
      render(<SaveStatusIndicator />);

      // Initially idle, nothing rendered
      expect(screen.queryByTestId("firo-save-status")).toBeNull();

      // Transition to saving
      act(() => {
        mockSaveStatusListener?.("saving");
      });
      let indicator = screen.getByTestId("firo-save-status");
      expect(indicator.getAttribute("role")).toBe("status");
      expect(indicator.getAttribute("aria-live")).toBe("polite");
      expect(indicator.textContent).toBe("Saving...");

      // Transition to saved
      act(() => {
        mockSaveStatusListener?.("saved");
      });
      indicator = screen.getByTestId("firo-save-status");
      expect(indicator.textContent).toBe("Saved");

      // Transition to error
      act(() => {
        mockSaveStatusListener?.("error");
      });
      indicator = screen.getByTestId("firo-save-status");
      expect(indicator.textContent).toBe("Error saving");
    });
  });
});
