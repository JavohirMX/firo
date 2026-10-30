/**
 * The mind-map projection (ADR-0040 section 4).
 *
 * The properties that matter, in order: a reparent is a `setField` on the
 * relation column and nothing else; a broken file still lays out (dangling
 * parents become roots, cycles break at the earliest record in `order`, and
 * neither is rewritten); and the tidy-tree geometry is the one rule a tidy
 * tree has — a parent centred on its children.
 */
import { describe, expect, test } from "vitest";

import { asFractionalIndex } from "@firo/schema";

import {
  descendantIds,
  MINDMAP_NODE_HEIGHT,
  MINDMAP_NODE_WIDTH,
  mindmapProjection,
  relationColumnFor,
} from "../src/mindmap.js";
import { displayValue } from "../src/types.js";

import { record, tasks, textColumn } from "./fixtures.js";

const relationColumn = {
  id: "col-parent",
  key: "parent",
  name: "Parent",
  type: "relation" as const,
};

const collection = tasks({
  columns: [textColumn("title", "Title"), relationColumn],
});

const node = (
  id: string,
  title: string,
  parent: string | null,
  order: string,
) =>
  record({
    id,
    order: asFractionalIndex(order),
    values: {
      title: { type: "text" as const, value: title },
      parent: { type: "relation" as const, value: parent },
    },
  });

describe("the forest", () => {
  test("a collection with no relation column projects nothing", () => {
    expect(relationColumnFor(tasks())).toBeNull();
    expect(
      mindmapProjection.layout(tasks(), [node("a", "A", null, "a0")]),
    ).toEqual([]);
  });

  test("roots are records with no parent OR a parent that is gone", () => {
    const elements = mindmapProjection.layout(collection, [
      node("root", "Root", null, "a0"),
      node("orphan", "Orphan", "rec-deleted", "a1"),
      node("child", "Child", "root", "a2"),
    ]);
    const nodes = elements.filter((e) => e.type === "card");
    const roots = nodes.filter((e) => e.x === 0).map((e) => e.recordId);
    // The dangling record is a root, and is NOT silently dropped.
    expect(roots).toEqual(["root", "orphan"]);
    expect(nodes.map((e) => e.recordId).sort()).toEqual([
      "child",
      "orphan",
      "root",
    ]);
  });

  test("a cycle breaks at the record first in order, and nothing is dropped", () => {
    // a is b's parent, b is a's parent: hand-edit territory, must still render.
    const elements = mindmapProjection.layout(collection, [
      node("a", "A", "b", "a0"),
      node("b", "B", "a", "a1"),
    ]);
    const nodes = elements.filter((e) => e.type === "card");
    expect(nodes).toHaveLength(2);
    const root = nodes.find((e) => e.x === 0);
    expect(root?.recordId).toBe("a"); // first in order breaks
    expect(nodes.find((e) => e.recordId === "b")?.x).toBe(
      MINDMAP_NODE_WIDTH + 80,
    );
  });
});

describe("the tidy tree", () => {
  test("a child sits one level right; siblings stack with the sibling gap", () => {
    const elements = mindmapProjection.layout(collection, [
      node("root", "Root", null, "a0"),
      node("c1", "One", "root", "a1"),
      node("c2", "Two", "root", "a2"),
    ]);
    const byId = new Map(
      elements.filter((e) => e.type === "card").map((e) => [e.recordId, e]),
    );
    expect(byId.get("c1")?.x).toBe(MINDMAP_NODE_WIDTH + 80);
    expect(byId.get("c2")?.x).toBe(MINDMAP_NODE_WIDTH + 80);
    expect(byId.get("c2")?.y).toBe(
      (byId.get("c1")?.y ?? 0) + MINDMAP_NODE_HEIGHT + 16,
    );
  });

  test("a parent is centred on its children", () => {
    const elements = mindmapProjection.layout(collection, [
      node("root", "Root", null, "a0"),
      node("c1", "One", "root", "a1"),
      node("c2", "Two", "root", "a2"),
      node("c3", "Three", "root", "a3"),
    ]);
    const byId = new Map(
      elements.filter((e) => e.type === "card").map((e) => [e.recordId, e]),
    );
    const first = byId.get("c1")!.y;
    const last = byId.get("c3")!.y;
    expect(byId.get("root")?.y).toBe((first + last) / 2);
  });

  test("every child has exactly one edge, named for the child", () => {
    const elements = mindmapProjection.layout(collection, [
      node("root", "Root", null, "a0"),
      node("c1", "One", "root", "a1"),
      node("c2", "Two", "root", "a2"),
    ]);
    const edges = elements.filter((e) => e.type === "edge");
    expect(edges.map((e) => e.recordId).sort()).toEqual(["c1", "c2"]);
    const edge = edges.find((e) => e.recordId === "c1")!;
    expect(edge.fromId).toBe("node:root");
    expect(edge.toId).toBe("node:c1");
    expect(edge.x).toBe(MINDMAP_NODE_WIDTH);
    expect(edge.width).toBe(80);
  });

  test("sibling order follows the record order, not creation order", () => {
    // c2 was entered before c1 but sorts after it.
    const elements = mindmapProjection.layout(collection, [
      node("c2", "Two", "root", "a2"),
      node("root", "Root", null, "a0"),
      node("c1", "One", "root", "a1"),
    ]);
    const byId = new Map(
      elements.filter((e) => e.type === "card").map((e) => [e.recordId, e]),
    );
    expect(byId.get("c1")!.y).toBeLessThan(byId.get("c2")!.y);
  });
});

