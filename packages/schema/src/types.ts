/**
 * The element and record types.
 *
 * ## What is inherited, and why that is not laziness
 *
 * `ElementBase` is Excalidraw's `_ExcalidrawElementBase` (MIT) with four changes.
 * The inheritance is deliberate rather than convenient, and it is worth being
 * explicit about which parts survive a rewrite:
 *
 * - **Kept: `version`, `versionNonce`, `index`.** `version` + `versionNonce` give
 *   last-writer-wins a deterministic answer; `index` is a real CRDT for
 *   ordering. They cost nothing, they are used by the CRDT layer, the undo stack
 *   *and* the renderer cache, and they are the one part of Excalidraw's
 *   reconciliation worth keeping. See
 *   [`../../docs/trd/02-data-model.md`](../../docs/trd/02-data-model.md).
 * - **Kept: the whole geometry and style block**, unchanged. A rectangle is a
 *   rectangle; there is no reason to reinvent the field list, and the renderer
 *   inherited from Excalidraw reads these names.
 * - **Replaced: `boundElements` → `bindings`.** A one-sided `boundElements` array
 *   is the source of most of the complexity in Excalidraw's 94 KB `binding.ts`,
 *   and a Miro-style board has connectors that are not arrows. A two-way
 *   relation is the honest shape.
 * - **Added: `containerId`, `text`, `recordId`.** Arbitrary container nesting
 *   (ADR-0007), ProseMirror rich text (ADR-0004), and the record projection link
 *   (AC-3).
 *
 * ## Why this file has no behaviour
 *
 * Types only. Validation lives in `validate.ts`, migration in `migrate.ts`, and
 * the registry in `registry.ts`. A type file that also validates is a type file
 * whose types can disagree with its own runtime checks, and the disagreement is
 * invisible until a bad board loads.
 */

import { validateOrderKey } from "@firo/fractional-indexing";

import type { ROUNDNESS } from "@firo/common";

import type { Radians } from "@firo/math";
import type { FractionalIndex } from "@firo/element/types";

import type { ProseMirrorDoc } from "./prosemirror.js";

/**
 * Brand a string as a `FractionalIndex`, throwing if it is not a valid key.
 *
 * ## Why this validates rather than asserts
 *
 * A `FractionalIndex` is the sort key a record is ordered by, and an invalid one
 * does not fail loudly -- it fails *later*, as records that sort wrongly and a
 * projection whose order nobody can explain. By the time that is visible the
 * board has been edited and re-saving has written the bad key back.
 *
 * A throwing constructor moves the failure to the point of the mistake, and
 * means `validateOrderKey` runs once at the boundary rather than on every
 * comparison during render.
 *
 * `generateKeyBetween` returns a valid key by construction, so it does not need
 * this; it exists for keys that arrive from a file or from a caller.
 *
 * ## The ends are `null`, not sentinel keys
 *
 * There is deliberately no `FIRST_ORDER_KEY` or `LAST_ORDER_KEY`. The inherited
 * implementation expresses the bounds as an absent predecessor and an absent
 * successor, and a sentinel would be a second way to say the same thing that
 * sorts differently from the first.
 */
export const asFractionalIndex = (key: string): FractionalIndex => {
  try {
    validateOrderKey(key);
  } catch {
    // Re-thrown with a message that says what to do, because the inherited
    // error ("invalid order key: a0!") does not.
    throw new RangeError(
      `"${key}" is not a valid order key. Use generateKeyBetween to make one.`,
    );
  }
  return key as FractionalIndex;
};

/**
 * Whether a string is a usable order key. The non-throwing form, for validation
 * paths that want to repair rather than reject.
 */
export const isFractionalIndex = (key: unknown): key is FractionalIndex => {
  if (typeof key !== "string") {
    return false;
  }
  try {
    validateOrderKey(key);
    return true;
  } catch {
    return false;
  }
};

