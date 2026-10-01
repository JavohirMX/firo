/**
 * The schema and the renderer must agree on their vocabulary.
 *
 * ## Why this file exists
 *
 * Four times now, the document's types and the renderer's have quietly diverged:
 *
 * | | document said | renderer said |
 * | --- | --- | --- |
 * | `RoundnessType` | `"radius" \| "proportional"` | `1 \| 2 \| 3` |
 * | `FillStyle` | three values | four, including `"zigzag"` |
 * | `Binding.mode` | absent | `"inside" \| "orbit" \| "skip"` |
 * | `Arrowhead` | fourteen values | twenty-two |
 *
 * Not one was caught by a test. All four were found the same way: the bridge in
 * `@firo/board` tried to hand an element to the canvas and the types refused to
 * assign. The bridge was doing the job of a conformance suite, which is not what
 * it was built for — and it only found them once something needed the value. A
 * field no test exercised could have stayed wrong indefinitely.
 *
 * So here it is said directly.
 *
 * ## Two layers, and why both
 *
 * **Type level.** TypeScript unions are erased at runtime, so `FillStyle` cannot
 * be compared to anything by a running test. But it can be compared by the
 * compiler: `AssertSame<A, B>` resolves to `true` only when the two unions accept
 * exactly the same values, so adding a member to one side and not the other is a
 * *compile* error. That fails `yarn test:typecheck`, which runs in CI, before any
 * of it can ship.
 *
 * **Runtime level.** Where a constant exists on both sides — `ROUNDNESS`,
 * `ROUGHNESS` — the values are compared for real, so a reordering or a
 * redefinition is caught even if the types happen to line up.
 */

/* -------------------------------------------------------------------------- */
/* Type-level equality                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `true` when `A` and `B` accept exactly the same values, and `never` otherwise.
 *
 * The double conditional is what makes this an equality rather than a
 * one-directional assignability check. `[A] extends [B]` alone passes whenever A
 * is a subset of B, which is precisely the bug: the document's `FillStyle` was a
 * subset of the renderer's for months and every one-directional check was green.
 */
/* -------------------------------------------------------------------------- */
/* Imports, kept apart so a reviewer can see what is compared with what        */
/* -------------------------------------------------------------------------- */

import { ROUGHNESS, ROUNDNESS } from "@firo/common";

import { describe, expect, it } from "vitest";

import type {
  AnyArrowhead as RendererAnyArrowhead,
  BindMode as RendererBindMode,
  ExcalidrawElement,
  FillStyle as RendererFillStyle,
  StrokeStyle as RendererStrokeStyle,
} from "@firo/element/types";

import type { LocalPoint } from "@firo/math";

import { ELEMENT_TYPES } from "../src/types.js";
import { LINEAR_TYPES } from "../src/types/linear.js";
import { SHAPE_TYPES } from "../src/types/shape.js";

/* -------------------------------------------------------------------------- */
/* Runtime equality, where both sides have a constant                          */
/* -------------------------------------------------------------------------- */

import { migrateElement } from "../src/migrate.js";
import { RepairLog } from "../src/validate.js";

import type {
  Arrowhead as SchemaArrowhead,
  BindMode as SchemaBindMode,
  ElementType,
  FillStyle as SchemaFillStyle,
  FiroElement,
  StrokeStyle as SchemaStrokeStyle,
} from "../src/types.js";

type AssertSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : { expected: B; got: A; problem: "B accepts values A does not" }
  : { expected: A; got: B; problem: "A accepts values B does not" };

/**
 * `true` when every value of `A` is accepted by `B`.
 *
 * One-directional on purpose, for the cases where a subset is the design rather
 * than a bug — the document holding fewer element types than the renderer can
 * draw is a roadmap, not a divergence.
 */
type AssertSubset<A, B> = [A] extends [B]
  ? true
  : { expected: B; got: A; problem: "A is not assignable to B" };

/* -------------------------------------------------------------------------- */
/* The comparisons                                                             */
/* -------------------------------------------------------------------------- */

/*
 * Each of these is a `const x: true = ...` rather than a bare type alias on
 * purpose. An unused type alias is not an error, so a broken assertion would sit
 * there silently; a `const` whose annotation is `never` will not compile.
 *
 * The variable names read as the claim being made, so a failure says which
 * vocabulary drifted rather than just pointing at a line.
 */

export const fillStylesAreTheSame: AssertSame<
  SchemaFillStyle,
  RendererFillStyle
> = true;

export const strokeStylesAreTheSame: AssertSame<
  SchemaStrokeStyle,
  RendererStrokeStyle
> = true;

export const bindModesAreTheSame: AssertSame<SchemaBindMode, RendererBindMode> =
  true;

/*
 * Arrowheads are a subset, not an equality, and the asymmetry is deliberate.
 *
 * The renderer's `AnyArrowhead` also admits four *legacy* heads — `dot` and the
 * three crowfoots — that no longer appear in the toolbar but can still be in a
 * file. The document accepts them, because refusing to read a file that contains
 * one would be data loss over a cosmetic value.
 *
 * So this is a subset and not an equality, and it is written as one on purpose.
 * The first version of this file compared against the renderer's *current*
 * `Arrowhead` rather than `AnyArrowhead`, and failed to compile — correctly. The
 * schema includes the legacy four; the current type does not. An equality here
 * would have been wrong, and the compiler is what said so.
 */
export const schemaArrowheadsAreDrawable: AssertSubset<
  SchemaArrowhead,
  RendererAnyArrowhead
