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
 */
export const ELEMENT_TYPES = [
  "stickynote",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
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

      link: string | null;
      locked: boolean;
      /**
       * Escaped hatch for host applications.
       *
       * Preserved verbatim through every migration. It is the reason migration rule 1
       * exists: an older Firo must not destroy a newer one's custom data.
       */
      customData?: Record<string, unknown>;
    }
>;

export type StickyNoteElement = ElementBase &
  Readonly<{
    type: "stickynote";
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
    /** `[x, y, pressure]` triples, relative to the element's origin. */
    points: readonly (readonly [number, number, number])[];
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
    elbowed: boolean;
  }>;

/** Which of the two. */
export type LinearType = LinearElement["type"];

export type FiroElement = StickyNoteElement | ShapeElement | LinearElement;

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
  | { type: "richText"; value: ProseMirrorDoc };

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
};