/** Element ids, group ids and binding ids are all branded to keep them apart. */
export type ElementId = string & { readonly __brand: "ElementId" };
export type GroupId = string & { readonly __brand: "GroupId" };

/** Cast a string to an `ElementId`. Only for values already known to be ids. */
export const asElementId = (id: string): ElementId => id as ElementId;

/**
 * The element types the document can hold.
 *
 * The point of this list is that the document knows what a board contains. A
 * board the user can draw a rectangle on is a board whose rectangle the document
 * does not have, which is one store's worth of content one save away from being
 * lost.
 *
 * In introduction order, which is also the order the fold gained the ability to
 * read each one. `frame` and `image` closed the last asymmetry: the renderer could
 * draw both and the document could hold neither, so a board could contain a frame
 * or a picture that no file, no autosave and no sync update would ever mention.
 */
export const ELEMENT_TYPES = [
  "stickynote",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "frame",
  "image",
] as const;

export type ElementType = typeof ELEMENT_TYPES[number];

/**
 * A two-way relation between a connector and what it connects to.
 *
 * Stored on *both* endpoints. `elementId` is the other end; `focus` and `gap`
 * mirror Excalidraw's binding geometry, which the inherited renderer needs for
 * elbow routing.
 */
/**
 * Whether a connector may reach inside the shape it is bound to.
 *
 * Excalidraw's `BindMode`, inherited. Missing here until the bridge needed it,
 * which makes it the fourth divergence between this schema and the renderer
 * found by the bridge rather than by a test. A connector bound to a fixed point
 * says whether it may come inside the shape or must stay outside, so a document
 * that cannot express that cannot reproduce the connector it was given.
 */
export type BindMode = "inside" | "orbit" | "skip";

export type Binding = Readonly<{
  elementId: ElementId;
  focus: number;
  gap: number;
  /** Fixed-point ratio, only meaningful for linear elements. */
  fixedPoint?: readonly [number, number];
  /**
   * Whether the connector may reach inside the shape.
   *
   * `undefined` alongside an absent `fixedPoint` is the ordinary case: a connector
   * bound to a shape's edge follows the edge rather than a point on it. Required
   * whenever `fixedPoint` is present, because a fixed-point binding with no mode
   * is not a thing the renderer can draw.
   */
  mode?: BindMode;
}>;

/** Style and geometry, verbatim from Excalidraw's base. */
export type ElementGeometry = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  angle: Radians;
}>;

export type ElementStyle = Readonly<{
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roundness: null | { type: RoundnessType; value?: number };
  roughness: number;
  opacity: number;
}>;

/**
 * Fill style, matching the renderer's.
 *
 * `"zigzag"` was missing here. The same drift as `RoundnessType` below, and it
 * surfaced the same way: the bridge handed a shape to the canvas and the types
 * refused to assign, because a shape the renderer can draw had a fill style the
 * document could not represent. A file containing one would have been coerced to
 * `"solid"` on load — a shape that came out of the app looking different from the
 * one that went in.
 */
export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";

/**
 * The head on the end of a connector.
 *
 * The cardinality variants are inherited rather than dropped: a connector that
 * means "one to many" is a real thing on a real board, and the renderer draws
 * them. `AnyArrowhead` in the renderer also admits the legacy set, which a file
 * can still contain; those are read, drawn, and normalised rather than rejected.
 */
export type Arrowhead =
  | "arrow"
  | "bar"
  | "circle"
  | "circle_outline"
  | "triangle"
  | "triangle_outline"
  | "diamond"
  | "diamond_outline"
  | "dot"
  | "crowfoot_one"
  | "crowfoot_many"
  | "crowfoot_one_or_many"
  | "cardinality_one"
  | "cardinality_many"
  | "cardinality_one_or_many"
  | "cardinality_exactly_one"
  | "cardinality_zero_or_one"
  | "cardinality_zero_or_many";
