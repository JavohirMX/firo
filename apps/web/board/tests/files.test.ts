import { createFiroDoc } from "@firo/doc";

import { createStickyNote } from "@firo/board/defaults";

import { exportBoard, exportFilename, importBoard, parseBoard } from "../files";
import { restoreBoard, saveBoard } from "../storage";

/*
 * `.firo` files, in and out.
 *
 * ## The criterion
 *
 * Phase 7's AC-6: export a `.firo` archive, read it as text, `git diff` it, delete the
 * app's storage, re-import, and every element, record, tag and vote is present. So
 * the test that matters is the whole round trip through a *different* document, not
 * a comparison of two objects from the same one.
 *
 * ## Why import refuses a non-empty board
 *
 * The document is a CRDT: a delete writes a tombstone, and an id cannot be reused
 * while the tombstone is there. Importing a file into a browser that already has an
 * autosaved board — which is every browser, since the autosave exists — therefore means
 * resolving a tombstoned node against a new element with the same id, and there is no
 * "replace this element" mutation to reach for.
 *
 * Rewriting the incoming ids works and was written, and is not what shipped. It
 * renames elements, so a note's label and its connector bindings have to be rewritten
 * in the same pass or the board draws with detached arrows, and it produces ids the
 * document did not mint. Refusing is the half that cannot lose anything.
 */
const board = () => createFiroDoc();

const note = (id: string, over: Record<string, unknown> = {}) =>
  createStickyNote({ id, x: 10, y: 20, ...over });

const seed = (doc: ReturnType<typeof board>, elements = 3) => {
  for (let i = 0; i < elements; i++) {
    doc.commit([
      { kind: "createElement", element: note(`n${i}`, { text: `note ${i}` }) },
    ]);
  }
};

const bytesOf = (doc: ReturnType<typeof board>) => {
  const result = exportBoard(doc);
  if (!result.ok) {
    throw new Error(`export failed: ${result.detail}`);
  }
  return result;
};

