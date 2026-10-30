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

import { generateKeyBetween } from "@firo/fractional-indexing";
import { getStickyNoteLayout } from "@firo/element";

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
  FrameElement,
  FreedrawElement,
  ImageCrop,
  ImageElement,
  LinearElement,
  ShapeElement,
  StickyNoteElement,
  TextElement,
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
 * Where the durable facilitation flags are kept, and why they need a hiding place
 * at all.
 *
 * Excalidraw's element has no `hiddenUntilRevealed` and no `hideInPresentation`,
 * so there is nowhere to put them. `customData` is the documented escape hatch for
 * exactly this, and it is the same situation as `containerId` above -- with one
 * difference that matters. `containerId` is null for every note on a board today,
 * so losing it is invisible until the first section exists. A flag is `false` or
 * absent for every note until somebody hides one, and losing it means a note a
 * facilitator deliberately hid for a private brainstorm is suddenly in front of
 * the room, with nothing in the file to say that was ever arranged.
 *
 * So the same rule applies with more force: namespaced, so they cannot collide
 * with a host application's own keys, and lifted back out in `splitCustomData`
 * rather than left to be read out of `customData` by whoever wants the value.
 *
 * Only `true` crosses. Absent and `false` are one answer -- see
 * `@firo/schema`'s `facilitation.ts` -- so writing `false` would put two keys on
 * every element of every board that predates the fields, and the editor would hand
 * them back on every fold.
 *
 * ## They are not editor-owned, and `EDITOR_OWNED_FIELDS` does not list them
 *
 * They are facilitator-owned: set by a document mutation, never by an editor
 * gesture, because the editor has no control that writes them. The echo check
 * compares the fields the editor owns precisely to decide "did the user change
 * this, or is the editor handing back what I sent it" -- and for these two the
 * answer is always the latter, because the projection wrote them and the editor
 * round-tripped `customData` untouched. Listing them would therefore be dead
 * weight: a comparison that can never differ, which reads as coverage and does
 * nothing. `pointsSync.test.ts` pins the decision rather than leaving it to be
 * re-litigated.
 */
const HIDDEN_UNTIL_REVEALED_KEY = "firo.hiddenUntilRevealed";
const HIDE_IN_PRESENTATION_KEY = "firo.hideInPresentation";

/**
 * Split an editor element's `customData` into Firo's own fields and everything
 * else.
 *
 * ## Why this is one function and not seven destructurings
 *
 * It was seven, each written as `const { containerId, ...rest } = element.customData` —
 * reading a key literally named `containerId` from an object whose only key is
 * `firo.containerId`. Every one of them found `undefined`, so the document's
 * `containerId` was never set on the way back.
 *
 * Measured, projecting and folding one shape four times:
 *
 * ```
 * cycle 0: containerId="sec1"  customData=undefined
 * cycle 1: containerId=undefined customData={"firo.containerId":"sec1"}
 * cycle 2: containerId=undefined customData={"firo.containerId":"sec1"}
 * ```
 *
 * The value was never destroyed — it rode along in `customData` — so the existing test
 * asserting it was "preserved" passed, and nothing looked broken. But the *field* was
 * gone from the first fold onward, which is the field ADR-0007 and rule 4 in
 * `AGENTS.md` are about, and the field anything reading a container's children will
 * look at. It survived in a place nobody reads.
 *
 * So it is lifted out here, once, and the duplicate is **removed** rather than left
 * behind. Leaving it would be two representations of one value that could disagree,
 * which is the same argument that keeps a frame from also listing its children.
 *
 * A note's own text is not affected: Excalidraw's `containerId` on a text element
 * means "this is a bound label", which the fold handles by consuming the element
 * before it ever reaches here. This key is Firo's own and means nesting.
 *
 * The two facilitation flags are lifted out the same way and for the same reason:
 * left inside `customData` they would still be *preserved*, so a test asserting
 * that would keep passing, while the field every consumer reads by name stayed
 * absent.
 *
 * Only a `boolean` is lifted, and anything else under those keys is **dropped**
 * rather than coerced -- the same treatment `containerId` has always had. The key
 * is in our namespace, so we own what is under it, and a string where a flag
 * belongs is a value no version of Firo ever wrote. The repair belongs to the
 * schema, which coerces it and records it; by the time an element reaches the
 * editor it has been through `loadBoard`.
 *
 * Nothing here throws either: this runs over the whole scene on every editor
 * change, so a throw would take the board's sync down rather than lose one value.
 */