export type StrokeStyle = "solid" | "dashed" | "dotted";
/**
 * Corner-rounding algorithm, matching Excalidraw's `ROUNDNESS` numeric enum.
 *
 * This was `"radius" | "proportional"` — strings — which contradicted this file's
 * own claim to copy Excalidraw's style fields verbatim, and matched nothing the
 * renderer actually accepts. The bridge hit it immediately: a Firo note would
 * carry a `roundness.type` the canvas cannot interpret, and the mismatch would
 * have surfaced as notes rendering with the wrong corners rather than as an error.
 *
 * Numeric because the renderer's constants are numeric, and a translation layer
 * would be a second thing to keep in step. `roundness.test.ts` asserts these stay
 * equal to `ROUNDNESS`, so the two cannot drift apart again.
 */
export type RoundnessType = typeof ROUNDNESS[keyof typeof ROUNDNESS];

/**
 * The base every element shares.
 *
 * `readonly` throughout, and it must stay that way: Yjs mutations produce new
 * objects, and a caller that mutates one in place has silently broken undo
 * (migration rule 2, [`../../docs/trd/02-data-model.md`](../../docs/trd/02-data-model.md)).
 */
export type ElementBase = Readonly<
  ElementGeometry &
    ElementStyle & {
      id: ElementId;
      type: ElementType;

      // --- merge + ordering, inherited deliberately ---
      /** Monotonic per element. Drives last-writer-wins merge. NOT the schema version. */
      version: number;
      /** Random per change. Deterministic tie-break when `version` collides. */
      versionNonce: number;
      /** Z-order and order-within-container, as a CRDT key. */
      index: FractionalIndex | null;

      // --- timestamps. `created` is wall-clock, deliberately not a Lamport clock ---
      /** epoch ms. Preserved across edits and undo; excluded from mutations. */
      created: number | null;
      /** epoch ms of last change. */
      updated: number;
      /**
       * Tombstone. An element is deleted, never removed.
       *
       * A CRDT delete that removed the key outright would make deletion
       * indistinguishable from never having existed, which breaks undo (the undo
       * stack has nothing to restore) and breaks concurrent edit resolution (a
       * concurrent edit to a deleted element would resurrect it). A tombstone with
       * a timestamp is what Yjs tombstones *and* what Excalidraw's `isDeleted` do;
       * keeping both is deliberate, because they solve different halves.
       */
      isDeleted: boolean;
      /**
       * epoch ms of deletion, or null. Retained so a delete can be distinguished
       * from an element that was created deleted, and so undo can restore the
       * original ordering relative to concurrent deletes.
       */
      deletedAt?: number | null;

      // --- structure ---
      groupIds: readonly GroupId[];
      /** Inherited: the frame this element is displayed in. */
      frameId: string | null;
      /** NEW: the parent container. `null` is top level. Arbitrary nesting. */
      containerId: string | null;
      /** Replaces Excalidraw's one-sided `boundElements`. */
      bindings: readonly Binding[];

      // --- content ---
      /** NEW: rich text. Never a string — ADR-0004. */
      text?: ProseMirrorDoc;
      /** NEW: this element projects this record. Makes it a projection, not data. */
      recordId?: string;

      // --- Phase 5 facilitation. Durable; both read in `./facilitation.ts` ---
      /*
       * `hiddenUntilRevealed?: boolean`
       *
       * A note the facilitator hid for a private brainstorm, until they reveal it.
       *
       * Durable, because "hidden" is a decision about the board and "revealed" is
       * a moment in a session: a note marked during a brainstorm must still be
       * marked tomorrow, and it has to survive the export that carries the board
       * to the next facilitator. The *toggle* is the ephemeral half -- see
       * `EphemeralReveal` in [`../../doc/src/ephemeral.ts`](../../doc/src/ephemeral.ts).
       *
       * Which is also why private-mode content has to be excluded from an export
       * rather than merely hidden by a viewport: a PNG that carries the hidden
       * notes carries them.
       *
       * Optional, and optional is the whole contract: **absent and `false` are one
       * answer.** A board written before this field existed therefore reads as
       * fully visible with no migration and no repair, which is what lets private
       * mode work on a v1 board at all.
       */
      hiddenUntilRevealed?: boolean;
      /*
       * `hideInPresentation?: boolean`
       *
       * Scaffolding to exclude while presenting.
       *
       * Durable for the same reason as the flag above: an agenda, a prompt nobody
       * needs any more, a "we are here" marker -- it is scaffolding on the day it
       * is hidden and on every day after.
       *
       * Optional for the same reason, so a board that never used presentation mode
       * carries neither key and re-saving it changes nothing.
       *
       * Two flags rather than one "visible" flag, and the difference is the point:
       * a note marked for a private session and an object marked as scaffolding are
       * different decisions with different lifetimes, and collapsing them would mean
       * revealing a room also un-hides the agenda for the next rehearsal.
       */
      hideInPresentation?: boolean;

      link: string | null;
      locked: boolean;
      /**
       * Escaped hatch for host applications.
       *
       * Preserved verbatim through every migration. It is the reason migration rule 1
       * exists: an older Firo must not destroy a newer one's custom data.
       */
      customData?: Record<string, unknown>;
      /**
       * Optional free-form labels for filtering and search (Phase 8.3).
       */
      tags?: readonly string[];
    }
