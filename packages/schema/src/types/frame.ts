/**
 * The `frame` element type.
 *
 * One field beyond `ElementBase`, and the module is short for the same reason the
 * type is: a frame is geometry, a name, and the base's own `frameId` and
 * `containerId` for membership and nesting. See the note on `FrameElement` for why
 * there is deliberately no `children` array.
 *
 * **What a frame is not, yet.** Phase 4 also wants frames to be hideable, to define
 * PDF page order, and to be presentation slides. None of those is a field on the
 * element: hiding is the editor's business, and page order is an ordering over
 * frames that belongs to the board. Adding them to *this* type would put document
 * state in the wrong place, which is the mistake ADR-0006 exists to prevent.
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
  clamp,
  number,
  oneOf,
  plainObject,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { ElementId, FrameElement, GroupId } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;
const ROUGHNESS_VALUES = [0, 1, 2] as const;

/** Excalidraw's default fill. Inherited rather than invented, as in `shape.ts`. */
const DEFAULT_FILL = "#ffffff";

/**
 * The fields this type adds, beyond the base.
 *
 * `name` only. `isDeleted` is here because the base's is optional and the renderer
 * reads it as a definite boolean, so it is normalised here rather than at each use.
 */
const KNOWN_FIELDS = ["name", "isDeleted"] as const;

const validateFrame = (
  raw: Record<string, unknown>,
  log: RepairLog,
): FrameElement => {
  /*
   * Migration rule 1: carry anything unrecognised through untouched, then overlay
   * the normalised values. The order is load-bearing — the other way round deletes
   * a newer Firo's fields.
   */
  const base = preserveUnknownFields(raw, allKnownFields("frame"), log);

  return {
    ...base,
    id: (raw.id as ElementId) ?? "",
    type: "frame",

    x: number(raw.x, 0, log, "x"),
    y: number(raw.y, 0, log, "y"),
    width: Math.abs(number(raw.width, 0, log, "width")),
    height: Math.abs(number(raw.height, 0, log, "height")),
    angle: number(raw.angle, 0, log, "angle") as FrameElement["angle"],

    strokeColor: string(raw.strokeColor, "#1e1e1e", log, "strokeColor"),
    backgroundColor: string(
      raw.backgroundColor,
      DEFAULT_FILL,
      log,
      "backgroundColor",
    ),
    fillStyle: oneOf(raw.fillStyle, FILL_STYLES, "solid", log, "fillStyle"),
    strokeWidth: oneOf(raw.strokeWidth, STROKE_WIDTHS, 2, log, "strokeWidth"),
    strokeStyle: oneOf(
      raw.strokeStyle,
      STROKE_STYLES,
      "solid",
      log,
      "strokeStyle",
    ),
    roundness: null,
    roughness: oneOf(raw.roughness, ROUGHNESS_VALUES, 1, log, "roughness"),
    opacity: clamp(
      number(raw.opacity, 100, log, "opacity"),
      0,
      100,
      log,
      "opacity",
    ),

    version: number(raw.version, 1, log, "version"),
    versionNonce: number(raw.versionNonce, 0, log, "versionNonce"),
    index: (raw.index as FrameElement["index"]) ?? null,

    created:
      raw.created === null || raw.created === undefined
        ? null
        : number(raw.created, 0, log, "created"),
    updated: number(raw.updated, 0, log, "updated"),
    isDeleted: raw.isDeleted === true,
    deletedAt:
      raw.deletedAt === null || raw.deletedAt === undefined
        ? null
        : number(raw.deletedAt, 0, log, "deletedAt"),

    groupIds: array<GroupId>(
      raw.groupIds,
      (item) => (typeof item === "string" ? (item as GroupId) : null),
      log,
      "groupIds",
    ),
    /*
     * Membership and nesting, both inherited. A frame can be inside another frame,
     * which is why this is read rather than pinned to null: `containerId` is the
     * general case (ADR-0007) and a frame is a container like any other.
     */
    frameId: (raw.frameId as string | null) ?? null,
    containerId: (raw.containerId as ElementId | null) ?? null,
    bindings: array(
      raw.bindings,
      (item) =>
        plainObject(item) ? (item as FrameElement["bindings"][number]) : null,
      log,
      "bindings",
    ),

    link: (raw.link as string | null) ?? null,
    locked: raw.locked === true,
    ...(plainObject(raw.customData) ? { customData: raw.customData } : {}),
    ...facilitationFlags(raw, log),
    ...elementTags(raw, log),

    /*
     * `null` preserved rather than defaulted to `""`. An unnamed frame and a frame
     * named with nothing in it are different states: the first is what a person gets
     * the moment they drag one out, and the second is what a text field that was
     * cleared produces. Collapsing them loses the difference, and `""` is also what
     * a renderer would draw as a label.
     */
    name: nullableName(raw.name, log),
  } as FrameElement;
};

/**
 * A frame's name, or `null`.
 *
 * Written out rather than delegated to `nullableString`, which returns `null` for a
 * non-string by coercing silently. A number where a name belongs is a corrupt value
 * and belongs in the repair log: the file said something the schema cannot hold, and
 * the log is how a person finds out which file to go and look at.
 */
const nullableName = (raw: unknown, log: RepairLog): string | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "string") {
    log.coerced("name", raw, null);
    return null;
  }
  return raw;
};

export const FRAME_SPEC: ElementSpec<FrameElement> = {
  type: "frame",
  knownFields: KNOWN_FIELDS,
  introducedAt: 1,
  migrations: [
    V1_TO_V2_FACILITATION_FLAGS,
    V2_TO_V3_ELEMENT_TAGS,
    V3_TO_V4_DOC_BLOCKS,
  ],
  validate: validateFrame,
};

registerElementType(FRAME_SPEC);
