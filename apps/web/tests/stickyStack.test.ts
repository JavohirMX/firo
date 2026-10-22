import { describe, expect, it, vi } from "vitest";

import {
  STICKY_STACK_COUNT,
  STICKY_STACK_STEP,
  createStickyStack,
  layoutStickyStack,
} from "../board/stickyStack";

describe("layoutStickyStack", () => {
  it("offsets each note by the step, bottom note first", () => {
    const p = layoutStickyStack(3, 100, { x: 0, y: 0 }, 10);
    expect(p).toHaveLength(3);
    expect(p[1].x - p[0].x).toBe(10);
    expect(p[2].y - p[1].y).toBe(10);
  });

  it("centres the whole pile on the given point", () => {
    const p = layoutStickyStack(4, 100, { x: 500, y: 300 }, 10);
    const left = p[0].x;
    const right = p[3].x + 100;
    expect((left + right) / 2).toBe(500);
    const top = p[0].y;
    const bottom = p[3].y + 100;
    expect((top + bottom) / 2).toBe(300);
  });

  it("returns nothing for a non-positive count or size", () => {
    expect(layoutStickyStack(0, 100, { x: 0, y: 0 })).toEqual([]);
    expect(layoutStickyStack(3, 0, { x: 0, y: 0 })).toEqual([]);
  });
});

const makeApi = (existing: unknown[] = []) => {
  const updateScene = vi.fn();
  const api = {
    getAppState: () => ({
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
      width: 800,
      height: 600,
      currentItemStickynoteSize: "m",
      currentItemStickynoteStrokeColor: "#000000",
      currentItemStickynoteBackgroundColor: "#fff3bf",
      currentItemFillStyle: "solid",
      currentItemStrokeStyle: "solid",
      currentItemRoughness: 0,
      currentItemOpacity: 100,
    }),
    getSceneElements: () => existing,
    updateScene,
  };
  return { api: api as never, updateScene };
};

describe("createStickyStack", () => {
  it("adds separate blank notes in one undoable update and selects the top", () => {
    const keep = { id: "keep" };
    const { api, updateScene } = makeApi([keep]);
    const notes = createStickyStack(api);
    expect(notes).toHaveLength(STICKY_STACK_COUNT);
    expect(updateScene).toHaveBeenCalledTimes(1);
    const call = updateScene.mock.calls[0][0];
    expect(call.elements[0]).toBe(keep);
    expect(call.elements).toHaveLength(1 + STICKY_STACK_COUNT);
    expect(call.captureUpdate).toBe("IMMEDIATELY");
    expect(call.appState.selectedElementIds).toEqual({
      [notes[notes.length - 1].id]: true,
    });
    // blank and ungrouped: dragging one note must not drag the pile
    for (const n of notes) {
      expect(n.groupIds).toEqual([]);
      expect(n.boundElements ?? []).toEqual([]);
    }
    expect(notes[1].x - notes[0].x).toBe(STICKY_STACK_STEP);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });
});