>;

export type StickyNoteElement = Omit<ElementBase, "text"> &
  Readonly<{
    type: "stickynote";
    /*
     * `Omit<ElementBase, "text">` above, and this is why.
     *
     * The base declares `text?: ProseMirrorDoc` — ADR-0004's field. Intersecting it
     * with a `text: string` produced `ProseMirrorDoc & string`, an impossible type, and
     * nothing complained only because `ProseMirrorDoc` was `any` until very recently.
     * So the exception is now *in the type*: a note's text is a string, the base's
     * ProseMirror field does not apply to it, and a reader can see that rather than
     * infer it.
     *
     * See `types/stickynote.ts` for why the exception is argued at all, and
     * `tests/richText.test.ts` for the gate that keeps it to two.
     */
    /** Excalidraw's sticky notes already carry this; extended, not reinvented. */
    text: string;
    fontSize: number;
    fontFamily: number;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    /**
     * Whether this note is also a container.
     *
     * Always `false`. A sticky note that holds other notes is a `section` with a
     * note's styling — promoting it is a *type change* and therefore a migration,
     * not a flag flip. The field exists so the registry can reject `true` loudly
     * rather than let a file from the future set it and have it ignored.
     */
    isContainer: false;
  }>;

/**
 * A shape: geometry, style and bindings, differing only in the discriminant.
 *
 * `angle` is in radians, matching Excalidraw rather than degrees, because the
 * renderer and the hit tester both work in radians and a conversion at the
 * boundary is a conversion to get wrong.
 */
export type ShapeElement = ElementBase &
  Readonly<{ type: "rectangle" | "diamond" | "ellipse" }>;

/** Which of the three. */
export type ShapeType = ShapeElement["type"];

/**
 * A connector: a path rather than a box.
 *
 * `x`, `y`, `width` and `height` are the bounding box of the path, not where it
 * starts -- the path is in `points`, relative to `x`/`y`. `bindings` is ordered:
 * the first entry is the start of the connector and the second is the end.
 */
export type LinearElement = ElementBase &
  Readonly<{
    type: "arrow" | "line";
    /**
     * The path, as `[x, y]` pairs relative to the element's origin.
     *
     * Two components, matching the renderer's `LocalPoint`. This was three --
     * `[x, y, pressure]` -- on the assumption that a point carried pen pressure.
     * It does not: the renderer's point is a two-tuple, the third component was
     * never read, and a connector in the document was carrying a number nothing
     * looked at. Found by the conformance test in
     * `tests/conformance.test.ts`, on its first run, which is the entire reason
     * that file exists.
     *
     * `x`, `y`, `width` and `height` are the bounding box of the path, not where
     * it is.
     *
     * One entry per vertex, with no upper limit. A two-item cap here once
     * straightened every bend in every polyline on load -- see
     * `tests/points.test.ts`.
     */
    points: readonly (readonly [number, number])[];
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
    elbowed: boolean;
  }>;

