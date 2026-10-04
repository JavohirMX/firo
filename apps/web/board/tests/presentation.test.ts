import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { FiroElement } from "@firo/schema";

import {
  boardHasSlides,
  focusFrame,
  getPresentation,
  startPresenting,
  stepPresentation,
  stopPresenting,
} from "../presentation";

/*
 * The app-side seam for presentation mode.
 *
 * ## What is being tested, given `presentation.test.ts` in `@firo/facilitation`
 * already exists
 *
 * That file owns the decision: what is on a slide, what the current slide is, and
 * how navigation clamps. It knows nothing about the document, the editor or the
 * viewport. This file is the other half — the three things that can only be wrong
 * here:
 *
 * 1. **Nothing is written.** Presentation is ephemeral (rule 1). If starting a deck
 *    commits to the document, every slide change becomes a durable update, an undo
 *    entry and a broadcast — 300 of them for a five-minute talk with a held arrow
 *    key. That is the same failure the timer's anchor-not-countdown design exists
 *    to prevent, and it is invisible in the UI until someone opens the file and
 *    finds the board has an undo history.
 *
 * 2. **The canvas is repainted.** `FiroDoc.subscribe` does not fire for an
 *    ephemeral write, so nothing repaints on its own. A seam that forgot `refresh`
 *    would leave the board looking exactly as it did, which reads as the feature
 *    doing nothing.
 *
 * 3. **The viewport moves, and moves to the right frame.** A presenter looking at
 *    a deck whose viewport never moves is looking at slide one for the whole talk.
 */

/** A frame at a known position and size, so a viewport move is checkable. */
const frame = (id: string, x = 0): FiroElement =>
  ({
    id,
    type: "frame",
    x,
    y: 0,
    width: 400,
    height: 300,
    angle: 0,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    link: null,
    locked: false,
    created: 1000,
    updated: 1000,
    name: id,
  } as unknown as FiroElement);

/** A note, which is never a slide however many of them there are. */
const note = (id: string, frameId: string | null = null): FiroElement =>
  ({
    ...frame(id),
    type: "rectangle",
    frameId,
  } as unknown as FiroElement);

const boardWith = (...elements: FiroElement[]) => {
  const doc = new FiroDoc(new Y.Doc());
  const refresh = vi.fn();
  const getDocument = () => doc;
  doc.commit(
    elements.map((element) => ({ kind: "createElement", element } as never)),
  );
  return { doc, getDocument, refresh };
};

/** Just enough editor to observe a viewport move. */
const fakeApi = () => {
  const scenes: unknown[] = [];
  return {
    api: {
      getAppState: () => ({ width: 1000, height: 800 }),
      getViewportOffsets: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
      updateScene: (payload: { appState?: Record<string, unknown> }) => {
        scenes.push(payload.appState);
      },
    } as unknown as ExcalidrawImperativeAPI,
    scenes,
  };
};

