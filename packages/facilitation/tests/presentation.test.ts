import { describe, expect, it } from "vitest";

import {
  currentSlideId,
  DEFAULT_PRESENTATION,
  endPresentation,
  elementsForPresentation,
  goToSlide,
  hasSlides,
  isShownInPresentation,
  slideContents,
  slidesFor,
  startPresentation,
  stepSlide,
  type PresentableElement,
  type PresentationState,
} from "../src/presentation.js";

import { DEFAULT_REVEAL_STATE } from "../src/reveal.js";

/*
 * Presentation mode.
 *
 * The property everything else serves: **what is drawn and what is exported are
 * the same question with one answer.** So most of these tests compare the
 * predicate against the list function, because that is the failure that matters —
 * an element hidden on the canvas and present in a PNG exported from it.
 *
 * The second property is that nothing is ever *deleted*. Presentation withholds
 * from the scene, and `BoardSync` already refuses to read a withheld element as
 * deleted; that protection is tested in `packages/board`, not here.
 */

const REVEALED = DEFAULT_REVEAL_STATE;
const PRIVATE = { mode: "private" as const };

const el = (
  over: Partial<PresentableElement> & { id: string },
): PresentableElement => ({
  type: "stickynote",
  ...over,
});

/** A board of three frames, each with two notes. Notes 2 and 3 sit in frames. */
const board = (): PresentableElement[] => [
  el({ id: "frame-1", type: "frame" }),
  el({ id: "frame-2", type: "frame" }),
  el({ id: "frame-3", type: "frame" }),
  el({ id: "a1", frameId: "frame-1" }),
  el({ id: "a2", frameId: "frame-1" }),
  el({ id: "b1", frameId: "frame-2" }),
  el({ id: "c1", frameId: "frame-3" }),
  // Floating: no frame at all.
  el({ id: "loose" }),
];

const ids = (elements: readonly PresentableElement[]) =>
  elements.map((e) => e.id);

