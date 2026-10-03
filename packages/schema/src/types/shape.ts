/**
 * The `rectangle`, `diamond` and `ellipse` element types.
 *
 * One module for three types, because they are one type with a different
 * discriminant. Every field they have is on `ElementBase` — geometry, style,
 * roundness, bindings — and none of them adds anything. A module each would be
 * three copies of the same validator to keep in step, which is the shape of bug
 * this project has been trying not to write all along.
 *
 * **What is inherited, deliberately.** `roundness` and `roughness` are
 * Excalidraw's, verbatim, including the numeric `RoundnessType`. See the note on
 * `RoundnessType` in `../types.ts` for why that one is numeric and why a test
 * holds it there.
 *
 * **What is not here yet.** `arrow`, `line` and `freedraw` need `points`, and
 * `text` needs a ProseMirror document, so neither can be expressed as "a
 * discriminant over `ElementBase`". They get their own modules when they get
 * added, rather than a `points` field pretended onto these.
 */
import { ROUNDNESS } from "@firo/common";

import { allKnownFields, registerElementType } from "../registry.js";

import {
  facilitationFlags,
  V1_TO_V2_FACILITATION_FLAGS,
} from "../facilitation.js";

import {
  array,
  clamp,
  number,
  oneOf,
  plainObject,
  preserveUnknownFields,
  string,
} from "../validate.js";

import type { ElementId, GroupId, ShapeElement, ShapeType } from "../types.js";
import type { ElementSpec } from "../registry.js";
import type { RepairLog } from "../validate.js";

export const SHAPE_TYPES = ["rectangle", "diamond", "ellipse"] as const;

const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;
const ROUGHNESS_VALUES = [0, 1, 2] as const;

/** Excalidraw's default fill. Inherited rather than invented. */
const DEFAULT_FILL = "#ffffff";

const KNOWN_FIELDS = ["isDeleted"] as const;

/**
 * `roundness`, validated.
 *
 * `null`, or an algorithm from `ROUNDNESS` with an optional radius. Anything else
 * is a corrupt value and is repaired rather than trusted, because a shape with an
 * unreadable corner style renders with the wrong corners and there is nothing in
 * the file to tell you why.
 *
 * Written out rather than delegated, because the shape is
 * `{ type, value? }` and the field validators here handle scalars and arrays.
 */
const roundness = (raw: unknown, log: RepairLog): ShapeElement["roundness"] => {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (!plainObject(raw)) {
    log.coerced("roundness", raw, null);
    return null;
  }

  const type = oneOf(
    raw.type,
    [
      ROUNDNESS.LEGACY,
      ROUNDNESS.PROPORTIONAL_RADIUS,
      ROUNDNESS.ADAPTIVE_RADIUS,
    ],
    ROUNDNESS.ADAPTIVE_RADIUS,
    log,
    "roundness.type",
  );

  if (raw.value === undefined) {
    return { type };
  }

  const value = number(raw.value, 0, log, "roundness.value");
  if (value < 0) {
    log.coerced("roundness.value", value, 0);
    return { type };
  }
  return { type, value };
};

/**
 * A validator for one shape type.
 *
 * A factory rather than three near-identical functions, so the field list and the
 * defaults exist once. The `type` is threaded through rather than inferred,
 * because the validator's return type has to be the specific member of the union
 * and TypeScript cannot narrow that from a runtime value.
 */
const makeValidator =
  (type: ShapeType) =>
  (raw: Record<string, unknown>, log: RepairLog): ShapeElement => {
    /*
     * Migration rule 1: carry anything unrecognised through untouched, then
     * overlay the normalised values. The order matters — the other way round
     * means a newer Firo's field is silently deleted.
     */
    const base = preserveUnknownFields(raw, allKnownFields(type), log);

    return {
      ...base,
      id: (raw.id as ElementId) ?? "",
      type,

      x: number(raw.x, 0, log, "x"),
      y: number(raw.y, 0, log, "y"),
      /*
       * A shape can be dragged out backwards, which makes a negative width. The
       * renderer takes the absolute value, and so does the validator: storing the
       * negative form means a file written by a client that normalises it and one
       * that does not disagree about the same shape.
       */
      width: Math.abs(number(raw.width, 0, log, "width")),
      height: Math.abs(number(raw.height, 0, log, "height")),
      angle: number(raw.angle, 0, log, "angle") as ShapeElement["angle"],

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
      roundness: roundness(raw.roundness, log),
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
      index: (raw.index as ShapeElement["index"]) ?? null,

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

      /*
       * Ids and bindings are kept as opaque items rather than validated
       * field-by-field here. A group id is a string; a binding is a relation the
       * connector type owns and will validate when it exists. Validating a
       * binding's `focus` and `gap` in three shape modules would be three places
       * to disagree about what a valid focus is.
       */
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
          plainObject(item) ? (item as ShapeElement["bindings"][number]) : null,
        log,
        "bindings",
      ),

      link: (raw.link as string | null) ?? null,
      locked: raw.locked === true,
      ...(plainObject(raw.customData) ? { customData: raw.customData } : {}),
      ...facilitationFlags(raw, log),
    } as ShapeElement;
  };

/** The three specs, registered. */
export const SHAPE_SPECS: readonly ElementSpec<ShapeElement>[] =
  SHAPE_TYPES.map((type) => {
    const spec: ElementSpec<ShapeElement> = {
      type,
      knownFields: KNOWN_FIELDS,
      introducedAt: 1,
      migrations: [V1_TO_V2_FACILITATION_FLAGS],
      validate: makeValidator(type),
    };
    registerElementType(spec);
    return spec;
  });
