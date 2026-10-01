/**
 * A polyline's points must survive a load.
 *
 * ## The bug
 *
 * `linear.ts` validates `points` as a plain list and then calls `.slice(0, 2)` on
 * the result, on the belief that a connector has at most two points. It does not:
 * a `line` or `arrow` drawn as a polyline has one point per vertex, and Excalidraw
 * produces them routinely — click, click, click, drag to finish. A four-vertex
 * polyline would load as a two-vertex one, quietly straightening every bend a
 * person drew.
 *
 * The two-point limit belongs to `bindings`, not `points`, and it is applied there
 * (and commented) because it is real. Copying it onto `points` is the mistake.
 *
 * ## Why the app did not show it
 *
 * Validation runs on *load*, not on commit. Drawing a bent line and reading the
 * document shows every point intact, so the app looks fine right up until the board
 * is saved and reopened — at which point the bends are gone and nothing in the file
 * says why. Measured: a three-vertex polyline is written and read back as three
 * points, and `loadBoard` turns it into two.
 */
// From the index, not from `migrate.js` directly: the element types register
// themselves as a side effect of `./types/index.js` being loaded, and importing
// the migration function on its own leaves the registry empty.
import {
  loadBoard,
  migrateElement,
  RepairLog,
  serializeBoard,
} from "../src/index.js";

import type { LinearElement } from "../src/index.js";

/** `migrateElement` returns the union; only the linear members carry `points`. */
const asLinear = (element: { points?: unknown } | unknown) =>
  element as LinearElement;

const polyline = (points: number[][]) => ({
  id: "line-1",
  type: "line",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  points,
});

describe("a linear element's points", () => {
  it("keeps every vertex of a polyline", () => {
    const log = new RepairLog();
    const { element } = migrateElement(
      polyline([
        [0, 0],
        [10, 10],
        [20, 5],
        [30, 30],
      ]),
      log,
    );

    expect(asLinear(element).points).toHaveLength(4);
  });

  it("keeps a many-vertex polyline, not just a few", () => {
    // A hand-drawn connector is routinely dozens of vertices long, so a limit that
    // is "just above two" would still lose data on a real drawing.
    const many = Array.from({ length: 40 }, (_, i) => [i, i % 2]);
    const log = new RepairLog();
    const { element } = migrateElement(polyline(many), log);

    expect(asLinear(element).points).toHaveLength(40);
  });

  it("still drops a point with no coordinates", () => {
    const log = new RepairLog();
    const { element } = migrateElement(polyline([[0, 0], [1], [20, 5]]), log);

    expect(asLinear(element).points).toHaveLength(2);
    expect(asLinear(element).points).toEqual([
      [0, 0],
      [20, 5],
    ]);
  });

  it("survives a save and reopen", () => {
    // The whole point of the fix, through the path a person actually takes. The
    // tests above pin the validator; this pins the consequence. Before the fix
    // this returned a two-point line for a five-point one, and the board looked
    // correct in the session that drew it.
    const log = new RepairLog();
    const { element } = migrateElement(
      polyline([
        [0, 0],
        [10, 40],
        [20, 5],
        [30, 60],
        [40, 10],
      ]),
      log,
    );

    const saved = serializeBoard({
      elements: [element],
      collections: [],
      records: [],
    });
    const reloaded = loadBoard(JSON.parse(JSON.stringify(saved)));

    expect(reloaded.elements).toHaveLength(1);
    expect(asLinear(reloaded.elements[0]).points).toHaveLength(5);
  });
});
