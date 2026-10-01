/**
 * Firo elements to editor elements, and back.
 *
 * ## Read this before adding a field
 *
 * The two vocabularies are close but not identical, and every difference is a
 * place where information can be lost. Each one is annotated with which
 * direction it survives.
 *
 * Shared and identical in both, surviving unchanged: `id`, geometry, style,
 * `version`, `versionNonce`, `index`, `isDeleted`, `groupIds`, `frameId`, `link`,
 * `locked`, `customData`.
 *
 * ## A note is two editor elements
 *
 * Firo's `StickyNoteElement` carries its own `text`. Excalidraw's sticky note
 * does not — the label is a **separate** `text` element pointing back via
 * `containerId`. So one document note projects to two editor elements, and
 * folding them back is the only way to get one note out again.
 *
 * That asymmetry is the single most important thing in this file, and it is why
 * `toEditorElements` returns an array. A projection that returned one element
 * would have nowhere to put the text, and the note would render blank.
 *
 * The converse matters just as much: **a `text` element with a `containerId` is
 * not a document element.** It belongs to its container. Folding must consume it
 * rather than emit it, or every note would also become a stray label in the
 * document.
 */

import type {
  BoundElement,
  ExcalidrawElement,
  ExcalidrawStickyNoteElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
} from "@firo/element/types";

import type {
  Binding,
  ElementId,
  FiroElement,
  LinearElement,
  ShapeElement,
  StickyNoteElement,
} from "@firo/schema";

/**
 * Where Firo's `containerId` is kept, since Excalidraw *shapes* have no such field.
 *
 * Excalidraw's `containerId` exists only on text elements, for bound labels.
 * Firo's is ADR-0007's arbitrary nesting, which applies to shapes, so there is
 * nowhere to put it.
 *
 * `customData` is the documented escape hatch for exactly this, and preserving
 * the value matters more than tidiness. Every sticky note has `containerId: null`
 * today, so dropping it would be invisible until the first section exists — and
 * then it would be silent data loss on the first save/load cycle. Namespaced so
 * it cannot collide with a host application's own keys.
 */
const CONTAINER_ID_KEY = "firo.containerId";

/**
 * The id given to a note's bound label.
 *
 * Derived rather than random, for the same reason `seedForId` is: the label must
 * be the *same element* every time a note is drawn, or Excalidraw would treat it
 * as a new element on every render and the note's text would be re-laid-out
 * constantly.
 *
 * The `~` cannot appear in an element id the app generates — ids come from
 * `nanoid`, whose alphabet is `A-Za-z0-9_-` — so a label id cannot collide with a
 * real element. `fromEditorElements` finds labels by `containerId` rather than by
 * parsing this, so the format is free to change without touching the fold.
 */
export const labelIdFor = (noteId: string): string => `${noteId}~label`;

/**
 * A stable 32-bit seed, derived from the element id.
 *
 * Excalidraw uses `seed` to jitter its hand-drawn shapes, and the jitter must be
 * identical every time the same element is drawn — otherwise a note's wobbly
 * outline would be re-rolled on every reload, and two people looking at the same
 * board would see different notes.
 *
 * Firo's schema has no `seed` field, which is correct: it is a rendering concern,
 * not document state. Deriving it from the id gives the stability without putting
 * it in the document.
 *
 * FNV-1a, 32-bit. Chosen for being short and well-distributed, not for
 * cryptographic reasons — nothing depends on this for security, only for
 * stability.
 */
export const seedForId = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    // 16777619, the FNV-1a prime. Math.imul keeps it in int32 range.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Fields the editor owns outright, and which may therefore be written back.
 *
 * This is the whole list. Anything absent is either shared with the document —
 * and then a value read from the editor is as good as one in the document — or
 * document-only, and writing the editor's value would destroy information.
 *
 * `customData` is deliberately excluded. The editor round-trips it untouched, so
 * it belongs to nobody in particular, and excluding it keeps a future editor that
 * normalises `customData` from silently rewriting a host application's data.
 */
export const EDITOR_OWNED_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roundness",
  "roughness",
  "opacity",
  "text",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
] as const;

/**
 * A Firo binding as the renderer wants one.
 *
 * Only a binding carrying a `fixedPoint` becomes a `FixedPointBinding`; anything
 * else stays `null` so the renderer draws the connector following the shape's
 * edge rather than pinning it to a point. The `focus` and `gap` the document
 * keeps have no field here -- the renderer moved off them -- which is why they
 * are preserved in the document and dropped on the way to the canvas.
 */
