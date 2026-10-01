/**
 * The `arrow` and `line` element types.
 *
 * ## Why these are not shapes
 *
 * A shape is geometry plus style. A connector is geometry plus *a path*, and the
 * path is the element: `x`, `y`, `width` and `height` are its bounding box, not
 * where it is. A connector at `x: 0, y: 0, width: 100` with `points` of
 * `[[0, 0], [100, 50]]` is a line from one place to another; a rectangle with
 * the same numbers is a box. Adding `points` to `ElementBase` would have every
 * shape carrying a field that is always empty, so these get their own type.
 *
 * ## Bindings, and which end is which
 *
 * Firo's `bindings` is a *set* of relations with no start or end. The renderer
 * needs to know which end of the connector a binding belongs to, or it cannot
 * place the arrowhead or follow the edge. So for a linear element the array
 * order carries it: **the first entry is the start, the second is the end**, and
 * there are never more than two.
 *
 * That is a convention rather than a field, and it is stated here because the
 * alternative -- inventing `startBindings` and `endBindings` -- would be a second
 * relation to keep consistent with the two-way `bindings` already on the base.
 * For a shape the order means nothing, which is why it can be a convention
 * instead of a rule.
 */
import { allKnownFields, registerElementType } from "../registry.js";

import {
  array,
  number,
  oneOf,
  plainObject,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type {
  Binding,
  ElementId,
  LinearElement,
  LinearType,
} from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

export const LINEAR_TYPES = ["arrow", "line"] as const;

const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;
const ROUGHNESS_VALUES = [0, 1, 2] as const;
const BIND_MODES = ["inside", "orbit", "skip"] as const;

const ARROWHEADS = [
  "arrow",
  "bar",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "dot",
  "crowfoot_one",
  "crowfoot_many",
  "crowfoot_one_or_many",
  "cardinality_one",
  "cardinality_many",
  "cardinality_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many",
] as const;

const KNOWN_FIELDS = [
  "points",
  "startArrowhead",
  "endArrowhead",
  "elbowed",
  "isDeleted",
] as const;

/** A point is `[x, y, pressure]`. A two-number point is normalised, not rejected. */
/**
 * One point, as `[x, y]`.
 *
 * A third component is dropped with a note rather than kept. It was once assumed
 * to be pen pressure; the renderer's point is a two-tuple, so a third number is
 * something no version of Firo has ever read. Keeping it would mean a file
 * accumulates numbers that look meaningful and are not.
 */
const point = (raw: unknown, log: RepairLog, field: string) => {
  if (!Array.isArray(raw) || raw.length < 2) {
    log.dropped(field, "a point needs an x and a y");
    return null;
  }
  if (raw.length > 2) {
    log.dropped(
      `${field}[2]`,
      "a point is [x, y]; a third component is read by nothing",
    );
  }
  return [
    number(raw[0], 0, log, `${field}[0]`),
    number(raw[1], 0, log, `${field}[1]`),
  ] as const;
};

const points = (raw: unknown, log: RepairLog) =>
  array(
    raw,
    (item, index) => point(item, log, `points[${index}]`),
    log,
    "points",
  ).slice(0, 2) as unknown as LinearElement["points"];

const arrowhead = (raw: unknown, log: RepairLog, field: string) =>
  raw === null || raw === undefined
    ? null
    : oneOf(raw, ARROWHEADS, "arrow", log, field);

const bindings = (raw: unknown, log: RepairLog): Binding[] =>
  array(
    raw,
    (item) => {
      if (!plainObject(item)) {
        return null;
      }
      const elementId = item.elementId;
      if (typeof elementId !== "string") {
        return null;
      }
      const fixedPoint = Array.isArray(item.fixedPoint)
        ? ([
            number(item.fixedPoint[0], 0.5, log, "fixedPoint[0]"),
            number(item.fixedPoint[1], 0.5, log, "fixedPoint[1]"),
          ] as const)
        : undefined;
      return {
        elementId: elementId as ElementId,
        focus: number(item.focus, 0, log, "focus"),
        gap: number(item.gap, 1, log, "gap"),
        ...(fixedPoint
          ? {
              fixedPoint,
              // A fixed-point binding with no mode is not drawable, so the
              // default is reported as a coercion rather than left undefined.
              mode: oneOf(item.mode, BIND_MODES, "orbit", log, "mode") as
                | "inside"
                | "orbit"
                | "skip",
            }
          : {}),
      };
    },
    log,
    "bindings",
  );

const makeValidator =
  (type: LinearType) =>
  (raw: Record<string, unknown>, log: RepairLog): LinearElement => {
    const base = preserveUnknownFields(raw, allKnownFields(type), log);

    return {
      ...base,
      id: (raw.id as ElementId) ?? "",
      type,

      x: number(raw.x, 0, log, "x"),
      y: number(raw.y, 0, log, "y"),
      width: Math.abs(number(raw.width, 0, log, "width")),
      height: Math.abs(number(raw.height, 0, log, "height")),
      angle: number(raw.angle, 0, log, "angle") as LinearElement["angle"],

      strokeColor: string(raw.strokeColor, "#1e1e1e", log, "strokeColor"),
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
      roundness: null,
      roughness: oneOf(raw.roughness, ROUGHNESS_VALUES, 1, log, "roughness"),
      opacity: number(raw.opacity, 100, log, "opacity"),

      points: points(raw.points, log),
      startArrowhead:
        type === "arrow"
          ? arrowhead(raw.startArrowhead, log, "startArrowhead")
          : null,
      endArrowhead:
        type === "arrow"
          ? arrowhead(raw.endArrowhead, log, "endArrowhead")
          : null,
      elbowed: raw.elbowed === true,

      version: number(raw.version, 1, log, "version"),
      versionNonce: number(raw.versionNonce, 0, log, "versionNonce"),
      index: (raw.index as LinearElement["index"]) ?? null,

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

      groupIds: array(
        raw.groupIds,
        (item) =>
          typeof item === "string"
            ? (item as LinearElement["groupIds"][number])
            : null,
        log,
        "groupIds",
      ),
      frameId: (raw.frameId as string | null) ?? null,
      containerId: (raw.containerId as ElementId | null) ?? null,
      // At most two: one per end. A third is not a relation the renderer can
      // place, so it is dropped rather than stored and ignored.
      bindings: bindings(raw.bindings, log).slice(0, 2),

      link: (raw.link as string | null) ?? null,
      locked: raw.locked === true,
      ...(plainObject(raw.customData) ? { customData: raw.customData } : {}),
      /*
       * `lastCommittedPoint` is deliberately absent.
       *
       * It is the point the drag was at when the gesture last committed -- live
       * gesture state that the editor rewrites as the pointer moves. Persisting
       * it would put a value in the document that changes without a user action,
       * which is the ephemeral/durable split this project draws a line around. The
       * editor owns it; the document does not see it.
       */
    } as unknown as LinearElement;
  };

export const LINEAR_SPECS: readonly ElementSpec<LinearElement>[] =
  LINEAR_TYPES.map((type) => {
    const spec: ElementSpec<LinearElement> = {
      type,
      knownFields: KNOWN_FIELDS,
      introducedAt: 1,
      migrations: [],
      validate: makeValidator(type),
    };
    registerElementType(spec);
    return spec;
  });
