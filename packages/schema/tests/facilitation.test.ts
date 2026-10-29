/**
 * Element schema v2: `hiddenUntilRevealed` and `hideInPresentation`.
 *
 * Two optional booleans is a small change, and the smallness is exactly why it is
 * easy to get wrong: every way of getting it wrong here loses a *facilitator's
 * decision* rather than raising an error. A note somebody marked "hide until the
 * reveal" for tomorrow's workshop simply stops being hidden, and nothing in the
 * file says so.
 *
 * So this file is mostly about the two properties that make the change safe:
 *
 * - **Every element type carries both fields.** Ten types, seven modules, and the
 *   nineteenth edit is the one that gets missed. It fails silently and in a
 *   direction the tests below name: a name in `BASE_FIELDS` with no validator
 *   behind it is *recognised and dropped*.
 * - **Absent stays absent.** `false` and absence are one answer, so a validator
 *   that materialised `false` would put two new keys on every element of every
 *   board that predates the fields -- a whole-file diff caused by a version bump.
 *
 * The v1 -> v2 migration itself is covered in `migrations.test.ts`, along with the
 * chain invariant that makes the step non-optional.
 */
import { describe, expect, test } from "vitest";

import {
  allKnownFields,
  canonicalJson,
  CURRENT_ELEMENT_VERSION, CURRENT_RECORD_VERSION,
  ELEMENT_TYPES,
  knownFieldsFor,
  loadBoard,
  migrateElement,
  preservedFields,
  RepairLog,
  serializeBoard,
} from "@firo/schema";

import type { ElementType } from "@firo/schema";

import boardV1 from "./fixtures/v1/board.json";
import boardV2 from "./fixtures/v2/board.json";

const FACILITATION_FLAGS = [
  "hiddenUntilRevealed",
  "hideInPresentation",
] as const;

/**
 * The smallest raw record each type will accept.
 *
 * Every type's validator repairs a missing field, so a bare object loads -- but the
 * repair log would then be full of entries and every assertion below would be
 * reading a defaulted element rather than the file's. Only the genuinely
 * type-specific fields are supplied.
 */
const rawFor = (type: ElementType): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    id: `el-${type}`,
    type,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  };

  if (type === "arrow" || type === "line" || type === "freedraw") {
    return {
      ...base,
      points: [
        [0, 0],
        [10, 10],
      ],
    };
  }
  if (type === "text" || type === "stickynote") {
    return { ...base, text: "a label" };
  }
  if (type === "image") {
    return { ...base, fileId: "abc123", scale: [1, 1] };
  }
  return base;
};

/** A board holding one element, stamped at the current version. */
const boardWith = (elements: readonly Record<string, unknown>[]) => ({
  elementSchemaVersion: CURRENT_ELEMENT_VERSION,
  recordSchemaVersion: 1,
  elementOrder: elements.map((element) => element.id as string),
  elements,
  collections: [],
  records: [],
  meta: {},
});

describe("both flags are known to every element type", () => {
  test.each(ELEMENT_TYPES)("%s reads and rewrites both flags", (type) => {
    const element = migrateElement(
      { ...rawFor(type), hiddenUntilRevealed: true, hideInPresentation: true },
      new RepairLog(),
    ).element;

    expect(element).toMatchObject({
      hiddenUntilRevealed: true,
      hideInPresentation: true,
    });

    // The other half of the trap in `registry.ts`. A name that is recognised but
    // never re-derived is *dropped*; a name that is missing is carried and never
    // read. Both leave the flag unreachable by name, and `preservedFields` is what
    // tells them apart.
    const preserved = preservedFields(element);
    for (const flag of FACILITATION_FLAGS) {
      expect(preserved).not.toHaveProperty(flag);
    }
  });

  test.each(ELEMENT_TYPES)(
    "%s lists both flags as base fields, once",
    (type) => {
      const known = allKnownFields(type);

      for (const flag of FACILITATION_FLAGS) {
        expect(known.filter((field) => field === flag)).toHaveLength(1);
      }

      // Base fields, not type-specific ones. A name in both lists is not a bug the
      // way a name in neither is, but it is a second place to update next time the
      // field changes, which is the shape this registry warns about.
      for (const flag of FACILITATION_FLAGS) {
        expect(knownFieldsFor(type)).not.toContain(flag);
      }
    },
  );

  test("setting a flag is not a repair", () => {
    // It must not report one. A repair log that fires on every hidden note would
    // train everyone to ignore it, which is how the next real corruption passes
    // unremarked.
    //
    // Built from the committed v1 note rather than a hand-written one, so the only
    // thing that differs from a board the harness already says loads clean is the
    // two flags. Otherwise this would pass or fail for a missing `fontSize`.
    const board = loadBoard(
      boardWith([
        {
          ...boardV1.elements[0],
          hiddenUntilRevealed: true,
          hideInPresentation: true,
        },
      ]),
    );
    expect(board.log.hasRepairs, board.log.summary()).toBe(false);
  });
});

