import { API } from "@firo/editor/tests/helpers/api";

import type { ExcalidrawElement } from "@firo/element/types";

import type { TextElement } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Free-standing text annotations in the bridge.
 *
 * ## The bug this pins
 *
 * The fold used to skip every `text` element, because a text element is a note's
 * label and labels are consumed *into* their container. That is true of a label and
 * false of an annotation, and the only thing separating them is a nullable
 * `containerId` — both are `type: "text"` in the editor, so no type caught it.
 *
 * Measured, before this existed: the editor held `["freedraw", "text"]` and the
 * document held `[]`. The annotation drew perfectly, because the canvas never asks the
 * document. Same failure as `freedraw` had, and the same silence.
 *
 * So the tests here are built around the distinction rather than around the fields: a
 * text element with a container is consumed, one without becomes a document element,
 * and neither behaviour may depend on anything else.
 */
const editorText = (over: Record<string, unknown> = {}) =>
  ({
    ...API.createElement({
      type: "text",
      x: 40,
      y: 60,
      width: 180,
      height: 40,
    } as never),
    type: "text",
    containerId: null,
    text: "hello",
    originalText: "hello",
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    autoResize: true,
    lineHeight: 1.25,
    baseFontSize: null,
    ...over,
  } as unknown as Record<string, unknown>);

/** A note's label: a text element *with* a container. */
const labelFor = (noteId: string, over: Record<string, unknown> = {}) =>
  editorText({
    containerId: noteId,
    id: `${noteId}~label`,
    ...over,
  });

const docText = (over: Record<string, unknown> = {}) =>
  ({
    id: "t1",
    type: "text",
    x: 40,
    y: 60,
    width: 180,
    height: 40,
    text: "hello",
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    autoResize: true,
    lineHeight: 1.25,
    // Base fields the projection reads. `bindings` in particular: the projection
    // calls `.length` on it unconditionally, so a fixture without it throws rather
    // than failing an assertion — which is a worse way to find out.
    version: 2,
    versionNonce: 7,
    index: "a0",
    created: 1000,
    updated: 2000,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    ...over,
  } as unknown as TextElement);