const splitCustomData = (element: {
  customData?: Record<string, unknown>;
}): {
  containerId?: ElementId;
  customData?: Record<string, unknown>;
  /** Ready to spread onto a folded element. */
  hiddenUntilRevealed?: boolean;
  hideInPresentation?: boolean;
} => {
  const {
    [CONTAINER_ID_KEY]: rawContainerId,
    [HIDDEN_UNTIL_REVEALED_KEY]: rawHidden,
    [HIDE_IN_PRESENTATION_KEY]: rawHiddenInPresentation,
    ...rest
  } = element.customData ?? {};

  return {
    ...(typeof rawContainerId === "string"
      ? { containerId: rawContainerId as ElementId }
      : {}),
    ...(Object.keys(rest).length ? { customData: rest } : {}),
    ...(typeof rawHidden === "boolean"
      ? { hiddenUntilRevealed: rawHidden }
      : {}),
    ...(typeof rawHiddenInPresentation === "boolean"
      ? { hideInPresentation: rawHiddenInPresentation }
      : {}),
  };
};

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
 * Fields the editor owns outright.
 *
 * ## This list decides echo detection, and nothing else
 *
 * It is read in exactly one place: `isEcho` in `sync.ts`. It does **not** decide
 * what gets written back — that is `changedFields`, which diffs the folded element
 * against the document field by field and is not restricted to this list. The
 * distinction matters: a field missing from here is not prevented from being
 * written, it is prevented from being *noticed*, which is worse.
 *
 * A field that belongs here but is absent is invisible to the echo check, so a
 * change to *only* that field is discarded as an echo. The element still exists in
 * the document, so nothing looks missing: it is frozen at whatever it was first
 * written with while the canvas shows the new value. No error, no warning, and
 * nothing in the file to say which of the two is right.
 *
 * `customData` is deliberately excluded. The editor round-trips it untouched, so
 * it belongs to nobody in particular, and excluding it keeps a future editor that
 * normalises `customData` from silently rewriting a host application's data.
 *
 * ## The durable facilitation flags are excluded too, and that is a decision
 *
 * `hiddenUntilRevealed` and `hideInPresentation` travel through this boundary in
 * `customData` -- see the namespaced keys beside `CONTAINER_ID_KEY` -- and are
 * deliberately absent from this list, because **the editor does not own them.**
 * They are set by a document mutation and no editor gesture writes them, so the
 * echo check's question ("did the user change this, or is the editor handing back
 * what I sent it?") has only one answer for them, and it is always the second.
 *
 * Listing them would therefore be a comparison that can never differ: dead weight
 * that reads as coverage. The staleness bug this list exists to prevent cannot
 * happen here, because the value arrives *from* this projection on the way in.
 *
 * Worth knowing before reading the derived tests as coverage of this: they derive
 * from *editor* element fixtures, and no editor element carries these names at top
 * level, so neither direction of that suite can see them either way.
 * `pointsSync.test.ts` pins the decision explicitly for that reason.
 *
 * ## Adding an element type means adding its fields here
 *
 * This list was wrong for a long time, and always in the same silent way. `points`
 * was missing from the beginning, so every bent connector was affected;
 * `pressures`, `simulatePressure` and `strokeOptions` were missing when `freedraw`
 * was added; and `groupIds`, `locked`, `link`, `frameId`, `polygon`, `elbowed` and
 * the two arrowheads were missing the whole time, which is to say grouping,
 * locking, hyperlinks and arrowhead changes have never reached the document.
 *
 * Measured for the stroke case: the document held 16 points where the editor held
 * 15, and stayed there indefinitely, because the correcting push was thrown away
 * each time.
 *
 * So the rule is not "add the scalars". It is **every field the editor owns and
 * the document must track**, and `pointsSync.test.ts` fails by name if one is left
 * out — it derives the list from what each element type actually carries, minus a
 * set of exclusions that each carry a stated reason.
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
  /*
   * The path, for connectors and strokes alike.
   *
   * A field missing from this list is invisible to the echo check, and the effect
   * is silent: the change is discarded as an echo and the document keeps a stale
   * value while the canvas shows the new one. `points` was missing from the start,
   * which is why extending a stroke or a bent connector left the document one
   * vertex behind with no error anywhere.
   *
   * So the list is not "the fields that happen to be scalars". It is every field
   * the editor owns and the document must track, and adding a field to an element
   * type means adding it here too.
   */
  "points",
  /*
   * The rest of a stroke's data. All four change how the stroke draws, and all
   * four were missing together -- the same silent staleness, on a type added in
   * one go.
   */
  "pressures",
  "simulatePressure",
  "strokeOptions",
  /*
   * Grouping, locking, links and frames. Also missing, also for the same reason,
   * and each one a feature that would have appeared broken in a way that looks
   * like a rendering bug: group two shapes and the document does not record it,
   * lock an element and it is not locked in the document, add a link and it is
   * not there. The canvas shows the change, so it reads as "the picture is right
   * and the file is behind", which is the hardest kind of bug to report.
   *
   * Grouping is Phase 3 work, so this is what unblocks it rather than a surprise
   * it would have sprung.
   */
  "groupIds",
  "locked",
  "link",
  "frameId",
  /*
   * A connector's own fields. `startArrowhead` and `endArrowhead` decide what the
   * ends look like, `polygon` whether the path closes, `elbowed` whether it is
   * routed in segments -- all editor-owned, all missing, all silently dropped.
   *
   * Note that the *bindings* are not here. `startBinding` and `endBinding` are
   * excluded rather than listed, because the fold reads them to build the
   * document's ordered `bindings`, and comparing the inputs as well would mean two
   * representations of one relation that could disagree.
   */
  "startArrowhead",
  "endArrowhead",
  "polygon",
  "elbowed",
  /*
   * A frame's name.
   *
   * One field, and it is here for the same reason as every other entry: a rename
   * that is not in this list compares equal on everything that is, so the push is
   * discarded as an echo and the frame keeps the name it was created with while the
   * canvas shows the new one. Nothing looks missing, because the frame is still
   * there — it is just under the wrong name, which is the hardest kind of stale to
   * notice and the easiest to blame on the renderer.
   */
  "name",
  /*
   * An image's own fields, all four, and all four change how the picture draws.
   *
   * `fileId` is the one that matters most: it is the reference to the bytes, so a
   * missing entry here means the document keeps pointing at the first blob an image
   * ever had. `scale` is a pair, and the echo check compares with `sameValue` rather
   * than `===` precisely so that an array-valued field can be on this list at all —
   * with `===` a listed array field would mean no push is ever an echo, the guard
   * would do nothing, and the loop it exists to stop would become possible.
   *
   * `status` is included even though it describes the editor's relationship with
   * its own blob store rather than the document's. Leaving it off would freeze the
   * field at whatever it was first written with, and the field would then be a
   * number nothing had ever agreed on.
   */
  "fileId",
  "status",
  "scale",
  "crop",
  "tags",
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
 * Whether a value has the shape of a crop window.
 *
 * Structural rather than a cast, for the reason the fold reads its fields
 * defensively everywhere: this runs over the whole scene on every editor change,
 * and a crop missing two of its six numbers is a corrupt element rather than a
 * reason to stop syncing the board. Returns a narrowed value so the caller copies
 * it without a second assertion.
 *
 * All six are required. A crop cannot be expressed against an image whose natural
 * size is unknown, so a partial one is not a crop with defaults — it is nothing, and
 * the schema's validator drops it for the same reason.
 */