describe("starting a presentation", () => {
  it("puts the board into the first slide", () => {
    const { getDocument } = boardWith(
      frame("f1"),
      frame("f2"),
      note("n1", "f1"),
    );

    const next = startPresenting(getDocument);

    expect(next.active).toBe(true);
    expect(next.slideIds).toEqual(["f1", "f2"]);
    expect(next.index).toBe(0);
  });

  it("takes slides in the order the frames were drawn", () => {
    // Z-order is the only ordering v1 has. Documenting it as a test means that when
    // §4.3's user-controlled page order arrives, this is the assertion that changes
    // rather than the one that quietly stops describing what happens.
    const { getDocument } = boardWith(
      frame("f2", 500),
      note("n1"),
      frame("f1", 0),
    );

    expect(startPresenting(getDocument).slideIds).toEqual(["f2", "f1"]);
  });

  it("commits nothing to the document", () => {
    const { doc, getDocument } = boardWith(frame("f1"), frame("f2"));

    const before = doc.durableUpdates;
    startPresenting(getDocument);
    stepPresentation(getDocument, 1);
    stopPresenting(getDocument);

    /*
     * The assertion that matters most in this file.
     *
     * Every one of those three calls is a mode change a facilitator makes
     * repeatedly — stepping through five slides is four writes — and if any of them
     * reaches the document it becomes an undo step and a broadcast. Undo would then
     * walk backwards through a deck the user never edited, labelled "next slide".
     */
    expect(doc.durableUpdates).toBe(before);
  });

  it("refuses to present a board with no frames", () => {
    const { getDocument } = boardWith(note("n1"), note("n2"));

    const next = startPresenting(getDocument);

    // Not an active session with zero slides, which would black out the board and
    // look broken. Staying put is the honest answer.
    expect(next.active).toBe(false);
    expect(getPresentation(getDocument).active).toBe(false);
  });

  it("repaints, so the canvas actually changes", () => {
    const { getDocument, refresh } = boardWith(frame("f1"));

    startPresenting(getDocument, undefined, refresh);

    /*
     * Without this the seam is correct and useless: the ephemeral write lands, the
     * state reads back right, and the board on screen never changes — because
     * nothing durable happened and nothing durable is what triggers a repaint.
     */
    expect(refresh).toHaveBeenCalled();
  });
});

