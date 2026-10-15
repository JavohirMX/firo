/**
 * The `text` element type: a free-standing text annotation on the canvas.
 *
 * ## What this is for
 *
 * The text tool draws a bare annotation — no box, no note, nothing to click. Until
 * this type existed the fold consumed *every* text element as a note's label, so an
 * annotation was drawn, looked correct, and reached the document as nothing. Measured:
 * the editor held `["freedraw", "text"]` and the document held `[]`. Same failure as
 * `freedraw` had, and the same silence — the canvas draws it because the canvas never
 * asks the document.
 *
 * ## Why `text` is a plain string and not a ProseMirror document
 *
 * ADR-0004 says "no text as a string, anywhere", with deliberate exceptions for frame
 * names, connector labels and file paths. A sticky note extended that list, on the
 * argument that a short label in a box is not a document and a ProseMirror instance
 * per note is a real cost on a board with hundreds.
 *
 * The same argument holds here, and more strongly: **Excalidraw's text element has no
 * rich text at all.** No bold, no lists, no links, no inline marks — `text` and
 * `originalText` are the only content fields. A ProseMirror document for it could
 * only ever contain a single text node, so it would be a structure with one
 * inhabitant, stored in the document, projected back to the canvas as the plain string
 * the renderer actually draws. It would buy nothing and cost a conversion on every
 * edit.
 *
 * So this follows the sticky note, and the tension is named rather than hidden: the
 * exception list in ADR-0004 does not mention standalone text, and this is a second
 * extension of it. Phase 4's cards and frames are where rich text actually arrives —
 * they have marks, lists and embedded content to represent, and this element does not.
 *
 * If a future Firo gives canvas text formatting, this becomes a **migration**, not a
 * breaking change: the field gains a sibling, `originalText` becomes the fallback for
 * a document that has not been converted. The same is already true of the sticky note.
 */
import { allKnownFields, registerElementType } from "../registry.js";

import {
  facilitationFlags,
  V1_TO_V2_FACILITATION_FLAGS,
} from "../facilitation.js";
import { elementTags, V2_TO_V3_ELEMENT_TAGS } from "../tags.js";

