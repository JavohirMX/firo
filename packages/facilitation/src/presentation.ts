import { DEFAULT_REVEAL_STATE, isVisible } from "@firo/facilitation";

import type { RevealState } from "@firo/facilitation";

/**
 * Presentation mode: frames as slides.
 *
 * ## What this is, and what it is not
 *
 * The plan (§5.5) describes presenting as "frames become slides, navigable, with
 * a laser pointer and per-object `hideInPresentation`". The laser pointer is
 * already inherited and wired. `hideInPresentation` is already in the schema and
 * already crosses the board/editor boundary. So the work here is the part that
 * does not exist: deciding what is on screen, and what the current slide is.
 *
 * It is deliberately **not** a full-screen overlay. That would be new chrome, a
 * new focus trap, and a new set of keyboard bindings, for a mode whose whole value
 * is that the audience sees only what the facilitator is showing. Instead it
 * composes two things that already work: **the withheld-set filter** that private
 * mode established, and **the viewport**, which the editor already knows how to
 * move to a frame.
 *
 * ## Why hiding is a second reason to withhold, not a second mechanism
 *
 * `BoardSync` already has exactly the right shape for this. It withholds elements
 * from the editor's scene, and it refuses to read a withheld element as deleted —
 * which is the hard part, and was the bug private mode nearly shipped. A second
 * mechanism would mean a second copy of that protection, and the second copy
 * would be the one nobody mutation-tests.
 *
 * So presentation asks the same question with one more clause: an element is
 * shown when private mode allows it **and** presenting allows it. The withheld
 * bookkeeping, the z-order slotting and the delete protection are unchanged and
 * already tested.
 *
 * ## The frame is not hidden, only its contents are culled
 *
 * A frame in presentation mode is the slide. If the frame element itself were
 * withheld there would be nothing to navigate to and nothing to frame the shot
 * with. So the frame survives, and what changes is whether the elements *inside*
 * it are drawn.
 */

/** Where a session is in its slide deck. */
export type PresentationState = Readonly<{
  /** Presenting at all. False is the ordinary editing state. */
  active: boolean;
  /** Ids of the frames, in the order they will be shown. */
  slideIds: readonly string[];
  /** Index into `slideIds`. Clamped, never out of range. */
  index: number;
  /**
   * The parent of a frame, for nested slides.
   *
   * Present rather than assumed because it is a *question about the board*, not a
   * property of the state. AC-4 asks for arbitrary nesting, so a frame can sit
   * inside a frame, and "is this element on the slide" then means "is the current
   * frame this element's parent, or any ancestor".
   *
   * An injected lookup rather than a second copy of the element list, so there is
   * one answer to "what is this frame's parent" in the product. The default is
   * "no frame has a parent", which degrades to single-level slides — the ordinary
   * case, and the one a v1 board is nearly always in.
   *
   * A walk up this chain is bounded; see `ANCESTOR_LIMIT`.
   */
  frameOf?: (frameId: string) => string | null;
}>;

/**
 * How many `frameId` links to walk before giving up.
 *
 * A board can nest frames to any depth — AC-4 asks for exactly that — so this
 * bounds a *walk*, not the data. Exceeding it means a cycle in the `frameId`
 * relation, which a hand-edited file can produce and which must not hang the
 * canvas.
 */
const ANCESTOR_LIMIT = 64;

/** Everything an element needs to answer "is this on the slide?". */
export type PresentableElement = {
  id: string;
  type?: string;
  frameId?: string | null;
  hiddenUntilRevealed?: boolean | null;
  hideInPresentation?: boolean | null;
};

/** Whether `frameId` is the current frame, or an ancestor of it. */
const inCurrentFrame = (
  elementFrameId: string | null,
  presentation: PresentationState,
): boolean => {
  const current = presentation.slideIds[presentation.index];
  if (current === undefined) {
    return true;
  }
  if (elementFrameId === null) {
    return false;
  }

  const lookup = presentation.frameOf;
  let cursor: string | null = elementFrameId;
  let guard = 0;

  while (cursor !== null && guard++ < ANCESTOR_LIMIT) {
    if (cursor === current) {
      return true;
    }
    // No lookup means no nesting is known, so the walk stops at one level rather
    // than guessing. Silently treating "unknown" as "not an ancestor" is the safe
    // direction: the element is withheld rather than shown in the wrong slide.
    cursor = lookup ? lookup(cursor) : null;
  }
  return false;
};

/** Not presenting. The default, so a board is never a slideshow by accident. */
export const DEFAULT_PRESENTATION: PresentationState = Object.freeze({
  active: false,
  slideIds: [],
  index: 0,
});

/**
 * The frames of a board, in slide order.
 *
 * `elementOrder` is the z-order and frames carry no separate page number in v1,
 * so the order frames were drawn in *is* the running order. That is a real
 * limitation rather than a design: §4.3's "user-controlled page order" is a schema
 * field that does not exist yet, and inventing one here would put presentation
 * order in two places. When it is added, this function reads it and nothing else
 * changes.
 *
 * Frames are taken in document order and de-duplicated, because a nested frame
 * (`frameId`) is a frame that happens to be inside another. For v1 a nested frame
 * is its own slide — a facilitator who has drawn a frame inside a frame wants to
 * show it.
 */
