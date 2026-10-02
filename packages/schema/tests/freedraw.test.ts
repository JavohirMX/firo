/**
 * The `freedraw` validator.
 *
 * ## Why a stroke needs its own tests
 *
 * Every other field on a freedraw element is shared with a shape or a connector and
 * is already covered by those types' tests. What is unique here is `pressures`,
 * `simulatePressure` and `strokeOptions`, and they are unique in a way that fails
 * *quietly*.
 *
 * Drop or default any of them and the stroke still loads, still renders, and looks
 * different: an even ribbon where there was a pressure taper, or a jittery line
 * where there was a smoothed one. There is no error, no warning, and nothing in the
 * file to indicate that a field was lost. The only defence is a test that says what
 * the value was.
 *
 * The other thing pinned here is the absence of a vertex cap. `linear.ts` once
 * applied `.slice(0, 2)` to its `points`, on the belief that a path has two ends,
 * and every polyline in every saved board loaded as a straight line. `points` here
 * is one entry per sampled position and a real stroke has hundreds.
 */
import { migrateElement } from "../src/index.js";
import { RepairLog } from "../src/index.js";

import type { FreedrawElement } from "../src/index.js";

const stroke = (overrides: Record<string, unknown> = {}) => {
  const log = new RepairLog();
  const { element } = migrateElement(
    {
      id: "fd-1",
      type: "freedraw",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      strokeColor: "#e03131",
      points: [
        [0, 0],
        [10, 20],
        [30, 5],
      ],
      pressures: [0.5, 0.8, 0.2],
      simulatePressure: true,
      strokeOptions: { variability: "variable", streamline: 0.4 },
      ...overrides,
    },
    log,
  );
  return { element: element as FreedrawElement, log };
};