/**
 * A freehand stroke: the pen tool's output.
 *
 * A path like a connector's, but not a connector. It has no arrowheads, no
 * bindings, and neither end means anything, which is why it is a separate type
 * rather than a `LinearElement` with most fields optional. A type where most
 * fields are `null` is a type nothing can check.
 *
 * ## Pressure is three fields and all three change the drawing
 *
 * A connector's point is a two-tuple because a connector has no pressure. A
 * freehand stroke is drawn from four things, and storing only the first produces
 * an even ribbon that ignores the person's hand with nothing in the file to show
 * anything was lost:
 *
 * - `points` -- where the pen went.
 * - `pressures` -- how hard, per point.
 * - `simulatePressure` -- whether to use `pressures` at all, or to vary width by
 *   pen speed. A mouse has no pressure, so this is `true` for most strokes and
 *   `pressures` is then not what drew the line.
 * - `strokeOptions.variability` and `.streamline` -- whether width varies along
 *   the stroke, and how much the path is smoothed.
 *
 * The conformance test in `tests/conformance.test.ts` holds this set against the
 * renderer's, because the failure mode is a stroke that draws differently after a
 * reload rather than an error.
 */
export type FreedrawElement = ElementBase &
  Readonly<{
    type: "freedraw";
    /**
     * The path, as `[x, y]` pairs relative to the element's origin -- the same
     * shape as a connector's, and with the same absence of a vertex limit.
     */
    points: readonly (readonly [number, number])[];
    /**
     * Pen pressure per point, parallel to `points`.
     *
     * A parallel array rather than a third component on each point. The renderer
     * indexes it positionally -- `pressures[i]` belongs to `points[i]` -- so the
     * two are read together and a length mismatch is a corrupt element rather than
     * a short array.
     */
    pressures: readonly number[];
    /**
     * Whether to draw from `pressures` or to vary width by pen speed.
     *
     * Stored rather than inferred from the device: a stroke drawn with a real pen
     * and one drawn with a mouse differ in exactly this field, and a file that
     * dropped it could not tell them apart.
     */
    simulatePressure: boolean;
    strokeOptions: Readonly<{
      variability: StrokeVariability;
      streamline: number;
    }>;
  }>;

/**
 * Whether a stroke's width varies along its length.
 *
 * `"variable"` tapers with pressure or speed; `"constant"` is an even ribbon.
 * Inherited, because the renderer branches on it and guessing wrong changes the
 * shape of every stroke drawn.
 */
export type StrokeVariability = "variable" | "constant";

/**
 * A free-standing text annotation: the text tool's output, with no box around it.
 *
 * Distinct from a sticky note's label in the only way that matters here — a label has
 * a `containerId` and is consumed *into* that container by the fold, while this is a
 * document element in its own right. Getting that backwards is not a type error: both
 * are `type: "text"` in the editor and the difference is a single nullable field, so
 * the distinction lives in the fold and is worth stating here.
 *
 * `text` is a plain string rather than a ProseMirror document, against ADR-0004's
 * general rule. The exception is deliberate and the reasoning is in `types/text.ts`:
 * Excalidraw's text element has no rich text at all, so a document here could only
 * ever hold a single text node.
 */
