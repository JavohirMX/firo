/*
 * `@firo/element/bounds`, not the `@firo/element` barrel, and the reason is worth
 * more than the line it sits on.
 *
 * Importing any *value* from the barrel pulls in `restore.ts` and the linear-element
 * editor with it, and from `apps/web` that costs **nine minutes** of `tsc` instead
 * of fifteen seconds -- measured, by removing and restoring this one line. Nothing
 * about the work changes; the app's type graph simply stops being able to skip the
 * element package's implementation.
 *
 * So: narrow subpath for a narrow need. `@firo/element/types` was already imported
 * type-only elsewhere in this directory, which is why nobody had hit this.
 */
import { getCommonBounds } from "@firo/element/bounds";
import { zoomToFitBounds } from "@firo/editor/viewport";
import {
  currentSlideId,
  DEFAULT_PRESENTATION,
  endPresentation,
  goToSlide,
  hasSlides,
  startPresentation,
  stepSlide,
} from "@firo/facilitation";
import { CaptureUpdateAction } from "@firo/editor";

import type { FiroDoc } from "@firo/doc";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { PresentationState } from "@firo/facilitation";
import type { FiroElement } from "@firo/schema";

import { announceFacilitationChange } from "./facilitator";

/**
 * The app-side seam for presentation mode.
 *
 * ## What lives here and what does not
 *
 * Deciding *what is on a slide* is `@firo/facilitation`'s job and is already
 * tested there. Deciding *which slide is current* is also the product's, but the
 * current slide lives in ephemeral state — where a facilitator has got to is a
 * property of the session, not of the board (rule 1). This module is the bridge:
 * it reads and writes that state, and moves the viewport, which is the only part
 * that needs the editor.
 *
 * ## Why the viewport moves at all
 *
 * Presentation filters the scene down to one slide, but filtering is not
 * presenting. The audience should be looking at the frame, filling the screen,
 * not at slide one parked in a corner of a board five frames wide. The editor
 * already knows how to fit bounds to a viewport, so this reuses `zoomToFitBounds`
 * rather than reimplementing scroll and zoom arithmetic — which is the class of
 * calculation where a subtly different rounding shows up as a frame that does not
 * quite line up with the edge of the screen.
 *
 * ## Why the bounds come from the document, not the scene
 *
 * The scene is mid-refresh when a slide changes. Reading bounds from it would mean
 * either moving the viewport *before* `pull()` has run — fitting to the previous
 * slide's frame — or reading a scene the previous `pull` left in place. The
 * document is authoritative, is already in hand, and holds the frame whether or not
 * the editor has been told about it yet.
 *
 * Note that this also sidesteps a nastier version of the same problem: the frame
 * element is never itself withheld (see `isShownInPresentation`), so a frame read
 * from a filtered scene would work by accident and stop working the moment that
 * rule changed.
 */

/** The presentation state, as the document holds it right now. */
export const getPresentation = (
  getDocument: () => FiroDoc,
): PresentationState =>
  getDocument().getEphemeral().presentation ?? DEFAULT_PRESENTATION;

/**
 * Move the viewport to fit `frameId`.
 *
 * No-ops rather than throws when the frame is missing or unreadable. A frame can
 * be deleted by a collaborator between the deck being computed and the viewport
 * moving, and a presenter whose keypress threw would get no toast and no movement —
 * indistinguishable from the shortcut not being bound at all.
 */
