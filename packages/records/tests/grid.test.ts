/**
 * The grid projection.
 *
 * The grid is the projection most likely to be mistaken for a finished feature, because
 * "one card per record" is exactly what a facilitator sees and nothing about the screen
 * says the cards cannot be moved. [`src/grid.ts`](../src/grid.ts) says so in a long
 * comment; this file says it in assertions, which is the version a reader cannot skip
 * past.
 */
import { describe, expect, it } from "vitest";

import { asFractionalIndex } from "@firo/schema";

import type { FiroRecord } from "@firo/schema";

import { gridProjection, positionOf, tableProjection } from "../src/index.js";

import { keys, record, tasks } from "./fixtures.js";

const collection = tasks();

const card = (id: string, title: string, order: string): FiroRecord =>
  record({
    id,
    order: asFractionalIndex(order),
    values: { title: { type: "text", value: title } },
  });

/** `n` cards with generated, valid, ascending order keys. */
const manyCards = (count: number): FiroRecord[] =>
  keys(count).map((order, index) =>
    card(`rec-${index}`, `Task ${index}`, order),
  );

const cards = () => [
  card("rec-1", "Interview five teams", "a0"),
  card("rec-2", "Write the spec", "a1"),
  card("rec-3", "Ship it", "a2"),
];

describe("a grid is one card per record", () => {
  it("emits exactly one card per record, naming its record", () => {
    const laid = gridProjection.layout(collection, cards());

    expect(laid).toHaveLength(3);
    expect(laid.map((element) => element.recordId)).toEqual([
      "rec-1",
      "rec-2",
      "rec-3",
    ]);
  });

  it("renders the title column's value on each card", () => {
    const laid = gridProjection.layout(collection, cards());

    expect(laid.map((element) => element.text)).toEqual([
      "Interview five teams",
      "Write the spec",
      "Ship it",
    ]);
  });

  it("agrees with the table about which record is which", () => {
    // AC-3 says one record, every view. Two views that disagree about order are still
    // one record, but a facilitator switching views sees the board rearrange itself,
    // which reads as data loss rather than as a rendering difference.
    //
    // `type: "cell"` matters: table headers also carry a `columnKey`, so filtering on
    // the key alone picks up a header per column, each with an empty `recordId`.
    const laid = gridProjection.layout(collection, cards());
    const tableRows = tableProjection
      .layout(collection, cards())
      .filter(
        (element) => element.type === "cell" && element.columnKey === "title",
      );

    expect(laid.map((element) => element.recordId)).toEqual(
      tableRows.map((element) => element.recordId),
    );
  });

  it("lays out in the record's order, whatever order the records arrive in", () => {
    // The grid derived its position from array index rather than from `record.order`,
    // so reordering a row in the table made the grid disagree. Position is derived here
    // (there is nowhere to store a free one), so the only thing that can be wrong is
    // *which* record gets which index.
    const shuffled = [...cards()].reverse();

    expect(
      gridProjection
        .layout(collection, shuffled)
        .map((element) => element.recordId),
    ).toEqual(["rec-1", "rec-2", "rec-3"]);
  });

  it("lays out in reading order, wrapping into rows", () => {
    const laid = gridProjection.layout(collection, cards());

    // Four to a row, so three cards share one row and step rightwards.
    expect(laid.map((element) => element.x)).toEqual([
      laid[0].x,
      laid[0].x + (laid[1].x - laid[0].x),
      laid[0].x + 2 * (laid[1].x - laid[0].x),
    ]);
    expect(new Set(laid.map((element) => element.y)).size).toBe(1);
  });

  it("starts a new row after the fourth card", () => {
    const many = Array.from({ length: 5 }, (_unused, index) =>
      card(`rec-${index}`, `Task ${index}`, `a${index}`),
    );

    const laid = gridProjection.layout(collection, many);

    expect(laid[4].y).toBeGreaterThan(laid[3].y);
    expect(laid[4].x).toBe(laid[0].x);
  });

  it("gives every card a unique id and a stable one", () => {
    const first = gridProjection.layout(collection, cards());
    const second = gridProjection.layout(collection, cards());

    expect(new Set(first.map((element) => element.id)).size).toBe(first.length);
    expect(second.map((element) => element.id)).toEqual(
      first.map((element) => element.id),
    );
  });

  it("lays out an empty collection as nothing, rather than throwing", () => {
    expect(gridProjection.layout(collection, [])).toEqual([]);
  });

  it("lays out 10,000 records", () => {
    expect(gridProjection.layout(collection, manyCards(10_000))).toHaveLength(
      10_000,
    );
  });
});