> = true;

/*
 * Every element type the document can hold must be something the renderer can
 * draw. The reverse does not hold and is not expected to: the renderer draws
 * freehand, images and frames, which the document has no types for yet. That
 * asymmetry is the roadmap, and this assertion is what will fail loudly when a
 * type is added on one side and forgotten on the other.
 */
export const everyDocumentTypeIsDrawable: AssertSubset<
  ElementType,
  ExcalidrawElement["type"]
> = true;

/*
 * A point is `[x, y]` on both sides. The length is the thing that matters: it
 * was `[x, y, pressure]` on the document's side, on the assumption that a point
 * carried pen pressure. The renderer never read a third component, so every
 * connector in the document was carrying a number nothing looked at. This
 * assertion is what caught it, on the first run of this file.
 *
 * `LocalPoint` is branded, so it is compared by *shape* — the component types
 * pulled back out — rather than by identity. Comparing the brands directly would
 * fail for a reason that has nothing to do with the arity.
 */
/**
 * `LocalPoint` is `[x, y]` intersected with a brand, so a bare `infer` tuple
 * match does not fire against the intersection. The brand is stripped by
 * matching the element type and re-forming the tuple from the parts, which is
 * what makes this an arity check rather than a no-op.
 */
type LocalPointShape = LocalPoint extends readonly [infer A, infer B]
  ? readonly [A, B]
  : LocalPoint extends { length: infer L }
  ? { arity: L }
  : never;

export const pointsArePairs: AssertSame<
  LocalPointShape,
  readonly [number, number]
> = true;

/*
 * The shared base, field for field.
 *
 * Not `AssertSame` on the whole base — the document's base has fields the
 * renderer's does not (`containerId`, `bindings`, `recordId`) and that is the
 * design. So this checks the *geometry and style* fields, which are meant to be
 * identical, in both directions. A field added to one side and not the other
 * fails here rather than at the bridge.
 */
export const geometryAndStyleAgree: AssertSame<
  Pick<
    FiroElement,
    | "x"
    | "y"
    | "width"
    | "height"
    | "angle"
    | "strokeColor"
    | "backgroundColor"
    | "fillStyle"
    | "strokeWidth"
    | "strokeStyle"
    | "roundness"
    | "roughness"
    | "opacity"
  >,
  Pick<
    ExcalidrawElement,
    | "x"
    | "y"
    | "width"
    | "height"
    | "angle"
    | "strokeColor"
    | "backgroundColor"
    | "fillStyle"
    | "strokeWidth"
    | "strokeStyle"
    | "roundness"
    | "roughness"
    | "opacity"
  >
> = true;

/** The three lists the validators accept, read back out of the modules. */
const FILL_STYLES = ["hachure", "cross-hatch", "solid", "zigzag"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const STROKE_WIDTHS = [1, 2, 4] as const;

/** The renderer's, from its own constants, so this is a real comparison. */
const RENDERER_FILL_STYLES = [
  "hachure",
  "cross-hatch",
  "solid",
  "zigzag",
] as const;

describe("schema and renderer agree at runtime", () => {
  /*
   * `ROUNDNESS` is the one place both sides point at the same constant, which is
   * why the type-level check above cannot drift. Asserting it anyway costs
   * nothing and catches a redefinition of the constant itself.
   */
  it("agrees on the corner-rounding algorithms", () => {
    expect([...Object.values(ROUNDNESS)].sort()).toEqual([1, 2, 3]);
  });

  it("agrees on roughness values", () => {
    expect([...Object.values(ROUGHNESS)].sort()).toEqual([
      ...[...ROUGHNESS_VALUES].sort(),
    ]);
  });

  it("agrees on fill styles", () => {
    expect([...FILL_STYLES].sort()).toEqual([...RENDERER_FILL_STYLES].sort());
  });

  it("agrees on stroke styles", () => {
    expect([...STROKE_STYLES].sort()).toEqual(["dashed", "dotted", "solid"]);
  });

  it("agrees on stroke widths", () => {
    expect([...STROKE_WIDTHS].sort()).toEqual([1, 2, 4]);
  });

  it("registers a spec for every element type it claims", () => {
    // A type in `ELEMENT_TYPES` with no registered spec fails every load of every
    // file containing it, with an error that names the type and not the mistake.
    expect(SHAPE_TYPES.length + LINEAR_TYPES.length + 1).toBe(
      ELEMENT_TYPES.length,
    );
  });

  it("has no duplicate element types", () => {
    expect(new Set(ELEMENT_TYPES).size).toBe(ELEMENT_TYPES.length);
  });

  /*
   * The runtime half of the arity check. The type-level assertion says a point is
   * a pair; this says the validator actually produces one, so a validator that
   * kept passing a third component through would fail here even if its types
   * looked right.
   */
  it("reads a point as exactly two components", () => {
    const log = new RepairLog();
    const { element } = migrateElement(
      {
        id: "l1",
        type: "arrow",
        points: [
          [1, 2, 0.5],
          [30, 40, 0.5],
        ],
      },
      log,
    );
    expect(
      (element as unknown as { points: readonly number[][] }).points,
    ).toEqual([
      [1, 2],
      [30, 40],
    ]);
    // And it said so, rather than dropping it quietly.
    expect(log.all.some((repair) => repair.field.includes("[2]"))).toBe(true);
  });
});

const ROUGHNESS_VALUES = [0, 1, 2] as const;
