import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CREATION_TOOLS, WebCreationRail } from "../App";
import { STORAGE_KEYS } from "../app_constants";

const setActiveToolMock = vi.fn();
const handleButtonPointerDownMock = vi.fn();
const executeActionMock = vi.fn();

const mockAppState: any = {
  activeTool: { type: "selection", locked: false },
};

vi.mock("@firo/editor", async () => {
  const actual = await vi.importActual<any>("@firo/editor");
  return {
    ...actual,
    useApp: () => ({
      state: mockAppState,
      setActiveTool: setActiveToolMock,
      toolDrag: {
        handleButtonPointerDown: handleButtonPointerDownMock,
      },
    }),
    useExcalidrawActionManager: () => ({
      actions: {
        undo: "undoAction",
        redo: "redoAction",
      },
      executeAction: executeActionMock,
    }),
  };
});

describe("WebCreationRail One-Time Tools Revert and Locking", () => {
  beforeEach(() => {
    setActiveToolMock.mockClear();
    handleButtonPointerDownMock.mockClear();
    executeActionMock.mockClear();
    window.localStorage.clear();
    mockAppState.activeTool.type = "selection";
  });

  it("identifies all creation tools correctly", () => {
    expect(CREATION_TOOLS.has("stickynote")).toBe(true);
    expect(CREATION_TOOLS.has("rectangle")).toBe(true);
    expect(CREATION_TOOLS.has("diamond")).toBe(true);
    expect(CREATION_TOOLS.has("ellipse")).toBe(true);
    expect(CREATION_TOOLS.has("arrow")).toBe(true);
    expect(CREATION_TOOLS.has("line")).toBe(true);
    expect(CREATION_TOOLS.has("text")).toBe(true);
    expect(CREATION_TOOLS.has("frame")).toBe(true);

    expect(CREATION_TOOLS.has("selection")).toBe(false);
    expect(CREATION_TOOLS.has("laser")).toBe(false);
    expect(CREATION_TOOLS.has("eraser")).toBe(false);
  });

  it("single-clicking a creation tool activates it with locked: false (one-time placement)", () => {
    render(<WebCreationRail appState={mockAppState} />);

    // Click sticky note tool
    const stickyBtn = screen.getByRole("button", { name: /Sticky note/i });
    fireEvent.click(stickyBtn);

    expect(setActiveToolMock).toHaveBeenCalledWith({
      type: "stickynote",
      locked: false,
    });

    // Click rectangle tool
    const rectBtn = screen.getByRole("button", { name: /Rectangle/i });
    fireEvent.click(rectBtn);

    expect(setActiveToolMock).toHaveBeenCalledWith({
      type: "rectangle",
      locked: false,
    });
  });

  it("shift-clicking a creation tool locks it for continuous placement", () => {
    render(<WebCreationRail appState={mockAppState} />);

    const stickyBtn = screen.getByRole("button", { name: /Sticky note/i });

    // Pointer down and click with shiftKey: true
    fireEvent.pointerDown(stickyBtn, { shiftKey: true });
    fireEvent.click(stickyBtn, { shiftKey: true });

    expect(setActiveToolMock).toHaveBeenCalledWith({
      type: "stickynote",
      locked: true,
    });
  });

  it("double-clicking a creation tool locks it for continuous placement", () => {
    render(<WebCreationRail appState={mockAppState} />);

    const rectBtn = screen.getByRole("button", { name: /Rectangle/i });

    // First click
    fireEvent.click(rectBtn);
    expect(setActiveToolMock).toHaveBeenLastCalledWith({
      type: "rectangle",
      locked: false,
    });

    // Immediate second click (within 350ms)
    fireEvent.click(rectBtn);
    expect(setActiveToolMock).toHaveBeenLastCalledWith({
      type: "rectangle",
      locked: true,
    });
  });

  it("clicking non-creation tools does not set locked flag", () => {
    mockAppState.activeTool.type = "freedraw";
    render(<WebCreationRail appState={mockAppState} />);

    // Click Draw (pen slot) to open flyout, then select Laser
    const drawBtn = screen.getByRole("button", { name: /Draw/i });
    fireEvent.click(drawBtn);

    const laserItem = screen.getByRole("menuitemradio", { name: /Laser/i });
    fireEvent.click(laserItem);

    expect(setActiveToolMock).toHaveBeenCalledWith({
      type: "laser",
    });
  });

  describe("Miro flyouts and grouped tools", () => {
    it("toggles the Shapes flyout and selects an alternative shape", () => {
      mockAppState.activeTool.type = "rectangle";
      render(<WebCreationRail appState={mockAppState} />);

      // Rectangle is currently active, so clicking it toggles the flyout
      const rectBtn = screen.getByRole("button", { name: /Rectangle/i });
      fireEvent.click(rectBtn);

      // Flyout should be open with Diamond and Ellipse options
      const diamondItem = screen.getByRole("menuitemradio", {
        name: /Diamond/i,
      });
      expect(diamondItem).toBeDefined();

      fireEvent.click(diamondItem);
      expect(setActiveToolMock).toHaveBeenCalledWith({
        type: "diamond",
        locked: false,
      });
    });

    it("toggles the Pen flyout and selects the Laser tool", () => {
      mockAppState.activeTool.type = "freedraw";
      render(<WebCreationRail appState={mockAppState} />);

      const drawBtn = screen.getByRole("button", { name: /Draw/i });
      fireEvent.click(drawBtn);

      const laserItem = screen.getByRole("menuitemradio", { name: /Laser/i });
      expect(laserItem).toBeDefined();

      fireEvent.click(laserItem);
      expect(setActiveToolMock).toHaveBeenCalledWith({
        type: "laser",
      });
    });

    it("toggles the Connectors flyout and selects the Line tool", () => {
      mockAppState.activeTool.type = "arrow";
      render(<WebCreationRail appState={mockAppState} />);

      const arrowBtn = screen.getByRole("button", { name: /Arrow/i });
      fireEvent.click(arrowBtn);

      const lineItem = screen.getByRole("menuitemradio", { name: /Line/i });
      expect(lineItem).toBeDefined();

      fireEvent.click(lineItem);
      expect(setActiveToolMock).toHaveBeenCalledWith({
        type: "line",
        locked: false,
      });
    });

    it("triggers template modal callback when Templates tool is clicked", () => {
      const onOpenTemplates = vi.fn();
      render(
        <WebCreationRail
          appState={mockAppState}
          onOpenTemplates={onOpenTemplates}
        />,
      );

      const templatesBtn = screen.getByRole("button", { name: /Templates/i });
      fireEvent.click(templatesBtn);

      expect(onOpenTemplates).toHaveBeenCalledTimes(1);
    });

    it("triggers comment mode toggle callback when Comment tool is clicked", () => {
      const onToggleCommentMode = vi.fn();
      render(
        <WebCreationRail
          appState={mockAppState}
          onToggleCommentMode={onToggleCommentMode}
        />,
      );

      const commentBtn = screen.getByRole("button", { name: /Comment/i });
      fireEvent.click(commentBtn);

      expect(onToggleCommentMode).toHaveBeenCalledTimes(1);
    });
  });

  describe("the merged Select/Hand pointer", () => {
    const pointer = () => screen.getByRole("button", { name: /Select/i });

    it("is one entry, not two", () => {
      render(<WebCreationRail appState={mockAppState} />);

      expect(
        screen.getAllByRole("button", { name: /Select|Hand/i }),
      ).toHaveLength(1);
      expect(pointer().getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to Hand when clicked while Select is active", () => {
      render(<WebCreationRail appState={mockAppState} />);

      fireEvent.click(pointer());

      expect(setActiveToolMock).toHaveBeenCalledWith({ type: "hand" });
    });

    it("toggles back to Select when clicked while Hand is active", () => {
      mockAppState.activeTool.type = "hand";
      render(<WebCreationRail appState={mockAppState} />);

      fireEvent.click(pointer());

      expect(setActiveToolMock).toHaveBeenCalledWith({ type: "selection" });
    });

    it("selects, rather than toggling, when another tool is active", () => {
      mockAppState.activeTool.type = "rectangle";
      render(<WebCreationRail appState={mockAppState} />);

      fireEvent.click(pointer());

      expect(setActiveToolMock).toHaveBeenCalledWith({ type: "selection" });
    });

    it("cannot be unpinned or dragged — it is the rail's floor", () => {
      render(<WebCreationRail appState={mockAppState} />);

      // The pointer offers no Unpin...
      expect(pointer().getAttribute("aria-haspopup")).toBeNull();
      fireEvent.contextMenu(pointer());
      expect(screen.queryByRole("menuitem", { name: "Unpin" })).toBeNull();

      // ...while a movable tool does, so the absence above is the pin and not a
      // menu that simply never renders.
      fireEvent.contextMenu(screen.getByRole("button", { name: /Draw/i }));
      expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeDefined();
      fireEvent.keyDown(document, { key: "Escape" });

      fireEvent.dragStart(pointer());
      fireEvent.drop(screen.getByRole("button", { name: /Draw/i }));

      // Dragging the pointer moved nothing, so nothing was persisted but the
      // default order it was already in.
      expect(
        JSON.parse(
          window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT)!,
        ).order,
      ).not.toContain("selection");
    });
  });

  describe("the arrangement", () => {
    it("persists a reorder to localStorage, where a preference belongs", () => {
      render(<WebCreationRail appState={mockAppState} />);

      fireEvent.dragStart(screen.getByRole("button", { name: /Draw/i }));
      fireEvent.dragOver(screen.getByRole("button", { name: /Templates/i }));
      fireEvent.drop(screen.getByRole("button", { name: /Templates/i }));

      const payload = JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT)!,
      );
      expect(payload.order[0]).toBe("pen");
    });

    it("persists an unpin, and offers the tool back", () => {
      render(<WebCreationRail appState={mockAppState} />);

      fireEvent.contextMenu(screen.getByRole("button", { name: /Draw/i }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Unpin" }));

      const payload = JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT)!,
      );
      expect(payload.unpinned).toContain("pen");
      expect(payload.order).not.toContain("pen");

      // ...and it comes back.
      fireEvent.click(screen.getByRole("button", { name: "Unpinned tools" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /Draw/i }));

      expect(
        JSON.parse(
          window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT)!,
        ).order,
      ).toContain("pen");
    });

    it("restores the stored arrangement on the next mount", () => {
      window.localStorage.setItem(
        STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT,
        JSON.stringify({ order: ["pen", "shapes"], unpinned: ["text"] }),
      );

      render(<WebCreationRail appState={mockAppState} />);

      const labels = screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? "");
      const position = (pattern: RegExp) =>
        labels.findIndex((label) => pattern.test(label));

      // The pinned pointer is first regardless of what the stored order said.
      expect(position(/Select/)).toBe(0);
      // The stored order wins: the pen sits ahead of the tools the stored
      // layout never mentioned, which are appended rather than hidden.
      expect(position(/Draw/)).toBeLessThan(position(/Sticky note/));
      // ...and what the user explicitly unpinned is out of the row.
      expect(screen.queryByRole("button", { name: /^Text/ })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Unpinned tools" }),
      ).toBeDefined();
    });
  });
});
