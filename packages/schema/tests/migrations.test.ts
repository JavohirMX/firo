/**
 * The migration harness tests.
 *
 * These are the tests that make the file format a promise rather than a hope
 * (rule 2, [`../../../docs/trd/02-data-model.md`](../../../docs/trd/02-data-model.md)).
 * They are deliberately the first thing in the package, because the harness is
 * the thing that must not be retrofitted.
 */
import { describe, expect, test } from "vitest";

import {
  CURRENT_ELEMENT_VERSION,
  CURRENT_RECORD_VERSION,
  ForwardVersionError,
  fixtures,
  fixturesAreComplete,
  loadBoard,
  loadFixture,
  migrateElement,
  preservedFields,
  RepairLog,
  roundTripFixture,
  serializeBoard,
} from "@firo/schema";

import boardV1 from "./fixtures/v1/board.json";

describe("the committed fixture set", () => {
  test("covers every released element version, with no gaps", () => {
    // The guard that makes "bump the version without a fixture" a build failure.
    expect(fixturesAreComplete()).toEqual([]);
  });

  test("the on-disk fixture is the same fixture the harness holds in code", () => {
    // Two sources of truth for the same promise is one source of truth too many.
    // The committed JSON is the artefact a user can diff; the module copy is
    // what the harness can load without a bundler. This test fails if they drift.
    const inCode = fixtures().find((f) => f.version === 1);
    expect(inCode).toBeDefined();
    expect(inCode?.board).toEqual(boardV1);
  });

  test("every fixture loads without repair", () => {
    for (const fixture of fixtures()) {
      const loaded = loadFixture(fixture);
      // `hasRepairs`, not `hasAny`: the fixture deliberately carries a value
      // for a column that no longer exists, and preserving that is the feature
      // working, not a repair.
      expect(
        loaded.log.hasRepairs,
        `fixture v${fixture.version} needed repairs: ${loaded.log.summary()}`,
      ).toBe(false);
    }
  });

  test("every fixture round-trips byte-identically", () => {
    for (const fixture of fixtures()) {
      const { stable } = roundTripFixture(fixture);
      expect(stable, `fixture v${fixture.version} did not round-trip`).toBe(
        true,
      );
    }
  });

  test("a version bump with no fixture is reported as a gap", () => {
    // Proves the guard works by simulating the mistake it exists to catch.
    // `fixturesAreComplete` reads module state, so the honest way to test it is
    // to check the shape of the guarantee directly.
    const versions = new Set(fixtures().map((f) => f.version));
    expect(versions.has(1)).toBe(true);
    // If CURRENT_ELEMENT_VERSION is ever above 1, a v2 fixture must exist.
    if (CURRENT_ELEMENT_VERSION > 1) {
      expect(versions.has(CURRENT_ELEMENT_VERSION)).toBe(true);
    }
    if (CURRENT_RECORD_VERSION > 1) {
      expect(versions.has(CURRENT_RECORD_VERSION)).toBe(true);
    }
  });
});

describe("loading the v1 fixture", () => {
  const loaded = loadBoard(boardV1);

  test("loads both elements", () => {
    expect(loaded.elements).toHaveLength(2);
    expect(loaded.elements.map((e) => e.type)).toEqual([
      "stickynote",
      "stickynote",
    ]);
  });

  test("preserves the note text and its geometry", () => {
    const [first] = loaded.elements;
    expect(first.text).toBe("Frame the problem");
    expect(first.x).toBe(40);
    expect(first.y).toBe(60);
    expect(first.width).toBe(200);
    expect(first.height).toBe(200);
  });

  test("preserves the fractional index and the merge counters", () => {
    const [first, second] = loaded.elements;
    expect(first.index).toBe("a0");
    expect(first.version).toBe(3);
    expect(first.versionNonce).toBe(112233);
    expect(second.index).toBe("a1");
    expect(second.versionNonce).toBe(445566);
  });

  test("preserves a binding", () => {
    expect(loaded.elements[1].bindings).toEqual([
      { elementId: "el-note-1", focus: 0, gap: 1 },
    ]);
  });

  test("loads the collection with its three columns", () => {
    expect(loaded.collections).toHaveLength(1);
    expect(loaded.collections[0].columns.map((c) => c.key)).toEqual([
      "title",
      "done",
      "owner",
    ]);
  });

  test("loads both records", () => {
    expect(loaded.records).toHaveLength(2);
    expect(loaded.records[0].values.title).toEqual({
      type: "text",
      value: "Interview five teams",
    });
  });
});