/**
 * The renderer's `FixedPointBinding` as a Firo binding.
 *
 * `focus` and `gap` are set to the values the renderer would have implied, and
 * they are *not* recovered from the drawing: the renderer does not store them, so
 * a connector's focus is not knowable from the editor and is recorded as the
 * default. The document keeps whatever the connector's own geometry implies, and
 * this is the one field on a connector that a round trip through the editor
 * cannot preserve exactly. Said here rather than left to be discovered.
 */
const fromFixedPointBinding = (binding: {
  elementId: string;
  fixedPoint?: readonly [number, number];
  mode?: string;
}): Binding => ({
  elementId: binding.elementId as ElementId,
  focus: 0,
  gap: 1,
  ...(binding.fixedPoint
    ? {
        fixedPoint: binding.fixedPoint,
        mode: (binding.mode ?? "orbit") as NonNullable<Binding["mode"]>,
      }
    : {}),
});

const toFixedPointBinding = (
  binding: FiroElement["bindings"][number] | undefined,
): Record<string, unknown> | null => {
  if (!binding?.fixedPoint) {
    return null;
  }
  return {
    elementId: binding.elementId,
    fixedPoint: binding.fixedPoint,
    mode: binding.mode ?? "orbit",
  };
};

/**
 * The fields every element shares, in the editor's shape.
 *
 * `seed` is derived here for every type rather than per type, because the rule
 * is the same everywhere: the same element must draw the same way every time.
 */
const sharedBaseFor = (element: FiroElement) => ({
  id: element.id,
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  angle: element.angle,
  strokeColor: element.strokeColor,
  backgroundColor: element.backgroundColor,
  fillStyle: element.fillStyle as FiroElement["fillStyle"],
  strokeWidth: element.strokeWidth,
  strokeStyle: element.strokeStyle,
  roundness: element.roundness as FiroElement["roundness"],
  roughness: element.roughness,
  opacity: element.opacity,
  seed: seedForId(element.id),
  version: element.version,
  versionNonce: element.versionNonce,
  index: element.index,
  isDeleted: element.isDeleted,
  groupIds: element.groupIds,
  frameId: element.frameId,
  created: element.created,
  updated: element.updated,
  link: element.link,
  locked: element.locked,
  boundElements: toBoundElements(element),
  ...customDataFor(element),
});

const baseFor = (element: StickyNoteElement) => ({
  id: element.id,
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  angle: element.angle,
  strokeColor: element.strokeColor,
  backgroundColor: element.backgroundColor,
  fillStyle: element.fillStyle as FiroElement["fillStyle"],
  strokeWidth: element.strokeWidth,
  strokeStyle: element.strokeStyle,
  roundness: element.roundness as FiroElement["roundness"],
  roughness: element.roughness,
  opacity: element.opacity,
  seed: seedForId(element.id),
  version: element.version,
  versionNonce: element.versionNonce,
  index: element.index,
  isDeleted: element.isDeleted,
  groupIds: element.groupIds,
  frameId: element.frameId,
  created: element.created,
  updated: element.updated,
  link: element.link,
  locked: element.locked,
  /*
   * Lossy, forward only.
   *
   * Firo's `Binding` is `{ elementId, focus, gap, fixedPoint? }`. Excalidraw's is
   * `{ id, type }`, and it reads that geometry off the arrow's own
   * `startBinding`/`endBinding` instead. Firo has no arrow type yet (Phase 4), so
   * there is nowhere for `focus` and `gap` to go. The document keeps them; the
   * editor does not see them.
   */
  boundElements: toBoundElements(element),
  ...customDataFor(element),
});

const toBoundElements = (
  element: FiroElement,
): readonly BoundElement[] | null =>
  element.bindings.length === 0
    ? null
    : element.bindings.map((binding) => ({
        id: binding.elementId,
        /*
         * Firo's bindings are two-way and the far end is a connector. The
         * editor's union is narrower, and "arrow" is the only member that is a
         * connector — "text" is bound labels, which Firo models as content on
         * the container rather than as bindings.
         */
        type: "arrow" as const,
      }));

/**
 * Merge Firo-only fields into `customData` without disturbing anyone else's.
 *
 * Spreads the existing object first so a host application's keys survive, which
 * is the same rule the migration chain follows: never drop a field you do not
 * recognise.
 */
const customDataFor = (element: FiroElement): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...(element.customData ?? {}) };
  if (element.containerId) {
    merged[CONTAINER_ID_KEY] = element.containerId;
  }
  // Returned under the `customData` key, not spread at the top level. Spreading
  // the *contents* put `firo.containerId` on the editor element as a property of
  // its own, where the fold looks for `element.customData` and found nothing --
  // so containerId was dropped on every round trip while the type said it
  // survived. Two tests caught it; the type checker could not, because the
  // element has an optional `customData` and a missing one is valid.
  return Object.keys(merged).length ? { customData: merged } : {};
};

