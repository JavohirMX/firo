import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "../../app_constants";
import {
  RAIL_PINNED_TOOLS,
  RAIL_TOOL_DEFAULTS,
  defaultRailLayout,
  normaliseRailLayout,
  readRailLayout,
  reorderRailTools,
  restoreRailTool,
  unpinRailTool,
  writeRailLayout,
} from "../railLayout";

const stored = () =>
  window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT);

describe("the rail arrangement", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with every arrangement tool visible, in the default order", () => {
    const layout = defaultRailLayout();
    expect(layout.order).toEqual([...RAIL_TOOL_DEFAULTS]);
    expect(layout.unpinned).toEqual([]);
  });

  it("never holds the pinned pointer entry, which is a control and not a tool", () => {
    // The rail hands its reorder result back pinned entry and all; the
    // arrangement must drop it rather than store it as a movable tool.
    const layout = normaliseRailLayout({
      order: ["selection", "hand", "laser", "eraser"],
    });
    expect(layout.order).not.toContain("selection");
    expect(layout.order).not.toContain("hand");
    expect(RAIL_PINNED_TOOLS).toEqual(["selection", "hand"]);
  });

  it("drops unknown ids and duplicates rather than trusting its input", () => {
    const layout = normaliseRailLayout({
      order: ["laser", "laser", "telepathy", 7, null],
    });
    expect(layout.order[0]).toBe("laser");
    expect(layout.order.filter((id) => id === "laser")).toHaveLength(1);
    expect(layout.order).not.toContain("telepathy");
  });

  it("shows a tool it has never heard of, because 'new' must not read as 'hidden'", () => {
    // A layout stored by an older Firo: `eraser` had not been invented yet.
    const layout = normaliseRailLayout({
      order: ["stickynote", "rectangle"],
      unpinned: ["laser"],
    });

    expect(layout.order).toContain("eraser");
    // ...but what the user explicitly hid stays hidden.
    expect(layout.order).not.toContain("laser");
    expect(layout.unpinned).toEqual(["laser"]);
  });

  it("falls back to the default order when storage is empty or unreadable", () => {
    expect(readRailLayout().order).toEqual([...RAIL_TOOL_DEFAULTS]);

    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT,
      "{ this is not json",
    );
    expect(readRailLayout().order).toEqual([...RAIL_TOOL_DEFAULTS]);
  });

  it("round-trips an arrangement through storage", () => {
    const layout = reorderRailTools(defaultRailLayout(), [
      "selection",
      "laser",
      ...RAIL_TOOL_DEFAULTS.filter((id) => id !== "laser"),
    ]);
    writeRailLayout(layout);

    expect(stored()).not.toBeNull();
    expect(readRailLayout()).toEqual(layout);
    expect(readRailLayout().order[0]).toBe("laser");
  });

  it("reorders, and keeps what was hidden hidden", () => {
    const hidden = unpinRailTool(defaultRailLayout(), "frame");
    const reordered = reorderRailTools(hidden, [
      "selection",
      "text",
      ...hidden.order.filter((id) => id !== "text"),
    ]);

    expect(reordered.order[0]).toBe("text");
    expect(reordered.unpinned).toEqual(["frame"]);
  });

  it("unpins a tool, and refuses to unpin the pointer", () => {
    const hidden = unpinRailTool(defaultRailLayout(), "eraser");
    expect(hidden.order).not.toContain("eraser");
    expect(hidden.unpinned).toEqual(["eraser"]);

    // Select and Hand are pinned: the request is a no-op, not an error.
    const layout = defaultRailLayout();
    expect(unpinRailTool(layout, "selection")).toBe(layout);
    expect(unpinRailTool(layout, "hand")).toBe(layout);
  });

  it("brings an unpinned tool back at the end of the row", () => {
    const hidden = unpinRailTool(defaultRailLayout(), "rectangle");
    const restored = restoreRailTool(hidden, "rectangle");

    expect(restored.unpinned).toEqual([]);
    expect(restored.order[restored.order.length - 1]).toBe("rectangle");
  });

  it("is idempotent: restoring a visible tool changes nothing", () => {
    const layout = defaultRailLayout();
    expect(restoreRailTool(layout, "text")).toEqual(layout);
  });
});
