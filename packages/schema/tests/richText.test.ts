/**
 * ADR-0004's enforcement, which was promised and never written.
 *
 * ## What the ADR says
 *
 * > **No text field in the schema is a string.** A test walks the schema and fails if
 * > any text-bearing field is typed `string`. This is rule 3 in AGENTS.md.
 *
 * That test did not exist. Nothing walked the schema, so the rule was enforced by
 * whoever happened to read the ADR — which is how it came to have *two* exceptions
 * before anyone noticed the guard was missing:
 *
 * | Type | `text` | Since |
 * | --- | --- | --- |
 * | `stickynote` | `string` | Phase 1, argued in `types/stickynote.ts` |
 * | `text` | `string` | added with the text tool's own element |
 *
 * Both are argued rather than accidental, and both arguments are recorded. But an
 * exception with no gate is a precedent, and a precedent with no gate is how a third
 * one arrives silently. This file is the gate.
 *
 * ## What it checks
 *
 * Every element type's `text` field is either a ProseMirror document or on the list
 * below. Adding an element type with a string `text` fails here, and adding a third
 * exception means editing this file on purpose, in a commit that says so.
 *
 * Type-level, because a TypeScript union is erased at runtime and a runtime walk
 * cannot see it. The same approach as `conformance.test.ts`, for the same reason.
 */
import { describe, expect, it } from "vitest";

import { ELEMENT_TYPES } from "../src/types.js";

import type {
  ElementBase,
  ElementType,
  FrameElement,
  FreedrawElement,
  ImageElement,
  LinearElement,
  ShapeElement,
  StickyNoteElement,
  TextElement,
} from "../src/types.js";
import type { ProseMirrorDoc } from "../src/prosemirror.js";

/**
 * The types allowed to hold text as a plain string, each with its reason.
 *
 * A `Record` rather than a union so the compiler checks the keys against
 * `ElementType` — a typo in a type name is a compile error rather than an entry that
 * never fires.
 */
const STRING_TEXT_EXCEPTIONS: Record<
  Extract<ElementType, "stickynote" | "text">,
  string
> = {
  stickynote:
    "A short label in a box. Excalidraw's own note stores a string, and a " +
    "ProseMirror instance per note is a real cost on a board with hundreds. " +
    "Becomes a migration when Phase 4 makes notes multi-line editable.",

  text:
    "A free-standing annotation. Excalidraw's text element has no rich text at " +
    "all — no bold, lists or links — so a ProseMirror document could only ever " +
    "contain a single text node, and the renderer would draw a plain string " +
    "regardless. A structure with one inhabitant. Same case as the sticky note.",
};

/** Every element type, keyed by name, so the walk below can index by discriminant. */
type ByType = {
  stickynote: StickyNoteElement;
  rectangle: ShapeElement;
  diamond: ShapeElement;
  ellipse: ShapeElement;
  arrow: LinearElement;
  line: LinearElement;
  freedraw: FreedrawElement;
  text: TextElement;
  frame: FrameElement;
  image: ImageElement;
};

/**
 * A type's `text` field, or a marker if it has none.
 *
 * The marker is deliberate: "no text field" and "a text field that is neither a
 * string nor a document" must fail differently, because the first is correct for a
 * rectangle and the second is a bug.
 */
type TextField<T> = T extends { text: infer F } ? F : { noTextField: true };

type IsPlainString<T> = [T] extends [string] ? true : false;
type IsProseMirror<T> = [T] extends [ProseMirrorDoc | undefined] ? true : false;

/**
 * Is this type's `text` field acceptable?
 *
 * Three ways to be acceptable and one way to be a bug: allow-listed with a stated
 * reason; no text field at all, which is correct for a rectangle; or a ProseMirror
 * document, which is the rule.
 */
type Acceptable<T extends ElementType> =
  T extends keyof typeof STRING_TEXT_EXCEPTIONS
    ? true // Allow-listed, and the reason is written down beside the name.
    : TextField<ByType[T]> extends { noTextField: true }
    ? true
    : IsProseMirror<TextField<ByType[T]>>;

describe("ADR-0004: no text field is a plain string", () => {
  it("holds for every element type", () => {
    /*
     * Each name is asserted individually so a failure says *which* type broke it,
     * rather than pointing at a union and leaving the reader to work it out.
     */
    const stickynote: Acceptable<"stickynote"> = true;
    const rectangle: Acceptable<"rectangle"> = true;
    const diamond: Acceptable<"diamond"> = true;
    const ellipse: Acceptable<"ellipse"> = true;
    const arrow: Acceptable<"arrow"> = true;
    const line: Acceptable<"line"> = true;
    const freedraw: Acceptable<"freedraw"> = true;
    const text: Acceptable<"text"> = true;
    const frame: Acceptable<"frame"> = true;
    const image: Acceptable<"image"> = true;

    // Referenced so the assertions are not read as unused.
    expect([
      stickynote,
      rectangle,
      diamond,
      ellipse,
      arrow,
      line,
      freedraw,
      text,
      frame,
      image,
    ]).toHaveLength(10);
  });

  it("covers every type in ELEMENT_TYPES, so a new type cannot slip past", () => {
    // The assertion above is a fixed list, which means a type added to the registry
    // would simply not be checked. This one closes that gap: the fixed list must
    // account for the whole set.
    //
    // `frame` and `image` are here because a frame has a *name* and a label drawn from
    // it, and somebody reading this file in a year should have to decide whether a
    // frame's name is a text field before adding a third exception rather than
    // assuming it is not one. The answer for both is that neither carries `text` at
    // all: a frame's name is a short identifier, not content, and an image's content
    // is its bytes.
    expect([...ELEMENT_TYPES].sort()).toEqual(
      [
        "arrow",
        "diamond",
        "ellipse",
        "frame",
        "freedraw",
        "image",
        "line",
        "rectangle",
        "stickynote",
        "text",
      ].sort(),
    );
  });

  it("gives every exception a stated reason", () => {
    // An allow-list entry with no reason is indistinguishable from a field someone
    // typed as a string, which is exactly what this file exists to catch.
    for (const [type, reason] of Object.entries(STRING_TEXT_EXCEPTIONS)) {
      expect(reason.length, `${type} has no reason`).toBeGreaterThan(40);
    }
  });

  it("actually stores a string on the two types that claim to", () => {
    // `Acceptable` short-circuits to `true` for an allow-listed type, so on its own it
    // would not notice if someone changed `stickynote.text` to a ProseMirror document
    // and left the allow-list entry behind. This closes that: the exception has to
    // still be an exception.
    // A `const x: <predicate> = true` annotation: it compiles only when the predicate
    // resolves to `true`, and fails with the predicate's own name if it does not.
    const noteHolds: IsPlainString<TextField<StickyNoteElement>> = true;
    const annotationHolds: IsPlainString<TextField<TextElement>> = true;

    expect([noteHolds, annotationHolds]).toEqual([true, true]);
  });

  it("leaves the base field as a ProseMirror document for everyone else", () => {
    // The default the exceptions deviate from. If this changed, every exception would
    // be quietly redundant.
    const baseIsDocument: IsProseMirror<ElementBase["text"]> = true;
    // The negation, so this also fails if the field ever becomes a string — which is
    // the drift this whole file exists to catch.
    const baseIsNotString: IsPlainString<ElementBase["text"]> = false;

    expect([baseIsDocument, baseIsNotString]).toEqual([true, false]);
  });
});
