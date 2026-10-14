/**
 * Building a document element from a few fields.
 *
 * `@firo/schema` has no factory, and that is a gap rather than a decision: the
 * type has around thirty required fields, most of which are either structural
 * (`version`, `index`, `versionNonce`) or a style default. Every caller that
 * wants to make a note would otherwise hand-write all of them, and get a
 * slightly different note each time.
 *
 * The two structural fields need care, because getting them wrong is invisible
 * until it is not:
 *
 * - `version` and `versionNonce` drive last-writer-wins merge. They must be set
 *   and must be *different* per element; two elements created in the same
 *   millisecond with the same version and nonce would merge as if they were the
 *   same element, and one would vanish.
 * - `index` is the z-order key. `null` means "the end", which is correct for a
 *   newly created element, and it lets the document assign the fractional index
 *   itself rather than the caller guessing at a string key.
 */

import type { Merge } from "@firo/common/utility-types";

import type { ElementId, StickyNoteElement } from "@firo/schema";

/** Excalidraw's sticky-note sizes in px. Width is always height × 1.3. */
const SIZES = [100, 150, 200, 250] as const;

export const STICKY_NOTE_DEFAULTS = {
  backgroundColor: "#ffc9c9",
  strokeColor: "#1e1e1e",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roundness: null,
  /**
   * Clean, matching `DEFAULT_ELEMENT_PROPS.roughness` ([ADR-0021](../../../docs/adr/0021-miro-style-shell-and-clean-aesthetic.md)).
   * A note this package creates is a new element, and a new element is clean;
   * the hand-drawn stroke is the per-element option, not the resting state.
   */
  roughness: 0,
  opacity: 100,
  fontSize: 20,
  fontFamily: 1,
  textAlign: "center",
  verticalAlign: "middle",
  // `as const`, not `as const satisfies Partial<StickyNoteElement>`: the repo's
  // eslint parser cannot parse `satisfies`, and the check is not lost anyway --
  // `createStickyNote` returns `StickyNoteElement` and spreads these defaults, so
  // a field that does not exist is a type error at the use site.
} as const;

/** A counter, so two notes created in the same millisecond still differ. */
let sequence = 0;

/**
 * A fresh sticky note.
 *
 * @param at - top-left in scene coordinates
 * @param overrides - any field, for a note that is not the default one
 *
 * The overrides are `Omit<Partial<StickyNoteElement>, ...the keys above>` so
 * they cannot restate a key the base already supplies. A plain `Merge` with
 * `Partial<StickyNoteElement>` does not do that: `Merge` drops the base's keys
 * that the overrides mention, which put `id?: ElementId` back and made every
 * caller passing a plain string id a type error.
 */
export const createStickyNote = ({
  id,
  x,
  y,
  height = 150,
  text = "",
  ...overrides
}: Merge<
  {
    id: string;
    x: number;
    y: number;
    height?: number;
    text?: string;
  },
  Omit<Partial<StickyNoteElement>, "id" | "x" | "y" | "height" | "text">
>): StickyNoteElement => {
  if (!SIZES.includes(height as typeof SIZES[number])) {
    throw new Error(
      `@firo/board: sticky note height must be one of ${SIZES.join(
        ", ",
      )}, got ${height}.`,
    );
  }

  const now = Date.now();
  sequence += 1;

  return {
    id: id as ElementId,
    type: "stickynote",
    x,
    y,
    // Excalidraw's ratio, inherited rather than reinvented.
    width: Math.round(height * 1.3),
    height,
    angle: 0,
    ...STICKY_NOTE_DEFAULTS,
    text,
    isContainer: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    version: 1,
    // Distinct per note even inside one millisecond, because `sequence` is
    // monotonic and the document compares these to break merge ties.
    versionNonce: sequence,
    index: null,
    created: now,
    updated: now,
    isDeleted: false,
    ...overrides,
  } as StickyNoteElement;
};
