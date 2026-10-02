import { API } from "@firo/editor/tests/helpers/api";

import type { FreedrawElement } from "@firo/schema";

import type { ExcalidrawElement } from "@firo/element/types";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Freehand strokes in the bridge.
 *
 * ## What was broken
 *
 * The fold had no branch for `freedraw`, so a stroke drawn in the app reached the
 * document as nothing. Measured before this existed: the editor held
 * `["freedraw"]` and the document held `[]`, with no error. The same shape of
 * failure as the shape branch documented in `shapes.test.ts`, and the same reason
 * it is easy to miss — the stroke draws correctly on the canvas, because the canvas
 * never asked the document.
 *
 * ## Why the pressure fields are the point of these tests
 *
 * A stroke is drawn from its points *and* its per-point pressures *and* whether to
 * use them *and* two stroke options. Drop any one and the stroke still renders —
 * as an even ribbon instead of a tapered one, or unsmoothed instead of clean. So a
 * round-trip test that only checked the point count would pass against a bridge
 * that had thrown away everything else, and the damage would only be visible to
 * someone comparing a board before and after a reload.
 */
const editorStroke = (over: Record<string, unknown> = {}) =>
  ({
    ...API.createElement({
      type: "freedraw",
      x: 10,
      y: 20,
      width: 120,
      height: 80,
    } as never),
    /*
     * Set after creation, not passed into it. `API.createElement` builds a generic
     * element and does not carry a freedraw's pressure fields, so passing them in
     * is silently ignored and the fixture comes out with `pressures: []`.
     *
     * That is worth knowing rather than working around quietly: the first version
     * of this file passed them in, and the "keeps the pressures" test failed with
     * an empty array — which read like a bug in the fold. The fold was copying
     * faithfully from an input that had nothing in it. Anything below that passes
     * values to the helper and then asserts on them is asserting on the helper's
     * defaults, not on what it was given.
     */
    points: [
      [0, 0],
      [30, 40],
      [70, 10],
      [110, 60],
    ],
    pressures: [0.2, 0.7, 0.4, 0.9],
    simulatePressure: true,
    strokeOptions: { variability: "variable", streamline: 0.4 },
    ...over,
  } as unknown as Record<string, unknown>);

const documentStroke = (over: Record<string, unknown> = {}) =>
  ({
    id: "fd1",
    type: "freedraw",
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    points: [
      [0, 0],
      [30, 40],
      [70, 10],
      [110, 60],
    ],
    pressures: [0.2, 0.7, 0.4, 0.9],
    simulatePressure: true,
    strokeOptions: { variability: "variable", streamline: 0.4 },
    version: 3,
    versionNonce: 7,
    index: "a1",
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
  } as unknown as FreedrawElement);

