/**
 * The `image` element type.
 *
 * A placed picture, referenced rather than embedded. The reasoning for that — and
 * for the fact that it makes a `.firo` file holding an image non-self-contained —
 * is on `ImageElement` in `../types.ts`. Read that before changing anything here,
 * because the field that looks missing (`mimeType`, `naturalWidth`) is missing on
 * purpose: the asset store holds both, keyed by the hash this element carries.
 *
 * **What this type does not do.** It does not fetch, decode, cache or draw
 * anything. An image element in the document is a rectangle with a reference in it,
 * and the renderer plus the asset store are what turn that into pixels. A schema
 * that knew about `HTMLImageElement` would be a schema that could not be written by
 * hand, diffed, or read in a test.
 */
import { allKnownFields, registerElementType } from "../registry.js";

import {
  array,
  clamp,
  number,
  oneOf,
  plainObject,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { ElementId, GroupId, ImageCrop, ImageElement } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;
const ROUGHNESS_VALUES = [0, 1, 2] as const;
const STATUSES = ["pending", "saved", "error"] as const;

/**
 * Excalidraw's default fill for an image.
 *
 * `"transparent"`, not the shape default. An image with an opaque background behind
 * it draws a rectangle of that colour around the picture's own edges, and the
 * inherited code uses this value. It is a rendering constant rather than a style
 * anyone picks, which is why it lives here and not in `@firo/common`.
 */
const DEFAULT_FILL = "transparent";

/** The fields this type adds, beyond the base. */
const KNOWN_FIELDS = [
  "fileId",
  "status",
  "scale",
  "crop",
  "isDeleted",
] as const;

/**
 * `scale`, as a two-tuple.
 *
 * Both axes are validated independently and neither is clamped to a range. The
 * renderer's comment says `<-1, 1>` and a validator that enforced it would refuse a
 * file the renderer draws: a scale of exactly `1` is not flipped, and a file
 * carrying `1.0000001` from a float round-trip is not corrupt either. Repairing
 * either would silently change how the picture looks, which is worse than drawing
 * what the file asked for.
 *
 * A third component is dropped with a note, for the reason `linear.ts` drops one
 * from a point: nothing reads it, so keeping it means files accumulate numbers that
 * look meaningful and are not.
 */
const scale = (raw: unknown, log: RepairLog): readonly [number, number] => {
  if (!Array.isArray(raw) || raw.length < 2) {
    log.coerced("scale", raw, [1, 1]);
    return [1, 1];
  }
  if (raw.length > 2) {
    log.dropped(
      "scale[2]",
      "scale is [x, y]; a third component is read by nothing",
    );
  }
  return [
    number(raw[0], 1, log, "scale[0]"),
    number(raw[1], 1, log, "scale[1]"),
  ];
};

/**
 * A crop window, or `null`.
 *
 * Every field is required once the crop exists. A crop with a missing
 * `naturalWidth` is not a crop with a default natural width — it is a crop whose
 * window cannot be expressed against any image, and repairing it to a plausible
 * number would crop the picture to the wrong place with nothing in the file to say
 * so. So a partial crop is dropped whole and logged, which leaves an uncropped
 * image that draws correctly rather than a cropped one that draws wrongly.
 */
const crop = (raw: unknown, log: RepairLog): ImageCrop | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!plainObject(raw)) {
    log.coerced("crop", raw, null);
    return null;
  }

  const fields = ["x", "y", "width", "height", "naturalWidth", "naturalHeight"];
  const missing = fields.filter((field) => typeof raw[field] !== "number");
  if (missing.length > 0) {
    log.dropped(
      "crop",
      `a crop needs all of ${fields.join(", ")}; missing ${missing.join(", ")}`,
    );
    return null;
  }

  return {
    x: number(raw.x, 0, log, "crop.x"),
    y: number(raw.y, 0, log, "crop.y"),
    width: number(raw.width, 0, log, "crop.width"),
    height: number(raw.height, 0, log, "crop.height"),
    naturalWidth: number(raw.naturalWidth, 0, log, "crop.naturalWidth"),
    naturalHeight: number(raw.naturalHeight, 0, log, "crop.naturalHeight"),
  };
};

const validateImage = (
  raw: Record<string, unknown>,
  log: RepairLog,
): ImageElement => {
  const base = preserveUnknownFields(raw, allKnownFields("image"), log);

  return {
    ...base,
    id: (raw.id as ElementId) ?? "",
    type: "image",

    x: number(raw.x, 0, log, "x"),
    y: number(raw.y, 0, log, "y"),
    width: Math.abs(number(raw.width, 0, log, "width")),
    height: Math.abs(number(raw.height, 0, log, "height")),
    angle: number(raw.angle, 0, log, "angle") as ImageElement["angle"],

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
    index: (raw.index as ImageElement["index"]) ?? null,

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
    frameId: (raw.frameId as string | null) ?? null,
    containerId: (raw.containerId as ElementId | null) ?? null,
    bindings: array(
      raw.bindings,
      (item) =>
        plainObject(item) ? (item as ImageElement["bindings"][number]) : null,
      log,
      "bindings",
    ),

    link: (raw.link as string | null) ?? null,
    locked: raw.locked === true,
    ...(plainObject(raw.customData) ? { customData: raw.customData } : {}),

    /*
     * `null` is preserved rather than defaulted to a hash. An image element with no
     * `fileId` is the renderer's `"pending"` case — placed, not yet read — and
     * inventing an id for it would produce an element that claims to reference
     * bytes which do not exist. That is the failure the export refusal exists to
     * catch, and it starts here.
     */
    fileId: typeof raw.fileId === "string" ? raw.fileId : null,
    status: oneOf(raw.status, STATUSES, "saved", log, "status"),
    scale: scale(raw.scale, log),
    crop: crop(raw.crop, log),
  } as ImageElement;
};

export const IMAGE_SPEC: ElementSpec<ImageElement> = {
  type: "image",
  knownFields: KNOWN_FIELDS,
  introducedAt: 1,
  migrations: [],
  validate: validateImage,
};

registerElementType(IMAGE_SPEC);
