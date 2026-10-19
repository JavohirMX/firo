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

  it("matches the composition table, with connectors retired", () => {
    expect(defaultRailLayout().order).toEqual([
      "ai",
      "stickynote",
      "templates",
      "text",
      "shapes",
      "pen",
      "frame",
      "comment",
      "docblock",
    ]);
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
      order: ["pen", "pen", "telepathy", 7, null],
    });
    expect(layout.order[0]).toBe("pen");
    expect(layout.order.filter((id) => id === "pen")).toHaveLength(1);
    expect(layout.order).not.toContain("telepathy");
  });

  it("shows a tool it has never heard of, because 'new' must not read as 'hidden'", () => {
    // A layout stored by an older Firo: `comment` had not been invented yet.
    const layout = normaliseRailLayout({
      order: ["stickynote", "shapes"],
      unpinned: ["pen"],
    });

    expect(layout.order).toContain("comment");
    // ...but what the user explicitly hid stays hidden.
    expect(layout.order).not.toContain("pen");
    expect(layout.unpinned).toEqual(["pen"]);
  });

  it("migrates legacy flat tools to Miro tool groups", () => {
    const layout = normaliseRailLayout({
      order: ["rectangle", "diamond", "arrow", "eraser"],
      unpinned: ["laser"],
    });
    expect(layout.order).toContain("shapes");
    expect(layout.order).not.toContain("rectangle");
    expect(layout.unpinned).toContain("pen");
  });

  it("folds a stored `connectors` slot into shapes exactly once", () => {
    // The shapes family absorbed the connectors slot (ADR-0031). A layout
    // written before that change still names it, and the alias must resolve it
    // into the one slot rather than duplicating or dropping anything.
    const layout = normaliseRailLayout({
      order: ["connectors", "text", "shapes"],
    });

    expect(layout.order.filter((id) => id === "shapes")).toHaveLength(1);
    expect(layout.order).not.toContain("connectors");
    // The first occurrence keeps the slot, so shapes stays ahead of text.
    expect(layout.order.indexOf("shapes")).toBeLessThan(
      layout.order.indexOf("text"),
    );
  });

  it("lets an unpinned `connectors` hide the merged shapes slot", () => {
    const layout = normaliseRailLayout({
      order: ["connectors", "text"],
      unpinned: ["connectors"],
    });

    expect(layout.order).not.toContain("shapes");
    expect(layout.unpinned).toEqual(["shapes"]);
  });

  it("falls back to the default order when storage is empty or unreadable", () => {
    expect(readRailLayout().order).toEqual([...RAIL_TOOL_DEFAULTS]);

    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT,
      "{ this is not json",
    );
    expect(readRailLayout().order).toEqual([...RAIL_TOOL_DEFAULTS]);
  });

  it("round-trips a pre-0031 layout through storage without loss", () => {
    // The arrangement a browser stored before connectors retired into shapes.
    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT,
      JSON.stringify({
        order: [
          "templates",
          "text",
          "stickynote",
          "shapes",
          "connectors",
          "pen",
          "frame",
          "comment",
          "docblock",
          "ai",
        ],
        unpinned: [],
      }),
    );

    const layout = readRailLayout();
    writeRailLayout(layout);

    expect(readRailLayout()).toEqual(layout);
    expect(layout.order).toEqual([
      "templates",
      "text",
      "stickynote",
      "shapes",
      "pen",
      "frame",
      "comment",
      "docblock",
      "ai",
    ]);
  });

  it("round-trips an arrangement through storage", () => {
    const layout = reorderRailTools(defaultRailLayout(), [
      "selection",
      "pen",
      ...RAIL_TOOL_DEFAULTS.filter((id) => id !== "pen"),
    ]);
    writeRailLayout(layout);

    expect(stored()).not.toBeNull();
    expect(readRailLayout()).toEqual(layout);
    expect(readRailLayout().order[0]).toBe("pen");
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
    const hidden = unpinRailTool(defaultRailLayout(), "pen");
    expect(hidden.order).not.toContain("pen");
    expect(hidden.unpinned).toEqual(["pen"]);

    // Select and Hand are pinned: the request is a no-op, not an error.
    const layout = defaultRailLayout();
    expect(unpinRailTool(layout, "selection")).toBe(layout);
    expect(unpinRailTool(layout, "hand")).toBe(layout);
  });

  it("brings an unpinned tool back at the end of the row", () => {
    const hidden = unpinRailTool(defaultRailLayout(), "shapes");
    const restored = restoreRailTool(hidden, "shapes");

    expect(restored.unpinned).toEqual([]);
    expect(restored.order[restored.order.length - 1]).toBe("shapes");
  });

  it("is idempotent: restoring a visible tool changes nothing", () => {
    const layout = defaultRailLayout();
    expect(restoreRailTool(layout, "text")).toEqual(layout);
  });
});