export type TextElement = Omit<ElementBase, "text"> &
  Readonly<{
    type: "text";
    /*
     * `Omit<ElementBase, "text">` above, for the same reason as the sticky note: the
     * base declares `text?: ProseMirrorDoc`, and intersecting that with a `text:
     * string` is a contradiction. Making the exception explicit in the type is better
     * than an intersection that silently means nothing.
     */
    /**
     * What the person typed.
     *
     * Not the laid-out form: the renderer keeps `originalText` as the input and `text`
     * as that input after wrapping inserted hard breaks, and storing the latter bakes
     * the current layout into the document. Every edit then wraps text that already
     * has breaks in it, and the corruption only shows when the element is later
     * widened.
     */
    text: string;
    fontSize: number;
    fontFamily: number;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    /**
     * Whether the width follows the text or the text wraps to the width.
     *
     * Persisted because it decides the shape. An annotation that grows with its text
     * and one that wraps to a fixed box are different objects, and re-wrapping a
     * saved one on load moves every line.
     */
    autoResize: boolean;
    /** A multiplier of the font size, not pixels. */
    lineHeight: number;
  }>;

/** Which of the two. */
export type LinearType = LinearElement["type"];

/**
 * A frame: a named region of the board, and a container.
 *
 * ## Why this type needs one field and not three
 *
 * A frame is geometry and a name. Everything else a frame does, the base already
 * carries, which is the reason it is a small type rather than a large one:
 *
 * - **Membership** is `frameId` on the element inside the frame. Inherited.
 * - **Nesting** is `frameId` on a frame, plus `containerId` for the general
 *   container case ([ADR-0007](../../../docs/adr/0007-arbitrary-container-nesting.md)).
 * - **Ordering and z-order** is `index`. Inherited.
 *
 * So a frame is `ElementBase` and a `name`. Adding a `children` array would be a
 * second source of truth for something `frameId` already says, and the two would
 * disagree the first time an element moved between frames.
 *
 * `name` is nullable because `null` is a real state — a frame nobody has named yet —
 * and a validator that turned it into `""` would make "unnamed" and "named with
 * nothing in it" the same value.
 */
export type FrameElement = ElementBase &
  Readonly<{
    type: "frame";
    /** Inherited from Excalidraw. `null` is an unnamed frame. */
    name: string | null;
  }>;

/**
 * An image: a placed picture, referenced rather than embedded.
 *
 * ## The bytes are not here, and that is the design
 *
 * `fileId` is a content-addressed reference into the asset store, not data. A 2 MB
 * image inside a CRDT update is broadcast on every sync and duplicated in every
 * peer, and the CRDT's own efficiency is irrelevant next to that — the same
 * reasoning that keeps assets out of the document in the first place, recorded in
 * [`../../packages/doc/src/library.ts`](../../packages/doc/src/library.ts).
 *
 * **The consequence is that a `.firo` file holding an image is not self-contained**,
 * and that is a property of the format rather than a defect in the type. The file
 * writer refuses to emit a board whose asset bytes it cannot carry, rather than
 * writing a reference to something the file does not contain. Making the format
 * carry the bytes — a manifest and a content-addressed assets directory, per
 * `docs/plans/phase-7-persistence-and-formats.md` §7.3 — is separate work, and the
 * refusal is what makes its absence visible rather than silent.
 *
 * ## `status` is inherited and is not about the document
 *
 * It is Excalidraw's "whether the respective file is persisted", and it is stored
 * because the renderer's field set and the document's must be identical for the
 * conformance test to mean anything. It describes the *editor's* relationship with
 * its own blob store. The document's own truth is whether `fileId` resolves in the
 * asset store, which is a question about a different store entirely.
 */
export type ImageElement = ElementBase &
  Readonly<{
    type: "image";
    /** Content-addressed reference into the asset store. Never bytes. */
    fileId: string | null;
    /** Inherited. Whether the editor has persisted the file it is holding. */
    status: "pending" | "saved" | "error";
    /**
     * Per-axis scale, each in `(-1, 1)`, for flipping.
     *
     * A pair rather than a scalar because the axes are independent: a mirrored
     * image is `[-1, 1]`, and one number could not say that.
     */
    scale: readonly [number, number];
    /** The crop window and the image's natural size, or `null` for uncropped. */
    crop: ImageCrop | null;
  }>;