/**
 * Project a document note into the editor elements that draw it.
 *
 * Returns two — the note and its label — because that is what the editor draws.
 * The label's box is the note's box; Excalidraw reflows bound labels on render
 * via `redrawTextBoundingBox`, and duplicating that layout here would be a second
 * implementation to keep in step with the first.
 *
 * @throws on a type the editor cannot draw. Silently dropping an element is how
 * a board loses content without anyone noticing.
 */
export const toEditorElements = (element: FiroElement): ExcalidrawElement[] => {
  if (
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "ellipse"
  ) {
    // A shape is one editor element, unlike a note. No label, so no second
    // element, nothing to consume and nothing to fold back.
    return [
      {
        ...sharedBaseFor(element),
        type: element.type,
      } as ExcalidrawElement,
    ];
  }

  if (element.type === "arrow" || element.type === "line") {
    /*
     * A connector is one editor element, and the one place where a projection has
     * to *reinterpret* rather than merely copy.
     *
     * Firo's `bindings` is an unordered set. The renderer needs to know which end
     * of the connector a binding belongs to, or it cannot follow the edge or place
     * an arrowhead. So the array order carries it: first is the start, second is
     * the end. See the note on `LinearElement` for why that is a convention here
     * and not a second relation.
     */
    const [start, end] = element.bindings;
    return [
      {
        ...sharedBaseFor(element),
        type: element.type,
        points: element.points,
        startArrowhead: element.startArrowhead,
        endArrowhead: element.endArrowhead,
        elbowed: element.elbowed,
        startBinding: toFixedPointBinding(start),
        endBinding: toFixedPointBinding(end),
      } as unknown as ExcalidrawElement,
    ];
  }

  if (element.type !== "stickynote") {
    throw new Error(
      `@firo/board: cannot draw element type "${element.type}" (id ${element.id}). ` +
        `Add it to the projection before it can reach the canvas.`,
    );
  }

  const base = baseFor(element);

  const sticky: ExcalidrawStickyNoteElement = {
    ...base,
    type: "stickynote",
    /*
     * The height the user placed the note at, which is not the same as the height
     * it currently occupies — Excalidraw's note grows *above* its baseline and
     * never below. The document records the current height, so the baseline is
     * taken as that. A note then cannot shrink below where it was put, which is
     * the behaviour that matters; "grew upward" is not representable until a note
     * is edited, and editing happens in the editor, which tracks it properly.
     */
    baseHeight: element.height,
  };

  const label: ExcalidrawTextElement = {
    ...base,
    id: labelIdFor(element.id),
    type: "text",
    /*
     * The label is derived state, not a sibling. Sharing the note's `version`
     * would make an edit to one look like an edit to both, so it is pinned at 1
     * and the note's version is what moves.
     */
    version: 1,
    versionNonce: 0,
    index: null,
    containerId: element.id,
    originalText: element.text,
    text: element.text,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily as ExcalidrawTextElement["fontFamily"],
    baseFontSize: element.fontSize,
    textAlign: element.textAlign,
    verticalAlign: element.verticalAlign,
    lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"],
    autoResize: true,
  };

  return [sticky, label];
};

/** Project a z-ordered list. Order is the z-order; a note's label follows it. */
export const toEditorScene = (
  elements: readonly FiroElement[],
): ExcalidrawElement[] => elements.flatMap(toEditorElements);

/**
 * Fold the editor's elements into document elements.
 *
 * This is the write direction, and the one that has to be right: a sticky note
 * and its label arrive as two editor elements and leave as one document element,
 * with the label's text folded into the note's own `text`.
 *
 * Labels are consumed, not emitted. A `text` element with a `containerId` belongs
 * to its container, and emitting it as well would give every note a stray sibling
 * in the document that would render as a duplicate.
 */
/**
 * The fields every element shares, in the document's shape.
 *
 * The counterpart to `sharedBaseFor`. Written once because the fold needs it for
 * every type, and three copies of a twenty-field object is three chances to
 * forget one field — and a forgotten field is a field that silently stops
 * round-tripping.
 */
/**
 * Cast at the single point where the two vocabularies meet.
 *
 * `FillStyle` and `RoundnessType` are declared once in each package, so they are
 * structurally identical but nominally distinct to TypeScript. That is a
 * duplication problem, not a design one — both are derived from the renderer's
 * constants and pinned by tests — so the cast is here rather than a translation
 * table that would have to be kept in step forever.
 */
