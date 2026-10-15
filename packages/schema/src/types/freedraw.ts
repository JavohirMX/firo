/**
 * The `freedraw` element type.
 *
 * ## Why this is not a linear element
 *
 * A freehand stroke has the same `points` a connector does and almost none of
 * everything else: no arrowheads, no bindings, and neither end of the path means
 * anything. Making it a `LinearElement` with most fields optional would mean a type
 * where `type: "arrow"` and `type: "line"` cannot be told apart from a stroke
 * without a runtime check, and a stroke that grew an arrowhead by accident would
 * typecheck. So it gets its own type, and the shared field list below is the
 * honest amount of overlap.
 *
 * ## What is deliberately absent
 *
 * `lastCommittedPoint` is not stored. It is where the pointer was when the gesture
 * last committed -- live state the editor rewrites as the pen moves. Persisting it
 * would put a value in the document that changes with no user action, which is the
 * ephemeral/durable line this project draws. The editor owns it.
 *
 * `pressures` *is* stored, unlike a connector's absent pressure. The renderer reads
 * it by index, and dropping it would draw every stroke as an even ribbon.
 */
import { allKnownFields, registerElementType } from "../registry.js";

import {
  facilitationFlags,
  V1_TO_V2_FACILITATION_FLAGS,
} from "../facilitation.js";
import { elementTags, V2_TO_V3_ELEMENT_TAGS } from "../tags.js";

