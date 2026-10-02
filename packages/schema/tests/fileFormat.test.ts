/*
 * From the index, not from `migrate.js` directly: the element types register
 * themselves as a side effect of `./types/index.js`, and importing the loader on its
 * own leaves the registry empty, so every fixture fails with `Unknown element type`.
 */
import { loadBoard, serializeBoard } from "../src/index.js";
import { canonicalJson, fixtures, serializeBoardFile } from "../src/index.js";

import type { SerializedBoard } from "../src/index.js";

/*
 * The `.firo` file format.
 *
 * ## What the exit criterion actually demands
 *
 * Phase 7 requires an export that round-trips **byte-identically**. That is a strong
 * claim and mostly a statement about *determinism*: exporting a board twice must
 * produce the same bytes, and exporting a board, importing it and exporting again
 * must produce them back unchanged. Otherwise `git diff` on a board nobody touched
 * shows a whole-file rewrite, which is the opposite of what a file format is for.
 *
 * ## Why `JSON.stringify` cannot do it
 *
 * It emits keys in insertion order, and insertion order is a property of the
 * *loader's object literals* rather than of the data. A validator that spreads
 * `{ ...base }` and overlays normalised fields emits keys in whatever order that
 * produces. So a stringify comparison fails on a board that round-tripped perfectly —
 * and passes on a board that lost a field, as long as both sides happened to order
 * the rest the same way. That is a comparison that cannot fail usefully.
 *
 * `canonicalJson` sorts keys, so it compares the data and nothing else. It is the
 * same function the fixture round-trip uses, deliberately: if the file writer and the
 * comparison disagreed, "the export round-trips" would mean nothing.
 */
const exportBytes = (board: SerializedBoard) => serializeBoardFile(board);

/** Load, re-serialise, and return the bytes — the whole round trip in one line. */
const reExportBytes = (bytes: string): string => {
  const loaded = loadBoard(JSON.parse(bytes));
  return exportBytes(serializeBoard(loaded));
};

describe("a board's file bytes", () => {
  it("round-trips byte-identically through a load", () => {
    // The criterion itself. There is one committed fixture today, covering both
    // chains; the next test asserts across all of them, so this one is the
    // single-fixture statement of the same property.
    const fixture = fixtures()[0];
    expect(fixture).toBeDefined();

    const loaded = loadBoard(fixture.board);
    const bytes = exportBytes(serializeBoard(loaded));

    expect(reExportBytes(bytes)).toBe(bytes);
  });

  it("round-trips every fixture byte-identically", () => {
    // Not just the current version. A migration that rewrites a v1 board into
    // something that will not re-export identically is a migration that cannot be
    // shipped and then re-saved without churn.
    for (const fixture of fixtures()) {
      const loaded = loadBoard(fixture.board);
      const bytes = exportBytes(serializeBoard(loaded));

      // Vitest's `expect` takes no message argument, so a failure names the line
      // rather than the fixture. The loop order is oldest-first, which is enough to
      // find it.
      expect(reExportBytes(bytes)).toBe(bytes);
    }
  });

  it("is stable across repeated exports of the same board", () => {
    const loaded = loadBoard(fixtures()[0].board);
    const once = exportBytes(serializeBoard(loaded));

    for (let i = 0; i < 5; i++) {
      expect(exportBytes(serializeBoard(loadBoard(JSON.parse(once))))).toBe(
        once,
      );
    }
  });

  it("does not depend on the key order it was handed", () => {
    // The property `JSON.stringify` lacks, and the reason this file exists. Two
    // objects with the same content in different key orders are the same board, and
    // must produce the same bytes.
    const a = { b: 2, a: 1, c: { y: 1, x: 2 } };
    const b = { c: { x: 2, y: 1 }, a: 1, b: 2 };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("produces bytes that are valid JSON", () => {
    const loaded = loadBoard(fixtures()[0].board);
    const bytes = exportBytes(serializeBoard(loaded));

    expect(() => JSON.parse(bytes)).not.toThrow();
    expect(JSON.parse(bytes)).toEqual(serializeBoard(loaded));
  });

  it("ends with a newline, so the file behaves like a text file", () => {
    const loaded = loadBoard(fixtures()[0].board);
    expect(exportBytes(serializeBoard(loaded)).endsWith("}\n")).toBe(true);
  });

  it("indents, so a board can be read as text", () => {
    // Phase 7's criterion is that a person can open the file and read it. Minified
    // JSON is technically text and uselessly so.
    const loaded = loadBoard(fixtures()[0].board);
    const bytes = exportBytes(serializeBoard(loaded));

    expect(bytes).toContain('\n  "elementSchemaVersion"');
  });
});

describe("pretty-printing", () => {
  /*
   * Written as a recursive walk rather than by indenting the compact form with a
   * regular expression. The regex version was tried first because it is shorter, and
   * it indents inside strings: a note containing `", {"` comes back with a newline
   * and two spaces in the middle of its text, and the file stops being the thing it
   * was exported from. A board is mostly strings someone typed, so that is the
   * ordinary case rather than a corner.
   */
  it("does not touch text that looks like structure", () => {
    const text = 'a note saying ", {" and "], ["';
    const board = {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      collections: [],
      records: [],
      meta: {},
      elements: [{ type: "stickynote", text }],
    };

    const bytes = serializeBoardFile(board as unknown as SerializedBoard);

    /*
     * The check is that parsing gives the text back, not that the raw text appears
     * verbatim in the file. JSON escapes the quotes, so the bytes legitimately hold
     * `\"` where the value has `"` -- and an earlier version of this assertion looked
     * for the unescaped text, which fails on correct output for the same reason the
     * regex indenter it is guarding against would have.
     *
     * What must not happen is a newline and two spaces landing *inside* the value,
     * which is exactly what the regex version did.
     */
    expect(JSON.parse(bytes).elements[0].text).toBe(text);
  });

  it("does not insert line breaks inside a value", () => {
    // The specific corruption the regex indenter caused: a note whose text contains
    // something that looks like JSON punctuation came back wrapped, and stopped being
    // the string that was exported.
    const text = "one, {\ntwo";
    const bytes = serializeBoardFile({
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      collections: [],
      records: [],
      meta: {},
      elements: [{ type: "stickynote", text }],
    } as unknown as SerializedBoard);

    // The value survives, and the file still parses as the board it was.
    expect(JSON.parse(bytes).elements[0].text).toBe(text);
  });

  it("keeps a newline someone typed inside a note", () => {
    const board = {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      collections: [],
      records: [],
      meta: {},
      elements: [{ type: "stickynote", text: "first\nsecond" }],
    };

    const bytes = serializeBoardFile(board as unknown as SerializedBoard);

    expect(JSON.parse(bytes).elements[0].text).toBe("first\nsecond");
  });

  it("writes an empty object and an empty array compactly", () => {
    // `{\n\n}` is valid and hideous.
    const board = {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      elements: [],
      collections: [],
      records: [],
      meta: {},
    };

    const bytes = serializeBoardFile(board);

    expect(bytes).toContain("[]");
    expect(bytes).toContain("{}");
    expect(bytes).not.toContain("{\n\n");
  });

  it("drops an undefined value rather than writing it out", () => {
    // A field that was never set is not the same as a field deliberately set to
    // null, and writing `undefined` would produce a file that does not parse.
    const bytes = serializeBoardFile({
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      collections: [],
      records: [],
      meta: {},
      elements: [{ type: "stickynote", missing: undefined }],
    } as unknown as SerializedBoard);

    expect(bytes).not.toContain("undefined");
    expect(JSON.parse(bytes).elements[0]).not.toHaveProperty("missing");
  });
});
