/**
 * The `stickynote` element type.
 *
 * The plan says extend, do not reinvent: Excalidraw already ships a sticky note
 * and it is MIT, so its shape is the starting point. What is inherited, and what
 * is added:
 *
 * **Inherited verbatim:** `text` as a plain string, `fontSize`, `fontFamily`,
 * `textAlign`, `verticalAlign`, and the `grow` behaviour. A sticky note is a
 * short label in a box, and a ProseMirror document for a one-line note is a
 * significant cost for no benefit — ADR-0004's list of deliberate exceptions is
 * about *frame names and connector labels*, and a sticky note is the same case
 * by the same argument.
 *
 * **The tension worth naming.** ADR-0004 says "no text as a string, anywhere".
 * This is a documented, deliberate exception of the same kind: a sticky note's
 * content is a short label, not a document, and the `text` field on
 * `ElementBase` (the ProseMirror one) is left unused for this type. When Phase 4
 * makes sticky notes multi-line-editable, this becomes a migration, not a
 * breaking change.
 *
 * **Added:** `isContainer`, always `false` — see the type's doc comment.
 */
import { allKnownFields, registerElementType } from "../registry.js";

import {
  facilitationFlags,
  V1_TO_V2_FACILITATION_FLAGS,
} from "../facilitation.js";
import { elementTags, V2_TO_V3_ELEMENT_TAGS } from "../tags.js";
import { V3_TO_V4_DOC_BLOCKS } from "../migrations.js";