export const focusFrame = (
  api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
  frameId: string,
): void => {
  const frame = getDocument()
    .read()
    .elements.find((element) => element.id === frameId);

  if (!frame || frame.isDeleted) {
    return;
  }

  const appState = api.getAppState();
  if (!(appState.width > 0) || !(appState.height > 0)) {
    // The canvas has not been measured yet. Fitting against a zero-sized viewport
    // divides by zero somewhere inside `zoomToFitBounds`, and the honest answer to
    // "how do I present a board that has not been laid out" is "not yet".
    return;
  }

  const fitted = zoomToFitBounds({
    bounds: getCommonBounds([frame as FiroElement] as never),
    appState,
    canvasOffsets: api.getViewportOffsets(),
    // `scale-down`, not `contain`: a slide that is zoomed *in* to fill a large
    // screen is what presenting means. Fitting down when the frame is small keeps
    // the current zoom rather than blowing a sticky note up to wall size.
    fit: "scale-down",
  });

  /*
   * Only the three viewport fields are taken.
   *
   * `zoomToFitBounds` hands back the whole `appState` it was given, spread. Feeding
   * that to `updateScene` would re-apply every field of the current app state as if
   * it were a change — which is how a selection or an open dialog gets closed by a
   * presenter pressing the right arrow.
   */
  api.updateScene({
    appState: {
      scrollX: fitted.appState.scrollX,
      scrollY: fitted.appState.scrollY,
      zoom: fitted.appState.zoom,
    },
    // Never recorded, for the reason `bridgeFor`'s `write` is not: nobody pressed
    // undo, and an undo entry labelled "next slide" on a board whose file never
    // changed would be a lie.
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

/**
 * Apply a new presentation state and repaint around it.
 *
 * `pull` first, then the viewport. The order matters and is not interchangeable:
 * `pull` is what puts the new slide's elements on the canvas, and moving the
 * viewport first would frame the previous slide's contents. Neither step depends on
 * the other's *result* — the bounds come from the document — so this is about what
 * the viewer sees on the next paint, not about correctness of the numbers.
 */
const apply = (
  getDocument: () => FiroDoc,
  next: PresentationState,
  api: ExcalidrawImperativeAPI | undefined,
  refresh: (() => void) | undefined,
): PresentationState => {
  getDocument().setEphemeral({ presentation: next });
  /*
   * Announced, because ephemeral state produces no document update.
   *
   * Without this the facilitator's slide readout keeps showing the old slide while
   * the canvas has already moved on — the two halves of the same feature disagreeing,
   * which is the state `FacilitatorBar` was stuck in for the timer before this was
   * wired up.
   */
  announceFacilitationChange();
  refresh?.();

  const frameId = currentSlideId(next);
  if (api && frameId) {
    focusFrame(api, getDocument, frameId);
  }

  return next;
};

/**
 * Begin presenting, from the first slide.
 *
 * Returns `DEFAULT_PRESENTATION` when the board has no frames, which is
 * `startPresentation`'s own behaviour: an active session with zero slides would
 * black out the board and look broken. Callers report that rather than treating it
 * as success — see the action, which is where a person can be told something.
 */
export const startPresenting = (
  getDocument: () => FiroDoc,
  api?: ExcalidrawImperativeAPI,
  refresh?: () => void,
): PresentationState => {
  const elements = getDocument().read().elements;
  const next = startPresentation(elements);
  if (!next.active) {
    return next;
  }
  return apply(getDocument, next, api, refresh);
};

/** Leave presentation. The deck is emptied, so re-entering recomputes it. */
export const stopPresenting = (
  getDocument: () => FiroDoc,
  refresh?: () => void,
): PresentationState => {
  const next = endPresentation();
  getDocument().setEphemeral({ presentation: next });
  announceFacilitationChange();
  /*
   * Repainted on the way out too, and this is the step that matters: stopping
   * without a `pull` would leave the canvas filtered to the last slide with nothing
   * on the board able to undo it. The viewport is deliberately *not* restored — the
   * presenter moved it, and where they left it is a better answer than where it was
   * before the deck started.
   */
  refresh?.();
  return next;
};

/** Move by `delta` slides, clamped at both ends. */
export const stepPresentation = (
  getDocument: () => FiroDoc,
  delta: number,
  api?: ExcalidrawImperativeAPI,
  refresh?: () => void,
): PresentationState => {
  const before = getPresentation(getDocument);
  const next = stepSlide(before, delta);
  /*
   * Compared by *index*, not by object identity.
   *
   * `stepSlide` returns a fresh object whenever it clamps — it spreads and rewrites
   * `index` with the same value — so an identity check never fires and every
   * overshoot repainted and re-focused the viewport for nothing. Worse, it looked
   * like it worked: a held arrow key at the end of the deck did produce a visible
   * movement, just back to where it already was.
   *
   * Identity does hold for the one case with no slides at all, and the index
   * comparison covers that too — an empty deck has index 0 on both sides.
   */
  if (next.index === before.index) {
    return before;
  }
  return apply(getDocument, next, api, refresh);
};

/** Jump to a slide by index, clamped. */
export const goToPresentationSlide = (
  getDocument: () => FiroDoc,
  index: number,
  api?: ExcalidrawImperativeAPI,
  refresh?: () => void,
): PresentationState => {
  const before = getPresentation(getDocument);
  const next = goToSlide(before, index);
  if (next.index === before.index) {
    return before;
  }
  return apply(getDocument, next, api, refresh);
};

/**
 * Whether there is anything to present.
 *
 * Derived from the *document* rather than from the current state, because the
 * question a facilitator is really asking is "does this board have frames?", and
 * the answer must not depend on whether they are already presenting. Reading
 * `hasSlides(getPresentation(...))` would say "no" for a board they were halfway
 * through, which is the opposite of useful for deciding whether to offer the
 * command at all.
 */
export const boardHasSlides = (getDocument: () => FiroDoc): boolean =>
  startPresentation(getDocument().read().elements).slideIds.length > 0;

/** Re-exported so callers need not import two modules for one question. */
export { hasSlides };