describe("moving between slides", () => {
  const deck = () => boardWith(frame("f1"), frame("f2"), frame("f3"));

  it("advances and goes back", () => {
    const { getDocument } = deck();
    startPresenting(getDocument);

    expect(stepPresentation(getDocument, 1).index).toBe(1);
    expect(stepPresentation(getDocument, -1).index).toBe(0);
  });

  it("stops at the last slide rather than wrapping", () => {
    const { getDocument } = deck();
    startPresenting(getDocument);

    stepPresentation(getDocument, 1);
    stepPresentation(getDocument, 1);
    expect(stepPresentation(getDocument, 1).index).toBe(2);
  });

  it("stops at the first slide too", () => {
    const { getDocument } = deck();
    startPresenting(getDocument);

    expect(stepPresentation(getDocument, -1).index).toBe(0);
  });

  it("does not write, repaint or move when the index would not change", () => {
    // `stepSlide` returns the *same object* when it has nowhere to go, and that is
    // the signal this branch is written against. A clamp that rebuilt an equal state
    // would still pull, still focus, and still write ephemeral state for nothing.
    const { getDocument, refresh } = deck();
    startPresenting(getDocument, undefined, refresh);
    refresh.mockClear();

    const before = getPresentation(getDocument);
    expect(stepPresentation(getDocument, -1)).toBe(before);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("stopping", () => {
  it("empties the deck, so re-entering recomputes it", () => {
    // A stale deck resumed after the frames changed underneath it would present
    // slides that are no longer on the board.
    const { getDocument } = boardWith(frame("f1"), frame("f2"));
    startPresenting(getDocument);

    const stopped = stopPresenting(getDocument);

    expect(stopped.active).toBe(false);
    expect(stopped.slideIds).toEqual([]);
  });

  it("repaints on the way out, which is the step that matters", () => {
    // Stopping without a pull leaves the canvas filtered to the last slide, with
    // nothing on the board able to undo it.
    const { getDocument, refresh } = boardWith(frame("f1"));
    startPresenting(getDocument, undefined, refresh);
    refresh.mockClear();

    stopPresenting(getDocument, refresh);

    expect(refresh).toHaveBeenCalled();
  });

  it("leaves the viewport where the presenter put it", () => {
    // Presenting moves the viewport; un-presenting does not move it back. Where the
    // presenter ended up is a better answer than where they started, and restoring
    // would fight a presenter who has framed something deliberately.
    const { getDocument } = boardWith(frame("f1"));
    const { api, scenes } = fakeApi();

    startPresenting(getDocument, api);
    scenes.length = 0;
    stopPresenting(getDocument);

    expect(scenes).toEqual([]);
  });
});

describe("moving the viewport", () => {
  it("fits the current slide's frame", () => {
    const { getDocument } = boardWith(frame("f1"), frame("f2", 900));
    const { api, scenes } = fakeApi();

    startPresenting(getDocument, api);

    // One move, carrying a zoom rather than leaving the scale alone.
    expect(scenes).toHaveLength(1);
    const viewport = scenes[0] as { scrollX: number; zoom: { value: number } };
    expect(viewport.zoom.value).toBeGreaterThan(0);
  });

  it("moves again on every slide change, and not on an overshoot", () => {
    const { getDocument } = boardWith(frame("f1"), frame("f2", 900));
    const { api, scenes } = fakeApi();

    startPresenting(getDocument, api);
    stepPresentation(getDocument, 1, api);
    // Already on the last slide. A facilitator holding the arrow key at the end of
    // a deck should not see the frame twitch back and forth, so the overshoot is
    // not a slide change and must not move anything.
    stepPresentation(getDocument, 1, api);

    expect(scenes).toHaveLength(2);
  });

  it("moves to a different place for a different slide", () => {
    // Not just "a viewport update happened" — the two slides are a long way apart,
    // so an implementation that moved the viewport while ignoring *which* frame it
    // was on would pass a call-count assertion and fail this one.
    const { getDocument } = boardWith(frame("f1"), frame("f2", 900));
    const { api, scenes } = fakeApi();

    startPresenting(getDocument, api);
    stepPresentation(getDocument, 1, api);

    const [first, second] = scenes as { scrollX: number }[];
    expect(second.scrollX).not.toBe(first.scrollX);
  });

  it("writes only the three viewport fields", () => {
    // `zoomToFitBounds` hands back the app state it was given, spread. Feeding that
    // to `updateScene` re-applies every field as a change, which is how a selection
    // or an open dialog gets closed by a presenter pressing the right arrow.
    const { getDocument } = boardWith(frame("f1"));
    const { api, scenes } = fakeApi();

    startPresenting(getDocument, api);

    expect(Object.keys(scenes[0] as object).sort()).toEqual([
      "scrollX",
      "scrollY",
      "zoom",
    ]);
  });

  it("does nothing when the canvas has not been measured", () => {
    // Fitting against a zero-sized viewport divides by zero inside
    // `zoomToFitBounds`. The honest answer to "present a board that has not been
    // laid out" is "not yet".
    const { getDocument } = boardWith(frame("f1"));
    const scenes: unknown[] = [];
    const api = {
      getAppState: () => ({ width: 0, height: 0 }),
      getViewportOffsets: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
      updateScene: (payload: { appState?: Record<string, unknown> }) => {
        scenes.push(payload.appState);
      },
    } as unknown as ExcalidrawImperativeAPI;

    startPresenting(getDocument, api);

    expect(scenes).toEqual([]);
  });

  it("does nothing when the frame is gone", () => {
    // A collaborator can delete a frame between the deck being computed and the
    // viewport moving. A presenter whose keypress threw would get no toast and no
    // movement, which is indistinguishable from the shortcut being unbound.
    const { getDocument } = boardWith(frame("f1"));
    const { api, scenes } = fakeApi();

    focusFrame(api, getDocument, "not-a-frame");

    expect(scenes).toEqual([]);
  });
});

describe("whether there is anything to present", () => {
  it("answers from the board, not from the current state", () => {
    // The question a facilitator is really asking is "does this board have frames?",
    // and the answer must not depend on whether they are already presenting. Reading
    // the live state would say "no" for a board they were halfway through.
    const { getDocument } = boardWith(frame("f1"), frame("f2"));

    expect(boardHasSlides(getDocument)).toBe(true);

    startPresenting(getDocument);
    expect(boardHasSlides(getDocument)).toBe(true);

    stopPresenting(getDocument);
    expect(boardHasSlides(getDocument)).toBe(true);
  });

  it("says no for a board with no frames", () => {
    const { getDocument } = boardWith(note("n1"));

    expect(boardHasSlides(getDocument)).toBe(false);
  });
});
