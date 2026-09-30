/**
 * Migration rule 1: never drop an unrecognised field.
 *
 * This is the invariant that makes upgrading *and* downgrading lossless, and it
 * is the one that fails silently. Nothing here throws: the failure mode is a
 * field that quietly stops existing, which only surfaces as data loss in a
 * board the user has been editing for a year.
 */
import { describe, expect, test } from "vitest";

import {
  loadBoard,
  migrateElement,
  preservedFields,
  RepairLog,
  serializeBoard,
} from "@firo/schema";

import boardV1 from "./fixtures/v1/board.json";

const note = (over: Record<string, unknown> = {}) => ({
  id: "el-1",
  type: "stickynote",
  text: "hello",
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  ...over,
});

describe("unknown fields survive a load", () => {
  test("an unrecognised top-level field is preserved verbatim", () => {
    const log = new RepairLog();
    const { element } = migrateElement(
      note({ someFutureField: { nested: [1, 2, 3] } }),
      log,
    );
    expect(preservedFields(element).someFutureField).toEqual({
      nested: [1, 2, 3],
    });
  });

  test("a `null` unknown field stays `null` rather than becoming absent", () => {
    // "Absent" and "present and null" are different, and a migration that
    // collapses them changes a future version's ability to tell the two apart.
    const { element } = migrateElement(
      note({ someFutureField: null }),
      new RepairLog(),
    );
    expect(preservedFields(element)).toHaveProperty("someFutureField", null);
  });

  test("an unknown field of a falsy value is not dropped", () => {
    for (const value of [0, "", false] as const) {
      const { element } = migrateElement(
        note({ someFutureField: value }),
        new RepairLog(),
      );
      expect(preservedFields(element)).toHaveProperty("someFutureField", value);
    }
  });

  test("the repair log reports each preserved field", () => {
    const log = new RepairLog();
    migrateElement(note({ a: 1, b: 2 }), log);
    expect(
      log.all.filter((r) => r.kind === "keptUnknown").map((r) => r.field),
    ).toEqual(["a", "b"]);
  });

  test("a known field is not double-carried as unknown", () => {
    // If a name appears in both `known` and the input, the validation path
    // owns it. Preserving it as unknown too would mean a stale copy wins.
    const log = new RepairLog();
    migrateElement(note({ textAlign: "center" }), log);
    expect(log.all.filter((r) => r.kind === "keptUnknown")).toHaveLength(0);
  });

  test("an unknown field survives the full board round trip", () => {
    const withUnknown = {
      ...boardV1,
      elements: [{ ...boardV1.elements[0], futureFlag: "keep me" }],
    };
    const loaded = loadBoard(withUnknown);
    const output = serializeBoard(loaded) as unknown as typeof withUnknown;
    expect(output.elements[0]).toHaveProperty("futureFlag", "keep me");
  });
});

describe("rule 1 has a shape that is easy to get wrong, and these are those cases", () => {
  test("a type change is not a data loss: an unknown type throws rather than dropping", () => {
    // The counter-case. A type this build does not know is not "a field to
    // preserve" -- it is an element whose entire meaning is unreadable. The two
    // rules pull in opposite directions, so unknown *types* throw and unknown
    // *fields* are carried.
    expect(() =>
      migrateElement({ id: "x", type: "mindmap" }, new RepairLog()),
    ).toThrow(/Unknown element type/);
  });

  test("a removed field is preserved too, because that is the conservative choice", () => {
    // Removing a field in a future version does not make it unknown here: this
    // build still lists it as known and will overwrite it. That is the gap the
    // next paragraph covers.
    const { element } = migrateElement(
      note({ isContainer: true }),
      new RepairLog(),
    );
    // `isContainer` is known here, so it is normalised, not carried.
    expect(element.isContainer).toBe(false);
  });

  test("a known field the file omits gets a documented default, not `undefined`", () => {
    const { element } = migrateElement(
      { id: "x", type: "stickynote", text: "t" },
      new RepairLog(),
    );
    expect(element.backgroundColor).toBe("#fff9b1");
    expect(element.roughness).toBe(1);
    expect(element.fontSize).toBe(20);
    expect(element.width).toBe(150);
  });
});

describe("repairs are reported, not silent", () => {
  test("a coerced field is recorded with both the old and new value", () => {
    const log = new RepairLog();
    migrateElement(note({ roughness: "1.5" }), log);
    const coerced = log.all.find(
      (r) => r.kind === "coerced" && r.field === "roughness",
    );
    expect(coerced).toMatchObject({ from: "1.5", to: 1 });
  });

  test("a clamped field is recorded with the clamp that was applied", () => {
    const log = new RepairLog();
    migrateElement(note({ opacity: 5000 }), log);
    const clamped = log.all.find(
      (r) => r.kind === "clamped" && r.field === "opacity",
    );
    expect(clamped).toMatchObject({ from: 5000, to: 100 });
  });

  test("a NaN coordinate is repaired rather than becoming a rendering hole", () => {
    // NaN survives a JSON round trip as `null`, so this is the only place it
    // can be caught before it reaches the canvas.
    const log = new RepairLog();
    const { element } = migrateElement(note({ x: Number.NaN }), log);
    expect(element.x).toBe(0);
    expect(log.hasAny).toBe(true);
  });

  test("an Infinity dimension is repaired", () => {
    const { element } = migrateElement(
      note({ width: Infinity }),
      new RepairLog(),
    );
    expect(Number.isFinite(element.width)).toBe(true);
  });

  test("an out-of-range sticky note height is clamped to a real size", () => {
    const log = new RepairLog();
    const { element } = migrateElement(note({ height: 9999 }), log);
    expect(element.height).toBe(250);
    expect(log.all.some((r) => r.kind === "clamped")).toBe(true);
  });

  test("summary groups by kind, so one bad field does not produce five lines", () => {
    const log = new RepairLog();
    migrateElement({ id: "x", type: "stickynote" }, log);
    expect(log.summary()).toMatch(/coerced/);
    expect(log.summary()).not.toContain("no repairs");
  });
});

describe("one bad element does not lose the board", () => {
  test("a non-object element is dropped and reported; its siblings survive", () => {
    // The log comes from `loadBoard` -- it is the only one it records into.
    const { elements, log } = loadBoard({
      ...boardV1,
      elements: [boardV1.elements[0], null, boardV1.elements[1], 42],
    });
    expect(elements).toHaveLength(2);
    expect(elements.map((e) => e.id)).toEqual(["el-note-1", "el-note-2"]);
    expect(
      log.all.filter((r) => r.kind === "dropped").length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("an element with no type is dropped, not defaulted into a note", () => {
    // Defaulting would invent an element the file never described.
    const { elements, log } = loadBoard({
      ...boardV1,
      elements: [{ id: "el-x", text: "no type" }],
    });
    expect(elements).toHaveLength(0);
    expect(log.hasAny).toBe(true);
  });
});
