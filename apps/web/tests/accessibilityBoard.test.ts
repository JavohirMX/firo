import { describe, expect, it, beforeEach } from "vitest";

import {
  COLOR_PALETTE,
  DEFAULT_STICKY_NOTE_BG,
  MIRO_STICKY_NOTE_COLORS,
} from "@firo/common";
import { asFractionalIndex } from "@firo/schema";

import { toAccessibilityItems, toElementsMap } from "../board/accessibility";
import {
  REDUCED_MOTION_CLASS,
  applyReducedMotion,
  readReducedMotion,
  writeReducedMotion,
} from "../board/reducedMotion";

/* eslint-disable @typescript-eslint/no-explicit-any */

const base = {
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  version: 1,
  versionNonce: 1,
  index: asFractionalIndex("a0"),
  created: 1,
  updated: 1,
  groupIds: [],
  frameId: null,
  containerId: null,
  boundElements: null,
  link: null,
  locked: false,
  isDeleted: false,
} as any;

const stickyNote = (id: string, backgroundColor: string) =>
  ({
    ...base,
    id,
    type: "stickynote",
    backgroundColor,
    // The text is *not* on the note — it is on a bound label. This is the
    // case the mapper has to read through.
    boundElements: [{ type: "text", id: `${id}-label` }],
  } as any);

const boundLabel = (id: string, containerId: string | null, text: string) =>
  ({
    ...base,
    id,
    type: "text",
    text,
    originalText: text,
    containerId,
    backgroundColor: "transparent",
    fontSize: 16,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    baseline: 10,
    lineHeight: 1.25,
    autoResize: true,
  } as any);

const freeText = (id: string, text: string) =>
  ({ ...boundLabel(id, null, text), containerId: null } as any);

const frame = (id: string, name: string) =>
  ({ ...base, id, type: "frame", name } as any);

const rectangle = (id: string, overrides: Record<string, unknown> = {}) =>
  ({ ...base, id, type: "rectangle", ...overrides } as any);

describe("board accessibility mapping", () => {
  it("reads a sticky note's text from its bound label", () => {
    const elements = [
      stickyNote("note-1", COLOR_PALETTE.yellow[1]),
      boundLabel("note-1-label", "note-1", "Write the RFC"),
    ];

    const items = toAccessibilityItems(elements, toElementsMap(elements));

    // The label is the note's text, not a second object.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "note-1",
      kind: "Sticky note",
      text: "Write the RFC",
      colorName: "Yellow",
    });
  });

  it("names the sticky-note palette, which is not the shape palette", () => {
    const elements = [
      stickyNote("note-1", MIRO_STICKY_NOTE_COLORS.yellowDark),
      boundLabel("note-1-label", "note-1", "Shipped"),
    ];

    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0].colorName).toBe("Dark yellow");
  });

  it("names the default sticky-note background", () => {
    const elements = [
      stickyNote("note-1", DEFAULT_STICKY_NOTE_BG),
      boundLabel("note-1-label", "note-1", "Default"),
    ];

    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0].colorName).toBe("Yellow");
  });

  it("reads a free-standing text element's own text", () => {
    const elements = [freeText("t1", "Hello")];
    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0]).toMatchObject({ kind: "Text", text: "Hello" });
  });

  it("reads a frame's name", () => {
    const elements = [frame("f1", "Discovery")];
    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0]).toMatchObject({ kind: "Frame", text: "Discovery" });
  });

  it("announces a locked element", () => {
    const elements = [rectangle("r1", { locked: true })];
    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0].locked).toBe(true);
  });

  it("omits a colour name for a colour that is not in the palette", () => {
    const elements = [rectangle("r1", { backgroundColor: "#123456" })];
    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items[0].colorName).toBeUndefined();
  });

  it("keeps the scene's order", () => {
    const elements = [
      rectangle("r1"),
      freeText("t1", "second"),
      frame("f1", "third"),
    ];
    const items = toAccessibilityItems(elements, toElementsMap(elements));

    expect(items.map((item) => item.id)).toEqual(["r1", "t1", "f1"]);
  });
});

describe("reduced motion, per session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults to off", () => {
    expect(readReducedMotion()).toBe(false);
  });

  it("round-trips through session storage", () => {
    writeReducedMotion(true);
    expect(readReducedMotion()).toBe(true);
    expect(window.sessionStorage.getItem("firo-reduced-motion")).toBe("1");

    writeReducedMotion(false);
    expect(readReducedMotion()).toBe(false);
    expect(window.sessionStorage.getItem("firo-reduced-motion")).toBeNull();
  });

  it("applies and removes the class on the document element", () => {
    applyReducedMotion(true);
    expect(
      document.documentElement.classList.contains(REDUCED_MOTION_CLASS),
    ).toBe(true);

    applyReducedMotion(false);
    expect(
      document.documentElement.classList.contains(REDUCED_MOTION_CLASS),
    ).toBe(false);
  });
});
