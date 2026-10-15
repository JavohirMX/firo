import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

import {
  AccessibilityTree,
  DEFAULT_TREE_WINDOW,
  buildAccessibilityNodes,
  describeAccessibilityItem,
  resolveTabNavigation,
  resolveTreeNavigation,
  treeWindowStart,
  type AccessibilityTreeItem,
} from "../src";

const note: AccessibilityTreeItem = {
  id: "note-1",
  kind: "Sticky note",
  text: "Write the RFC",
  colorName: "Yellow",
};

describe("@firo/ui accessibility tree", () => {
  describe("describeAccessibilityItem", () => {
    it("builds the label from trd/09's example", () => {
      expect(
        describeAccessibilityItem(
          {
            id: "n",
            kind: "Sticky note",
            text: "Write the RFC",
            colorName: "Yellow",
          },
          4,
          12,
        ),
      ).toBe("Sticky note: Write the RFC. Yellow. Position 4 of 12.");
    });

    it("omits text, colour and lock when absent", () => {
      expect(
        describeAccessibilityItem({ id: "r", kind: "Rectangle" }, 1, 3),
      ).toBe("Rectangle. Position 1 of 3.");
    });

    it("collapses whitespace so a multi-line note is one sentence", () => {
      expect(
        describeAccessibilityItem(
          { id: "n", kind: "Sticky note", text: "  first\n\nsecond  " },
          1,
          1,
        ),
      ).toBe("Sticky note: first second. Position 1 of 1.");
    });

    it("announces a locked element", () => {
      expect(
        describeAccessibilityItem(
          { id: "r", kind: "Rectangle", locked: true },
          2,
          2,
        ),
      ).toBe("Rectangle. Locked. Position 2 of 2.");
    });
  });

  describe("buildAccessibilityNodes", () => {
    it("numbers the set from one, over the whole list", () => {
      const nodes = buildAccessibilityNodes([
        { id: "a", kind: "Rectangle" },
        { id: "b", kind: "Ellipse", text: "Start" },
      ]);

      expect(nodes.map((node) => node.posinset)).toEqual([1, 2]);
      expect(nodes.every((node) => node.setsize === 2)).toBe(true);
      expect(nodes[1].label).toBe("Ellipse: Start. Position 2 of 2.");
    });

    it("returns an empty tree for an empty board", () => {
      expect(buildAccessibilityNodes([])).toEqual([]);
    });
  });

  describe("resolveTreeNavigation", () => {
    it("stops at the ends rather than wrapping", () => {
      expect(resolveTreeNavigation("ArrowDown", 1, 2)).toBeNull();
      expect(resolveTreeNavigation("ArrowUp", 0, 2)).toBeNull();
    });

    it("moves within the list and jumps to the ends", () => {
      expect(resolveTreeNavigation("ArrowDown", 0, 2)).toBe("next");
      expect(resolveTreeNavigation("ArrowUp", 1, 2)).toBe("previous");
      expect(resolveTreeNavigation("Home", 3, 5)).toBe("first");
      expect(resolveTreeNavigation("End", 0, 5)).toBe("last");
    });
  });

  describe("resolveTabNavigation", () => {
    it("consumes Tab only while it stays inside the tree", () => {
      expect(resolveTabNavigation(false, 0, 3)).toEqual({
        index: 1,
        consumed: true,
      });
      // Last element: not consumed, so Tab leaves the board.
      expect(resolveTabNavigation(false, 2, 3)).toEqual({
        index: 2,
        consumed: false,
      });
      // First element, Shift+Tab: not consumed, leaves the board.
      expect(resolveTabNavigation(true, 0, 3)).toEqual({
        index: 0,
        consumed: false,
      });
    });
  });

  describe("AccessibilityTree", () => {
    const items: AccessibilityTreeItem[] = [
      note,
      { id: "note-2", kind: "Ellipse" },
    ];

    it("renders the application role, a label and a roledescription", () => {
      render(
        <AccessibilityTree
          items={items}
          boardLabel="Sprint planning"
          onActivate={vi.fn()}
        />,
      );

      const board = screen.getByRole("application", {
        name: "Sprint planning",
      });
      expect(board.getAttribute("aria-roledescription")).toBe("whiteboard");
      expect(
        screen.getByRole("list", { name: "Board contents" }),
      ).toBeDefined();
    });

    it("names each element and marks its position in the set", () => {
      render(<AccessibilityTree items={items} onActivate={vi.fn()} />);

      const first = screen.getByRole("button", { name: /Sticky note/ });
      expect(first.getAttribute("aria-label")).toBe(
        "Sticky note: Write the RFC. Yellow. Position 1 of 2.",
      );
      // Position sits on the list item, where `aria-posinset` is supported.
      const firstItem = first.closest("li")!;
      expect(firstItem.getAttribute("aria-posinset")).toBe("1");
      expect(firstItem.getAttribute("aria-setsize")).toBe("2");

      const second = screen.getByRole("button", { name: /Ellipse/ });
      expect(second.closest("li")!.getAttribute("aria-posinset")).toBe("2");
    });

    it("keeps one tab stop and moves it with the arrow keys", () => {
      const onFocusElement = vi.fn();
      render(
        <AccessibilityTree
          items={items}
          onActivate={vi.fn()}
          onFocusElement={onFocusElement}
        />,
      );

      const [first, second] = screen.getAllByRole("button");
      expect(first.getAttribute("tabindex")).toBe("0");
      expect(second.getAttribute("tabindex")).toBe("-1");

      fireEvent.keyDown(first, { key: "ArrowDown" });

      expect(document.activeElement).toBe(second);
      expect(second.getAttribute("tabindex")).toBe("0");
      expect(onFocusElement).toHaveBeenCalledWith("note-2");
    });

    it("moves between elements on Tab, and does not trap Tab at the end", () => {
      render(<AccessibilityTree items={items} onActivate={vi.fn()} />);

      const [first, second] = screen.getAllByRole("button");

      fireEvent.keyDown(first, { key: "Tab" });
      expect(document.activeElement).toBe(second);

      fireEvent.keyDown(second, { key: "Tab" });
      // Consumed nowhere to go: focus stays put so the browser can leave.
      expect(document.activeElement).toBe(second);
    });

    it("activates on Enter and Space", () => {
      const onActivate = vi.fn();
      render(<AccessibilityTree items={items} onActivate={onActivate} />);

      const [first] = screen.getAllByRole("button");
      fireEvent.keyDown(first, { key: "Enter" });
      expect(onActivate).toHaveBeenCalledWith("note-1");

      fireEvent.keyDown(first, { key: " " });
      expect(onActivate).toHaveBeenCalledTimes(2);

      fireEvent.click(first);
      expect(onActivate).toHaveBeenCalledTimes(3);
    });

    it("deselects on Escape", () => {
      const onEscape = vi.fn();
      render(
        <AccessibilityTree
          items={items}
          onActivate={vi.fn()}
          onEscape={onEscape}
        />,
      );

      fireEvent.keyDown(screen.getAllByRole("button")[0], { key: "Escape" });
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("follows an external selection and marks it pressed", () => {
      render(
        <AccessibilityTree
          items={items}
          selectedId="note-2"
          onActivate={vi.fn()}
        />,
      );

      const [first, second] = screen.getAllByRole("button");
      expect(second.getAttribute("tabindex")).toBe("0");
      expect(first.getAttribute("tabindex")).toBe("-1");
      expect(second.getAttribute("aria-pressed")).toBe("true");
      expect(first.getAttribute("aria-pressed")).toBeNull();
    });

    it("clamps focus to a neighbour when the focused element is removed", () => {
      const { rerender } = render(
        <AccessibilityTree
          items={items}
          selectedId="note-2"
          onActivate={vi.fn()}
        />,
      );

      // The board shrinks under the tree; focus must not be left on a node
      // that no longer exists.
      rerender(<AccessibilityTree items={[note]} onActivate={vi.fn()} />);

      const [only] = screen.getAllByRole("button");
      expect(only.getAttribute("tabindex")).toBe("0");
    });

    it("renders a polite live region that never interrupts", () => {
      render(
        <AccessibilityTree
          items={items}
          onActivate={vi.fn()}
          liveMessage="Saved"
        />,
      );

      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toBe("Saved");
    });
  });

  describe("treeWindowStart", () => {
    it("keeps the active element inside the window", () => {
      // 10 of 500, centred where possible.
      const start = treeWindowStart(250, 500, 10);
      expect(start).toBeLessThanOrEqual(250);
      expect(start + 10).toBeGreaterThan(250);
    });

    it("clamps at both ends", () => {
      expect(treeWindowStart(0, 500, 10)).toBe(0);
      expect(treeWindowStart(499, 500, 10)).toBe(490);
    });

    it("never starts below zero on a board smaller than the window", () => {
      expect(treeWindowStart(3, 5, DEFAULT_TREE_WINDOW)).toBe(0);
    });
  });

  describe("AccessibilityTree virtualisation", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`,
      kind: "Rectangle",
    }));

    it("renders only a window, while still reporting the true set size", () => {
      render(
        <AccessibilityTree items={many} windowSize={10} onActivate={vi.fn()} />,
      );

      expect(screen.getAllByRole("listitem")).toHaveLength(10);
      // The position is the position in the board, not in the window.
      const firstRendered = screen.getByRole("button", {
        name: /Position 1 of 500/,
      });
      expect(firstRendered.closest("li")!.getAttribute("aria-setsize")).toBe(
        "500",
      );
    });

    it("shifts the window when focus moves past its end", () => {
      render(
        <AccessibilityTree items={many} windowSize={10} onActivate={vi.fn()} />,
      );

      const buttons = screen.getAllByRole("button");
      act(() => {
        buttons[9].focus();
        fireEvent.keyDown(buttons[9], { key: "ArrowDown" });
      });

      // Focused element is now 11 of 500, and it is rendered.
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Rectangle. Position 11 of 500.",
      );
      expect(screen.getAllByRole("listitem")).toHaveLength(10);
    });
  });
});