import {
  array,
  clamp,
  number,
  oneOf,
  plainObject,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { ElementId, FreedrawElement, GroupId } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;
const ROUGHNESS_VALUES = [0, 1, 2] as const;
const VARIABILITIES = ["variable", "constant"] as const;

/** Excalidraw's own default, so a stroke with no value draws as it was drawn. */
const DEFAULT_STROKE_COLOR = "#1e1e1e";
const DEFAULT_STROKE_STREAMLINE = 0.4;

const KNOWN_FIELDS = [
  "points",
  "pressures",
  "simulatePressure",
  "strokeOptions",
  "isDeleted",
] as const;

/**
 * One point, as `[x, y]`.
 *
 * Same rule as a connector's point, and for the same reason: the renderer's
 * `LocalPoint` is a two-tuple, so a third number is something no version of Firo
 * reads. A stroke's pressure is carried separately in `pressures`, indexed by
 * position, and folding it into the point would duplicate it in a way nothing
 * keeps in step.
 */
const point = (raw: unknown, log: RepairLog, field: string) => {
  if (!Array.isArray(raw) || raw.length < 2) {
    log.dropped(field, "a point needs an x and a y");
    return null;
  }
  if (raw.length > 2) {
    log.dropped(
      `${field}[2]`,
      "a point is [x, y]; pressure is carried in `pressures`",
    );
  }
  return [
    number(raw[0], 0, log, `${field}[0]`),
    number(raw[1], 0, log, `${field}[1]`),
  ] as const;
};

/**
 * The path, one entry per sampled position.
 *
 * No upper limit, deliberately. This is the mistake `linear.ts` made, where a
 * two-item cap meant for `bindings` was also applied here and quietly straightened
 * every polyline on load; `tests/points.test.ts` exists because of it. A freehand
 * stroke is routinely hundreds of points long, and truncating one does not merely
 * lose detail -- it changes the shape of the line.
 */
const points = (raw: unknown, log: RepairLog) =>
  array(
    raw,
    (item, index) => point(item, log, `points[${index}]`),
    log,
    "points",
  ) as unknown as FreedrawElement["points"];

/**
 * Pen pressure, one per point, clamped to the range a stylus reports.
 *
 * Values outside `0..1` are clamped rather than dropped. A single out-of-range
 * reading is a driver quirk, and dropping the pressure would leave a hole in a
 * parallel array that is indexed positionally -- `pressures[i]` is `points[i]`, so
 * a missing entry misaligns every pressure after it. Clamping keeps the arrays the
 * same length, which is the invariant that actually matters.
 */
const pressures = (raw: unknown, log: RepairLog) =>
  array(
    raw,
    (item, index) => clamp(number(item, 0.5, log, `pressures[${index}]`), 0, 1),
    log,
    "pressures",
  ) as unknown as FreedrawElement["pressures"];

/**
 * Whether to draw from `pressures`, defaulting to **true**.
 *
 * The default is `true` and it is not arbitrary — it is the only value the
 * renderer can always draw.
 *
 * With `simulatePressure: false` the renderer maps every point to
 * `[x, y, pressures[i]]`. A file missing the flag but carrying no `pressures` — a
 * hand-edited board, a partial write, a client from before this field existed —
 * therefore hands `undefined` to perfect-freehand as the pressure for every single
 * point. Nothing throws; the stroke just comes out wrong, and differently wrong on
 * every render.
 *
 * `true` reads the points alone, so it needs nothing else to be present. It is also
 * what the majority of strokes actually are: a mouse or trackpad has no pressure,
 * so the editor sets this for anything not drawn with a stylus. Defaulting to
 * `false` would be defaulting to the interpretation that breaks, in order to be
 * right about the minority.
 */
const simulatePressure = (raw: unknown, log: RepairLog) => {
  if (raw === undefined || raw === null) {
    log.missing("simulatePressure", true);
    return true;
  }
  if (typeof raw !== "boolean") {
    log.coerced("simulatePressure", raw, true);
    return true;
  }
  return raw;
};

/**
 * `strokeOptions`, or a default when absent or unreadable.
 *
 * Both fields change the drawing -- one decides whether width varies, the other
 * how much the path is smoothed -- so a stroke missing them renders differently
 * after a reload. Defaulting is the lesser evil, and it is logged.
 */
const strokeOptions = (raw: unknown, log: RepairLog) => {
  if (!plainObject(raw)) {
    if (raw !== undefined && raw !== null) {
      log.coerced("strokeOptions", raw, {
        variability: "variable",
        streamline: DEFAULT_STROKE_STREAMLINE,
      });
    }
    return {
      variability: "variable" as const,
      streamline: DEFAULT_STROKE_STREAMLINE,
    };
  }

  return {
    variability: oneOf(
      raw.variability,
      VARIABILITIES,
      "variable",
      log,
      "strokeOptions.variability",
    ),
    streamline: clamp(
      number(
        raw.streamline,
        DEFAULT_STROKE_STREAMLINE,
        log,
        "strokeOptions.streamline",
      ),
      0,
      1,
    ),
  };
};

export const FREEDRAW_SPEC: ElementSpec<FreedrawElement> = {
  type: "freedraw",
  knownFields: KNOWN_FIELDS,
  introducedAt: 1,
  migrations: [V1_TO_V2_FACILITATION_FLAGS, V2_TO_V3_ELEMENT_TAGS],
  validate: (raw: Record<string, unknown>, log: RepairLog): FreedrawElement => {
    /*
     * Migration rule 1: carry anything unrecognised through untouched, then
     * overlay the normalised values. The other way round means a newer Firo's
     * field is silently deleted.
     */
    const base = preserveUnknownFields(raw, allKnownFields("freedraw"), log);

    return {
      ...base,
      id: (raw.id as ElementId) ?? "",
      type: "freedraw",

      /*
       * `x`, `y`, `width` and `height` are the stroke's bounding box, not where
       * the pen started -- the path is in `points`, relative to the origin. They
       * are absolute-valued for the same reason a shape's are: a client that
       * normalises a negative width and one that does not would otherwise
       * disagree about the same stroke.
       */
      x: number(raw.x, 0, log, "x"),
      y: number(raw.y, 0, log, "y"),
      width: Math.abs(number(raw.width, 0, log, "width")),
      height: Math.abs(number(raw.height, 0, log, "height")),
      angle: number(raw.angle, 0, log, "angle") as FreedrawElement["angle"],

      strokeColor: string(
        raw.strokeColor,
        DEFAULT_STROKE_COLOR,
        log,
        "strokeColor",
      ),
      /*
       * A stroke is a line, not a container, so there is nothing behind it. The
       * renderer reads `backgroundColor` for a stroke's fill when the user closes
       * the path, and "transparent" is what an unclosed stroke wants.
       */
      backgroundColor: string(
        raw.backgroundColor,
        "transparent",
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
      // Roundness is a corner property and a stroke has no corners. `null` is the
      // renderer's own value for a freedraw element, not a default invented here.
      roundness: null,
      roughness: oneOf(raw.roughness, ROUGHNESS_VALUES, 1, log, "roughness"),
      opacity: clamp(number(raw.opacity, 100, log, "opacity"), 0, 100),

      points: points(raw.points, log),
      pressures: pressures(raw.pressures, log),
      simulatePressure: simulatePressure(raw.simulatePressure, log),
      strokeOptions: strokeOptions(raw.strokeOptions, log),

      version: number(raw.version, 1, log, "version"),
      versionNonce: number(raw.versionNonce, 0, log, "versionNonce"),
      index: (raw.index as FreedrawElement["index"]) ?? null,

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
      /*
       * Always empty, and validated anyway.
       *
       * A stroke cannot be bound: a binding tells the renderer to follow another
       * element's edge, and a freehand path is the person's own line, not a route
       * between two things. Nothing produces a binding here, so accepting one from
       * a file would mean storing a relation the renderer cannot honour. Dropped
       * with a note rather than trusted.
       */
      bindings: array(
        raw.bindings,
        (item) =>
          plainObject(item)
            ? (item as FreedrawElement["bindings"][number])
            : null,
        log,
        "bindings",
      ).slice(0, 0),

      link: (raw.link as string | null) ?? null,
      locked: raw.locked === true,
      ...(plainObject(raw.customData) ? { customData: raw.customData } : {}),
      ...facilitationFlags(raw, log),
      ...elementTags(raw, log),
    } as FreedrawElement;
  },
};

registerElementType(FREEDRAW_SPEC);
