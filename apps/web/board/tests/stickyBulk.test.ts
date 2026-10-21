import { describe, expect, it } from "vitest";

import {
  BULK_STICKY_LIMIT,
  layoutBulkStickyGrid,
  parseBulkStickyLines,
} from "../stickyBulk";

/*
 * The parse and the grid, without a pixel. What is worth protecting:
 *
 * 1. **One line, one note.** Blank lines are skipped — "an empty idea" is not
 *    a note, and a paste with trailing newlines must not invent work.
 * 2. **The limit is honest.** Lines past the cap are counted, not silently
 *    kept or silently lost.
 * 3. **The grid is square and centred.** A column of forty runs off the
 *    screen; the batch lands where the facilitator is looking.
 */

describe("parseBulkStickyLines", () => {
  it("is one note per non-empty line", () => {
    const parsed = parseBulkStickyLines("First\nSecond\nThird");
    expect(parsed.lines).toEqual(["First", "Second", "Third"]);
    expect(parsed.overflow).toBe(0);
  });

  it("skips blank lines and trims whitespace", () => {
    const parsed = parseBulkStickyLines("  First  \n\n   \nSecond\n");
    expect(parsed.lines).toEqual(["First", "Second"]);
  });

  it("handles Windows and old-Mac line endings", () => {
    const parsed = parseBulkStickyLines("A\r\nB\rC\nD");
    expect(parsed.lines).toEqual(["A", "B", "C", "D"]);
  });

  it("caps at the limit and counts the overflow", () => {
    const many = Array.from(
      { length: BULK_STICKY_LIMIT + 7 },
      (_, i) => `idea ${i}`,
    ).join("\n");
    const parsed = parseBulkStickyLines(many);
    expect(parsed.lines).toHaveLength(BULK_STICKY_LIMIT);
    expect(parsed.overflow).toBe(7);
  });

  it("is empty for empty input", () => {
    const parsed = parseBulkStickyLines("");
    expect(parsed.lines).toEqual([]);
    expect(parsed.overflow).toBe(0);
  });
});

describe("layoutBulkStickyGrid", () => {
  const center = { x: 1000, y: 500 };

  it("lays nothing out for no notes", () => {
    expect(layoutBulkStickyGrid(0, 250, center)).toEqual([]);
  });

  it("centres a single note on the view", () => {
    const [only] = layoutBulkStickyGrid(1, 200, center);
    expect(only.x).toBe(1000 - 100);
    expect(only.y).toBe(500 - 100);
  });

  it("is as square as the count allows", () => {
    // 10 notes: 4 columns by 3 rows, not 10 in a row off the screen edge.
    const placements = layoutBulkStickyGrid(10, 100, center, 0);
    const xs = new Set(placements.map((p) => p.x));
    const ys = new Set(placements.map((p) => p.y));
    expect(xs.size).toBe(4);
    expect(ys.size).toBe(3);
  });

  it("centres the block, not the first cell", () => {
    const size = 100;
    const gap = 24;
    const placements = layoutBulkStickyGrid(4, size, center, gap);
    // 2x2: total span is 2*size + gap in both axes.
    const span = 2 * size + gap;
    const minX = Math.min(...placements.map((p) => p.x));
    const minY = Math.min(...placements.map((p) => p.y));
    expect(minX).toBe(center.x - span / 2);
    expect(minY).toBe(center.y - span / 2);
  });

  it("keeps the gap between neighbours", () => {
    const placements = layoutBulkStickyGrid(2, 100, center, 24);
    const [first, second] = placements;
    expect(second.x - first.x).toBe(124);
    expect(second.y).toBe(first.y);
  });

  it("refuses nonsense input rather than producing NaN coordinates", () => {
    expect(layoutBulkStickyGrid(5, 0, center)).toEqual([]);
    expect(layoutBulkStickyGrid(-1, 100, center)).toEqual([]);
  });
});