describe("export", () => {
  it("produces the same bytes for the same board", () => {
    // The property `git diff` depends on. Without it, an untouched board shows a
    // whole-file rewrite between exports.
    const doc = board();
    seed(doc);

    expect(bytesOf(doc).bytes).toBe(bytesOf(doc).bytes);
  });

  it("writes bytes that parse back into the same board", () => {
    const doc = board();
    seed(doc, 4);

    const next = board();
    expect(importBoard(next, bytesOf(doc).bytes)).toMatchObject({ ok: true });

    const before = doc.read();
    const after = next.read();
    expect(after.elements).toHaveLength(before.elements.length);
    expect(after.elementOrder).toEqual(before.elementOrder);
  });

  it("keeps a note's text exactly", () => {
    // The field most easily mangled in transit, and the one with the documented
    // corruption: storing the wrapped form instead of what was typed.
    const doc = board();
    doc.commit([
      {
        kind: "createElement",
        element: note("n1", { text: "the quick brown fox jumps" }) as never,
      },
    ]);

    const next = board();
    importBoard(next, bytesOf(doc).bytes);

    expect(next.read().elements[0].text).toBe("the quick brown fox jumps");
  });

  it("keeps a stroke's points and pressures", () => {
    const doc = board();
    doc.commit([
      {
        kind: "createElement",
        element: {
          id: "fd1",
          type: "freedraw",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          points: [
            [0, 0],
            [10, 20],
            [30, 5],
          ],
          pressures: [0.2, 0.7, 0.4],
          simulatePressure: true,
          strokeOptions: { variability: "variable", streamline: 0.4 },
        } as never,
      },
    ]);

    const next = board();
    importBoard(next, bytesOf(doc).bytes);
    const stroke = next.read().elements[0] as unknown as {
      points: unknown[];
      pressures: number[];
    };

    expect(stroke.points).toHaveLength(3);
    expect(stroke.pressures).toEqual([0.2, 0.7, 0.4]);
  });

  it("names the file with a sortable local timestamp", () => {
    const name = exportFilename(new Date(2026, 0, 2, 9, 5));
    expect(name).toBe("board-20260102-0905.firo");
  });

  it("has no filename that breaks on another platform", () => {
    // A download name is shown in a bar and typed into shells. A colon is a path
    // separator on Windows and a stream separator in a shell.
    const name = exportFilename(new Date(2026, 0, 2, 9, 5));
    expect(name).not.toMatch(/[:*?"<>|]/);
  });

  it("reports a failure rather than throwing", () => {
    // An export that throws inside a click handler takes the app down with it.
    const broken = {
      read: () => {
        throw new Error("nope");
      },
    } as never;

    const result = exportBoard(broken);
    expect(result.ok).toBe(false);
  });
});

describe("the AC-6 round trip", () => {
  it("exports, discards the board entirely, and imports it back", () => {
    /*
     * The criterion, end to end, through a document that knows nothing about the one
     * that produced the file. Comparing two snapshots of the same document would pass
     * even if the file were empty.
     */
    const original = board();
    seed(original, 5);
    original.commit([
      {
        kind: "createElement",
        element: note("extra", { text: "with text" }) as never,
      },
    ]);

    const file = bytesOf(original);

    // "Delete the app's storage": a fresh document, nothing carried over.
    const reloaded = board();
    expect(reloaded.read().elements).toHaveLength(0);

    expect(importBoard(reloaded, file.bytes)).toMatchObject({
      ok: true,
      elements: 6,
    });

    const after = reloaded.read();
    expect(after.elements).toHaveLength(6);
    expect(after.elementOrder).toEqual(original.read().elementOrder);
    expect(after.elements.map((element) => element.id).sort()).toEqual(
      original
        .read()
        .elements.map((element) => element.id)
        .sort(),
    );
  });

  it("survives being exported again, unchanged", () => {
    // Byte-identical in both directions: export, import, export. A format that
    // reorders itself on the way through is not one anyone can keep in git.
    const original = board();
    seed(original, 3);

    const reloaded = board();
    importBoard(reloaded, bytesOf(original).bytes);

    expect(bytesOf(reloaded).bytes).toBe(bytesOf(original).bytes);
  });
});

describe("tombstones: kept in the autosave, dropped from the file", () => {
  /*
   * The split, asserted from both sides at once, because getting it backwards in either
   * direction is silent and bad:
   *
   * - Compact the autosave and an undone element cannot be brought back, and a stale
   *   write can resurrect a deleted one. The document is a CRDT; the tombstone is load-
   *   bearing.
   * - Keep tombstones in the file and it grows without bound. Measured before this
   *   existed: five notes with two deleted exported all five, and every edit-and-undo
   *   added another.
   *
   * The two paths differ by one call — `compactBoard` — and by nothing else, so a test
   * that only checked one of them would pass with the other broken.
   */
  const seeded = () => {
    const doc = board();
    seed(doc, 4);
    doc.commit([{ kind: "deleteElements", ids: ["n1", "n2"] }]);
    return doc;
  };

  it("drops deleted elements from an exported file", () => {
    const doc = seeded();
    expect(doc.read().elements).toHaveLength(4); // including the two tombstones

    const bytes = bytesOf(doc).bytes;
    const parsed = JSON.parse(bytes);

    expect(parsed.elements).toHaveLength(2);
    expect(
      parsed.elements.every(
        (element: { isDeleted?: boolean }) => !element.isDeleted,
      ),
    ).toBe(true);
  });

  it("keeps them in the autosave, where they are load-bearing", async () => {
    // The other direction, through the real persistence path rather than by
    // inspecting a serialised string. An undone element has to still be restorable
    // after a reload, and that works only if the tombstone survived.
    const doc = seeded();
    await saveBoard(doc);

    const restored = board();
    await restoreBoard(restored);
    const elements = restored.read().elements;

    expect(elements).toHaveLength(4);
    expect(elements.filter((element) => element.isDeleted)).toHaveLength(2);
  });

  it("round-trips the live half of a board that has tombstones", () => {
    // The point of compacting: what the file *does* carry must still be everything
    // that is actually on the canvas. Compaction drops dead elements, not live ones.
    const doc = seeded();
    const file = bytesOf(doc).bytes;

    const reloaded = board();
    importBoard(reloaded, file);

    const live = reloaded
      .read()
      .elements.filter((element) => !element.isDeleted);
    expect(live.map((element) => element.id)).toEqual(["n0", "n3"]);
  });
});

describe("a file that cannot be read", () => {
  it("says the file is not JSON, rather than failing obscurely", () => {
    expect(parseBoard("{ not json")).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
  });

  it("refuses a file from a newer Firo, and names the version", () => {
    // The plan's criterion: "Loading a file from a newer version fails loudly and
    // writes nothing". Loudly matters as much as safely — a silent success would
    // import a board with fields this version drops, and the loss would not be visible
    // until later.
    const result = parseBoard(
      JSON.stringify({
        elementSchemaVersion: 9999,
        recordSchemaVersion: 9999,
        elements: [],
        collections: [],
        records: [],
      }),
    );

    expect(result).toMatchObject({ ok: false, reason: "newer-version" });
    expect(result.ok === false ? result.detail : "").toMatch(/9999/);
  });

  it("refuses an empty file, because importing it would clear the board", () => {
    expect(
      parseBoard(
        JSON.stringify({
          elementSchemaVersion: 1,
          recordSchemaVersion: 1,
          elementOrder: [],
          elements: [],
          collections: [],
          records: [],
          meta: {},
        }),
      ),
    ).toMatchObject({ ok: false, reason: "empty" });
  });

  it("changes nothing when the file cannot be read", () => {
    const doc = board();
    seed(doc, 3);
    const before = doc.read();
    const revision = doc.revision;

    expect(importBoard(doc, "{ not json").ok).toBe(false);
    expect(importBoard(doc, "{}").ok).toBe(false);

    // The revision is the part that matters: a rejected import that still committed
    // something would leave the board looking right and its undo history wrong.
    expect(doc.read().elements).toHaveLength(before.elements.length);
    expect(doc.read().elementOrder).toEqual(before.elementOrder);
    expect(doc.revision).toBe(revision);
  });

  it("changes nothing when the file is from a newer version", () => {
    const doc = board();
    seed(doc, 3);
    const revision = doc.revision;

    const result = importBoard(
      doc,
      JSON.stringify({
        elementSchemaVersion: 9999,
        recordSchemaVersion: 9999,
        elements: [{ id: "x", type: "rectangle" }],
        collections: [],
        records: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(doc.read().elements).toHaveLength(3);
    expect(doc.revision).toBe(revision);
  });
});

describe("importing into a board that already has content", () => {
  it("refuses, and says what to do instead", () => {
    const doc = board();
    seed(doc, 2);

    // Seeded, not an empty board: an empty file is refused earlier, as `empty`, and
    // would never reach the check this test is about.
    const source = board();
    seed(source, 3);

    const result = importBoard(doc, bytesOf(source).bytes);

    expect(result).toMatchObject({ ok: false, reason: "not-empty" });
    expect(result.ok === false ? result.detail : "").toMatch(/Export/);
  });

  it("leaves the existing board untouched", () => {
    const doc = board();
    seed(doc, 2);
    const before = doc.read();

    importBoard(doc, bytesOf(board()).bytes);

    expect(doc.read().elements).toHaveLength(before.elements.length);
    expect(doc.read().elementOrder).toEqual(before.elementOrder);
  });

  it("is the reason the id conflict never arises", () => {
    // Documents the reason the refusal exists, rather than the behaviour it avoids.
    // Importing a file into a board with the same ids is the *normal* case once the
    // autosave is on, and it would mean a tombstoned node against a new element with
    // the same id.
    const source = board();
    seed(source, 2);
    const target = board();
    seed(target, 2); // same ids, because `seed` is deterministic

    expect(() => importBoard(target, bytesOf(source).bytes)).not.toThrow();
    expect(target.read().elements).toHaveLength(2);
  });
});