const sharedDocumentFields = (element: ExcalidrawElement) => {
  return {
    id: element.id as ElementId,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    angle: element.angle,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle,
    strokeWidth: element.strokeWidth,
    strokeStyle: element.strokeStyle,
    roundness: element.roundness,
    roughness: element.roughness,
    opacity: element.opacity,
    version: element.version,
    versionNonce: element.versionNonce,
    index: element.index,
    isDeleted: element.isDeleted,
    groupIds: element.groupIds,
    frameId: element.frameId,
    /*
     * A shape's bindings are a *marker*, not a copy of the geometry.
     *
     * The relation is stored on both endpoints, but only the connector's copy
     * carries anything: the renderer keeps the binding geometry on the
     * connector's `startBinding`/`endBinding` and reduces the shape's side to
     * `{ id, type }` in `boundElements`. So the shape's binding is written with
     * default `focus` and `gap`, and those defaults are not recoverable from the
     * editor.
     *
     * That is fine for drawing — the renderer never reads them from this side —
     * and worth knowing for merging: two clients can hold different `focus`/`gap`
     * on the same relation without either being wrong, because neither value came
     * from the drawing. The connector's copy is the one that matters, and it
     * round trips exactly.
     */
    bindings: (element.boundElements ?? []).map((bound) => ({
      elementId: bound.id as ElementId,
      focus: 0,
      gap: 1,
    })),
    link: element.link,
    locked: element.locked,
    created: element.created ?? null,
    updated: element.updated,
    /*
     * One cast for the whole shape.
     *
     * The document and the editor declare `FillStyle`, `RoundnessType` and
     * `GroupId` separately, so they are structurally identical but nominally
     * distinct. That is duplication, not a difference in meaning, and both sides
     * are pinned to the renderer's constants by tests. Casting once here is
     * better than a field-by-field translation table, which would be a third
     * place to keep in step and would hide the fact that nothing is actually
     * being translated.
     */
  } as unknown as Omit<ShapeElement, "type"> & { type: ShapeElement["type"] };
};

