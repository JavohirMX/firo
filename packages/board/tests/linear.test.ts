import { API } from "@firo/editor/tests/helpers/api";

import type { LinearElement, LinearType } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Connectors in the bridge.
 *
 * A connector is the one element the bridge has to *reinterpret* rather than
 * copy. The document keeps an ordered `bindings` list; the renderer keeps
 * `startBinding` and `endBinding` as separate fields. Getting the correspondence
 * wrong is silent: the arrow still draws, it just attaches to the wrong end, or
 * follows nothing.
 *
 * So the tests here are mostly about *which end*, not about whether bindings
 * survive at all.
 */

const editorConnector = (
  type: LinearType,
  over: Record<string, unknown> = {},
): Record<string, unknown> => {
  const element = API.createElement({
    type: type === "arrow" ? "arrow" : "line",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    points: [
      [0, 0, 0.5],
      [100, 50, 0.5],
    ],
    ...over,
  } as never);
  return { ...element, type } as unknown as Record<string, unknown>;
};

const documentConnector = (
  type: LinearType,
  over: Record<string, unknown> = {},
) =>
  ({
    id: "l1",
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    points: [
      [0, 0, 0.5],
      [100, 50, 0.5],
    ],
    startArrowhead: null,
    endArrowhead: null,
    elbowed: false,
    version: 1,
    versionNonce: 3,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
    ...over,
  } as unknown as LinearElement);

describe("connector projection", () => {
  it.each(["arrow", "line"] as const)(
    "projects a %s as one editor element",
    (type) => {
      expect(toEditorElements(documentConnector(type))).toHaveLength(1);
    },
  );

  it("carries the path across, since the path is the element", () => {
    const points = [
      [1, 2, 0.5],
      [30, 40, 0.5],
    ];
    const [projected] = toEditorElements(
      documentConnector("arrow", { points }),
    );
    expect((projected as unknown as { points: unknown }).points).toEqual(
      points,
    );
  });

  it("carries arrowheads across", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        startArrowhead: "dot",
        endArrowhead: "triangle",
      }),
    );
    expect(projected).toMatchObject({
      startArrowhead: "dot",
      endArrowhead: "triangle",
    });
  });

  /*
   * The correspondence the whole type rests on.
   */
  it("reads the first binding as the start and the second as the end", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [
          {
            elementId: "from",
            focus: 0,
            gap: 1,
            fixedPoint: [0.5, 0.5],
            mode: "orbit",
          },
          {
            elementId: "to",
            focus: 0,
            gap: 1,
            fixedPoint: [0.2, 0.8],
            mode: "inside",
          },
        ],
      }),
    );
    const connector = projected as unknown as {
      startBinding: { elementId: string; mode: string } | null;
      endBinding: { elementId: string; mode: string } | null;
    };
    expect(connector.startBinding?.elementId).toBe("from");
    expect(connector.startBinding?.mode).toBe("orbit");
    expect(connector.endBinding?.elementId).toBe("to");
    expect(connector.endBinding?.mode).toBe("inside");
  });

  it("leaves a binding without a fixed point out of the renderer", () => {
    // The renderer moved off `focus`/`gap` onto `fixedPoint` + `mode`. A binding
    // with no fixed point is an edge-following connector, which is `null` here,
    // not a binding at the default point.
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [{ elementId: "edge", focus: 0, gap: 1 }],
      }),
    );
    expect(
      (projected as unknown as { startBinding: unknown }).startBinding,
    ).toBeNull();
  });

  it("defaults a fixed-point binding's mode rather than emitting an undrawable one", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [
          { elementId: "a", focus: 0, gap: 1, fixedPoint: [0.5, 0.5] },
        ],
      }),
    );
    expect(
      (projected as unknown as { startBinding: { mode: string } | null })
        .startBinding?.mode,
    ).toBe("orbit");
  });
});

describe("connector fold", () => {
  it.each(["arrow", "line"] as const)(
    "folds a %s into the document",
    (type) => {
      const folded = fromEditorElements([editorConnector(type)] as never);
      expect(folded).toHaveLength(1);
      expect(folded[0].type).toBe(type);
    },
  );

  it("is the regression: a drawn connector reaches the document", () => {
    const folded = fromEditorElements([
      editorConnector("arrow"),
      editorConnector("line"),
    ] as never);
    expect(folded.map((e) => e.type)).toEqual(["arrow", "line"]);
  });

  it("keeps the path across a round trip", () => {
    const points = [
      [5, 6, 0.5],
      [70, 80, 0.5],
    ];
    const [projected] = toEditorElements(
      documentConnector("arrow", { points }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect((folded as LinearElement).points).toEqual(points);
  });

  it("puts the start binding first and the end second", () => {
    // The mirror of the projection test, and the reason the two live together.
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [
          {
            elementId: "from",
            focus: 0,
            gap: 1,
            fixedPoint: [0.5, 0.5],
            mode: "orbit",
          },
          {
            elementId: "to",
            focus: 0,
            gap: 1,
            fixedPoint: [0.2, 0.8],
            mode: "inside",
          },
        ],
      }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect((folded as LinearElement).bindings.map((b) => b.elementId)).toEqual([
      "from",
      "to",
    ]);
  });

  it("keeps the binding mode across a round trip", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [
          {
            elementId: "a",
            focus: 0,
            gap: 1,
            fixedPoint: [0.5, 0.5],
            mode: "inside",
          },
        ],
      }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect((folded as LinearElement).bindings[0]?.mode).toBe("inside");
  });

  it("does not invent a second end when there is only one", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", {
        bindings: [
          {
            elementId: "only",
            focus: 0,
            gap: 1,
            fixedPoint: [0.5, 0.5],
            mode: "orbit",
          },
        ],
      }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect((folded as LinearElement).bindings).toHaveLength(1);
  });

  it("keeps at most two bindings, because there are only two ends", () => {
    const [folded] = fromEditorElements([
      editorConnector("arrow", {
        startBinding: { elementId: "a", fixedPoint: [0.5, 0.5], mode: "orbit" },
        endBinding: { elementId: "b", fixedPoint: [0.5, 0.5], mode: "orbit" },
        boundElements: [{ id: "a", type: "arrow" }],
      }),
    ] as never);
    expect((folded as LinearElement).bindings.length).toBeLessThanOrEqual(2);
  });

  it("round trips geometry and identity", () => {
    const [projected] = toEditorElements(
      documentConnector("line", { x: 12, y: 34, width: 200 }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect(folded).toMatchObject({ id: "l1", x: 12, y: 34, width: 200 });
  });

  it("preserves a tombstone", () => {
    const [projected] = toEditorElements(
      documentConnector("arrow", { isDeleted: true }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.isDeleted).toBe(true);
  });
});
