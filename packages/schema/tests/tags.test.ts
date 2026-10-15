/**
 * Element schema v3: element tags.
 *
 * Verifies that tags are optional, normalized, preserved across element types,
 * and that absent tags remain absent without serializing empty arrays.
 */
import { describe, expect, test } from "vitest";

import {
  allKnownFields,
  ELEMENT_TYPES,
  knownFieldsFor,
  loadBoard,
  RepairLog,
  serializeBoard,
  elementTags,
} from "@firo/schema";

import boardV3 from "./fixtures/v3/board.json";

describe("element schema v3: tags", () => {
  test("every registered element type recognizes 'tags' as a base field", () => {
    for (const type of ELEMENT_TYPES) {
      expect(allKnownFields(type)).toContain("tags");
      // And not duplicated in type-specific known fields
      expect(knownFieldsFor(type)).not.toContain("tags");
    }
  });

  test("elementTags helper normalizes strings and drops empty items", () => {
    const log = new RepairLog();
    const result = elementTags(
      { tags: ["  hello  ", "", "world  ", 123] },
      log,
    );
    expect(result.tags).toEqual(["hello", "world"]);
  });

  test("elementTags returns empty object for absent or empty tags", () => {
    const log = new RepairLog();
    expect(elementTags({}, log)).toEqual({});
    expect(elementTags({ tags: [] }, log)).toEqual({});
    expect(elementTags({ tags: ["   "] }, log)).toEqual({});
  });

  test("the committed v3 fixture loads with element tags", () => {
    const loaded = loadBoard(boardV3);
    expect(loaded.elements).toHaveLength(3);

    const [noteTagged, notePlain, shapeTagged] = loaded.elements;
    expect(noteTagged.tags).toEqual(["planning", "urgent"]);
    expect(notePlain.tags).toBeUndefined();
    expect(shapeTagged.tags).toEqual(["decision"]);
  });

  test("round-trips v3 board preserving tags without adding empty tags to untagged elements", () => {
    const loaded = loadBoard(boardV3);
    const serialized = serializeBoard(loaded);
    const elements = serialized.elements as Array<Record<string, unknown>>;
    expect(elements[0].tags).toEqual(["planning", "urgent"]);
    expect(elements[1]).not.toHaveProperty("tags");
    expect(elements[2].tags).toEqual(["decision"]);
  });
});