const plainCrop = (value: unknown): value is ImageCrop => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const crop = value as Record<string, unknown>;
  return (
    typeof crop.x === "number" &&
    typeof crop.y === "number" &&
    typeof crop.width === "number" &&
    typeof crop.height === "number" &&
    typeof crop.naturalWidth === "number" &&
    typeof crop.naturalHeight === "number"
  );
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
  ...(element.tags ? { tags: element.tags } : {}),
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
 *
 * The three namespaced keys are written here and lifted back out in
 * `splitCustomData`. `firo.*` rather than bare names, so they cannot collide with
 * a host application's own `customData` — a collision here would mean the fold
 * reading somebody else's `containerId` as a container.
 *
 * The flags are written only when `true`, for the same reason the note's
 * `containerId` is: absent and `false` are one answer, so writing `false` would
 * put two keys on every element of a board nobody hid anything on.
 */
const customDataFor = (element: FiroElement): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...(element.customData ?? {}) };
  if (element.containerId) {
    merged[CONTAINER_ID_KEY] = element.containerId;
  }
  if (element.hiddenUntilRevealed) {
    merged[HIDDEN_UNTIL_REVEALED_KEY] = true;
  }
  if (element.hideInPresentation) {
    merged[HIDE_IN_PRESENTATION_KEY] = true;
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
 * The pair is laid out here, with the same `getStickyNoteLayout` the editor's
 * own fit uses: the document holds the note's pre-fit ceiling as its fontSize,
 * and the post-mount reflows that would otherwise re-derive the geometry race
 * the font-loaded event — a race the label loses on most warm-cache loads,
 * rendering oversized text that overflows the note. A projected note is born
 * fitted; the editor's reflows only re-derive the same geometry afterwards.
 *
 * @throws on a type the editor cannot draw. Silently dropping an element is how
 * a board loses content without anyone noticing.
 */
export const toEditorElements = (
  element: FiroElement,
  nextIndex?: FiroElement["index"],
): ExcalidrawElement[] => {
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

  if (element.type === "text") {
    /*
     * A free-standing annotation, and one editor element.
     *
     * The asymmetry with a note is the whole point: a note projects to *two* elements
     * because its label is derived state, whereas an annotation is a single object. A
     * projection that emitted two here would leave a stray label in the scene for the
     * fold to trip over on the next change.
     *
     * `text` and `originalText` are both set from the stored value, and that is not a
     * shortcut. The stored value is the *input* string -- the fold reads
     * `originalText`, not the wrapped `text` -- and the renderer re-wraps on render and
     * writes the result back to `text`, separating the two as soon as it lays the text
     * out.
     */
    const annotation = element as unknown as {
      text: string;
      fontSize: number;
      fontFamily: number;
      textAlign: ExcalidrawTextElement["textAlign"];
      verticalAlign: ExcalidrawTextElement["verticalAlign"];
      autoResize: boolean;
      lineHeight: number;
    };

    return [
      {
        ...sharedBaseFor(element),
        type: "text",
        text: annotation.text,
        originalText: annotation.text,
        fontSize: annotation.fontSize,
        fontFamily:
          annotation.fontFamily as ExcalidrawTextElement["fontFamily"],
        textAlign: annotation.textAlign,
        verticalAlign: annotation.verticalAlign,
        autoResize: annotation.autoResize,
        lineHeight: annotation.lineHeight,
        // No container: that is what makes this an annotation and not a label.
        containerId: null,
        /*
         * `null` rather than a copied size. The field is the size the user picked, from
         * which auto-fit derives `fontSize`, and only a sticky note's label has one. An
         * annotation must not claim to be a label -- see the note on the renderer's
         * `baseFontSize`.
         */
        baseFontSize: null,
      } as unknown as ExcalidrawElement,
    ];
  }

  if (element.type === "freedraw") {
    /*
     * A freehand stroke is one editor element and a straight copy, unlike a note.
     *
     * Every field the renderer needs is carried, and that is the whole reason this
     * branch exists. A stroke with its `pressures`, `simulatePressure` and
     * `strokeOptions` dropped still loads and still draws — it just draws as an
     * even, unsmoothed ribbon, so a file missing them would look like a
     * deliberately plain stroke rather than like damage.
     *
     * The three arrays and the options object are copied rather than shared.
     *
     * The editor builds a stroke's points by *replacing* the array
     * (`points: [...points, newPoint]`), so sharing would happen to be safe today.
     * It is copied anyway because that is a property of current editor code rather
     * than an invariant anyone has written down: an element that is handed the
     * document's own array and then pushed into would change the document with no
     * commit, no diff and no undo entry, and the next fold would read the mutated
     * values and commit them as if the user had made them. A stroke is a few
     * hundred pairs and projections happen on document changes, not per frame, so
     * the copy is not worth the question.
     */
    return [
      {
        ...sharedBaseFor(element),
        type: "freedraw",
        points: [...element.points],
        pressures: [...element.pressures],
        simulatePressure: element.simulatePressure,
        strokeOptions: { ...element.strokeOptions },
        /*
         * `lastCommittedPoint` is left unset on purpose. It is live gesture state
         * the editor rewrites as the pen moves; the document does not store it, so
         * there is nothing here to restore. The renderer falls back to the last
         * entry of `points` when it is absent.
         */
      } as unknown as ExcalidrawElement,
    ];
  }

  if (element.type === "frame") {
    /*
     * A frame is one editor element and a straight copy, like a shape.
     *
     * `name` is passed through as it stands, `null` included. The renderer reads it
     * to draw the label at the top-left of the frame and draws nothing for `null`,
     * which is exactly what an unnamed frame should look like.
     *
     * There is no `children` to project, and that is not an omission. Membership
     * travels the other way: the elements inside the frame carry its id in
     * `frameId`, and the renderer collects them by asking which elements name this
     * frame. A frame that also listed its children would be holding the same
     * relation twice, and the two copies would disagree the first time somebody
     * dragged a shape from one frame to another.
     */
    return [
      {
        ...sharedBaseFor(element),
        type: "frame",
        name: element.name,
      } as unknown as ExcalidrawElement,
    ];
  }

  if (element.type === "image") {
    /*
     * An image is one editor element and a straight copy of four fields.
     *
     * `fileId` is the reference the asset store is keyed by, and it is copied
     * verbatim. The renderer hands it to whoever loads the bytes; this package does
     * not fetch, decode or draw, and a projection that tried to would be a second
     * place where image loading lives.
     *
     * The `scale` pair and the crop object are copied rather than shared, for the
     * stroke's reason: the editor may replace them or mutate them, and today it
     * happens to replace. Sharing would be safe by accident.
     */
    return [
      {
        ...sharedBaseFor(element),
        type: "image",
        fileId: element.fileId,
        status: element.status,
        scale: [element.scale[0], element.scale[1]] as [number, number],
        crop: element.crop ? { ...element.crop } : null,
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
  const labelId = labelIdFor(element.id);
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
    boundElements: [
      { id: labelId, type: "text" },
      ...(base.boundElements ?? []),
    ],
  };

  const label: ExcalidrawTextElement = {
    ...base,
    id: labelId,
    type: "text",
    /*
     * The label is derived state, not a sibling. Sharing the note's `version`
     * would make an edit to one look like an edit to both, so it is pinned at 1
     * and the note's version is what moves.
     */
    version: 1,
    versionNonce: 0,
    /*
     * The label gets a real fractional index, one step after the note's — which is
     * where Excalidraw puts it when a person draws the note. Measured, drawing a
     * note in the app: note `"a0"`, label `"a1"`.
     *
     * It was `null` here, on the reasoning that a derived element has no place in
     * the z-order. That is wrong, and it only showed up once persistence existed.
     *
     * `index: null` is not a tolerated value: `validateFractionalIndices` runs on
     * every scene change in development and throws `InvalidFractionalIndexError` on
     * it. Nothing noticed while the editor built its own notes, because Excalidraw
     * gives the label a proper index when *it* creates one. The projection only runs
     * on restore, so the invalid label entered the scene the first time a board came
     * back from storage — that is, the first time a saved board was reopened. A board
     * that saved perfectly then failed to open, which is the worst possible moment to
     * discover it.
     *
     * Derived from the note's index rather than invented, so it is stable: the same
     * note projects to the same label index on every restore, and two notes can never
     * collide on one.
     */
    index: generateKeyBetween(
      element.index,
      nextIndex ?? null,
    ) as ExcalidrawTextElement["index"],
    containerId: element.id,
    originalText: element.text,
    text: element.text,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily as ExcalidrawTextElement["fontFamily"],
    baseFontSize: element.fontSize,
    ...(typeof element.customData?.autoFontSize === "boolean"
      ? { autoFontSize: element.customData.autoFontSize }
      : {}),
    textAlign: element.textAlign,
    verticalAlign: element.verticalAlign,
    lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"],
    autoResize: true,
  };

  const layout = getStickyNoteLayout(sticky, label);
  Object.assign(sticky, layout.container);
  if (layout.text) {
    /*
     * Geometry only. `baseFontSize` and `autoFontSize` stay as the document
     * recorded them (above): they are the user's intent, and overwriting them
     * with the fit's working values would make every projection differ from
     * the document it came from — the sync echo would read a change that
     * never happened.
     */
    const { text, fontSize, width, height, x, y } = layout.text;
    Object.assign(label, { text, fontSize, width, height, x, y });
  }

  return [sticky, label];
};

/**
 * Project a z-ordered list. Order is the z-order; a note's label follows it.
 *
 * The successor's index goes in with each element: a note's label is derived
 * between the note and whatever follows it, so densely indexed boards —
 * imports, where indices are assigned a0, a1, a2 at load — still get a label
 * that sorts before the next note instead of colliding with it.
 */
export const toEditorScene = (
  elements: readonly FiroElement[],
): ExcalidrawElement[] =>
  elements.flatMap((element, i) =>
    toEditorElements(element, elements[i + 1]?.index),
  );

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
    ...(element.tags ? { tags: element.tags } : {}),
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
    bindings: (element.boundElements ?? [])
      .filter((bound) => bound.type === "arrow")
      .map((bound) => ({
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

export const editorLabelsByContainer = (
  elements: readonly ExcalidrawElement[],
): Map<string, ExcalidrawTextElement> => {
  // Labels first, so a note can find its own without a second pass.
  //
  // Only *live* labels. A tombstone is skipped, and that is the whole point:
  // double-clicking a note to type in it tombstones the note's original label and
  // creates a replacement bound to the same container, so a note in mid-edit has
  // two labels pointing at it -- one deleted, one current.
  //
  // Taking whichever came last in scene order made note text a coin flip. Measured:
  // typing "the quick brown fox..." into a note left the document holding an empty
  // string while the canvas showed the text, because the tombstone sorted last and
  // overwrote the live label in this map. The same edit on a differently-sized note
  // happened to keep the text, so it looked intermittent and was really just
  // scene order.
  const labelByContainer = new Map<string, ExcalidrawTextElement>();
  for (const element of elements) {
    if (element.type === "text" && element.containerId && !element.isDeleted) {
      labelByContainer.set(element.containerId, element);
    }
  }
  return labelByContainer;
};

/**
 * Fold one editor element into document form, or `null` when it has none.
 *
 * The editor's whole scene is folded by `fromEditorElements`, but `BoardSync`
 * also folds scenes *partially* -- when only a handful of elements changed it
 * folds just those and reuses the last folded copy for the rest. Both callers
 * need the same per-element translation, so the fold lives here: one element
 * in, its document form out, and `null` for the elements the document has no
 * form for -- a bound label (consumed by its container and not a document
 * element in its own right) and a type this version of the schema does not
 * know (`embeddable`, `magicframe`).
 *
 * `labelByContainer` comes from `editorLabelsByContainer`, built once over the
 * whole scene; a note reads its text from there.
 */
export const foldEditorElement = (
  element: ExcalidrawElement,
  labelByContainer: ReadonlyMap<string, ExcalidrawTextElement>,
): FiroElement | null => {
  if (element.type === "text") {
    /*
     * A text element is one of two things, and which one is a single nullable
     * field.
     *
     * With a `containerId` it is a *label*: already consumed by its container above,
     * or an orphan with no note to belong to, and either way there is nothing to put
     * it in. Consumed.
     *
     * Without one it is a *free-standing annotation* — the text tool's output, with
     * no box around it — and it is a document element in its own right.
     *
     * This branch is why that distinction is drawn here rather than by type. Both are
     * `type: "text"` in the editor, so a fold that skipped the type outright dropped
     * every annotation: measured, the editor held `["freedraw", "text"]` and the
     * document held `[]`. It drew correctly, because the canvas never asks the
     * document.
     */
    if (element.containerId) {
      return null;
    }

    const annotation = element as unknown as {
      originalText: string;
      fontSize: number;
      fontFamily: number;
      textAlign: TextElement["textAlign"];
      verticalAlign: TextElement["verticalAlign"];
      autoResize: boolean;
      lineHeight: number;
    };

    const textFields = sharedDocumentFields(element);
    const {
      containerId,
      customData: textCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
      ...textFields,
      type: "text",
      /*
       * `originalText`, not `text` — the same reasoning as a note's label, and the
       * same bug if it is ignored. `text` is the input after wrapping inserted hard
       * breaks to fit the width, so storing it bakes the current layout into the
       * document; every later edit then wraps text that already has breaks in it, and
       * the damage only becomes visible when someone widens the element.
       */
      text: annotation.originalText,
      fontSize: annotation.fontSize,
      fontFamily: annotation.fontFamily,
      textAlign: annotation.textAlign,
      verticalAlign: annotation.verticalAlign,
      autoResize: annotation.autoResize,
      lineHeight: annotation.lineHeight,
      ...(containerId ? { containerId } : {}),
      ...(textCustomData ? { customData: textCustomData } : {}),
      ...facilitationFlags,
    } as unknown as TextElement;
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
    /*
     * `...facilitationFlags` is spread from the rest of `splitCustomData`'s
     * result, so every branch gets the same two flags from one implementation and
     * a branch cannot forget them. The other six branches are identical here --
     * deliberately: a per-branch hand-written `hiddenUntilRevealed: element
     * .customData?.[...]` is seven copies, and the copy somebody misses loses a
     * facilitator's decision rather than raising an error.
     */
    const {
      containerId,
      customData: shapeCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
      ...fields,
      type: element.type,
      ...(containerId ? { containerId } : {}),
      ...(shapeCustomData ? { customData: shapeCustomData } : {}),
      ...facilitationFlags,
    } as ShapeElement;
  }

  if (element.type === "freedraw") {
    /*
     * A stroke, and a single editor element — so nothing to consume and nothing
     * to fold, the same as a shape.
     *
     * Every pressure field is copied. This is where a stroke is most easily
     * damaged: the fold runs on every editor change, so a stroke that lost
     * `pressures` here would come back on the next sync as a flat line and look
     * like a rendering bug rather than a lost field.
     *
     * The fields are read defensively, which they are not elsewhere in this
     * fold, and the reason is the spreads. `[...stroke.pressures]` on an element
     * with no `pressures` throws, and the fold runs over the whole scene on
     * every editor change — so one malformed stroke would take the entire board's
     * sync down with it. That is the failure the "skips a type the document has
     * no schema for" test exists to prevent, reached from the other direction.
     *
     * An incomplete stroke is folded with defaults rather than dropped: the
     * schema's validator repairs it on load, so a stroke that arrives missing
     * its pressures becomes a valid even-width stroke instead of vanishing.
     */
    const stroke = element as unknown as {
      points?: unknown;
      pressures?: readonly number[];
      simulatePressure?: boolean;
      strokeOptions?: Partial<FreedrawElement["strokeOptions"]>;
    };

    const fields = sharedDocumentFields(element);
    const {
      containerId,
      customData: strokeCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
      ...fields,
      type: "freedraw",
      points: Array.isArray(stroke.points) ? [...stroke.points] : [],
      pressures: Array.isArray(stroke.pressures) ? [...stroke.pressures] : [],
      // `true` is the safe default: the renderer can draw from points alone,
      // whereas `false` with no pressures hands it `undefined` per point.
      simulatePressure: stroke.simulatePressure !== false,
      strokeOptions: {
        variability: stroke.strokeOptions?.variability ?? "variable",
        streamline: stroke.strokeOptions?.streamline ?? 0.4,
      },
      ...(containerId ? { containerId } : {}),
      ...(strokeCustomData ? { customData: strokeCustomData } : {}),
      ...facilitationFlags,
    } as unknown as FreedrawElement;
  }

  if (element.type === "frame") {
    /*
     * A frame, and a single editor element — nothing to consume, nothing to fold,
     * the same as a shape.
     *
     * `name` is copied straight across, including `null`. An unnamed frame is a
     * real state and not a missing value, and folding it to `""` would make every
     * unnamed frame on a board indistinguishable from a frame someone cleared.
     *
     * A frame's *membership* arrives on the elements inside it, as `frameId`, and
     * those are folded by their own branches. There is deliberately no list of
     * children here: the base already carries the relation, and a second copy of it
     * is a second thing to disagree.
     */
    const frame = element as unknown as { name?: string | null };

    const fields = sharedDocumentFields(element);
    const {
      containerId,
      customData: frameCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
      ...fields,
      type: "frame",
      name: typeof frame.name === "string" ? frame.name : null,
      ...(containerId ? { containerId } : {}),
      ...(frameCustomData ? { customData: frameCustomData } : {}),
      ...facilitationFlags,
    } as FrameElement;
  }

  if (element.type === "image") {
    /*
     * An image, and a single editor element. The last type the fold did not know,
     * so the last one that could be drawn, autosaved in the editor's own copy,
     * and then absent from every file.
     *
     * Read defensively, like the stroke branch and for the same reason: the fold
     * runs over the whole scene on every editor change, so a spread of an element
     * whose `scale` is missing would take the entire board's sync down rather than
     * lose one picture.
     *
     * `fileId` is folded as `null` when absent rather than defaulted to anything.
     * An image with no reference is the renderer's pending case — placed, not yet
     * read — and inventing an id for it would produce an element pointing at bytes
     * that do not exist. That is the state the file writer refuses to export, so it
     * has to be representable rather than papered over.
     */
    const image = element as unknown as {
      fileId?: string | null;
      status?: string;
      scale?: unknown;
      crop?: ImageCrop | null;
    };

    const fields = sharedDocumentFields(element);
    const {
      containerId,
      customData: imageCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
      ...fields,
      type: "image",
      fileId: typeof image.fileId === "string" ? image.fileId : null,
      status:
        image.status === "pending" || image.status === "error"
          ? image.status
          : "saved",
      /*
       * Copied rather than shared, for the stroke's reason. The editor may or may
       * not replace this array rather than mutate it — that is current behaviour,
       * not an invariant — and an element handed the document's own pair and then
       * written into would change the document with no commit, no diff and no undo
       * entry.
       */
      scale: Array.isArray(image.scale)
        ? ([image.scale[0], image.scale[1]] as [number, number])
        : [1, 1],
      crop: plainCrop(image.crop) ? { ...image.crop } : null,
      ...(containerId ? { containerId } : {}),
      ...(imageCustomData ? { customData: imageCustomData } : {}),
      ...facilitationFlags,
    } as unknown as ImageElement;
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
    const {
      containerId,
      customData: linearCustomData,
      ...facilitationFlags
    } = splitCustomData(element);

    return {
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
      ...(containerId ? { containerId } : {}),
      ...(linearCustomData ? { customData: linearCustomData } : {}),
      ...facilitationFlags,
    } as unknown as LinearElement;
  }

  if (element.type !== "stickynote") {
    // A shape the editor can draw that Firo has no type for — `embeddable`, and
    // `magicframe`. Skipped rather than thrown: a board may legitimately hold an
    // element type this version does not understand, and refusing to sync would
    // freeze the board over something the user can see.
    //
    // The gap is now empty of everything a person can draw with the toolbar. It was
    // not: `freedraw`, `image` and `frame` were all in this branch, which means a
    // stroke, a picture or a frame drawn in the app reached the document as nothing
    // at all — drawn correctly, saved by the editor's own redundant copy, and
    // absent from every `.firo` file. Anything added here needs an element type in
    // `@firo/schema` and a branch above, in the same commit.
    return null;
  }

  const label = labelByContainer.get(element.id);
  const {
    containerId,
    customData: noteCustomData,
    ...facilitationFlags
  } = splitCustomData(element);

  return {
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
    bindings: (element.boundElements ?? [])
      .filter((bound) => bound.type === "arrow")
      .map((bound) => ({
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
    ...(containerId ? { containerId } : {}),
    ...(noteCustomData || typeof label?.autoFontSize === "boolean"
      ? {
          customData: {
            ...noteCustomData,
            ...(typeof label?.autoFontSize === "boolean"
              ? { autoFontSize: label.autoFontSize }
              : {}),
          },
        }
      : {}),
    ...facilitationFlags,
  } as unknown as StickyNoteElement;
};

/**
 * Fold a whole editor scene into document form.
 *
 * Nothing more than the per-element fold applied in scene order — the scene
 * order *is* the z-order, and the fold preserves it. Kept as a named export
 * because it is the wholesale path: the initial sync, a full pull's echo, and
 * the pushes `BoardSync` sends when the scene's *composition* changed.
 */
export const fromEditorElements = (
  elements: readonly ExcalidrawElement[],
): FiroElement[] => {
  const labelByContainer = editorLabelsByContainer(elements);
  const folded: FiroElement[] = [];

  for (const element of elements) {
    const one = foldEditorElement(element, labelByContainer);
    if (one) {
      folded.push(one);
    }
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
