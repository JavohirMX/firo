import { describe, expect, it } from "vitest";

import {
  createHighlighterSession,
  HIGHLIGHTER_STYLE,
  type PenStyle,
} from "../highlighter";

const pen: PenStyle = {
  currentItemStrokeColor: "#1e1e1e",
  currentItemStrokeWidthKey: "thin",
  currentItemOpacity: 100,
};

describe("highlighter session", () => {
  it("applies the preset and restores the ordinary pen exactly", () => {
    const s = createHighlighterSession();
    expect(s.active).toBe(false);
    expect(s.enter(pen)).toEqual(HIGHLIGHTER_STYLE);
    expect(s.active).toBe(true);
    expect(s.leave()).toEqual(pen);
    expect(s.active).toBe(false);
  });

  it("never saves the highlighter style as the pen when re-entered", () => {
    const s = createHighlighterSession();
    s.enter(pen);
    s.enter(HIGHLIGHTER_STYLE);
    expect(s.leave()).toEqual(pen);
  });

  it("leave without enter is a no-op", () => {
    expect(createHighlighterSession().leave()).toBeNull();
  });

  it("supports switching in both directions repeatedly", () => {
    const s = createHighlighterSession();
    const custom: PenStyle = { ...pen, currentItemStrokeColor: "#e03131" };
    s.enter(custom);
    expect(s.leave()).toEqual(custom);
    s.enter(pen);
    expect(s.leave()).toEqual(pen);
  });
});
