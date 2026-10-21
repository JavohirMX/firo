import { describe, expect, it, vi } from "vitest";

import {
  applyStickyOption,
  type StickyOptionDeps,
} from "../board/stickyNoteOptions";

const makeDeps = (overrides: Record<string, unknown> = {}) => {
  const executeAction = vi.fn();
  const setAppState = vi.fn();
  const onOpenBulkSticky = vi.fn();
  const deps = {
    actionManager: {
      actions: {
        changeBackgroundColor: { name: "changeBackgroundColor" },
        changeStickyNoteSize: { name: "changeStickyNoteSize" },
        ...((overrides.actions as object) || {}),
      },
      executeAction,
    },
    setAppState,
    app: {
      scene: { getNonDeletedElements: () => [] },
      state: { selectedElementIds: {} },
    },
    onOpenBulkSticky,
  };
  return {
    deps: deps as unknown as StickyOptionDeps,
    executeAction,
    setAppState,
    onOpenBulkSticky,
  };
};

describe("applyStickyOption", () => {
  it("routes a colour pick through the picker action", () => {
    const { deps, executeAction } = makeDeps();
    const consumed = applyStickyOption(
      { id: "colour-yellow", color: "#fff3bf" },
      deps,
    );
    expect(consumed).toBe(true);
    expect(executeAction).toHaveBeenCalledWith(
      deps.actionManager.actions.changeBackgroundColor,
      "ui",
      { color: "#fff3bf" },
    );
  });

  it("opens bulk create for the bulk choice", () => {
    const { deps, onOpenBulkSticky } = makeDeps();
    expect(applyStickyOption({ id: "bulk-create" }, deps)).toBe(true);
    expect(onOpenBulkSticky).toHaveBeenCalledTimes(1);
  });

  it("sets the size default without a resize action when nothing is selected", () => {
    const { deps, executeAction, setAppState } = makeDeps();
    expect(applyStickyOption({ id: "size-l" }, deps)).toBe(true);
    expect(setAppState).toHaveBeenCalledWith({
      currentItemStickynoteSize: "l",
    });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("rejects an unknown size preset without touching anything", () => {
    const { deps, executeAction, setAppState } = makeDeps();
    expect(applyStickyOption({ id: "size-xxl" }, deps)).toBe(false);
    expect(setAppState).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("ignores unknown choices", () => {
    const { deps, executeAction, setAppState, onOpenBulkSticky } = makeDeps();
    expect(applyStickyOption({ id: "mystery" }, deps)).toBe(false);
    expect(setAppState).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
    expect(onOpenBulkSticky).not.toHaveBeenCalled();
  });
});