describe("a windowed grid keeps its cards where the full grid would put them", () => {
  it("positions a windowed card as if the earlier cards existed", () => {
    // Re-basing to the origin is the bug a virtualised grid gets: the first visible card
    // jumps to the top-left instead of staying where it was, and the grid appears to
    // reflow every time the window moves.
    const all = manyCards(20);

    const full = gridProjection.layout(collection, all);
    const windowed = gridProjection.layout(collection, all, {
      offset: 10,
      limit: 1,
    });

    expect(windowed[0].id).toBe(full[10].id);
    expect(windowed[0].x).toBe(full[10].x);
    expect(windowed[0].y).toBe(full[10].y);
  });

  it("lays out only the window it was asked for", () => {
    expect(
      gridProjection.layout(collection, cards(), { offset: 1, limit: 1 }),
    ).toHaveLength(1);
  });

  it("clamps a negative offset rather than slicing from the end", () => {
    expect(
      gridProjection.layout(collection, cards(), { offset: -2, limit: 1 })[0]
        .recordId,
    ).toBe("rec-1");
  });
});

describe("positionOf agrees with the layout", () => {
  it("returns the position layout gives the record at that index", () => {
    // The hit-test and the layout are two answers to "where is card n". They are
    // allowed to be one function's worth of arithmetic apart; they are not allowed to
    // disagree, because a disagreement means clicking a card that is somewhere else.
    gridProjection
      .layout(collection, manyCards(12))
      .forEach((element, index) => {
        const { x, y } = positionOf(index);

        expect(
          [element.x, element.y],
          `card ${index} is not where positionOf says`,
        ).toEqual([x, y]);
      });
  });

  it("honours an origin, so a hit-test in a panned viewport is not in board space", () => {
    const { x, y } = positionOf(0, { originX: 500, originY: 200 });

    expect(x).toBe(500);
    expect(y).toBe(200);
  });
});

describe("the grid refuses a drag, and says so rather than pretending", () => {
  it("returns null for a move", () => {
    // There is no stored position to write. Accepting the drag and ignoring it would
    // be a card that follows the pointer and springs back, which reads as a bug in the
    // app rather than as a feature that has not been built.
    expect(
      gridProjection.interpret(collection, cards(), {
        kind: "move",
        recordId: "rec-1",
        x: 500,
        y: 500,
      }),
    ).toBeNull();
  });

  it("does not advertise reorder, which is why refusing a move is consistent", () => {
    // `supports` is what a UI reads to decide which controls to draw. A projection that
    // advertised `reorder` and then refused would put a button on screen that does
    // nothing.
    expect(gridProjection.supports).not.toContain("reorder");
    expect(gridProjection.supports).not.toContain("freePlacement");
  });

  it("accepts an edit, which it does support", () => {
    expect(
      gridProjection.interpret(collection, cards(), {
        kind: "edit",
        recordId: "rec-1",
        columnKey: "title",
        value: "Interview six teams",
      }),
    ).toEqual({
      kind: "setField",
      recordId: "rec-1",
      columnKey: "title",
      value: { type: "text", value: "Interview six teams" },
    });
  });

  it("refuses an edit on a column that has gone", () => {
    expect(
      gridProjection.interpret(collection, cards(), {
        kind: "edit",
        recordId: "rec-1",
        columnKey: "gone",
        value: "x",
      }),
    ).toBeNull();
  });
});
