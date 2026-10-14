import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CREATION_TOOLS, WebCreationRail } from "../App";

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
    render(<WebCreationRail appState={mockAppState} />);

    const laserBtn = screen.getByRole("button", { name: /Laser/i });
    fireEvent.click(laserBtn);

    expect(setActiveToolMock).toHaveBeenCalledWith({
      type: "laser",
    });
  });
});