describe("a free-standing annotation in the bridge", () => {
  describe("editor to document", () => {
    it("folds an annotation into the document", () => {
      // The regression. Before this, the fold skipped the type and returned nothing.
      const [folded] = fromEditorElements([
        editorText() as unknown as ExcalidrawElement,
      ]);

      expect(folded).toBeDefined();
      expect(folded?.type).toBe("text");
    });

    it("keeps what was typed, not the wrapped form", () => {
      /*
       * `originalText` is the input; `text` is that input after wrapping inserted hard
       * breaks to fit the width. Storing `text` bakes the current layout into the
       * document, and every later edit then wraps text that already has breaks in it.
       * The damage is invisible until someone widens the element.
       */
      const [folded] = fromEditorElements([
        editorText({
          originalText: "the quick brown fox jumps over the lazy dog",
          text: "the quick\nbrown fox\njumps over",
        }) as unknown as ExcalidrawElement,
      ]);

      expect((folded as unknown as TextElement).text).toBe(
        "the quick brown fox jumps over the lazy dog",
      );
    });

    it("keeps the font and alignment, which decide how it looks", () => {
      const [folded] = fromEditorElements([
        editorText({
          fontSize: 28,
          fontFamily: 5,
          textAlign: "center",
          verticalAlign: "bottom",
        }) as unknown as ExcalidrawElement,
      ]);
      const text = folded as unknown as TextElement;

      expect(text.fontSize).toBe(28);
      expect(text.fontFamily).toBe(5);
      expect(text.textAlign).toBe("center");
      expect(text.verticalAlign).toBe("bottom");
    });

    it("keeps `autoResize` and `lineHeight`, which decide its shape", () => {
      // An annotation that grows with its text and one that wraps to a fixed box are
      // different objects, and `lineHeight` decides where every line sits. Losing
      // either re-spaces or re-wraps the annotation on load.
      const [folded] = fromEditorElements([
        editorText({
          autoResize: false,
          lineHeight: 1.75,
        }) as unknown as ExcalidrawElement,
      ]);
      const text = folded as unknown as TextElement;

      expect(text.autoResize).toBe(false);
      expect(text.lineHeight).toBe(1.75);
    });

    it("keeps the geometry", () => {
      const [folded] = fromEditorElements([
        editorText() as unknown as ExcalidrawElement,
      ]);
      const text = folded as unknown as TextElement;

      expect(text.x).toBe(40);
      expect(text.y).toBe(60);
      expect(text.width).toBe(180);
      expect(text.height).toBe(40);
    });

    it("does not claim a container", () => {
      // The one field that makes this an annotation rather than a label. If it were
      // set, the *next* fold pass would treat the annotation as a label and swallow it
      // into whatever it named — silently, with the text appearing inside another
      // element.
      //
      // Asserted as "not a string" rather than "exactly null" because the fold omits
      // the field when there is nothing to put in it and the schema's validator
      // defaults it to `null` on load. Shapes do the same; requiring the fold to
      // materialise every absent field would make it disagree with the shape branch
      // for no gain.
      const [folded] = fromEditorElements([
        editorText() as unknown as ExcalidrawElement,
      ]);
      const containerId = (folded as unknown as TextElement).containerId;

      expect(containerId ?? null).toBeNull();
    });
  });

  describe("a note's label is still consumed", () => {
    it("emits only the note, not a stray annotation", () => {
      // The other half of the distinction, and the reason the fold cannot simply stop
      // skipping `text`. If a label were emitted as an annotation, every note would
      // gain a duplicate of its own words floating on the canvas.
      const note = {
        ...API.createElement({ type: "stickynote" } as never),
        type: "stickynote",
        id: "note1",
      } as unknown as Record<string, unknown>;

      const folded = fromEditorElements([
        note as unknown as ExcalidrawElement,
        labelFor("note1", {
          originalText: "hi",
        }) as unknown as ExcalidrawElement,
      ]);

      expect(folded).toHaveLength(1);
      expect(folded[0].type).toBe("stickynote");
    });

    it("folds a note and an annotation into two separate elements", () => {
      // Both in one scene, which is the case that was ambiguous until now.
      const note = {
        ...API.createElement({ type: "stickynote" } as never),
        type: "stickynote",
        id: "note1",
      } as unknown as Record<string, unknown>;

      const folded = fromEditorElements([
        note as unknown as ExcalidrawElement,
        labelFor("note1", {
          originalText: "on the note",
        }) as unknown as ExcalidrawElement,
        editorText({
          id: "t1",
          originalText: "on the canvas",
        }) as unknown as ExcalidrawElement,
      ]);

      expect(folded.map((element) => element.type).sort()).toEqual([
        "stickynote",
        "text",
      ]);
      const annotation = folded.find((element) => element.type === "text");
      expect(annotation && "text" in annotation ? annotation.text : null).toBe(
        "on the canvas",
      );
    });

    it("ignores a deleted annotation's text but keeps the tombstone", () => {
      // Undo soft-deletes, and the document keeps the tombstone so it can be restored.
      // Dropping it instead would make an undone annotation irreversible.
      const [folded] = fromEditorElements([
        editorText({
          id: "t1",
          isDeleted: true,
        }) as unknown as ExcalidrawElement,
      ]);

      expect(folded).toBeDefined();
      expect(folded?.isDeleted).toBe(true);
    });
  });

  describe("document to editor", () => {
    it("projects an annotation as one editor element", () => {
      // Unlike a note, which is two. Two here would leave a stray label in the scene
      // for the fold to trip over on the next change.
      expect(toEditorElements(docText())).toHaveLength(1);
    });

    it("produces something the editor will accept", () => {
      const [element] = toEditorElements(docText());

      expect(element?.type).toBe("text");
      expect(element).toMatchObject({
        text: "hello",
        originalText: "hello",
        fontSize: 20,
        autoResize: true,
        lineHeight: 1.25,
        containerId: null,
        baseFontSize: null,
      });
    });

    it("sets both text fields to the stored input", () => {
      /*
       * Not a shortcut. The stored value is the *input* string — the fold reads
       * `originalText`, not the wrapped `text` — and the renderer re-wraps on render
       * and writes the result back to `text`, separating the two as soon as it lays
       * the text out. Setting both equal is correct precisely because they are about
       * to differ.
       */
      const [element] = toEditorElements(docText());

      expect((element as unknown as { text: string }).text).toBe("hello");
      expect(
        (element as unknown as { originalText: string }).originalText,
      ).toBe("hello");
    });

    it("does not carry a `baseFontSize`, so it cannot be mistaken for a label", () => {
      // Only a sticky note's label has one, and the renderer's own note says a label
      // that loses it detaches badly. An annotation must not claim to be a label.
      const [element] = toEditorElements(docText());

      expect(
        (element as unknown as { baseFontSize: number | null }).baseFontSize,
      ).toBeNull();
    });
  });

  describe("round trip", () => {
    it("survives document to editor and back unchanged", () => {
      const original = docText({
        text: "a longer annotation that will certainly wrap at some width",
        fontSize: 28,
        textAlign: "center",
        autoResize: false,
        lineHeight: 1.75,
      });

      const [editor] = toEditorElements(original);
      const [back] = fromEditorElements([
        editor as unknown as ExcalidrawElement,
      ]);
      const result = back as unknown as TextElement;

      expect(result.text).toBe(original.text);
      expect(result.fontSize).toBe(original.fontSize);
      expect(result.textAlign).toBe(original.textAlign);
      expect(result.autoResize).toBe(original.autoResize);
      expect(result.lineHeight).toBe(original.lineHeight);
      expect(result.x).toBe(original.x);
      expect(result.width).toBe(original.width);
    });

    it("keeps typed text free of hard line breaks through a full round trip", () => {
      /*
       * The end-to-end version of the wrapping bug. A round trip that only checked the
       * string's length, or compared it loosely, would pass while the annotation came
       * back with layout baked into its content — and every subsequent edit would then
       * add more.
       */
      const typed =
        "the quick brown fox jumps over the lazy dog again and again";
      const [editor] = toEditorElements(docText({ text: typed }));
      const [back] = fromEditorElements([
        editor as unknown as ExcalidrawElement,
      ]);

      const result = back as unknown as TextElement;
      expect(result.text).toBe(typed);
      expect(result.text.includes("\n")).toBe(false);
    });

    it("is stable across repeated projections", () => {
      // The z-order and geometry must not drift, or a reload would reshuffle the board.
      const element = docText();
      const once = toEditorElements(element)[0];
      const twice = toEditorElements(element)[0];

      expect(twice).toEqual(once);
    });
  });
});
