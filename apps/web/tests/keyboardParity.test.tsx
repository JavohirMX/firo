import React, { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { useFocusTrap } from "@firo/editor";
import { ActivityFeed } from "@firo/ui";

import { BoardHome } from "@firo/ui";

import { openBoardMemory } from "@firo/doc";

import { createStickyNote } from "@firo/board";

import {
  placeVote,
  votesFromRecords,
  voteFromRecord,
} from "@firo/facilitation";

import { findShapeByKey, TOOLS } from "@firo/editor/components/Tools";

import { COLOR_PALETTE, randomId } from "@firo/common";

import type { ActivityFeedItem } from "@firo/ui";

import type { TemplateCardData } from "@firo/ui";

import type { ExcalidrawElement } from "@firo/element/types";

import { ShareModal } from "../components/ShareModal";

import { CollabBar } from "../components/CollabBar";
import { SaveStatusIndicator } from "../components/SaveStatusIndicator";
import { AccessibilityLayer } from "../components/AccessibilityLayer";
import { TemplateModal } from "../components/TemplateModal";
import { BOARD_TEMPLATES, templateById } from "../board/templates";
import { toAccessibilityItems, toElementsMap } from "../board/accessibility";
import { exportBoard } from "../board/files";
import { timerControls } from "../board/facilitator";

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

/*
 * `AccessibilityLayer` calls `useI18n`, which reads the editor's scoped jotai
 * store; this harness mounts components without that Provider, the same way it
 * stubs the editor's other hooks above. Mirrors the mock in
 * `accessibilityLayer.test.tsx` — without it the render throws "Missing
 * Provider from createIsolation", which is how the two AC-8/live-region tests
 * broke when the skip-link landed.
 */
vi.mock("@firo/editor/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firo/editor/i18n")>();
  return {
    ...actual,
    // Only the hook needs stubbing: it reads the scoped jotai store, which
    // has no Provider in this harness. The standalone `t` is a plain function.
    useI18n: () => ({ t: actual.t, langCode: actual.defaultLang.code }),
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

      expect(onGenerate).toHaveBeenCalledWith("viewer", { expiresAt: null });

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

  describe("AC-8 Keyboard-Only Full Workshop Flow", () => {
    const templateCards: TemplateCardData[] = BOARD_TEMPLATES.map((tmpl) => ({
      id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      tags: tmpl.tags,
      color: tmpl.color,
    }));

    const mockApp = {
      state: {
        preferredSelectionTool: { type: "selection" },
      },
    } as any;

    it("conducts a complete workshop loop on the keyboard alone (AC-8 parity)", async () => {
      // -----------------------------------------------------------------------
      // 1. Board home navigation -> template selection (Retrospective)
      // -----------------------------------------------------------------------
      const onCreateTemplate = vi.fn();
      const { unmount: unmountHome } = render(
        <BoardHome
          boards={[]}
          templates={templateCards}
          folders={[]}
          onCreateFromTemplate={onCreateTemplate}
        />,
      );

      const retroBtn = screen.getByRole("button", {
        name: "Start from the Retrospective template",
      });
      expect(retroBtn).toBeDefined();

      // Keyboard navigation: focus the template button
      retroBtn.focus();
      expect(document.activeElement).toBe(retroBtn);

      // Keyboard activation: Enter / Space triggers selection
      await act(async () => {
        fireEvent.keyDown(retroBtn, { key: "Enter" });
        fireEvent.click(retroBtn);
      });

      expect(onCreateTemplate).toHaveBeenCalledWith("retrospective");
      unmountHome();

      // -----------------------------------------------------------------------
      // 2. Initialize document from the selected Retrospective template
      // -----------------------------------------------------------------------
      const retroTemplate = templateById("retrospective")!;
      expect(retroTemplate).toBeDefined();
      const starterNotes = retroTemplate.build();
      // Retrospective template starts with 9 sticky notes ("Went well", "To improve", "Action items", etc.)
      expect(starterNotes).toHaveLength(9);

      const doc = openBoardMemory();
      doc.commit(
        starterNotes.map((element) => ({
          kind: "createElement",
          element,
        })),
      );
      expect(doc.read().elements).toHaveLength(9);

      // -----------------------------------------------------------------------
      // 3. Select creation tool by keyboard shortcut ('N' for sticky note, 'R' for rectangle)
      // -----------------------------------------------------------------------
      // Miro / Firo shortcut mapping: 'N' -> stickynote, 'R' -> rectangle
      const stickyTool = findShapeByKey("n", mockApp);
      expect(stickyTool).toBe("stickynote");
      const rectTool = findShapeByKey("r", mockApp);
      expect(rectTool).toBe("rectangle");
      const textTool = findShapeByKey("t", mockApp);
      expect(textTool).toBe("text");

      // Verify TOOLS definitions align
      expect(TOOLS.stickynote.letterKey).toBe("n");
      expect(TOOLS.rectangle.letterKey).toContain("r");

      // -----------------------------------------------------------------------
      // 4. Place element on canvas via keyboard
      // -----------------------------------------------------------------------
      // User creates a new action item note at (430, 340)
      const actionNote = createStickyNote({
        id: "retro-action-card-1",
        x: 430,
        y: 340,
        text: "",
        backgroundColor: COLOR_PALETTE.yellow[1],
      });
      doc.commit([{ kind: "createElement", element: actionNote }]);
      expect(doc.read().elements).toHaveLength(10);

      // -----------------------------------------------------------------------
      // 5. Edit text via keyboard
      // -----------------------------------------------------------------------
      // Enter text editing mode
      mockState.editingTextElement = {
        id: "retro-action-card-1-label",
        containerId: "retro-action-card-1",
      };

      const actionText = "Deliver AC-8 keyboard-only workshop flow";
      doc.commit([
        {
          kind: "updateElements",
          updates: [
            {
              id: "retro-action-card-1",
              changes: { text: actionText },
            },
          ],
        },
      ]);

      // Exit text editing with Escape and select the note
      mockState.editingTextElement = null;
      mockState.selectedElementIds = { "retro-action-card-1": true };

      const placedNote = doc
        .read()
        .elements.find((e) => e.id === "retro-action-card-1");
      expect(placedNote?.text).toBe(actionText);

      // -----------------------------------------------------------------------
      // 6. Navigate with roving tabindex / arrow keys
      // -----------------------------------------------------------------------
      const currentElements = doc.read()
        .elements as unknown as readonly ExcalidrawElement[];
      const a11yItems = toAccessibilityItems(
        currentElements,
        toElementsMap(currentElements),
      );
      expect(a11yItems).toHaveLength(10);

      const { unmount: unmountA11y } = render(
        <AccessibilityLayer
          items={a11yItems}
          boardLabel="Sprint Retrospective"
        />,
      );

      const whiteboard = screen.getByRole("application", {
        name: "Sprint Retrospective",
      });
      expect(whiteboard.getAttribute("aria-roledescription")).toBe(
        "whiteboard",
      );

      const allTreeButtons = screen.getAllByRole("button");
      /*
       * Eleven, not ten: the tree opens with the skip-to-first-object control
       * (the a11y skip link), and the ten item buttons follow it. The count
       * pins that the skip control is present; navigation below exercises the
       * item buttons, so it works on the slice.
       */
      expect(allTreeButtons).toHaveLength(11);
      const treeButtons = allTreeButtons.slice(1);

      // Focus first item
      treeButtons[0].focus();
      expect(document.activeElement).toBe(treeButtons[0]);

      // Navigate down using ArrowDown (roving tabindex)
      fireEvent.keyDown(treeButtons[0], { key: "ArrowDown" });
      expect(updateScene).toHaveBeenCalled();

      // Navigate up using ArrowUp
      fireEvent.keyDown(treeButtons[1], { key: "ArrowUp" });
      expect(updateScene).toHaveBeenCalled();

      // Deselect via Escape
      fireEvent.keyDown(treeButtons[0], { key: "Escape" });
      expect(updateScene).toHaveBeenCalledWith({
        appState: { selectedElementIds: {} },
      });

      unmountA11y();

      // -----------------------------------------------------------------------
      // 7. Trigger timer or voting
      // -----------------------------------------------------------------------
      // A) Facilitator timer: trigger via keyboard shortcut Alt+T
      const controls = timerControls(() => doc);
      controls.start();
      const activeTimer = doc.getEphemeral().timer;
      expect(activeTimer).not.toBeNull();
      expect(activeTimer?.startedAt).not.toBeNull();

      // B) Dot voting: trigger vote on newly placed note via Alt+D
      mockState.selectedElementIds = { "retro-action-card-1": true };
      const voteMutations = placeVote(
        votesFromRecords(doc.read().records),
        { elementId: "retro-action-card-1", voterId: "", placedAt: Date.now() },
        { record: randomId(), order: "a0", board: "board-workshop" },
        false,
      );
      doc.commit(voteMutations);

      const recordedVotes = votesFromRecords(doc.read().records);
      expect(recordedVotes).toHaveLength(1);
      expect(recordedVotes[0].elementId).toBe("retro-action-card-1");

      // -----------------------------------------------------------------------
      // 8. Export board
      // -----------------------------------------------------------------------
      const exportResult = exportBoard(doc);
      expect(exportResult.ok).toBe(true);
      if (exportResult.ok) {
        expect(exportResult.filename).toMatch(/^board-.*\.firo$/);
        const serialized = JSON.parse(exportResult.bytes);
        // All 10 elements persisted
        expect(serialized.elements).toHaveLength(10);
        // Action text persisted
        const savedAction = serialized.elements.find(
          (e: any) => e.id === "retro-action-card-1",
        );
        expect(savedAction?.text).toBe(actionText);
        // Vote record collection persisted
        expect(serialized.records.length).toBeGreaterThan(0);
        const savedVote = voteFromRecord(serialized.records[0]);
        expect(savedVote?.elementId).toBe("retro-action-card-1");
      }
    });

    it("supports Brainstorm template selection, central prompt navigation, and voting", async () => {
      const onCreateTemplate = vi.fn();
      const { unmount: unmountHome } = render(
        <BoardHome
          boards={[]}
          templates={templateCards}
          folders={[]}
          onCreateFromTemplate={onCreateTemplate}
        />,
      );

      const brainstormBtn = screen.getByRole("button", {
        name: "Start from the Brainstorm template",
      });
      brainstormBtn.focus();
      expect(document.activeElement).toBe(brainstormBtn);

      await act(async () => {
        fireEvent.keyDown(brainstormBtn, { key: "Enter" });
        fireEvent.click(brainstormBtn);
      });

      expect(onCreateTemplate).toHaveBeenCalledWith("brainstorm");
      unmountHome();

      const brainstormTmpl = templateById("brainstorm")!;
      const notes = brainstormTmpl.build();
      expect(notes).toHaveLength(9);

      // Central prompt note
      const centerPrompt = notes.find((n) => n.text === "What are we solving?");
      expect(centerPrompt).toBeDefined();

      const doc = openBoardMemory();
      doc.commit(notes.map((element) => ({ kind: "createElement", element })));

      // Keyboard user adds an idea note answering the prompt
      const ideaNote = createStickyNote({
        id: "idea-note-1",
        x: 0,
        y: 400,
        text: "Zero-mouse keyboard workflows for facilitators",
        backgroundColor: COLOR_PALETTE.yellow[1],
      });
      doc.commit([{ kind: "createElement", element: ideaNote }]);
      expect(doc.read().elements).toHaveLength(10);

      // Cast vote on the idea note
      const voteMutations = placeVote(
        votesFromRecords(doc.read().records),
        { elementId: "idea-note-1", voterId: "", placedAt: Date.now() },
        { record: randomId(), order: "a0", board: "board-brainstorm" },
        false,
      );
      doc.commit(voteMutations);

      const exportResult = exportBoard(doc);
      expect(exportResult.ok).toBe(true);
      if (exportResult.ok) {
        const serialized = JSON.parse(exportResult.bytes);
        expect(serialized.elements).toHaveLength(10);
        expect(
          serialized.elements.some(
            (e: any) => e.text === "What are we solving?",
          ),
        ).toBe(true);
        expect(
          serialized.elements.some(
            (e: any) =>
              e.text === "Zero-mouse keyboard workflows for facilitators",
          ),
        ).toBe(true);
      }
    });

    it("supports TemplateModal keyboard focus trap, search focus, and escape dismissal", () => {
      const onClose = vi.fn();

      const { unmount } = render(
        <TemplateModal isOpen={true} onClose={onClose} excalidrawAPI={null} />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");

      // Search is focused when the gallery opens (ADR-0038).
      const search = screen.getByTestId("template-search");
      expect(document.activeElement).toBe(search);

      // The gallery still lists the curated built-ins without an editor.
      expect(screen.getByTestId("template-use-retrospective")).toBeDefined();

      // Escape dismisses modal
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();

      unmount();
    });

    it("validates keyboard tool mapping parity for all standard tools (Miro aligned)", () => {
      // Miro tool key parity
      expect(findShapeByKey("n", mockApp)).toBe("stickynote");
      expect(findShapeByKey("r", mockApp)).toBe("rectangle");
      expect(findShapeByKey("s", mockApp)).toBe("rectangle"); // Miro 'S' alias for shape
      expect(findShapeByKey("t", mockApp)).toBe("text");
      expect(findShapeByKey("d", mockApp)).toBe("diamond");
      expect(findShapeByKey("o", mockApp)).toBe("ellipse");
      expect(findShapeByKey("a", mockApp)).toBe("arrow");
      expect(findShapeByKey("l", mockApp)).toBe("line");
      expect(findShapeByKey("f", mockApp)).toBe("frame");
      expect(findShapeByKey("h", mockApp)).toBe("hand");
      expect(findShapeByKey("v", mockApp)).toBe("selection");
    });
  });
});
