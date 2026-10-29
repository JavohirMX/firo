import { describe, expect, it } from "vitest";

import type { FiroElement } from "@firo/schema";

import {
  deleteFrame,
  frameLabel,
  listFrames,
  renameFrame,
} from "../board/frames";

const frame = (id: string, name: string | null = null, isDeleted = false) =>
  ({
    id,
    type: "frame",
    name,
    isDeleted,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  } as unknown as FiroElement);

const rect = (id: string) =>
  ({ id, type: "rectangle", isDeleted: false } as unknown as FiroElement);

describe("listFrames", () => {
  it("lists live frames in document order with 1-based positions", () => {
    const rows = listFrames([rect("r1"), frame("a", "Intro"), frame("b")]);
    expect(rows).toEqual([
      { id: "a", name: "Intro", position: 1 },
      { id: "b", name: null, position: 2 },
    ]);
  });

  it("skips deleted frames and closes the position gaps", () => {
    const rows = listFrames([
      frame("a"),
      frame("gone", null, true),
      frame("b"),
    ]);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("returns an empty list when the board has no frames", () => {
    expect(listFrames([rect("r1")])).toEqual([]);
  });
});

describe("renameFrame", () => {
  it("renames only the target frame", () => {
    const next = renameFrame([frame("a"), frame("b", "Keep")], "a", "New");
    expect(next[0]).toMatchObject({ id: "a", name: "New" });
    expect(next[1]).toMatchObject({ id: "b", name: "Keep" });
  });

  it("clears a name with null", () => {
    const next = renameFrame([frame("a", "Old")], "a", null);
    expect(next[0]).toMatchObject({ name: null });
  });

  it("returns the same array for an unknown id, so no undo step is made", () => {
    const els = [frame("a")];
    expect(renameFrame(els, "nope", "X")).toBe(els);
  });

  it("returns the same array when the id is a deleted frame", () => {
    const els = [frame("a", null, true)];
    expect(renameFrame(els, "a", "X")).toBe(els);
  });

  it("refuses to rename a non-frame element with the same id", () => {
    const els = [rect("a")];
    expect(renameFrame(els, "a", "X")).toBe(els);
  });
});

describe("deleteFrame", () => {
  it("soft-deletes the frame and leaves other elements untouched", () => {
    const next = deleteFrame([frame("a"), rect("r1")], "a");
    expect(next[0]).toMatchObject({ id: "a", isDeleted: true });
    expect(next[1]).toMatchObject({ id: "r1", isDeleted: false });
  });

  it("returns the same array for an unknown or already-deleted frame", () => {
    const els = [frame("a", null, true)];
    expect(deleteFrame(els, "a")).toBe(els);
    expect(deleteFrame(els, "nope")).toBe(els);
  });
});

describe("frameLabel", () => {
  it("uses the name when set and the default otherwise", () => {
    expect(frameLabel({ id: "a", name: "Agenda", position: 3 })).toBe("Agenda");
    expect(frameLabel({ id: "a", name: null, position: 3 })).toBe("Frame 3");
  });
});