describe("reparent", () => {
  const three = [
    node("root", "Root", null, "a0"),
    node("child", "Child", "root", "a1"),
    node("grand", "Grand", "child", "a2"),
  ];

  test("a valid reparent is a setField on the relation column", () => {
    expect(
      mindmapProjection.interpret(collection, three, {
        kind: "reparent",
        recordId: "grand",
        newParentId: "root",
      }),
    ).toEqual({
      kind: "setField",
      recordId: "grand",
      columnKey: "parent",
      value: { type: "relation", value: "root" },
    });
  });

  test("a null parent roots the record", () => {
    const mutation = mindmapProjection.interpret(collection, three, {
      kind: "reparent",
      recordId: "grand",
      newParentId: null,
    });
    expect(mutation).toMatchObject({
      value: { type: "relation", value: null },
    });
  });

  test.each([
    ["itself", "grand", "grand"],
    ["its own child", "root", "child"],
    ["its own grandchild", "root", "grand"],
    ["a record that is gone", "grand", "rec-deleted"],
  ])("rejects parenting to %s", (_label, recordId, newParentId) => {
    expect(
      mindmapProjection.interpret(collection, three, {
        kind: "reparent",
        recordId,
        newParentId,
      }),
    ).toBeNull();
  });

  test("rejects a parent in another collection", () => {
    const elsewhere = {
      ...node("else", "Else", null, "a3"),
      collectionId: "col-other",
    };
    expect(
      mindmapProjection.interpret(collection, [...three, elsewhere], {
        kind: "reparent",
        recordId: "grand",
        newParentId: "else",
      }),
    ).toBeNull();
  });
});

describe("edit", () => {
  test("edits the title text, and only a text column", () => {
    const rows = [node("a", "A", null, "a0")];
    expect(
      mindmapProjection.interpret(collection, rows, {
        kind: "edit",
        recordId: "a",
        columnKey: "title",
        value: "Renamed",
      }),
    ).toEqual({
      kind: "setField",
      recordId: "a",
      columnKey: "title",
      value: { type: "text", value: "Renamed" },
    });
    // A relation is not edited as text.
    expect(
      mindmapProjection.interpret(collection, rows, {
        kind: "edit",
        recordId: "a",
        columnKey: "parent",
        value: "rec-9",
      }),
    ).toBeNull();
  });

  test("offers edit and nothing else", () => {
    expect(mindmapProjection.supports).toEqual(["edit"]);
  });
});

describe("displayValue for a relation", () => {
  const rows = [
    node("root", "Root cause", null, "a0"),
    node("child", "Factor", "root", "a1"),
    node("orphan", "Detached", "rec-deleted", "a2"),
  ];
  const context = { collection, records: rows };

  test("renders the target's title", () => {
    expect(displayValue(rows[1], relationColumn, context)).toBe("Root cause");
  });

  test("a null parent is an empty cell, a dangling one is named", () => {
    expect(displayValue(rows[0], relationColumn, context)).toBe("");
    expect(displayValue(rows[2], relationColumn, context)).toBe(
      "Missing record",
    );
  });

  test("without context a relation shows nothing rather than guessing", () => {
    expect(displayValue(rows[1], relationColumn)).toBe("");
  });
});

describe("descendantIds", () => {
  test("includes the record and everything below it, nothing else", () => {
    const rows = [
      node("root", "Root", null, "a0"),
      node("child", "Child", "root", "a1"),
      node("grand", "Grand", "child", "a2"),
      node("other", "Other", null, "a3"),
    ];
    expect([...descendantIds(rows, "parent", "root")].sort()).toEqual([
      "child",
      "grand",
      "root",
    ]);
    expect([...descendantIds(rows, "parent", "child")].sort()).toEqual([
      "child",
      "grand",
    ]);
    expect([...descendantIds(rows, "parent", "grand")]).toEqual(["grand"]);
  });

  test("terminates when the file already contains a cycle", () => {
    const rows = [
      node("a", "A", "b", "a0"),
      node("b", "B", "a", "a1"),
      node("c", "C", null, "a2"),
    ];
    expect([...descendantIds(rows, "parent", "a")].sort()).toEqual(["a", "b"]);
  });
});