describe("a freedraw element", () => {
  it("keeps the points it was given", () => {
    const { element } = stroke();
    expect(element.points).toEqual([
      [0, 0],
      [10, 20],
      [30, 5],
    ]);
  });

  it("keeps every point of a long stroke", () => {
    // A pen stroke is routinely hundreds of sampled points. A cap here would not
    // merely lose detail -- it would change the shape of the line, which is the
    // bug `linear.ts` had.
    const many = Array.from({ length: 300 }, (_, i) => [i, i % 7]);
    const { element } = stroke({
      points: many,
      pressures: many.map(() => 0.5),
    });

    expect(element.points).toHaveLength(300);
  });

  it("keeps the pressures, aligned with the points", () => {
    // Positional: `pressures[i]` belongs to `points[i]`. A validator that filtered
    // an out-of-range value would misalign every pressure after it rather than
    // reject the element.
    const { element } = stroke();
    expect(element.pressures).toEqual([0.5, 0.8, 0.2]);
  });

  it("clamps an out-of-range pressure instead of dropping it", () => {
    // Dropping would leave a hole in a positionally-indexed array, which is worse
    // than a clamped value: the pressures after the hole would all describe the
    // wrong point.
    const { element } = stroke({ pressures: [-3, 0.5, 7] });
    expect(element.pressures).toEqual([0, 0.5, 1]);
  });

  it("keeps `simulatePressure`, which decides whether pressures are read at all", () => {
    expect(stroke({ simulatePressure: true }).element.simulatePressure).toBe(
      true,
    );
    expect(stroke({ simulatePressure: false }).element.simulatePressure).toBe(
      false,
    );
  });

  it("defaults `simulatePressure` to true when absent", () => {
    // A mouse has no pressure, so most strokes are drawn with it simulated. The
    // alternative default is a stroke with no width variation at all.
    const { element } = stroke({ simulatePressure: undefined });
    expect(element.simulatePressure).toBe(true);
  });

  it("keeps both stroke options", () => {
    // `variability` decides whether width varies along the stroke and `streamline`
    // how much the path is smoothed. Both change the drawing; neither is cosmetic.
    const { element } = stroke();
    expect(element.strokeOptions).toEqual({
      variability: "variable",
      streamline: 0.4,
    });
  });

  it("keeps a constant-width stroke constant", () => {
    // The other value of the union. Asserted because the field is a two-value
    // switch the renderer branches on, and a validator that coerced everything to
    // `"variable"` would silently retaper every even ribbon.
    const { element } = stroke({
      strokeOptions: { variability: "constant", streamline: 0 },
    });
    expect(element.strokeOptions).toEqual({
      variability: "constant",
      streamline: 0,
    });
  });

  it("defaults a missing `strokeOptions` rather than leaving it undefined", () => {
    const { element } = stroke({ strokeOptions: undefined });
    expect(element.strokeOptions).toEqual({
      variability: "variable",
      streamline: 0.4,
    });
  });

  it("repairs an unreadable `strokeOptions` instead of trusting it", () => {
    const { element } = stroke({ strokeOptions: "tapered" });
    expect(element.strokeOptions).toEqual({
      variability: "variable",
      streamline: 0.4,
    });
  });

  it("clamps `streamline` into 0..1", () => {
    expect(
      stroke({ strokeOptions: { variability: "variable", streamline: 9 } })
        .element.strokeOptions.streamline,
    ).toBe(1);
    expect(
      stroke({ strokeOptions: { variability: "variable", streamline: -4 } })
        .element.strokeOptions.streamline,
    ).toBe(0);
  });

  it("drops a point with no coordinates and keeps the rest", () => {
    const { element } = stroke({
      points: [[0, 0], [5], [10, 10]],
    });
    expect(element.points).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it("drops a third component on a point", () => {
    // A stroke's pressure lives in `pressures`, indexed by position. A pressure
    // folded into the point as well would be a second copy nothing keeps in step
    // with the first -- and this is the mistake `linear.ts` documents having made
    // in the other direction.
    const { element } = stroke({ points: [[0, 0, 0.7]] });
    expect(element.points).toEqual([[0, 0]]);
  });

  it("keeps the width and height of the bounding box positive", () => {
    // A stroke can be drawn right-to-left, which makes a negative extent. The
    // renderer takes the absolute value, so storing the negative form would make
    // two clients disagree about the same stroke.
    const { element } = stroke({ width: -100, height: -50 });
    expect(element.width).toBe(100);
    expect(element.height).toBe(50);
  });

  it("has no roundness, because a stroke has no corners", () => {
    expect(stroke().element.roundness).toBeNull();
  });

  it("refuses a binding, which a stroke cannot honour", () => {
    // A binding tells the renderer to follow another element's edge. A freehand
    // path is the person's own line, not a route between two things, so a binding
    // on one is a relation with no meaning rather than a feature.
    const { element } = stroke({
      bindings: [{ elementId: "other", focus: 0, gap: 1 }],
    });
    expect(element.bindings).toEqual([]);
  });

  it("preserves a field it does not know about", () => {
    // Migration rule 1, and the reason a forward-compatible file survives: unknown
    // keys are carried through untouched so a newer Firo's field is not deleted by
    // an older one.
    const { element } = stroke({ somethingNewer: "keep me" });
    expect((element as unknown as Record<string, unknown>).somethingNewer).toBe(
      "keep me",
    );
  });

  it("round-trips through save and reopen unchanged", () => {
    // The consequence, through the path a person takes. Everything above is a unit
    // assertion; this is the one that would catch a field being dropped somewhere
    // between the validator and the file.
    const { element } = stroke({
      points: Array.from({ length: 40 }, (_, i) => [i, i % 5]),
      pressures: Array.from({ length: 40 }, (_, i) => (i % 10) / 10),
      simulatePressure: false,
      strokeOptions: { variability: "constant", streamline: 0.15 },
    });

    const reloaded = migrateElement(
      JSON.parse(JSON.stringify(element)),
      new RepairLog(),
    ).element as FreedrawElement;

    expect(reloaded.points).toHaveLength(40);
    expect(reloaded.pressures).toHaveLength(40);
    expect(reloaded.simulatePressure).toBe(false);
    expect(reloaded.strokeOptions).toEqual({
      variability: "constant",
      streamline: 0.15,
    });
    expect(reloaded.strokeColor).toBe("#e03131");
  });
});
