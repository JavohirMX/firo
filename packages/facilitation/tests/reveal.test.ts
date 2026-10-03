import { describe, expect, it } from "vitest";

import {
  DEFAULT_REVEAL_STATE,
  hasHidden,
  isVisible,
  setRevealMode,
  toggleReveal,
  visibleElements,
  type RevealState,
} from "../src/reveal.js";

const PRIVATE: RevealState = { mode: "private" };
const REVEALED: RevealState = { mode: "revealed" };

const note = (id: string, hidden: boolean | null | undefined = undefined) => ({
  id,
  hiddenUntilRevealed: hidden,
});

describe("private mode and reveal", () => {
  describe("the toggle", () => {
    it("starts revealed, so a board is never private by accident", () => {
      // The dangerous default is the other one: a board that opened private
      // would hide its own content with no way for a first-time user to know why.
      expect(DEFAULT_REVEAL_STATE.mode).toBe("revealed");
      expect(isVisible(note("a", true), DEFAULT_REVEAL_STATE)).toBe(true);
    });

    it("flips between the two modes", () => {
      const hidden = toggleReveal(REVEALED);
      expect(hidden.mode).toBe("private");
      expect(toggleReveal(hidden).mode).toBe("revealed");
    });

    it("sets a mode directly", () => {
      expect(setRevealMode(REVEALED, "private").mode).toBe("private");
    });

    it("returns a frozen state", () => {
      // The ephemeral merge freezes its result; a facilitator's toggle going
      // through the same path must not hand out a mutable object.
      expect(Object.isFrozen(toggleReveal(REVEALED))).toBe(true);
    });
  });

  describe("what is visible", () => {
    it("hides marked elements while private", () => {
      expect(isVisible(note("a", true), PRIVATE)).toBe(false);
    });

    it("shows unmarked elements while private", () => {
      expect(isVisible(note("a"), PRIVATE)).toBe(true);
      expect(isVisible(note("a", false), PRIVATE)).toBe(true);
    });

    it("shows everything once revealed", () => {
      expect(isVisible(note("a", true), REVEALED)).toBe(true);
    });

    it("treats absent, null and false as the same answer", () => {
      // A board written before private mode existed has no such field at all.
      // If `undefined` were not equivalent to `false` it would read as "hidden",
      // and every pre-existing board would open empty.
      expect(isVisible(note("a", undefined), PRIVATE)).toBe(true);
      expect(isVisible(note("a", null), PRIVATE)).toBe(true);
      expect(isVisible(note("a", false), PRIVATE)).toBe(true);
    });

    it("filters a list and preserves order", () => {
      const elements = [note("a"), note("b", true), note("c"), note("d", true)];
      expect(visibleElements(elements, PRIVATE).map((e) => e.id)).toEqual([
        "a",
        "c",
      ]);
      expect(visibleElements(elements, REVEALED)).toHaveLength(4);
    });
  });

  describe("the export leak", () => {
    it("reports whether anything is hidden, so export can warn first", () => {
      // The failure this exists to prevent: a facilitator hides a board to
      // collect honest ideas, then exports a PNG for the screen -- and the
      // hidden notes are in the file, because the exporter walks the scene
      // rather than asking what is visible.
      const elements = [note("a"), note("b", true)];

      expect(hasHidden(elements, PRIVATE)).toBe(true);
      expect(hasHidden(elements, REVEALED)).toBe(false);
      expect(hasHidden([note("a")], PRIVATE)).toBe(false);
      expect(hasHidden([], PRIVATE)).toBe(false);
    });

    it("gives the exporter the same answer the canvas gets", () => {
      // One function for both. Each caller filtering for itself is exactly how
      // the canvas filters and a later-added export path does not.
      const elements = [note("a", true), note("b")];
      const drawn = visibleElements(elements, PRIVATE);
      const exported = visibleElements(elements, PRIVATE);

      expect(drawn.map((e) => e.id)).toEqual(exported.map((e) => e.id));
      expect(exported.map((e) => e.id)).not.toContain("a");
    });
  });

  describe("the durable/ephemeral split", () => {
    it("keeps the per-element flag separate from the session toggle", () => {
      // The board-level toggle is ephemeral: closing the tab must not leave a
      // board stuck private. The per-element flag is durable: a note marked
      // "hide until reveal" must still be hidden when the board is reopened.
      // Conflating them loses one or the other, and neither loss is visible at
      // the moment it happens.
      const board = [note("a", true)];

      // Ephemeral state resets; the flags do not.
      expect(isVisible(board[0], DEFAULT_REVEAL_STATE)).toBe(true);
      expect(isVisible(board[0], setRevealMode(DEFAULT_REVEAL_STATE, "private")))
        .toBe(false);
      // The element's own flag is untouched by the toggle.
      expect(board[0].hiddenUntilRevealed).toBe(true);
    });
  });
});