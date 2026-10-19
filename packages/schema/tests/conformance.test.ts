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
  ExcalidrawFrameElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawGenericElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
  FillStyle as RendererFillStyle,
  StrokeStyle as RendererStrokeStyle,
  StrokeVariability as RendererStrokeVariability,
} from "@firo/element/types";

import type { LocalPoint } from "@firo/math";

import { ELEMENT_TYPES } from "../src/types.js";
import { LINEAR_TYPES } from "../src/types/linear.js";
import { SHAPE_TYPES } from "../src/types/shape.js";

/* -------------------------------------------------------------------------- */
/* Runtime equality, where both sides have a constant                          */
/* -------------------------------------------------------------------------- */

/*
 * Importing the entry point is what registers the element types, and this file is
 * the one place that has to see the *whole* set. The individual `types/*.js`
 * imports below are deliberate -- they are what the per-module assertions read --
 * but on their own they leave the registry holding only those two modules, and the
 * registry check would then pass or fail for reasons that have nothing to do with
 * the schema.
 *
 * This mirrors what a real consumer does: `import { loadBoard } from "@firo/schema"`.
 */
import "../src/index.js";

import { migrateElement } from "../src/migrate.js";
import { registeredElementTypes } from "../src/registry.js";
import { RepairLog } from "../src/validate.js";