export const fromEditorElements = (
  elements: readonly ExcalidrawElement[],
): FiroElement[] => {
  // Labels first, so a note can find its own without a second pass.
  const labelByContainer = new Map<string, ExcalidrawTextElement>();
  for (const element of elements) {
    if (element.type === "text" && element.containerId) {
      labelByContainer.set(element.containerId, element);
    }
  }

  const folded: FiroElement[] = [];

  for (const element of elements) {
    // A label. Already consumed by its container, or an orphan with no note to
    // belong to — in which case there is nothing to put it in.
    if (element.type === "text") {
      continue;
    }

    if (
      element.type === "rectangle" ||
      element.type === "diamond" ||
      element.type === "ellipse"
    ) {
      /*
       * A shape, and a single editor element — so nothing to consume and nothing
       * to fold. The fields come straight off it.
       *
       * This branch is why the document can be the board's source of truth.
       * Before it existed the fold skipped every type it did not recognise, which
       * meant a rectangle drawn in the app was drawn, looked fine, and reached
       * the document as nothing at all: the editor held four elements and the
       * document held zero. Skipping is still right for a type this version
       * genuinely does not know, and that case is below.
       */
      const fields = sharedDocumentFields(element);
      const { containerId, ...shapeCustomData } = (element.customData ??
        {}) as { containerId?: unknown } & Record<string, unknown>;

      folded.push({
        ...fields,
        type: element.type,
        ...(typeof containerId === "string" ? { containerId } : {}),
        ...(Object.keys(shapeCustomData).length
          ? { customData: shapeCustomData }
          : {}),
      } as ShapeElement);
      continue;
    }

    if (element.type === "arrow" || element.type === "line") {
      const connector = element as unknown as {
        points: unknown;
        startArrowhead: unknown;
        endArrowhead: unknown;
        elbowed: unknown;
        startBinding: {
          elementId: string;
          fixedPoint?: readonly [number, number];
          mode?: string;
        } | null;
        endBinding: {
          elementId: string;
          fixedPoint?: readonly [number, number];
          mode?: string;
        } | null;
      };
      /*
       * A connector, and the only element whose bindings the fold has to
       * *assemble* rather than read.
       *
       * The renderer splits a connector's bindings into `startBinding` and
       * `endBinding`; the document keeps them as one ordered list. So the fold
       * puts start first and end second, and the projection above reads them back
       * the same way. The two must agree, which is the reason both directions
       * live next to each other rather than in separate files.
       */
      const fields = sharedDocumentFields(element);
      const { containerId, ...linearCustomData } = (element.customData ??
        {}) as { containerId?: unknown } & Record<string, unknown>;

      folded.push({
        ...fields,
        type: element.type,
        points: connector.points as LinearElement["points"],
        startArrowhead: (connector.startArrowhead ??
          null) as LinearElement["startArrowhead"],
        endArrowhead: (connector.endArrowhead ??
          null) as LinearElement["endArrowhead"],
        elbowed: connector.elbowed === true,
        /*
         * Order matters and is load-bearing. `fields.bindings` came from the
         * editor's `boundElements`, which for a connector is *not* where the
         * geometry lives -- that is in `startBinding`/`endBinding` -- so the
         * bindings built there are replaced wholesale by these.
         */
        bindings: [
          ...(connector.startBinding
            ? [fromFixedPointBinding(connector.startBinding)]
            : []),
          ...(connector.endBinding
            ? [fromFixedPointBinding(connector.endBinding)]
            : []),
        ].slice(0, 2) as unknown as FiroElement["bindings"],
        ...(typeof containerId === "string" ? { containerId } : {}),
        ...(Object.keys(linearCustomData).length
          ? { customData: linearCustomData }
          : {}),
      } as unknown as LinearElement);
      continue;
    }

    if (element.type !== "stickynote") {
      // A shape the editor can draw that Firo has no type for yet — `freedraw`,
      // `image`, `frame`, `embeddable`. Skipped rather than thrown: a board may
      // legitimately hold an element type this version does not understand, and
      // refusing to sync would freeze the board over something the user can see.
      //
      // The gap is narrowing rather than hypothetical: shapes and connectors are
      // in, so what remains is drawing, images and frames. `freedraw` is next
      // because freehand is the one people reach for when they are not thinking
      // about structure.
      continue;
    }

    const label = labelByContainer.get(element.id);
    const { containerId, ...customData } = (element.customData ?? {}) as {
      containerId?: unknown;
    } & Record<string, unknown>;

    folded.push({
      id: element.id as ElementId,
      type: "stickynote",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: element.angle,
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      fillStyle: element.fillStyle as FiroElement["fillStyle"],
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
      roundness: element.roundness as FiroElement["roundness"],
      roughness: element.roughness,
      opacity: element.opacity,
      version: element.version,
      versionNonce: element.versionNonce,
      index: element.index,
      isDeleted: element.isDeleted,
      groupIds: element.groupIds,
      frameId: element.frameId,
      /*
       * Lossy, and the reason this must not be used to write a whole element
       * back over the document: the editor's `boundElements` carries no `focus`
       * or `gap`, so bindings read this way arrive with the geometry the document
       * is holding replaced by nothing. Sync goes field by field for this.
       */
      bindings: (element.boundElements ?? []).map((bound) => ({
        elementId: bound.id as ElementId,
        focus: 0,
        gap: 1,
      })),
      /*
       * `originalText`, not `text`.
       *
       * A sticky note's bound label carries two strings: `originalText` is what
       * the user typed, and `text` is that string after `wrapText` has inserted
       * hard line breaks to fit the note's width (element/src/stickyNote.ts).
       *
       * Reading `text` stores the *layout* as if it were the content. The note
       * still looks right, so nothing appears broken — but every save bakes the
       * current wrapping into the document, and the next layout pass wraps text
       * that already has breaks in it. Notes that have been edited enough times
       * accumulate line breaks, and the corruption is invisible until someone
       * widens the note and finds the text is not where they left it.
       *
       * Found by drawing a note, typing "hello board", and finding "hello
       * newline board" in the document.
       */
      text: label?.originalText ?? "",
      fontSize: label?.fontSize ?? 20,
      fontFamily: label?.fontFamily ?? 1,
      textAlign: label?.textAlign ?? "center",
      verticalAlign: label?.verticalAlign ?? "middle",
      isContainer: false,
      link: element.link,
      locked: element.locked,
      created: element.created ?? null,
      updated: element.updated,
      ...(typeof containerId === "string" ? { containerId } : {}),
      ...(Object.keys(customData).length ? { customData } : {}),
    } as unknown as StickyNoteElement);
  }

  return folded;
};

/**
 * The editor elements for a document note, keyed by id, for tests and for callers
 * that need to reason about a single note's projection.
 */
export const toEditorElement = (
  element: FiroElement,
): NonDeletedExcalidrawElement =>
  toEditorElements(element)[0] as NonDeletedExcalidrawElement;
