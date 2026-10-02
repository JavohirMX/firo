import { compactBoard, loadBoard } from "../src/index.js";

import type { SerializedBoard } from "../src/index.js";

/*
 * Compaction, which is the file format's answer to tombstones.
 *
 * ## The split this exists to protect
 *
 * | | tombstones | why |
 * | --- | --- | --- |
 * | **autosave** | kept | the document is a CRDT. A tombstone stops a stale write resurrecting a deleted element, and it is what lets an undone deletion be restored. |
 * | **`.firo` file** | dropped | a file is a snapshot, not a replica. It carries no undo history for a tombstone to restore, and has no concurrent writer for one to protect against. |
 *
 * Getting this backwards in either direction is bad, and silently:
 *
 * - Compact the autosave and an undone element cannot be brought back, and a stale
 *   write can resurrect a deleted one.
 * - Keep tombstones in the file and the file grows without bound. Measured before this
 *   existed: five notes with two deleted exported all five, and every edit-and-undo
 *   added another.
 *
 * So the compaction is a named function in the schema rather than a flag on the
 * serialiser. The autosave calls `serializeBoard` and does not know this exists; the
 * file calls `compactBoard` and has to ask for it.
 */
/**
 * A rectangle with every field a rectangle needs.
 *
 * The first version of this file used `{ id, type, isDeleted }` and the
 * "loads without complaint" assertion failed — correctly. The validator was repairing
 * every missing geometry field, so the assertion was measuring the fixture rather
 * than the compaction. A test that cannot fail for the reason it claims is worse than
 * no test, so the fixture is now a real element.
 */
const rectangle = (id: string, isDeleted: boolean) => ({
  id,
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  version: 1,
  versionNonce: 0,
  index: "a0",
  created: 1000,
  updated: 1000,
  isDeleted,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
});

const board = (over: Partial<SerializedBoard> = {}): SerializedBoard =>
  ({
    elementSchemaVersion: 1,
    recordSchemaVersion: 1,
    elementOrder: ["a", "b", "c"],
    elements: [
      rectangle("a", false),
      rectangle("b", true),
      rectangle("c", false),
    ],
    collections: [],
    records: [],
    meta: {},
    ...over,
  } as unknown as SerializedBoard);

const ids = (b: SerializedBoard) =>
  b.elements.map((element) => (element as { id: string }).id);

describe("compactBoard", () => {
  it("drops deleted elements", () => {
    expect(ids(compactBoard(board()))).toEqual(["a", "c"]);
  });

  it("drops the dropped ids from the z-order too", () => {
    /*
     * Not cosmetic. `loadBoard` copes with a dangling id by dropping it *and reporting
     * it*, so a file with one would warn on every single load. A file this function
     * writes should be one `loadBoard` has nothing to complain about.
     */
    expect(compactBoard(board()).elementOrder).toEqual(["a", "c"]);
  });

  it("returns the board unchanged when nothing is deleted", () => {
    const live = board({
      elementOrder: ["a", "c"],
      elements: [rectangle("a", false), rectangle("c", false)],
    });

    expect(ids(compactBoard(live))).toEqual(["a", "c"]);
    expect(compactBoard(live).elementOrder).toEqual(["a", "c"]);
  });

  it("is idempotent", () => {
    // `git diff` depends on this as much as on the canonical key order: compacting a
    // board twice must equal compacting it once, or every export would differ from
    // the last.
    const once = compactBoard(board());
    expect(compactBoard(once)).toEqual(once);
  });

  it("is deterministic, so an unchanged board exports identical bytes", () => {
    const a = JSON.stringify(compactBoard(board()));
    const b = JSON.stringify(compactBoard(board()));

    expect(a).toBe(b);
  });

  it("leaves an element with no `isDeleted` alone", () => {
    // Not every writer sets the field. A shape restored from an old file may not have
    // it, and treating a missing flag as "deleted" would empty the board.
    const { isDeleted: _dropped, ...withoutFlag } = rectangle("a", false);
    const noFlag = board({
      elementOrder: ["a", "b", "c"],
      elements: [withoutFlag, rectangle("b", false), rectangle("c", false)],
    });

    expect(ids(compactBoard(noFlag))).toEqual(["a", "b", "c"]);
  });

  it("keeps archived records, which are a state and not a tombstone", () => {
    /*
     * The distinction that is easy to get wrong in the other direction.
     *
     * `archiveRecords` exists *because* deleting is wrong for a record: archiving takes
     * it out of a projection's view and lets it come back. Compacting it would lose a
     * card someone deliberately removed from a board *view* but not from the board —
     * and unlike an element tombstone, there is no flag that says "this was meant to be
     * temporary".
     */
    const withArchived = board({
      records: [
        { id: "r1", archived: false },
        { id: "r2", archived: true },
      ],
    });

    expect(compactBoard(withArchived).records).toHaveLength(2);
  });

  it("keeps collections", () => {
    const withCollections = board({
      collections: [{ id: "col1", name: "Backlog" }],
    });

    expect(compactBoard(withCollections).collections).toHaveLength(1);
  });

  it("produces a board that loads without complaint", () => {
    // The end-to-end check. A compacted file must be a valid input to `loadBoard`,
    // and must round-trip back to the same set of live elements.
    const compacted = compactBoard(board());
    const loaded = loadBoard(compacted);

    expect(loaded.elements.map((element) => element.id)).toEqual(["a", "c"]);
    // `hasRepairs` and not `hasAny`: a preserved unknown field is the
    // forward-compatibility promise working, not something to complain about.
    expect(loaded.log.hasRepairs).toBe(false);
  });

  it("survives a compact-serialise-load cycle without losing a live element", () => {
    const loaded = loadBoard(compactBoard(board()));

    expect(loaded.elements).toHaveLength(2);
    expect(loaded.elementOrder).toEqual(["a", "c"]);
  });

  it("empties a board whose every element is deleted", () => {
    // A board where everything has been undone. Exporting it should produce an empty
    // board rather than a file full of tombstones, and the importer already refuses an
    // empty file — so this is the case where export and import disagree on purpose.
    const allGone = board({
      elementOrder: ["a", "b", "c"],
      elements: [
        rectangle("a", true),
        rectangle("b", true),
        rectangle("c", true),
      ],
    });

    expect(compactBoard(allGone).elements).toEqual([]);
    expect(compactBoard(allGone).elementOrder).toEqual([]);
  });
});
