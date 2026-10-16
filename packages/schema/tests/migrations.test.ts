/**
 * The migration harness tests.
 *
 * These are the tests that make the file format a promise rather than a hope
 * (rule 2, [`../../../docs/trd/02-data-model.md`](../../../docs/trd/02-data-model.md)).
 * They are deliberately the first thing in the package, because the harness is
 * the thing that must not be retrofitted.
 */
import { describe, expect, test, vi } from "vitest";

import {
  CURRENT_ELEMENT_VERSION,
  CURRENT_RECORD_VERSION,
  canonicalJson,
  ForwardVersionError,
  fixtures,
  fixturesAreComplete,
  loadBoard,
  loadFixture,
  migrateElement,
  preservedFields,
  RepairLog,
  requireElementSpec,
  registeredElementTypes,
  V1_TO_V2_FACILITATION_FLAGS,
  V2_TO_V3_ELEMENT_TAGS,
  V3_TO_V4_DOC_BLOCKS,
  migrateBoardV3ToV4,
  DOC_BLOCK_COLLECTION_ID,
  roundTripFixture,
  serializeBoard,
} from "@firo/schema";

import boardV1 from "./fixtures/v1/board.json";
import boardV2 from "./fixtures/v2/board.json";
import boardV3 from "./fixtures/v3/board.json";
import boardV4 from "./fixtures/v4/board.json";

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

    // And the same for v2, which is the fixture the bump hangs its promise on.
    const inCodeV2 = fixtures().find((f) => f.version === 2);
    expect(inCodeV2).toBeDefined();
    expect(inCodeV2?.board).toEqual(boardV2);

    // And the same for v3, which is the fixture for element tags.
    const inCodeV3 = fixtures().find((f) => f.version === 3);
    expect(inCodeV3).toBeDefined();
    expect(inCodeV3?.board).toEqual(boardV3);

    // And the same for v4, which is the fixture for doc blocks.
    const inCodeV4 = fixtures().find((f) => f.version === 4);
    expect(inCodeV4).toBeDefined();
    expect(inCodeV4?.board).toEqual(boardV4);
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

  test("every fixture round-trips, changing nothing but the version header", () => {
    // "Byte-identically" used to be the claim here, and it stopped being true at
    // the first version bump -- for the v1 fixture the header is *supposed* to
    // change, because stamping the stored version on the way out is how a board
    // gets downgraded on its second save. So the promise is the narrower and more
    // useful one: a load followed by a save touches the version header and nothing
    // else. That also catches a migration rewriting a field it had no business
    // touching, which "the two are equal" would have.
    for (const fixture of fixtures()) {
      const { stable } = roundTripFixture(fixture);
      expect(stable, `fixture v${fixture.version} did not round-trip`).toBe(
        true,
      );
    }
  });

  test("a fixture already at the current version round-trips byte-identically", () => {
    // The other half, and the one `roundTripFixture` cannot check on its own
    // because it normalises the headers: for the current version there is nothing
    // to normalise, so this is the real byte-for-byte promise -- a re-export of an
    // unchanged board must not churn `git diff`.
    const current = fixtures().filter(
      (fixture) => fixture.version === CURRENT_ELEMENT_VERSION,
    );
    expect(current.length).toBeGreaterThan(0);
    for (const fixture of current) {
      expect(canonicalJson(serializeBoard(loadFixture(fixture)))).toBe(
        canonicalJson(fixture.board),
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
  test("round-trips the v1 board, upgrading nothing but the header", () => {
    // The v1 -> v2 upgrade adds two optional flags and moves no data, so the
    // strongest thing that can be asserted is that it changed *only* the version.
    // Spelling the exception out rather than loosening the comparison is the point:
    // a test that ignored the header would have passed while the bump did nothing
    // at all, and one that ignored the elements would pass if the migration
    // quietly rewrote them.
    const loaded = loadBoard(boardV1);
    expect(serializeBoard(loaded)).toEqual({
      ...boardV1,
      elementSchemaVersion: CURRENT_ELEMENT_VERSION,
      recordSchemaVersion: CURRENT_RECORD_VERSION,
    });
  });

  test("the v1 elements gain neither flag, because absence is the default", () => {
    // Materialising `false` would put two new keys on every element of every board
    // that predates the fields -- a whole-file diff on a board nobody touched,
    // caused by a version bump rather than by an edit.
    for (const element of loadBoard(boardV1).elements) {
      expect(element).not.toHaveProperty("hiddenUntilRevealed");
      expect(element).not.toHaveProperty("hideInPresentation");
    }
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

/**
 * The chain itself, rather than any one migration's effect.
 *
 * `runElementMigrations` stops at the first gap and never says so, so a type whose
 * spec forgot a step loads a newer file *without migrating it* -- and the result
 * presents as a board that skipped a schema version rather than as a build error.
 * v2 is the first bump, so this is the first time that could happen here; from now
 * on it can happen at every one.
 */
describe("every registered type carries a contiguous migration chain", () => {
  test("no gaps between a type's introduction and the current version", () => {
    for (const type of registeredElementTypes()) {
      const spec = requireElementSpec(type);
      const froms = [...spec.migrations]
        .sort((a, b) => a.from - b.from)
        .map((migration) => migration.from);

      const expected: number[] = [];
      for (let v = spec.introducedAt; v < CURRENT_ELEMENT_VERSION; v++) {
        expected.push(v);
      }

      // Named, so the failure says which type forgot rather than "an array differs".
      expect({ type, froms }).toEqual({ type, froms: expected });
    }
  });

  test("no step skips a version", () => {
    for (const type of registeredElementTypes()) {
      for (const migration of requireElementSpec(type).migrations) {
        expect(
          migration.to - migration.from,
          `${type} declares a step ${migration.from} -> ${migration.to}, which ` +
            `would leave the versions between it unmigrated`,
        ).toBe(1);
      }
    }
  });

  test("no step points outside the versions this build understands", () => {
    for (const type of registeredElementTypes()) {
      for (const migration of requireElementSpec(type).migrations) {
        expect(migration.from).toBeGreaterThanOrEqual(1);
        expect(migration.to).toBeLessThanOrEqual(CURRENT_ELEMENT_VERSION);
      }
    }
  });

  test("every type holds the same shared step object, not a copy of it", () => {
    // Ten types x one step is where a copy-paste would put ten subtly different
    // migrations in a chain nobody reads end to end. Identity, so the thing under
    // test is the one exported and documented.
    for (const type of registeredElementTypes()) {
      expect(requireElementSpec(type).migrations).toContain(
        V1_TO_V2_FACILITATION_FLAGS,
      );
      expect(requireElementSpec(type).migrations).toContain(
        V2_TO_V3_ELEMENT_TAGS,
      );
      expect(requireElementSpec(type).migrations).toContain(
        V3_TO_V4_DOC_BLOCKS,
      );
    }
  });
});

describe("the v1 -> v2 step", () => {
  const step = V1_TO_V2_FACILITATION_FLAGS;

  test("returns a new object rather than the one it was handed", () => {
    // Migration rule 2: never mutate in place. Yjs needs it, and an in-place
    // mutation is invisible to the undo manager. Returning `raw` satisfies the
    // letter of the rule and hands the caller and the next step the same object,
    // which is one edit away from a step that does mutate it.
    const raw = { id: "el-1", type: "stickynote", text: "t" };
    const out = step.migrate(raw, new RepairLog());
    expect(out).not.toBe(raw);
    expect(out).toEqual(raw);
  });

  test("keeps a field it does not recognise", () => {
    const out = step.migrate(
      { id: "el-1", type: "stickynote", aFieldFromV3: { deep: true } },
      new RepairLog(),
    );
    expect(out).toHaveProperty("aFieldFromV3", { deep: true });
  });

  test("adds neither flag, because absence is v2's default", () => {
    const out = step.migrate(
      { id: "el-1", type: "stickynote" },
      new RepairLog(),
    );
    for (const flag of ["hiddenUntilRevealed", "hideInPresentation"]) {
      expect(out).not.toHaveProperty(flag);
    }
  });

  test("it actually runs for a board stamped v1", () => {
    // The contiguity test above checks the chain is *declared*; this checks it is
    // walked. Without it, a `runElementMigrations` that ignored `migrations`
    // entirely would satisfy every other assertion in this file.
    const spy = vi.spyOn(V1_TO_V2_FACILITATION_FLAGS, "migrate");
    try {
      loadBoard(boardV1);
      expect(spy).toHaveBeenCalledTimes(boardV1.elements.length);
      for (const [raw] of spy.mock.calls) {
        expect(raw).not.toHaveProperty("hiddenUntilRevealed");
      }
    } finally {
      spy.mockRestore();
    }
  });

  test("and does not run for a board already at the current version", () => {
    // The control, so a spy that counted nothing could not pass the test above.
    const spy = vi.spyOn(V1_TO_V2_FACILITATION_FLAGS, "migrate");
    try {
      loadBoard(boardV3);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the v2 -> v3 step", () => {
  const step = V2_TO_V3_ELEMENT_TAGS;

  test("returns a new object rather than mutating in place", () => {
    const raw = { id: "el-1", type: "stickynote", text: "t" };
    const out = step.migrate(raw, new RepairLog());
    expect(out).not.toBe(raw);
    expect(out).toEqual(raw);
  });

  test("keeps unknown fields untouched", () => {
    const out = step.migrate(
      { id: "el-1", type: "stickynote", futureProp: 123 },
      new RepairLog(),
    );
    expect(out).toHaveProperty("futureProp", 123);
  });

  test("leaves untagged elements untouched without materializing empty tags", () => {
    const out = step.migrate(
      { id: "el-1", type: "stickynote" },
      new RepairLog(),
    );
    expect(out).not.toHaveProperty("tags");
  });

  test("it actually runs for a board stamped v2", () => {
    const spy = vi.spyOn(V2_TO_V3_ELEMENT_TAGS, "migrate");
    try {
      loadBoard(boardV2);
      expect(spy).toHaveBeenCalledTimes(boardV2.elements.length);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the v3 -> v4 step", () => {
  const step = V3_TO_V4_DOC_BLOCKS;

  test("returns a new object rather than mutating in place", () => {
    const raw = { id: "el-1", type: "stickynote", text: "t" };
    const out = step.migrate(raw, new RepairLog());
    expect(out).not.toBe(raw);
    expect(out).toEqual(raw);
  });

  test("keeps unknown fields untouched", () => {
    const out = step.migrate(
      { id: "el-1", type: "stickynote", futureProp: 456 },
      new RepairLog(),
    );
    expect(out).toHaveProperty("futureProp", 456);
  });

  test("it actually runs for a board stamped v3", () => {
    const spy = vi.spyOn(V3_TO_V4_DOC_BLOCKS, "migrate");
    try {
      loadBoard(boardV3);
      expect(spy).toHaveBeenCalledTimes(boardV3.elements.length);
    } finally {
      spy.mockRestore();
    }
  });

  test("and does not run for a board already at v4", () => {
    const spy = vi.spyOn(V3_TO_V4_DOC_BLOCKS, "migrate");
    try {
      loadBoard(boardV4);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("migrateBoardV3ToV4 adds doc blocks collection by spreading previous object", () => {
    const v3Board = {
      elementSchemaVersion: 3,
      meta: { id: "custom-board", customKey: "preserved" },
      elements: [{ id: "el-1", type: "stickynote" }],
      collections: [{ id: "col-existing", name: "Existing" }],
    };

    const migrated = migrateBoardV3ToV4(v3Board);

    expect(migrated.elementSchemaVersion).toBe(4);
    expect(migrated.meta).toEqual(v3Board.meta);
    expect(migrated.elements).toBe(v3Board.elements);
    expect(migrated.collections).toHaveLength(2);
    expect(
      (migrated.collections as Array<{ id: string }>).some(
        (c) => c.id === DOC_BLOCK_COLLECTION_ID,
      ),
    ).toBe(true);
  });

  test("migrateBoardV3ToV4 is idempotent when doc blocks collection already exists", () => {
    const v4Board = {
      elementSchemaVersion: 4,
      meta: { id: "custom-board" },
      collections: [{ id: DOC_BLOCK_COLLECTION_ID, name: "Doc Blocks" }],
    };

    const migrated = migrateBoardV3ToV4(v4Board);
    expect(migrated.collections).toHaveLength(1);
  });
});