import {
  array,
  boolean,
  clamp,
  nullableString,
  nullableNumber,
  number,
  oneOf,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { Binding, GroupId, StickyNoteElement } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

/** Excalidraw's sticky-note sizes, in px. Width is always height * 1.3. */
const SIZES = [100, 150, 200, 250] as const;

const TEXT_ALIGN = ["left", "center", "right"] as const;
const VERTICAL_ALIGN = ["top", "middle", "bottom"] as const;

const KNOWN_FIELDS = [
  "text",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "isContainer",
  "isDeleted",
] as const;

const validate = (
  raw: Record<string, unknown>,
  log: RepairLog,
): StickyNoteElement => {
  /*
   * Migration rule 1 first: carry anything this type does not recognise through
   * untouched, then overlay the normalised values. The order matters -- doing it
   * the other way round means a newer Firo's field is silently deleted.
   *
   * The list is `allKnownFields`, not this type's own `KNOWN_FIELDS`. The base
   * fields are recognised here too, so they get re-derived from `raw` below
   * rather than carried through stale. Passing only the type-specific list would
   * treat `containerId` and `recordId` as unknown, which works by accident and
   * then breaks the moment their handling changes.
   */
  const base = preserveUnknownFields(raw, allKnownFields("stickynote"), log);

  const width = number(raw.width, 150, log, "width");
  // Excalidraw's aspect ratio, and the source of the "sticky notes are
  // 5:4-ish" look. Clamped to the supported sizes, because a note at an
  // arbitrary size is a note with a corrupted `width`.
  const height = clamp(
    number(raw.height, 150, log, "height"),
    SIZES[0],
    SIZES[SIZES.length - 1],
    log,
    "height",
  );

  /*
   * The note is a container only if it is a `section`. A `true` here means the
   * file came from a future version that promoted it without changing the type,
   * which is a migration bug there, not something to honour here. Report it and
   * force the value rather than letting a corrupt file dictate the shape.
   */
  if (raw.isContainer === true) {
    log.dropped(
      "isContainer",
      "sticky notes are never containers; a note that holds things is a section",
    );
  }

  return {
    ...base,
    id: (raw.id as StickyNoteElement["id"]) ?? "",
    type: "stickynote",

    isContainer: false,

    x: number(raw.x, 0, log, "x"),
    y: number(raw.y, 0, log, "y"),
    width,
    height,
    angle: number(raw.angle, 0, log, "angle") as StickyNoteElement["angle"],

    strokeColor: string(raw.strokeColor, "#1e1e1e", log, "strokeColor"),
    backgroundColor: string(
      raw.backgroundColor,
      "#fff9b1",
      log,
      "backgroundColor",
    ),
    fillStyle: oneOf(
      raw.fillStyle,
      ["hachure", "cross-hatch", "solid"] as const,
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
    roundness: null,
    roughness: oneOf(raw.roughness, [0, 1, 2] as const, 1, log, "roughness"),
    opacity: clamp(
      number(raw.opacity, 100, log, "opacity"),
      0,
      100,
      log,
      "opacity",
    ),

    version: number(raw.version, 1, log, "version"),
    versionNonce: number(raw.versionNonce, 0, log, "versionNonce"),
    index: (raw.index as StickyNoteElement["index"]) ?? null,

    // `created` is a wall-clock timestamp, not an ordering clock. `null` means
    // "unknown" and is preserved; see docs/trd/02-data-model.md rule 3.
    created: nullableNumber(raw.created, log, "created"),
    updated: number(raw.updated, 0, log, "updated"),
    groupIds: array<GroupId>(
      raw.groupIds,
      (g) => (typeof g === "string" ? (g as GroupId) : null),
      log,
      "groupIds",
    ),
    frameId: nullableString(raw.frameId, log, "frameId"),
    containerId: nullableString(raw.containerId, log, "containerId"),
    bindings: array<Binding>(
      raw.bindings,
      (b) => {
        if (b === null || typeof b !== "object") {
          return null;
        }
        const binding = b as Record<string, unknown>;
        if (typeof binding.elementId !== "string") {
          return null;
        }
        return {
          elementId: binding.elementId as Binding["elementId"],
          focus: number(binding.focus, 0, log, "bindings[].focus"),
          gap: number(binding.gap, 1, log, "bindings[].gap"),
          ...(Array.isArray(binding.fixedPoint)
            ? {
                fixedPoint: [
                  number(
                    binding.fixedPoint[0],
                    0,
                    log,
                    "bindings[].fixedPoint[0]",
                  ),
                  number(
                    binding.fixedPoint[1],
                    0,
                    log,
                    "bindings[].fixedPoint[1]",
                  ),
                ] as const,
              }
            : {}),
        };
      },
      log,
      "bindings",
    ),

    // Optional base fields. Absent means absent, not "normalise to null" -- the
    // difference matters because a value a future version set to null must stay
    // null, and one it never wrote at all must not acquire a null.
    ...(raw.recordId === undefined
      ? {}
      : { recordId: string(raw.recordId, "", log, "recordId") }),
    ...(raw.deletedAt === undefined
      ? {}
      : { deletedAt: nullableNumber(raw.deletedAt, log, "deletedAt") }),

    link: nullableString(raw.link, log, "link"),
    locked: boolean(raw.locked, false, log, "locked"),
    isDeleted: boolean(raw.isDeleted, false, log, "isDeleted"),
    ...(typeof raw.customData === "object" && raw.customData !== null
      ? { customData: raw.customData as Record<string, unknown> }
      : {}),
    ...facilitationFlags(raw, log),
    ...elementTags(raw, log),

    text: string(raw.text, "", log, "text"),
    fontSize: oneOf(
      raw.fontSize,
      [16, 20, 28, 36] as const,
      20,
      log,
      "fontSize",
    ),
    fontFamily: number(raw.fontFamily, 6, log, "fontFamily"),
    textAlign: oneOf(raw.textAlign, TEXT_ALIGN, "left", log, "textAlign"),
    verticalAlign: oneOf(
      raw.verticalAlign,
      VERTICAL_ALIGN,
      "top",
      log,
      "verticalAlign",
    ),
  };
};

export const STICKY_NOTE_SPEC: ElementSpec<StickyNoteElement> = {
  type: "stickynote",
  knownFields: KNOWN_FIELDS,
  introducedAt: 1,
  migrations: [
    V1_TO_V2_FACILITATION_FLAGS,
    V2_TO_V3_ELEMENT_TAGS,
    V3_TO_V4_DOC_BLOCKS,
  ],
  validate,
};

registerElementType(STICKY_NOTE_SPEC);
