import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AccessibilityLayer } from "../components/AccessibilityLayer";

const updateScene = vi.fn();

const mockState: {
  selectedElementIds: Record<string, true>;
  editingTextElement: { id: string; containerId?: string | null } | null;
} = {
  selectedElementIds: { "note-2": true },
  editingTextElement: null,
};

vi.mock("@firo/editor/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === "accessibility.skipToFirstObject"
        ? "Skip to first object on the board"
        : key,
  }),
}));

vi.mock("@firo/editor", () => ({
  useExcalidrawAPI: () => ({ updateScene }),
  useExcalidrawStateValue: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));

describe("AccessibilityLayer", () => {
  beforeEach(() => {
    updateScene.mockClear();
    mockState.selectedElementIds = { "note-2": true };
    mockState.editingTextElement = null;
  });

  const items = [
    { id: "note-1", kind: "Sticky note", text: "Write the RFC" },
    { id: "note-2", kind: "Ellipse", text: "Done" },
  ];

  it("renders the board's tree under the board's name", () => {
    render(<AccessibilityLayer items={items} boardLabel="Sprint planning" />);

    expect(
      screen.getByRole("application", { name: "Sprint planning" }),
    ).toBeDefined();
    // The two board objects plus the skip link that leads to them.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks the editor's current selection as pressed", () => {
    render(<AccessibilityLayer items={items} />);

    const selected = screen.getByRole("button", { name: /Ellipse/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
  });

  it("stays on the element while its bound label is being edited", () => {
    // Opening the text editor clears `selectedElementIds`; the label carries
    // the container id, so the note is still the current element.
    mockState.selectedElementIds = {};
    mockState.editingTextElement = {
      id: "note-1-label",
      containerId: "note-1",
    };

    render(<AccessibilityLayer items={items} />);

    expect(
      screen
        .getByRole("button", { name: /Sticky note/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("selects an element on the canvas when its node is activated", () => {
    render(<AccessibilityLayer items={items} />);

    fireEvent.click(screen.getByRole("button", { name: /Sticky note/ }));

    expect(updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: { "note-1": true } },
    });
  });

  it("clears the canvas selection on Escape", () => {
    render(<AccessibilityLayer items={items} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /Sticky note/ }), {
      key: "Escape",
    });

    expect(updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: {} },
    });
  });

  it("announces a message in the tree's polite live region", () => {
    render(
      <AccessibilityLayer
        items={items}
        liveMessage="Could not save: storage is full"
      />,
    );

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Could not save: storage is full");
  });

  describe("skip link", () => {
    it("renders the localized skip link and selects through the editor", () => {
      render(<AccessibilityLayer items={items} boardLabel="Board" />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Skip to first object on the board",
        }),
      );

      expect(updateScene).toHaveBeenCalledWith({
        appState: { selectedElementIds: { "note-1": true } },
      });
    });

    it("renders no skip link when the board is empty", () => {
      render(<AccessibilityLayer items={[]} boardLabel="Board" />);

      expect(
        screen.queryByRole("button", {
          name: "Skip to first object on the board",
        }),
      ).toBeNull();
    });
  });
});