describe("a freehand stroke in the bridge", () => {
  describe("editor to document", () => {
    it("folds a stroke into the document", () => {
      // The regression this branch exists for. Before it, the fold skipped the type
      // and this returned an empty array.
      const [folded] = fromEditorElements([
        editorStroke() as unknown as ExcalidrawElement,
      ]);

      expect(folded).toBeDefined();
      expect(folded?.type).toBe("freedraw");
    });

    it("keeps the points", () => {
      const [folded] = fromEditorElements([
        editorStroke() as unknown as ExcalidrawElement,
      ]);
      const stroke = folded as unknown as FreedrawElement;

      expect(stroke.points).toEqual([
        [0, 0],
        [30, 40],
        [70, 10],
        [110, 60],
      ]);
    });

    it("keeps the pressures, in step with the points", () => {
      // Asserted on length as well as value. The two arrays are read together by
      // the renderer -- `pressures[i]` belongs to `points[i]` -- so a bridge that
      // copied one and truncated the other would render a stroke whose width
      // belongs to the wrong part of the line, with nothing to indicate why.
      const [folded] = fromEditorElements([
        editorStroke() as unknown as ExcalidrawElement,
      ]);
      const stroke = folded as unknown as FreedrawElement;

      expect(stroke.pressures).toEqual([0.2, 0.7, 0.4, 0.9]);
      expect(stroke.pressures).toHaveLength(stroke.points.length);
    });

    it("keeps `simulatePressure`", () => {
      // `false` is the case worth pinning: it is the one that says "use the stored
      // pressures", so losing it would discard the array above along with the
      // instruction to read it.
      const [folded] = fromEditorElements([
        editorStroke({
          simulatePressure: false,
        }) as unknown as ExcalidrawElement,
      ]);
      expect((folded as unknown as FreedrawElement).simulatePressure).toBe(
        false,
      );
    });

    it("keeps both stroke options", () => {
      const [folded] = fromEditorElements([
        editorStroke({
          strokeOptions: { variability: "constant", streamline: 0.1 },
        }) as unknown as ExcalidrawElement,
      ]);
      const stroke = folded as unknown as FreedrawElement;

      expect(stroke.strokeOptions).toEqual({
        variability: "constant",
        streamline: 0.1,
      });
    });

    it("keeps the stroke's geometry and style", () => {
      const [folded] = fromEditorElements([
        editorStroke({
          strokeColor: "#e03131",
          strokeWidth: 4,
          opacity: 60,
        }) as unknown as ExcalidrawElement,
      ]);
      const stroke = folded as unknown as FreedrawElement;

      expect(stroke.x).toBe(10);
      expect(stroke.y).toBe(20);
      expect(stroke.width).toBe(120);
      expect(stroke.height).toBe(80);
      expect(stroke.strokeColor).toBe("#e03131");
      expect(stroke.strokeWidth).toBe(4);
      expect(stroke.opacity).toBe(60);
    });

    it("folds a stroke alongside other elements without disturbing them", () => {
      // The fold is one pass over the scene, so a new branch can consume or drop
      // something belonging to a neighbouring element. A note's label is the
      // fragile case: it is consumed by its note, and a stroke branch that
      // miscounted would leave the label behind as an orphan.
      const note = {
        ...API.createElement({ type: "stickynote" } as never),
        type: "stickynote",
      } as unknown as Record<string, unknown>;

      const folded = fromEditorElements([
        note as unknown as ExcalidrawElement,
        editorStroke() as unknown as ExcalidrawElement,
      ]);

      expect(folded.map((element) => element.type).sort()).toEqual([
        "freedraw",
        "stickynote",
      ]);
    });
  });

  describe("document to editor", () => {
    it("projects a stroke as one editor element", () => {
      // Unlike a note, which is two. A stroke that projected as two would leave a
      // stray element in the scene for the fold to trip over on the next change.
      expect(toEditorElements(documentStroke())).toHaveLength(1);
    });

    it("produces something the editor will accept", () => {
      const [element] = toEditorElements(documentStroke());

      expect(element?.type).toBe("freedraw");
      // The renderer reads these; a projection missing them draws a flat line.
      expect(element).toMatchObject({
        simulatePressure: true,
        strokeOptions: { variability: "variable", streamline: 0.4 },
      });
    });

    it("does not hand the document's arrays to the editor by reference", () => {
      /*
       * The editor mutates elements in place — that is what `version` and
       * `versionNonce` bumping is. Sharing an array would let a render or a
       * gesture write straight into the document's state with no commit, no diff
       * and no undo entry, which is the ephemeral/durable split this project draws
       * a line around.
       *
       * The projection is rebuilt from the document on every change, so the
       * mutation would be invisible: the next fold would see the editor's values
       * and commit them as if the user had made them.
       */
      const stroke = documentStroke();
      const [element] = toEditorElements(stroke) as unknown as Array<{
        points: unknown[];
        pressures: number[];
        strokeOptions: object;
      }>;

      expect(element.points).not.toBe(stroke.points);
      expect(element.pressures).not.toBe(stroke.pressures);
      expect(element.strokeOptions).not.toBe(stroke.strokeOptions);
    });
  });

  describe("round trip", () => {
    it("survives document to editor and back unchanged", () => {
      const original = documentStroke();

      const [editor] = toEditorElements(original);
      const [back] = fromEditorElements([
        editor as unknown as ExcalidrawElement,
      ]);
      const result = back as unknown as FreedrawElement;

      expect(result.points).toEqual(original.points);
      expect(result.pressures).toEqual(original.pressures);
      expect(result.simulatePressure).toBe(original.simulatePressure);
      expect(result.strokeOptions).toEqual(original.strokeOptions);
      expect(result.x).toBe(original.x);
      expect(result.y).toBe(original.y);
      expect(result.strokeColor).toBe(original.strokeColor);
    });

    it("keeps a long stroke's points through a full round trip", () => {
      // A real pen stroke is hundreds of points. A cap anywhere in the chain --
      // the validator, the fold, or the projection -- would shorten it, and the
      // shape would change rather than merely lose detail.
      const many = Array.from({ length: 200 }, (_, i) => [i, (i * 7) % 13]);
      const original = documentStroke({
        points: many,
        pressures: many.map((_, i) => (i % 10) / 10),
      });

      const [editor] = toEditorElements(original);
      const [back] = fromEditorElements([
        editor as unknown as ExcalidrawElement,
      ]);
      const result = back as unknown as FreedrawElement;

      expect(result.points).toHaveLength(200);
      expect(result.pressures).toHaveLength(200);
    });

    it("preserves a stroke's tombstone, so undo can restore it", () => {
      // Undo soft-deletes. A bridge that dropped `isDeleted` on the way through
      // would resurrect every undone stroke on the next sync, which is the failure
      // that made undo look broken for so long elsewhere in this codebase.
      const [editor] = toEditorElements(documentStroke({ isDeleted: true }));
      const [back] = fromEditorElements([
        editor as unknown as ExcalidrawElement,
      ]);

      expect((back as unknown as FreedrawElement).isDeleted).toBe(true);
    });
  });
});