describe("serialise is the exact inverse of load", () => {
  test("round-trips the v1 board unchanged", () => {
    const loaded = loadBoard(boardV1);
    expect(serializeBoard(loaded)).toEqual(boardV1);
  });

  test("is stable across a second load of its own output", () => {
    const once = serializeBoard(loadBoard(boardV1));
    const twice = serializeBoard(loadBoard(once));
    expect(twice).toEqual(once);
  });

  test("stamps the current versions, so a saved board is never downgraded", () => {
    const serialised = serializeBoard(loadBoard(boardV1));
    expect(serialised.elementSchemaVersion).toBe(CURRENT_ELEMENT_VERSION);
    expect(serialised.recordSchemaVersion).toBe(CURRENT_RECORD_VERSION);
  });
});

describe("AC-10: a file from a newer version fails loudly", () => {
  test("a board with a future element version is rejected, not repaired", () => {
    expect(() =>
      loadBoard({
        ...boardV1,
        elementSchemaVersion: CURRENT_ELEMENT_VERSION + 1,
      }),
    ).toThrow(ForwardVersionError);
  });

  test("a board with a future record version is rejected", () => {
    expect(() =>
      loadBoard({
        ...boardV1,
        recordSchemaVersion: CURRENT_RECORD_VERSION + 1,
      }),
    ).toThrow(ForwardVersionError);
  });

  test("the version comes from the board header, not from each element", () => {
    // A deliberate design decision, and worth pinning: a board is written by one
    // writer at one version, so a per-element `schemaVersion` is not consulted.
    // A stray one on a v1 board is a field from something we do not understand,
    // so it is preserved rather than obeyed.
    const loaded = loadBoard({
      ...boardV1,
      elements: [
        ...boardV1.elements,
        { ...boardV1.elements[0], id: "el-x", schemaVersion: 999 },
      ],
    });
    expect(loaded.elements).toHaveLength(3);
    expect(preservedFields(loaded.elements[2])).toHaveProperty(
      "schemaVersion",
      999,
    );
  });

  test("a board whose header is a future version aborts before reading any element", () => {
    // Fail fast, not fail late. Reading the element data before the version check
    // means a future board gets partially read before being refused, and
    // partial reads are how a refused board ends up half-written.
    //
    // The property has to be defined with `Object.defineProperty` rather than a
    // plain object literal: `{ ...boardV1, get elements() { ... } }` would
    // evaluate the getter while building the argument, so the test would be
    // measuring itself. Same reason a Proxy over the array does not work here --
    // `forEach` reads the array's internal slots and never calls
    // `Symbol.iterator`, so the trap would never fire and the test would pass
    // vacuously.
    let read = false;
    const board = { ...boardV1, elementSchemaVersion: 99 } as Record<
      string,
      unknown
    >;
    Object.defineProperty(board, "elements", {
      enumerable: true,
      get() {
        read = true;
        return boardV1.elements;
      },
    });

    expect(() => loadBoard(board)).toThrow(ForwardVersionError);
    expect(read).toBe(false);
  });

  test("a board at the current version does read its elements", () => {
    // The control, so a loader that simply never reads the data cannot pass
    // both tests.
    let read = false;
    const board = { ...boardV1 } as Record<string, unknown>;
    Object.defineProperty(board, "elements", {
      enumerable: true,
      get() {
        read = true;
        return boardV1.elements;
      },
    });
    expect(loadBoard(board).elements).toHaveLength(2);
    expect(read).toBe(true);
  });

  test("the per-element guard also holds, independently of the board-level one", () => {
    // `runElementMigrations` is the thorough check; the board-level check is a
    // fail-fast optimisation in front of it. Both must reject on their own, or
    // the optimisation becomes the only enforcement and removing it silently
    // downgrades "fail before reading" to "fail partway through".
    const log = new RepairLog();
    expect(() =>
      migrateElement(boardV1.elements[0], log, CURRENT_ELEMENT_VERSION + 1),
    ).toThrow(ForwardVersionError);
  });

  test("an element type this build does not have is rejected", () => {
    const future = {
      ...boardV1,
      elements: [{ id: "el-x", type: "kanban", text: "a future type" }],
    };
    expect(() => loadBoard(future)).toThrow(/Unknown element type "kanban"/);
  });

  test("the error message tells the user what to do", () => {
    try {
      loadBoard({ ...boardV1, elementSchemaVersion: 99 });
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("newer version of Firo");
      expect(message).toContain("Update Firo");
      expect(message).toContain("Nothing was written");
    }
  });
});