describe("absent is the default, and stays that way", () => {
  test("an element with neither flag has neither key afterwards", () => {
    const element = migrateElement(
      rawFor("stickynote"),
      new RepairLog(),
    ).element;
    for (const flag of FACILITATION_FLAGS) {
      expect(element).not.toHaveProperty(flag);
    }
  });

  test("absent and `false` are one answer to the reader, and only one of them is stored", () => {
    // The property that makes private mode work on a v1 board with no migration:
    // a board written before these fields existed reads as fully visible and fully
    // presented.
    const absent = migrateElement(
      rawFor("stickynote"),
      new RepairLog(),
    ).element;
    const explicit = migrateElement(
      { ...rawFor("stickynote"), hiddenUntilRevealed: false },
      new RepairLog(),
    ).element;

    expect(absent.hiddenUntilRevealed ?? false).toBe(
      explicit.hiddenUntilRevealed,
    );
    // ...but an explicit `false` is preserved rather than erased, because a writer
    // that emitted it meant it, and "explicitly not hidden" is a state a future
    // field might need to distinguish from "never looked at".
    expect(explicit.hiddenUntilRevealed).toBe(false);
  });

  test("a v1 board re-saved does not gain the keys", () => {
    // The concrete cost of materialising them: a whole-file diff on a board nobody
    // touched, caused by a version bump rather than by an edit.
    const board = loadBoard({
      ...boardWith([boardV1.elements[0]]),
      elementSchemaVersion: 1,
    });
    const written = serializeBoard(board).elements[0] as Record<
      string,
      unknown
    >;
    for (const flag of FACILITATION_FLAGS) {
      expect(written).not.toHaveProperty(flag);
    }
  });
});

describe("a flag that is present but wrong is repaired and reported", () => {
  test.each(FACILITATION_FLAGS)("%s is coerced to false and logged", (flag) => {
    const log = new RepairLog();
    const element = migrateElement(
      { ...rawFor("stickynote"), [flag]: "yes" },
      log,
    ).element as unknown as Record<string, unknown>;

    expect(element[flag]).toBe(false);
    expect(log.all).toContainEqual({
      kind: "coerced",
      field: flag,
      from: "yes",
      to: false,
    });
  });

  test("a host application's `customData` is untouched alongside them", () => {
    // The escape hatch and the flags are neighbours, not rivals: a host app's own
    // keys ride in the same object and must survive a note being hidden.
    const board = loadBoard(
      boardWith([
        {
          ...rawFor("stickynote"),
          hiddenUntilRevealed: true,
          customData: { "acme.sprint": 7 },
        },
      ]),
    );
    const written = serializeBoard(board).elements[0] as Record<
      string,
      unknown
    >;
    expect(written).toMatchObject({
      hiddenUntilRevealed: true,
      customData: { "acme.sprint": 7 },
    });
  });
});

describe("the committed v2 fixture", () => {
  const loaded = loadBoard(boardV2);

  test("loads without repair", () => {
    expect(loaded.log.hasRepairs, loaded.log.summary()).toBe(false);
  });

  test("a note with both flags set has both", () => {
    const [hidden] = loaded.elements;
    expect(hidden).toMatchObject({
      id: "el-note-hidden",
      hiddenUntilRevealed: true,
      hideInPresentation: true,
    });
  });

  test("a note with neither has neither key", () => {
    const plain = loaded.elements.find((e) => e.id === "el-note-plain");
    for (const flag of FACILITATION_FLAGS) {
      expect(plain).not.toHaveProperty(flag);
    }
  });

  test("an explicit `false` survives as `false`", () => {
    expect(
      loaded.elements.find((e) => e.id === "el-note-future"),
    ).toHaveProperty("hiddenUntilRevealed", false);
  });

  test("a field from a newer Firo rides through the whole round trip", () => {
    // The v2 file carrying a v3 field, in the committed fixture rather than in a
    // test that builds one. It is the promise the harness exists to keep, and it
    // is worth having committed: a fixture is a thing a future contributor can
    // read rather than infer.
    const written = serializeBoard(loaded);
    expect(canonicalJson(written)).toBe(
      canonicalJson({
        ...boardV2,
        elementSchemaVersion: CURRENT_ELEMENT_VERSION,
        recordSchemaVersion: CURRENT_RECORD_VERSION,
      }),
    );
    expect(written.elements[2]).toHaveProperty("someFutureField", {
      keptBy: "migration rule 1",
    });
  });
});