describe("presentation mode", () => {
  describe("starting and stopping", () => {
    it("starts inactive, so a board is never a slideshow by accident", () => {
      expect(DEFAULT_PRESENTATION.active).toBe(false);
      expect(hasSlides(DEFAULT_PRESENTATION)).toBe(false);
    });

    it("takes its slides from the frames, in document order", () => {
      expect(slidesFor(board())).toEqual(["frame-1", "frame-2", "frame-3"]);
    });

    it("starts on the first slide", () => {
      const state = startPresentation(board());
      expect(state.active).toBe(true);
      expect(state.index).toBe(0);
      expect(currentSlideId(state)).toBe("frame-1");
    });

    it("refuses to start on a board with no frames", () => {
      // An active session with zero slides would black out the board and look
      // broken. Staying inactive is the honest answer.
      const state = startPresentation([el({ id: "a" }), el({ id: "b" })]);
      expect(state.active).toBe(false);
      expect(state.slideIds).toEqual([]);
    });

    it("forgets its deck on the way out", () => {
      // A stale deck resumed after the frames changed underneath it would present
      // slides that no longer exist.
      const state = endPresentation();
      expect(state.active).toBe(false);
      expect(state.slideIds).toEqual([]);
      expect(currentSlideId(state)).toBeNull();
    });

    it("deduplicates a frame id", () => {
      // Defensive: a document with a repeated id must not produce a deck that
      // presents the same slide twice.
      const slides = slidesFor([
        el({ id: "f", type: "frame" }),
        el({ id: "f", type: "frame" }),
      ]);
      expect(slides).toEqual(["f"]);
    });
  });

  describe("what is on the slide", () => {
    it("shows the current frame and its contents, and nothing else", () => {
      const state = startPresentation(board());
      expect(
        ids(elementsForPresentation(board(), REVEALED, state)).sort(),
      ).toEqual(["a1", "a2", "frame-1"]);
    });

    it("moves with the slide", () => {
      const state = goToSlide(startPresentation(board()), 1);
      expect(
        ids(elementsForPresentation(board(), REVEALED, state)).sort(),
      ).toEqual(["b1", "frame-2"]);
    });

    it("hides a floating note, because it is not on any slide", () => {
      // The case that separates "presenting a frame" from "moving the viewport".
      // Scrolling to the frame would leave the loose note visible in the margin.
      const state = startPresentation(board());
      expect(
        ids(elementsForPresentation(board(), REVEALED, state)),
      ).not.toContain("loose");
    });

    it("hides an element flagged hideInPresentation", () => {
      const state = startPresentation(board());
      const withFlag = [
        ...board(),
        el({ id: "secret", frameId: "frame-1", hideInPresentation: true }),
      ];
      expect(
        ids(elementsForPresentation(withFlag, REVEALED, state)),
      ).not.toContain("secret");
    });

    it("shows a hideInPresentation element when not presenting", () => {
      // The flag is scoped to the mode. A note excluded from a slide must still be
      // there in the editor, or un-flagging it would be the only way to see it.
      const elements = [el({ id: "x", hideInPresentation: true })];
      expect(
        ids(elementsForPresentation(elements, REVEALED, DEFAULT_PRESENTATION)),
      ).toEqual(["x"]);
    });

    it("still honours private mode while presenting", () => {
      // Two reasons to withhold, composed. A board that is private and being
      // presented must hide both the brainstorm notes and the other slides.
      const state = startPresentation(board());
      const elements = [
        ...board(),
        el({ id: "hidden", frameId: "frame-1", hiddenUntilRevealed: true }),
      ];
      const shown = ids(elementsForPresentation(elements, PRIVATE, state));
      expect(shown).not.toContain("hidden");
      expect(shown).not.toContain("frame-2");
    });

    it("shows everything when not presenting, whatever the flags", () => {
      const elements = [
        el({ id: "a", hiddenUntilRevealed: true }),
        el({ id: "b", hideInPresentation: true }),
      ];
      // Private mode still applies while not presenting; the presentation flag
      // does not. Asserting both halves, because "shows everything" would pass for
      // the wrong reason if private mode were also broken.
      expect(
        ids(elementsForPresentation(elements, REVEALED, DEFAULT_PRESENTATION)),
      ).toEqual(["a", "b"]);
      expect(
        ids(elementsForPresentation(elements, PRIVATE, DEFAULT_PRESENTATION)),
      ).toEqual(["b"]);
    });

    it("shows everything when the index is past the end", () => {
      // A facilitator who has not chosen a frame should see their board rather
      // than a black screen.
      const state: PresentationState = {
        active: true,
        slideIds: ["frame-1"],
        index: 7,
      };
      expect(
        elementsForPresentation(board(), REVEALED, state).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("nested frames", () => {
    // AC-4 asks for nesting to any depth, so "is this on the slide" has to mean
    // "is the current frame this element's parent, or any ancestor". A single
    // `===` would hide the contents of a nested frame.
    const frameOf = (parents: Record<string, string>) => (id: string) =>
      parents[id] ?? null;

    it("includes the contents of a frame inside the current frame", () => {
      const state = startPresentation(board());
      const nested: PresentationState = {
        ...state,
        frameOf: frameOf({ inner: "frame-1" }),
      };
      const elements = [
        ...board(),
        el({ id: "inner", type: "frame", frameId: "frame-1" }),
        el({ id: "deep", frameId: "inner" }),
      ];
      const shown = ids(elementsForPresentation(elements, REVEALED, nested));
      expect(shown).toContain("deep");
    });

    it("excludes a frame nested inside a *different* frame", () => {
      const state = startPresentation(board());
      const nested: PresentationState = {
        ...state,
        frameOf: frameOf({ inner: "frame-2" }),
      };
      const elements = [
        ...board(),
        el({ id: "inner", type: "frame", frameId: "frame-2" }),
        el({ id: "deep", frameId: "inner" }),
      ];
      expect(
        ids(elementsForPresentation(elements, REVEALED, nested)),
      ).not.toContain("deep");
    });

    it("walks several levels", () => {
      const state = startPresentation(board());
      const nested: PresentationState = {
        ...state,
        frameOf: frameOf({ l3: "l2", l2: "l1", l1: "frame-1" }),
      };
      const elements = [el({ id: "deep", frameId: "l3" })];
      expect(ids(elementsForPresentation(elements, REVEALED, nested))).toEqual([
        "deep",
      ]);
    });

    it("survives a cycle in frameId rather than hanging", () => {
      // A hand-edited file can produce `a.frameId = b, b.frameId = a`. The walk is
      // bounded so the canvas cannot be wedged by it.
      const state = startPresentation(board());
      const cyclic: PresentationState = {
        ...state,
        frameOf: frameOf({ a: "b", b: "a" }),
      };
      const elements = [el({ id: "x", frameId: "a" })];
      expect(elementsForPresentation(elements, REVEALED, cyclic)).toHaveLength(
        0,
      );
    });

    it("treats unknown nesting as not-a-descendant, not as shown", () => {
      // No `frameOf` means no nesting is known. Withholding is the safe direction:
      // the alternative shows an element on the wrong slide.
      const state = startPresentation(board());
      const elements = [el({ id: "x", frameId: "some-frame" })];
      expect(elementsForPresentation(elements, REVEALED, state)).toHaveLength(
        0,
      );
    });
  });

  describe("navigation", () => {
    it("steps forward and back", () => {
      const state = startPresentation(board());
      expect(stepSlide(state, 1).index).toBe(1);
      expect(stepSlide(stepSlide(state, 1), -1).index).toBe(0);
    });

    it("clamps at the end rather than wrapping", () => {
      // A facilitator who overshoots with a held arrow key should land on the last
      // slide, not silently return to the first and present it to the room.
      const state = startPresentation(board());
      const past = stepSlide(stepSlide(stepSlide(state, 1), 1), 1);
      expect(past.index).toBe(2);
      expect(currentSlideId(past)).toBe("frame-3");
    });

    it("clamps at zero going back", () => {
      const state = startPresentation(board());
      expect(stepSlide(state, -5).index).toBe(0);
    });

    it("clamps a direct jump", () => {
      const state = startPresentation(board());
      expect(goToSlide(state, 99).index).toBe(2);
      expect(goToSlide(state, -3).index).toBe(0);
    });

    it("does nothing with no slides", () => {
      expect(stepSlide(DEFAULT_PRESENTATION, 1)).toBe(DEFAULT_PRESENTATION);
      expect(goToSlide(DEFAULT_PRESENTATION, 2).index).toBe(0);
    });
  });

  describe("one answer, two callers", () => {
    it("slideContents agrees with what is drawn", () => {
      // The failure this rules out: a caller asking "what is on this slide"
      // answering slightly differently from the renderer, so a tally reports an
      // element nobody can see.
      const state = goToSlide(startPresentation(board()), 1);
      const elements = board();

      const drawn = ids(elementsForPresentation(elements, REVEALED, state));
      const contents = ids(slideContents(elements, state));

      for (const id of contents) {
        expect(drawn).toContain(id);
      }
    });

    it("slideContents excludes hideInPresentation elements", () => {
      const state = startPresentation(board());
      const elements = [
        ...board(),
        el({ id: "secret", frameId: "frame-1", hideInPresentation: true }),
      ];
      expect(ids(slideContents(elements, state))).not.toContain("secret");
    });

    it("slideContents is empty when not presenting", () => {
      expect(slideContents(board(), DEFAULT_PRESENTATION)).toEqual([]);
    });

    it("the predicate and the list agree element for element", () => {
      // Exhaustively, over a board with every combination of the three flags.
      const state = startPresentation(board());
      const elements: PresentableElement[] = [
        el({ id: "plain", frameId: "frame-1" }),
        el({ id: "h", frameId: "frame-1", hiddenUntilRevealed: true }),
        el({ id: "p", frameId: "frame-1", hideInPresentation: true }),
        el({
          id: "hp",
          frameId: "frame-1",
          hiddenUntilRevealed: true,
          hideInPresentation: true,
        }),
        el({ id: "elsewhere", frameId: "frame-2" }),
        el({ id: "loose" }),
      ];
      for (const reveal of [REVEALED, PRIVATE]) {
        const listed = new Set(
          ids(elementsForPresentation(elements, reveal, state)),
        );
        for (const element of elements) {
          const shown = isShownInPresentation(element, reveal, state);
          expect(listed.has(element.id), `${element.id} / ${reveal.mode}`).toBe(
            shown,
          );
        }
      }
    });
  });
});