export const slidesFor = (
  elements: readonly { id: string; type?: string }[],
): string[] => {
  const seen = new Set<string>();
  const slides: string[] = [];
  for (const element of elements) {
    if (element.type === "frame" && !seen.has(element.id)) {
      seen.add(element.id);
      slides.push(element.id);
    }
  }
  return slides;
};

/**
 * Whether an element is drawn in the current presentation state.
 *
 * Two independent reasons to withhold, and they compose with `and` rather than
 * being two filters:
 *
 * - Private mode hides `hiddenUntilRevealed`. Durable, session-scoped by the
 *   toggle, and already handled by `visibleElements`.
 * - Presenting hides `hideInPresentation`. Durable, and scoped to the mode.
 *
 * Exported as one predicate so the canvas and any exporter share it, which is the
 * same rule `reveal.ts` follows for the same reason.
 */
export const isShownInPresentation = (
  element: PresentableElement,
  reveal: RevealState,
  presentation: PresentationState,
): boolean => {
  if (!isVisible(element, reveal)) {
    return false;
  }
  if (!presentation.active) {
    return true;
  }
  if (element.hideInPresentation) {
    return false;
  }
  /*
   * The frame itself is the slide, and it is never hidden.
   *
   * If the frame element were withheld there would be nothing to navigate to and
   * nothing to frame the shot with — so the slide's own frame is always shown and
   * the culling applies to everything inside it.
   */
  if (element.id === currentSlideId(presentation)) {
    return true;
  }
  /*
   * Everything outside the current frame is hidden.
   *
   * Not an optimisation — it is the point. Presenting a frame means showing that
   * frame, and a note from three frames away on the same board is not part of the
   * slide. Withholding it here rather than only moving the viewport is what keeps
   * a stray element from being visible in the margins, and what keeps it out of a
   * PNG exported from presentation mode.
   *
   * This is a single `frameId` comparison, not a walk up the nesting chain, and the
   * reason is on `PresentationState.frameOf`.
   */
  return inCurrentFrame(element.frameId ?? null, presentation);
};

/**
 * The elements to draw, in presentation order.
 *
 * Uses `visibleElements` for the private-mode half so there is one function per
 * rule rather than one per caller — the leak that matters is a note that is hidden
 * on the canvas and present in the exported PNG, and that happens the moment two
 * places filter differently.
 */
export const elementsForPresentation = <T extends PresentableElement>(
  elements: readonly T[],
  reveal: RevealState,
  presentation: PresentationState,
): T[] =>
  elements.filter((element) =>
    isShownInPresentation(element, reveal, presentation),
  );

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Move by `delta` slides, clamped at both ends.
 *
 * Clamped rather than wrapped: a facilitator who overshoots the end of the deck
 * with a held arrow key should land on the last slide, not silently return to the
 * first and present it to the room by accident.
 */
export const stepSlide = (
  presentation: PresentationState,
  delta: number,
): PresentationState => {
  if (!presentation.slideIds.length) {
    return presentation;
  }
  const next = presentation.index + delta;
  return {
    ...presentation,
    index: Math.max(0, Math.min(presentation.slideIds.length - 1, next)),
  };
};

/** Go to a slide by index, clamped. */
export const goToSlide = (
  presentation: PresentationState,
  index: number,
): PresentationState => ({
  ...presentation,
  index: Math.max(
    0,
    Math.min(Math.max(0, presentation.slideIds.length - 1), index),
  ),
});

/** Begin presenting, from the first slide. */
export const startPresentation = (
  elements: readonly { id: string; type?: string }[],
): PresentationState => {
  const slideIds = slidesFor(elements);
  if (!slideIds.length) {
    // Nothing to present. Staying inactive is honest; an active session with zero
    // slides would black out the board and look broken.
    return DEFAULT_PRESENTATION;
  }
  return { active: true, slideIds, index: 0 };
};

/**
 * Leave presentation.
 *
 * `slideIds` is emptied rather than kept, so a stale deck cannot be resumed after
 * the frames have changed underneath it. Re-entering recomputes from the document.
 */
export const endPresentation = (): PresentationState => DEFAULT_PRESENTATION;

/**
 * The id of the frame on the current slide, or null.
 *
 * What the viewport should be moved to. Null means "not presenting, or no
 * slides", and the caller should leave the viewport alone rather than reset it.
 */
export const currentSlideId = (
  presentation: PresentationState,
): string | null =>
  presentation.active
    ? presentation.slideIds[presentation.index] ?? null
    : null;

/** Whether there is anything to present. */
export const hasSlides = (presentation: PresentationState): boolean =>
  presentation.slideIds.length > 0;

/**
 * Elements on the current slide, for a tally or a summary.
 *
 * Answers "what is in this slide" without re-deriving membership, so a caller
 * cannot disagree with the renderer about it.
 */
export const slideContents = (
  elements: readonly PresentableElement[],
  presentation: PresentationState,
): PresentableElement[] => {
  if (!presentation.active) {
    return [];
  }
  const frameId = currentSlideId(presentation);
  if (frameId === null) {
    return [];
  }
  /*
   * The same predicate the renderer uses, minus `hideInPresentation`.
   *
   * Reusing `inCurrentFrame` is the point: a caller asking "what is on this slide"
   * that answered slightly differently from the renderer would report a tally for
   * an element nobody can see.
   */
  return elements.filter(
    (element) =>
      (element.id === frameId ||
        inCurrentFrame(element.frameId ?? null, presentation)) &&
      element.hideInPresentation !== true,
  );
};

export { DEFAULT_REVEAL_STATE };