import {
  array,
  boolean,
  clamp,
  nullableNumber,
  nullableString,
  number,
  oneOf,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { ElementId, GroupId, TextElement } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

const TEXT_ALIGN = ["left", "center", "right"] as const;
const VERTICAL_ALIGN = ["top", "middle", "bottom"] as const;

/** Excalidraw's text sizes. Inherited, and the same set the note uses. */
const FONT_SIZES = [16, 20, 28, 36] as const;

const KNOWN_FIELDS = [
  "text",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "autoResize",
  "lineHeight",
  "isDeleted",
] as const;

/**
 * The line height Excalidraw uses when nothing overrides it.
 *
 * A multiplier, not pixels, and 1.25 is the renderer's default for both notes and
 * bare text. Stored because a note or an annotation re-laid-out with a different
 * value moves its lines, and a board that came back with different line spacing would
 * be visibly not the board that was saved.
 */
const DEFAULT_LINE_HEIGHT = 1.25;

const validate = (
  raw: Record<string, unknown>,
  log: RepairLog,
): TextElement => {
  /*
   * Migration rule 1: carry anything unrecognised through untouched, then overlay
   * the normalised values. The other way round means a newer Firo's field is silently
   * deleted.
   *
   * `allKnownFields` rather than this type's own `KNOWN_FIELDS`, because the base
   * fields are recognised here too and are re-derived from `raw` below rather than
   * carried through stale.
   */
  const base = preserveUnknownFields(raw, allKnownFields("text"), log);

  return {
    ...base,
    id: (raw.id as ElementId) ?? "",
    type: "text",

    x: number(raw.x, 0, log, "x"),
    y: number(raw.y, 0, log, "y"),
    /*
     * Absolute-valued, like every other type. An annotation can be dragged out
     * backwards, and the renderer takes the absolute value — so storing the negative
     * form would make two clients disagree about the same annotation.
     */
    width: Math.abs(number(raw.width, 0, log, "width")),
    height: Math.abs(number(raw.height, 0, log, "height")),
    angle: number(raw.angle, 0, log, "angle") as TextElement["angle"],

    strokeColor: string(raw.strokeColor, "#1e1e1e", log, "strokeColor"),
    backgroundColor: string(
      raw.backgroundColor,
      "transparent",
      log,
      "backgroundColor",
    ),
    fillStyle: oneOf(
      raw.fillStyle,
      ["hachure", "cross-hatch", "solid", "zigzag"] as const,
      "solid",
      log,
      "fillStyle",
    ),
    strokeWidth: oneOf(
      raw.strokeWidth,
      [1, 2, 4] as const,
      2,
      log,
      "strokeWidth",
    ),
    strokeStyle: oneOf(
      raw.strokeStyle,
      ["solid", "dashed", "dotted"] as const,
      "solid",
      log,
      "strokeStyle",
    ),
    // Corners are a box property and bare text has no box.
    roundness: null,
    roughness: oneOf(raw.roughness, [0, 1, 2] as const, 1, log, "roughness"),
    opacity: clamp(number(raw.opacity, 100, log, "opacity"), 0, 100),

    version: number(raw.version, 1, log, "version"),
    versionNonce: number(raw.versionNonce, 0, log, "versionNonce"),
    index: (raw.index as TextElement["index"]) ?? null,

    created:
      raw.created === null || raw.created === undefined
        ? null
        : number(raw.created, 0, log, "created"),
    updated: number(raw.updated, 0, log, "updated"),
    isDeleted: boolean(raw.isDeleted, false, log, "isDeleted"),
    deletedAt:
      raw.deletedAt === undefined
        ? undefined
        : nullableNumber(raw.deletedAt, log, "deletedAt"),

    groupIds: array<GroupId>(
      raw.groupIds,
      (item) => (typeof item === "string" ? (item as GroupId) : null),
      log,
      "groupIds",
    ),
    frameId: (raw.frameId as string | null) ?? null,
    /*
     * Always `null`, and dropped if a file carries one.
     *
     * A `containerId` on a text element is what makes it a *label* rather than an
     * annotation, and the fold consumes labels into their container. So an
     * annotation claiming one is claiming to be part of something, and the note it
     * names would swallow it — silently, and with the annotation's text appearing
     * inside a note nobody put it in.
     *
     * Dropped rather than trusted, and logged, because a file carrying one is a file
     * written by something that does not understand the distinction.
     */
    containerId: null,
    bindings: array(
      raw.bindings,
      (item) =>
        plainObjectBinding(item)
          ? (item as TextElement["bindings"][number])
          : null,
      log,
      "bindings",
    ),

    link: nullableString(raw.link, log, "link"),
    locked: boolean(raw.locked, false, log, "locked"),
    ...(typeof raw.customData === "object" && raw.customData !== null
      ? { customData: raw.customData as Record<string, unknown> }
      : {}),
    ...facilitationFlags(raw, log),
    ...elementTags(raw, log),

    /*
     * What the person typed, not the laid-out form.
     *
     * The renderer keeps two strings: `originalText` is the input and `text` is that
     * input after wrapping has inserted hard breaks to fit the width. Storing `text`
     * would store the *layout* as if it were the content -- and since the next layout
     * pass would then wrap text that already has breaks in it, every edit would add
     * more. The corruption is invisible until someone widens the element and finds the
     * text is no longer where they left it.
     *
     * Same reasoning, and the same bug, as the sticky note's label.
     */
    text: string(raw.text, "", log, "text"),
    fontSize: oneOf(raw.fontSize, FONT_SIZES, 20, log, "fontSize"),
    fontFamily: number(raw.fontFamily, 6, log, "fontFamily"),
    textAlign: oneOf(raw.textAlign, TEXT_ALIGN, "left", log, "textAlign"),
    verticalAlign: oneOf(
      raw.verticalAlign,
      VERTICAL_ALIGN,
      "top",
      log,
      "verticalAlign",
    ),
    /*
     * Whether the width follows the text. Persisted because it decides the shape: an
     * annotation that grows with its text and one that wraps to a fixed box are
     * different objects, and re-wrapping a saved one on load moves every line.
     */
    autoResize: boolean(raw.autoResize, true, log, "autoResize"),
    lineHeight: clamp(
      number(raw.lineHeight, DEFAULT_LINE_HEIGHT, log, "lineHeight"),
      0.5,
      4,
    ),
  };
};

/** Local, so this module does not import the whole validator surface for one check. */
const plainObjectBinding = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const TEXT_SPEC: ElementSpec<TextElement> = {
  type: "text",
  knownFields: KNOWN_FIELDS,
  introducedAt: 1,
  migrations: [V1_TO_V2_FACILITATION_FLAGS, V2_TO_V3_ELEMENT_TAGS],
  validate,
};

registerElementType(TEXT_SPEC);