/**
 * A crop window, with the natural size it was taken from.
 *
 * Inherited from the renderer's `ImageCrop` verbatim, including carrying the
 * natural dimensions on the crop itself. They look derivable from the asset and are
 * not: the asset is addressed by hash and knows nothing about how it was placed, so
 * without them a cropped image cannot be re-cropped to a different window after a
 * reload without decoding the original first.
 */
export type ImageCrop = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}>;

export type FiroElement =
  | StickyNoteElement
  | ShapeElement
  | LinearElement
  | FreedrawElement
  | TextElement
  | FrameElement
  | ImageElement;

/** Narrowing helper, so callers do not repeat the discriminant check. */
export const isElementType = <T extends ElementType>(
  element: { type: string },
  type: T,
): element is FiroElement & { type: T } => element.type === type;

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A typed row in a collection.
 *
 * ## The two decisions that look like over-engineering
 *
 * **`values` is keyed by `Column.key`, not `Column.id`.** Ids are regenerated;
 * keys are stable. Keying by id means deleting and recreating a column silently
 * discards every value that referenced it, which is the most common data-loss
 * bug in a record store.
 *
 * **Values for deleted columns are retained.** Deleting a column hides it.
 * Restoring the column restores the data. Pruning on delete is a one-line
 * optimisation that makes a restore impossible.
 */
export type FiroRecord = Readonly<{
  id: string;
  collectionId: string;
  /** Keyed by `Column.key`, never by `Column.id`. */
  values: Readonly<Record<string, FieldValue>>;
  /** Client wall-clock. Not an ordering clock and not a merge clock. */
  created: number;
  updated: number;
  /**
   * Order within a projection.
   *
   * Per-projection, not per-record: a record ordered second in a table and
   * second in a kanban is a coincidence, and a projection owns the ordering it
   * uses. Stored per record here only as the default; a projection may override
   * it. See [`../../docs/trd/06-records-and-projections.md`](../../docs/trd/06-records-and-projections.md).
   */
  order: FractionalIndex;
  archived: boolean;
}>;

export type FieldValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "singleSelect"; value: string | null }
  | { type: "multiSelect"; value: readonly string[] }
  | { type: "date"; value: string | null }
  | { type: "person"; value: string | null }
  | { type: "link"; value: string | null }
  | { type: "richText"; value: ProseMirrorDoc }
  /*
   * A same-collection parent link: the record id of the parent, or null for a
   * root. ADR-0040 section 4. Deliberately not the cross-collection
   * `linkToRecord` TRD-06 defers: a relation points inside its own collection,
   * so there is no record-identity-across-collections or delete-cascade
   * question. The mind-map projection reads the first relation column.
   */
  | { type: "relation"; value: string | null };

export const COLUMN_TYPES = [
  "text",
  "number",
  "boolean",
  "singleSelect",
  "multiSelect",
  "date",
  "person",
  "link",
  "richText",
  "relation",
] as const;

export type ColumnType = typeof COLUMN_TYPES[number];

export type SelectOption = Readonly<{
  id: string;
  name: string;
  color: string;
}>;

export type Column = Readonly<{
  id: string;
  /**
   * Stable across rename, delete and re-create. This is what `Record.values` is
   * keyed by. Never reuse a key for a different meaning: changing what a key
   * means reinterprets every existing value.
   */
  key: string;
  /** The display name. Renaming this is not a rename of the key. */
  name: string;
  type: ColumnType;
  options?: readonly SelectOption[];
  color?: string;
}>;