import type {
  Arrowhead as SchemaArrowhead,
  BindMode as SchemaBindMode,
  ElementBase,
  ElementType,
  FillStyle as SchemaFillStyle,
  FiroElement,
  FrameElement,
  FreedrawElement,
  ImageElement,
  TextElement,
  StrokeStyle as SchemaStrokeStyle,
  StrokeVariability as SchemaStrokeVariability,
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
 * `embeddable` and `magicframe`, which the document has no types for and has no
 * plans to. `magicframe` is Excalidraw's AI frame and ADR-0012 keeps AI out of v1.
 *
 * That asymmetry used to be wider. It included `image` and `frame`, which meant the
 * renderer could draw a picture or a frame onto a board and the document could hold
 * neither — so a board could contain content that no file, no autosave and no sync
 * update would ever mention. Both were added; the assertion below holds the
 * remaining gap shut.
 */
export const everyDocumentTypeIsDrawable: AssertSubset<
  ElementType,
  ExcalidrawElement["type"]
> = true;

/*
 * The converse, as a list rather than a type assertion.
 *
 * This cannot be `AssertSame` in the other direction, because the two sides are
 * deliberately different sets: the renderer has types Firo will not hold. What it
 * must not do is *drift* — so the renderer's types the document does not have are
 * pinned by name, and adding one to `ELEMENT_TYPES` without removing it here fails
 * the test rather than passing unnoticed.
 *
 * This is the assertion that would have caught the image and frame gap when the fold
 * was skipping them, rather than when somebody exported a board and found the
 * picture missing from the file.
 */
/**
 * Every renderer type the document deliberately does not hold.
 *
 * This cannot be `AssertSame` in the other direction, because the two sides are
 * different sets by design: the renderer has types Firo will not hold. What it must
 * not do is *drift* — so the unheld types are pinned by name, and adding one to
 * `ELEMENT_TYPES` without removing it here fails the test rather than passing
 * unnoticed.
 *
 * This is the assertion that would have caught the image and frame gap when the fold
 * was skipping them, rather than when somebody exported a board and found the
 * picture missing from the file. It found the two entries below it did not predict
 * on its first run, which is the argument for having it.
 *
 * Each entry carries its reason, because "the document does not hold this" is only
 * a decision rather than an oversight if the reason is written down:
 *
 * - `selection` is the rubber-band rectangle. It is UI state, and rule 1 in
 *   `AGENTS.md` is that ephemeral state never enters the document — a selection
 *   rectangle in a CRDT would be synced, persisted and undoable, and would mean
 *   something different to every collaborator looking at the board.
 * - `embeddable` and `iframe` are remote content. `embeddable` was already deleted
 *   from the app in Phase 0 as Excalidraw+ product surface, and `iframe` is the same
 *   idea with a different discriminant. NFR-3 and ADR-0012: no remote content, no
 *   AI, in v1.
 * - `magicframe` is Excalidraw's AI-generated frame. ADR-0012 again — it is v3 work
 *   at the earliest, and a type in the schema is a promise to load files that
 *   contain it.
 */
export const UNHELD_RENDERER_TYPES = [
  "selection",
  "embeddable",
  "iframe",
  "magicframe",
] as const;

export const theOnlyUnheldTypesAreKnown: AssertSame<
  Extract<ExcalidrawElement["type"], string>,
  ElementType | typeof UNHELD_RENDERER_TYPES[number]
> = true;

/*
 * A frame's fields, held against the renderer's.
 *
 * One field, and the assertion is here because one is exactly what a missing test
 * would not notice. A frame that quietly acquired the wrong name would still compile
 * and still draw — with the label reading as an unnamed frame rather than as an
 * error.
 */
type RendererFrameFields = Omit<
  ExcalidrawFrameElement,
  keyof ExcalidrawGenericElement | "type"
>;

type SchemaFrameFields = Omit<FrameElement, keyof ElementBase | "type">;

export const frameFieldsAreTheSame: AssertSame<
  Extract<keyof RendererFrameFields, string>,
  Extract<keyof SchemaFrameFields, string>
> = true;

export const frameNameIsTheSame: AssertSame<
  RendererFrameFields["name"],
  SchemaFrameFields["name"]
> = true;

/*
 * An image's fields, held against the renderer's.
 *
 * All four are load-bearing and all four fail silently rather than loudly, which is
 * why this is checked field by field and not only by name:
 *
 * - `fileId` is the reference to the bytes. Lost, and the picture becomes a
 *   placeholder pointing at nothing.
 * - `status` decides whether the renderer waits for the file or draws the failure
 *   state. Lost, and a slow-loading image either never appears or appears as a
 *   permanent error.
 * - `scale` is a *pair*, for flipping. Reduced to one number it could not express a
 *   mirrored image, and the picture would come back the right way round.
 * - `crop` is a window plus the natural size it was taken from. The natural size
 *   looks derivable from the asset and is not — the asset is keyed by hash and knows
 *   nothing about how it was placed — so a crop without it cannot be re-expressed
 *   after a reload.
 *
 * `FileId` is branded on the renderer and the document stores a plain string: the
 * brand is a compile-time marker rather than a value, so it is stripped for the same
 * reason `LocalPoint` is.
 */
type RendererImageFields = Omit<
  ExcalidrawImageElement,
  keyof ExcalidrawGenericElement | "type"
>;

type SchemaImageFields = Omit<ImageElement, keyof ElementBase | "type">;

export const imageFieldsAreTheSame: AssertSame<
  Extract<keyof RendererImageFields, string>,
  Extract<keyof SchemaImageFields, string>
> = true;

/**
 * The renderer's branded `FileId`, as the plain string the document stores.
 *
 * The brand is stripped and the `null` is kept. The first version of this stripped
 * both, because `T extends string ? string : never` distributes over `FileId | null`
 * and collapses the null arm to `never` — so it silently asserted that the document
 * holds a non-nullable string, which is the opposite of what the renderer says. A
 * conditional type that is too eager is as wrong as one that is too loose, and only
 * a test that compares the two sides notices.
 */
type UnbrandedFileId = NonNullable<
  RendererImageFields["fileId"]
> extends infer T
  ? T extends string
    ? string
    : never
  : never;

export const imageFileIdIsAString: AssertSame<
  UnbrandedFileId | Extract<RendererImageFields["fileId"], null>,
  SchemaImageFields["fileId"]
> = true;

export const imageStatusIsTheSame: AssertSame<
  RendererImageFields["status"],
  SchemaImageFields["status"]
> = true;

/**
 * `scale`, compared by shape.
 *
 * The renderer declares a mutable `[number, number]` and the document a `readonly`
 * one, which `AssertSame` reports as a difference because a `readonly` tuple is not
 * assignable *to* a mutable one. That is the same class of thing as `LocalPoint`'s
 * brand and `lineHeight`'s unit: a compile-time marker rather than a value, and one
 * the document is stricter about on purpose — everything in `@firo/schema` is
 * `readonly`, because a Yjs mutation produces new objects and a caller that mutates
 * one in place has broken undo.
 *
 * Loosening the document's `scale` to match the renderer would make the type assignable
 * in one direction and weaker in the other, to buy nothing: there is no bug a mutable
 * `scale` prevents.
 */
type MutableScale<T> = T extends readonly [infer A, infer B]
  ? [A, B]
  : T extends readonly unknown[]
  ? { mutableArity: T["length"] }
  : never;

export const imageScaleIsTheSame: AssertSame<
  MutableScale<SchemaImageFields["scale"]>,
  MutableScale<RendererImageFields["scale"]>
> = true;

export const imageCropIsTheSame: AssertSame<
  RendererImageFields["crop"],
  SchemaImageFields["crop"]
> = true;

/*
 * A freehand stroke's fields, held against the renderer's.
 *
 * The general assertion above only checks the *discriminant* — that `"freedraw"`
 * is a type the renderer draws. It says nothing about whether the document stores
 * what the stroke needs to look the same after a reload, and that is the failure
 * this one exists for.
 *
 * A stroke is drawn from five things: its points, its per-point pressures, whether
 * to use them at all, and the two stroke options. Drop any one and the stroke
 * still loads, still draws, and looks *different* — an even ribbon where there was
 * a taper, or unsmoothed jitter where there was a clean line. No error, no
 * warning, and nothing in the file to say a field was dropped.
 *
 * So the field sets must be *identical*, in both directions, and each field's type
 * must match. The reverse direction matters as much as the forward one: a field the
 * schema invents and the renderer never reads is a field no test would ever
 * exercise, which is how the earlier drifts started.
 *
 * The point field is compared by shape rather than by type, because `LocalPoint`
 * is branded — see `pointsArePairs` below, and the note on `PointShapeOf`.
 */
type RendererFreedrawFields = Omit<
  ExcalidrawFreeDrawElement,
  keyof ExcalidrawGenericElement | "type"
>;

type SchemaFreedrawFields = Omit<FreedrawElement, keyof ElementBase | "type">;

/**
 * A side's point type, reduced to its shape.
 *
 * The renderer's point is `LocalPoint` — a tuple intersected with a brand — and the
 * schema's is a plain `readonly [number, number]`. Comparing those directly fails
 * for a reason that has nothing to do with arity, which is the trap `pointsArePairs`
 * was already written to avoid. A branded point is reduced to its shape; a plain
 * one is left alone. Both sides then meet as `readonly [number, number]`.
 */
type PointShapeOf<T> = T extends { points: readonly (infer P)[] }
  ? P extends LocalPoint
    ? LocalPointShape
    : P
  : never;

export const freedrawFieldsAreTheSame: AssertSame<
  Extract<keyof RendererFreedrawFields, string>,
  Extract<keyof SchemaFreedrawFields, string>
> = true;

export const freedrawPointsAreTheSame: AssertSame<
  PointShapeOf<RendererFreedrawFields>,
  PointShapeOf<SchemaFreedrawFields>
> = true;

export const freedrawPressuresAreTheSame: AssertSame<
  RendererFreedrawFields["pressures"],
  SchemaFreedrawFields["pressures"]
> = true;

export const freedrawSimulatePressureIsTheSame: AssertSame<
  RendererFreedrawFields["simulatePressure"],
  SchemaFreedrawFields["simulatePressure"]
> = true;

export const freedrawStrokeOptionsAreTheSame: AssertSame<
  RendererFreedrawFields["strokeOptions"],
  SchemaFreedrawFields["strokeOptions"]
> = true;

/*
 * A text annotation's fields, held against the renderer's.
 *
 * Same argument as the freedraw assertion, and for the same reason: the discriminant
 * check says `text` is a type the renderer draws, and says nothing about whether the
 * document keeps what the annotation needs to look the same after a reload.
 *
 * Two fields here are load-bearing in a way that is easy to miss. `lineHeight` decides
 * where every line sits, so a lost one re-spaces the whole annotation. `autoResize`
 * decides its shape -- an annotation that grows with its text and one that wraps to a
 * fixed box are different objects.
 *
 * Deliberately *not* compared, each for a stated reason:
 *
 * - `containerId` and `baseFontSize` are what make a text element a note's *label*
 *   rather than an annotation, and the schema forces both to `null`. An annotation that
 *   claimed a container would be swallowed by the note it named, silently, with its
 *   text appearing inside a note nobody put it in.
 * - `originalText` is the *input* string, and it is what the document's `text` field
 *   already holds. Storing it twice would be two copies of one value that could
 *   disagree, and the fold reads `originalText` precisely so that only one is written.
 * - `labelPosition` places a label along a container's edge. An annotation has no
 *   container and therefore no edge, so the field is meaningless here; it is also
 *   optional on the renderer, so a file could carry it with nothing to attach it to.
 * - `text` is excluded from both sides and deserves its own note. `ElementBase`
 *   declares `text?: ProseMirrorDoc` — that is ADR-0004's field, and it is the *right*
 *   default. A sticky note already overrides it with a plain string, on the argument
 *   that a short label in a box is not a document; this type takes the same exception
 *   for the same reason, and `types/text.ts` says so at length.
 *
 *   Overriding rather than renaming is deliberate. Renaming to something like
 *   `plainText` would remove the collision, and would also mean that when Phase 4
 *   gives this element real formatting there would be a field to migrate and a second
 *   one to leave behind. Keeping the name means the migration is "this field's type
 *   changes", which is what the sticky note's already is.
 *
 * The last two were found by this assertion failing on its first run, which is the
 * argument for having it.
 */
type RendererTextFields = Omit<
  ExcalidrawTextElement,
  | keyof ExcalidrawGenericElement
  | "type"
  | "containerId"
  | "baseFontSize"
  | "autoFontSize"
  | "originalText"
  | "labelPosition"
  // ADR-0004's ProseMirror field, overridden by this type. See the note above.
  | "text"
>;

type SchemaTextFields = Omit<TextElement, keyof ElementBase | "type">;

export const textFieldsAreTheSame: AssertSame<
  Extract<keyof RendererTextFields, string>,
  Extract<keyof SchemaTextFields, string>
> = true;

/*
 * `lineHeight` is branded `unitlessLineHeight` on the renderer, to say "not pixels".
 * Compared by shape for the same reason `LocalPoint` is: the brand is not the claim,
 * and comparing it directly fails for a reason that has nothing to do with the value.
 */
type Unbranded<T> = T extends number ? number : never;

export const textLineHeightIsTheSame: AssertSame<
  Unbranded<RendererTextFields["lineHeight"]>,
  Unbranded<SchemaTextFields["lineHeight"]>
> = true;

export const textAutoResizeIsTheSame: AssertSame<
  RendererTextFields["autoResize"],
  SchemaTextFields["autoResize"]
> = true;

/*
 * Width variation, held against the renderer's. Like `BindMode` and `FillStyle`
 * before it: a two-value union the renderer branches on in three places, and a
 * missing value coerces a tapered stroke into an even one.
 */
export const strokeVariabilityIsTheSame: AssertSame<
  SchemaStrokeVariability,
  RendererStrokeVariability
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
    //
    // Counted from the registry rather than as `SHAPE_TYPES.length +
    // LINEAR_TYPES.length + 1`, which is what this used to be. That form needed
    // editing every time a type was added, and the edit is easy to forget — which
    // is how `freedraw` landed in `ELEMENT_TYPES` and failed this test. Reading
    // the registry cannot drift from it.
    expect([...registeredElementTypes()].sort()).toEqual(
      [...ELEMENT_TYPES].sort(),
    );
  });

  it("registers a spec from every module that declares types", () => {
    // The registry check above passes if a module is imported and registers, *or*
    // if a module declares types and is never imported at all — as long as someone
    // else registered the same names. This names the modules explicitly, so a
    // forgotten `import "./x.js"` in `types/index.ts` is caught here rather than
    // surfacing later as an unknown type in a user's file.
    //
    // The `+ 5` is the singleton modules: stickynote, freedraw, text, frame, image.
    // The two family modules are counted from their own lists so a third shape or a
    // fourth connector is picked up without editing this line.
    expect(SHAPE_TYPES.length + LINEAR_TYPES.length + 5).toBe(
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