export type Collection = Readonly<{
  id: string;
  boardId: string;
  name: string;
  columns: readonly Column[];
  order: FractionalIndex;
  version: number;
}>;

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One message in a comment thread.
 *
 * ## Why `body` is a plain string and not a ProseMirror document
 *
 * Rule 3 ([`../../docs/trd/05-rich-text.md`](../../docs/trd/05-rich-text.md))
 * says any *element* with editable rich text stores ProseMirror. A comment is not
 * an element, and the TRD's own table puts a rich-text comment body in v2:
 * "Comment body | ProseMirror | v2". So v1 stores plain text, and upgrading the
 * body is a migration on this lane rather than a reinterpretation of a string
 * that was never a document.
 *
 * ## Why `author` is a string and not a user id
 *
 * There are no accounts in v1 (Phase 9 owns them). A local display name is the
 * honest placeholder: it is what a single-user board can know, and a
 * `CommentEntry` written today has a field for the account id to arrive in later
 * rather than a field to rename.
 */
export type CommentEntry = Readonly<{
  id: string;
  body: string;
  author: string;
  createdAt: number;
}>;

/**
 * Where a thread is pinned, **relative to its anchor element's origin**.
 *
 * ## Why relative and not absolute
 *
 * An absolute board coordinate would have to be rewritten every time the element
 * moved -- one mutation per pointer-up for every comment on the board, and a
 * comment that drifts off its note the moment one of those writes is missed. A
 * relative offset moves *with* the element by construction: the renderer adds it
 * to the element's current position, so "re-anchor on move" costs nothing.
 *
 * `(0, 0)` is the element's top-left, which is the only origin every element type
 * shares (`frame`, `image` and the shapes do not agree on a centre).
 */
export type CommentAnchor = Readonly<{
  x: number;
  y: number;
}>;

/**
 * A threaded, object-anchored comment conversation.
 *
 * ## Why this is a lane of its own and not an element or a record
 *
 * - **Not an element.** A comment is not a positioned object on the canvas; it
 *   is a durable row *about* one. Making it an element is what the TRD rules out
 *   because it would put comments in the element map, so a commenter would need
 *   edit rights on the whole board ([`../../docs/trd/08-server-and-auth.md`](../../docs/trd/08-server-and-auth.md)).
 * - **Not a record in a collection.** The record model keys values by
 *   `Column.key` and validates them against a `FieldValue` union that has no
 *   place for an array of messages or an anchor. Forcing a thread into columns
 *   means encoding structured data as text, which is the one thing a typed record
 *   store exists to prevent.
 *
 * So it is a third durable lane, sibling to `elements` and `records`, versioned
 * under the record chain (see [`./version.ts`](./version.ts)) and stored in its
 * own Yjs root. That is the separation a separate permission partition needs in
 * v2, built now rather than retrofitted.
 *
 * ## Why a thread survives its anchor
 *
 * `elementId` may name an element that has been deleted. The thread is *not*
 * cascaded: a conversation someone had about a note is not destroyed because the
 * note was. A renderer that cannot find the element shows the thread in an
 * orphaned list rather than dropping it, which is the v2 "survives as a
 * tombstone" behaviour available from the shape alone.
 */
export type CommentThread = Readonly<{
  id: string;
  /** The element this thread is about. May name a deleted element. */
  elementId: string;
  anchor: CommentAnchor;
  /** Oldest first. Never empty for a thread that was created normally. */
  comments: readonly CommentEntry[];
  /** A resolved thread stays and is hidden by default; it is not deleted. */
  resolved: boolean;
  /** Who opened the thread. */
  author: string;
  createdAt: number;
  updatedAt: number;
}>;

/** The set of `FieldValue["type"]` a column type accepts. */
export const FIELD_TYPE_FOR_COLUMN: Readonly<
  Record<ColumnType, FieldValue["type"]>
> = {
  text: "text",
  number: "number",
  boolean: "boolean",
  singleSelect: "singleSelect",
  multiSelect: "multiSelect",
  date: "date",
  person: "person",
  link: "link",
  richText: "richText",
  relation: "relation",
};
