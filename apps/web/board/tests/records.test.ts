/**
 * AC-3, through a real document.
 *
 * [`docs/prd/04-acceptance-criteria.md`](../../../../docs/prd/04-acceptance-criteria.md)
 * AC-3: drag a card from "Doing" to "Done", switch to table, the Status cell reads
 * "Done", with no reload and no manual sync step — and the same after a page reload and
 * after an export/import cycle.
 *
 * ## What this file proves, and what it cannot
 *
 * It proves the *mechanism*: a drag gesture becomes a `RecordMutation`, the mutation
 * becomes a document commit, the record in the document changes, and the other
 * projection reads the new value from that same record — with no reload and nothing
 * synchronised, because there is only one copy of the data.
 *
 * It does not prove the criterion. AC-3 also says "drag", which needs pixels, and
 * "switch to table", which needs a control. Those are a renderer and a UI and neither
 * exists yet. What is here is the part that would silently be wrong if it were
 * assembled wrongly — and assembling it wrongly is easy, because a projection that
 * wrote to the record directly would make every assertion below pass while making
 * AC-3 true for the wrong reason.
 *
 * So the load-bearing assertion here is the negative one: that the drag changed the
 * *document*, and that nothing along the way wrote to the record the projection was
 * holding.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import {
  asFractionalIndex,
  emptyProseMirrorDoc,
  loadBoard,
  serializeBoard,
} from "@firo/schema";
import { boardProjection, projectionFor, tableProjection } from "@firo/records";

import type { Collection, FiroRecord } from "@firo/schema";
import type { RecordMutation } from "@firo/records";

import {
  applyRecordMutation,
  applyRecordMutations,
  recordsIn,
  toDocMutations,
} from "../records.js";

const collection: Collection = {
  id: "col-tasks",
  boardId: "b-1",
  name: "Tasks",
  order: asFractionalIndex("a0"),
  version: 1,
  columns: [
    { id: "c-1", key: "title", name: "Title", type: "text" },
    {
      id: "c-2",
      key: "status",
      name: "Status",
      type: "singleSelect",
      options: [
        { id: "opt-Todo", name: "Todo", color: "#000" },
        { id: "opt-Doing", name: "Doing", color: "#000" },
        { id: "opt-Done", name: "Done", color: "#000" },
      ],
    },
  ],
};

const row = (
  id: string,
  title: string,
  status: string,
  order: string,
): FiroRecord => ({
  id,
  collectionId: "col-tasks",
  values: {
    title: { type: "text", value: title },
    status: { type: "singleSelect", value: `opt-${status}` },
  },
  created: 0,
  updated: 0,
  order: asFractionalIndex(order),
  archived: false,
});

/**
 * A document with three tasks in it, committed through the real write path.
 *
 * Not `load()`, because a loaded board has not been through `commit()` and a test that
 * starts from a load is testing a document nobody ever had.
 */
const boardWith = (records: readonly FiroRecord[]): FiroDoc => {
  const doc = new FiroDoc(new Y.Doc());

  doc.commit([
    { kind: "createCollection", collection },
    ...records.map((record) => ({ kind: "createRecord" as const, record })),
  ]);

  return doc;
};

const tasks = () => [
  row("rec-1", "Interview five teams", "Todo", "a0"),
  row("rec-2", "Write the spec", "Doing", "a1"),
  row("rec-3", "Ship it", "Done", "a2"),
];

/** The Status cell the table projection renders for a record. */
const statusCellOf = (
  records: readonly FiroRecord[],
  recordId: string,
): string | undefined =>
  tableProjection
    .layout(collection, records)
    .find(
      (element) =>
        element.type === "cell" &&
        element.recordId === recordId &&
        element.columnKey === "status",
    )?.text;

/** Where the "Done" column is, read from the board's own layout. */
const dropPointOnDone = (records: readonly FiroRecord[]) => {
  const card = boardProjection
    .layout(collection, records)
    .find(
      (element) =>
        element.type === "card" &&
        element.groupId ===
          collection.columns[1].options!.find(
            (option) => option.name === "Done",
          )!.id,
    );

  expect(card, "the Done column laid out no card to aim at").toBeDefined();

  return { x: card!.x + card!.width / 2, y: card!.y + card!.height / 2 };
};

describe("AC-3: a drag changes the record, and the other view reads it", () => {
  it("drag Doing → Done, and the table's Status cell reads Done with no reload", () => {
    const doc = boardWith(tasks());

    // What the renderer would hand the projection, from a hit-test.
    const before = recordsIn(doc, "col-tasks");
    expect(statusCellOf(before, "rec-2")).toBe("opt-Doing");

    const mutation = boardProjection.interpret(collection, before, {
      kind: "move",
      recordId: "rec-2",
      ...dropPointOnDone(before),
    });

    expect(mutation).not.toBeNull();

    // The mutation is committed. Nothing re-reads anything: the table below is asked
    // again and gets a different answer because the record changed.
    const result = applyRecordMutation(doc, "col-tasks", mutation!);

    expect(result?.changed).toBe(true);
    expect(statusCellOf(recordsIn(doc, "col-tasks"), "rec-2")).toBe("opt-Done");
  });

  it("the drag did not write to the record the projection was holding", () => {
    // The assertion that makes the one above mean something. A projection that mutated
    // `before` in place would leave the document untouched, the table would still read
    // Doing, and a test that only checked the table would fail — but a test that only
    // checked "did the drag work" would have passed while the product silently lost the
    // change on reload.
    const doc = boardWith(tasks());
    const held = recordsIn(doc, "col-tasks");
    const snapshot = JSON.stringify(held);

    boardProjection.interpret(collection, held, {
      kind: "move",
      recordId: "rec-2",
      ...dropPointOnDone(held),
    });

    expect(JSON.stringify(held)).toBe(snapshot);
  });

  it("the change survives a reload, because it went through the document", () => {
    const doc = boardWith(tasks());
    applyRecordMutation(
      doc,
      "col-tasks",
      boardProjection.interpret(collection, recordsIn(doc, "col-tasks"), {
        kind: "move",
        recordId: "rec-2",
        ...dropPointOnDone(recordsIn(doc, "col-tasks")),
      })!,
    );

    // A different document object, built from the serialised board. This is the
    // reload: nothing is carried over in memory, so anything the drag changed has to
    // have been in the data.
    const reloaded = new FiroDoc(new Y.Doc());
    reloaded.load(loadBoard(serializeBoard(doc.read())));

    expect(statusCellOf(recordsIn(reloaded, "col-tasks"), "rec-2")).toBe(
      "opt-Done",
    );
  });

  it("the change survives an export/import cycle", () => {
    const doc = boardWith(tasks());
    applyRecordMutation(
      doc,
      "col-tasks",
      boardProjection.interpret(collection, recordsIn(doc, "col-tasks"), {
        kind: "move",
        recordId: "rec-2",
        ...dropPointOnDone(recordsIn(doc, "col-tasks")),
      })!,
    );

    const imported = new FiroDoc(new Y.Doc());
    imported.load(loadBoard(serializeBoard(doc.read())));

    expect(recordsIn(imported, "col-tasks")).toHaveLength(3);
    expect(statusCellOf(recordsIn(imported, "col-tasks"), "rec-2")).toBe(
      "opt-Done",
    );
  });

  it("switching projection is a different function of the same records", () => {
    // The other half of "no manual sync step": there is no switch to perform, so there
    // is nothing that could be out of date.
    const doc = boardWith(tasks());

    const before = projectionFor("board").layout(
      collection,
      recordsIn(doc, "col-tasks"),
    );
    const after = projectionFor("table").layout(
      collection,
      recordsIn(doc, "col-tasks"),
    );

    expect(before.filter((element) => element.type === "card")).toHaveLength(3);
    expect(after.filter((element) => element.type === "cell")).toHaveLength(6);
    expect(
      new Set(
        after
          .filter((element) => element.type === "cell")
          .map((element) => element.recordId),
      ),
    ).toEqual(new Set(["rec-1", "rec-2", "rec-3"]));
  });

  it("one undo step takes the card back", () => {
    // A commit is one undo step, which is why `applyRecordMutations` batches. An undo
    // that had to be pressed once per field would make the board feel like it is
    // fighting the person using it.
    const doc = boardWith(tasks());
    const before = recordsIn(doc, "col-tasks");

    // Created before the commit it undoes: a `Y.UndoManager` only tracks what happens
    // after it exists, so building one afterwards gives an empty undo stack and an
    // `undo()` that silently does nothing.
    const undo = doc.createUndoManager();

    applyRecordMutation(
      doc,
      "col-tasks",
      boardProjection.interpret(collection, before, {
        kind: "move",
        recordId: "rec-2",
        ...dropPointOnDone(before),
      })!,
    );

    expect(statusCellOf(recordsIn(doc, "col-tasks"), "rec-2")).toBe("opt-Done");

    undo.undo();

    expect(statusCellOf(recordsIn(doc, "col-tasks"), "rec-2")).toBe(
      "opt-Doing",
    );
  });
});

describe("every mutation a projection can produce is applicable", () => {
  it("setField, setOrder and setPosition all translate or refuse loudly", () => {
    const doc = boardWith(tasks());
    const records = recordsIn(doc, "col-tasks");

    const field = boardProjection.interpret(collection, records, {
      kind: "edit",
      recordId: "rec-1",
      columnKey: "title",
      value: "Interview six teams",
    })!;
    expect(applyRecordMutation(doc, "col-tasks", field)?.changed).toBe(true);
    expect(recordsIn(doc, "col-tasks")[0].values.title).toEqual({
      type: "text",
      value: "Interview six teams",
    });

    const order = tableProjection.interpret(collection, records, {
      kind: "reorder",
      recordId: "rec-3",
      beforeId: "rec-1",
    })!;
    expect(applyRecordMutation(doc, "col-tasks", order)?.changed).toBe(true);
    expect(recordsIn(doc, "col-tasks").map((r) => r.id)).toEqual([
      "rec-3",
      "rec-1",
      "rec-2",
    ]);

    // The one that throws. See `toDocMutations`.
    expect(() =>
      toDocMutations(records, {
        kind: "setPosition",
        recordId: "rec-1",
        x: 10,
        y: 20,
      } as RecordMutation),
    ).toThrow(/nothing in the data model has a field for one/);
  });

  it("a batch is one commit, so one gesture is one undo step", () => {
    const doc = boardWith(tasks());
    const undo = doc.createUndoManager();

    const result = applyRecordMutations(doc, "col-tasks", [
      {
        kind: "setField",
        recordId: "rec-1",
        columnKey: "title",
        value: { type: "text", value: "Renamed one" },
      },
      {
        kind: "setField",
        recordId: "rec-2",
        columnKey: "title",
        value: { type: "text", value: "Renamed two" },
      },
    ]);

    expect(result?.applied).toBe(2);

    undo.undo();

    expect(recordsIn(doc, "col-tasks").map((r) => r.values.title)).toEqual([
      { type: "text", value: "Interview five teams" },
      { type: "text", value: "Write the spec" },
      { type: "text", value: "Ship it" },
    ]);
  });

  it("setting two columns of one record keeps both", () => {
    // The read-modify-write in `toDocMutations` folding a whole `values` map. Within
    // one client this is correct; see the note about two collaborators in that file.
    const doc = boardWith(tasks());

    applyRecordMutations(doc, "col-tasks", [
      {
        kind: "setField",
        recordId: "rec-1",
        columnKey: "title",
        value: { type: "text", value: "New title" },
      },
      {
        kind: "setField",
        recordId: "rec-1",
        columnKey: "status",
        value: { type: "singleSelect", value: "opt-Doing" },
      },
    ]);

    expect(recordsIn(doc, "col-tasks")[0].values).toEqual({
      title: { type: "text", value: "New title" },
      status: { type: "singleSelect", value: "opt-Doing" },
    });
  });
});

describe("a mutation that cannot be applied is refused, not applied badly", () => {
  it("a record that has gone", () => {
    const doc = boardWith(tasks());

    expect(
      applyRecordMutation(doc, "col-tasks", {
        kind: "setField",
        recordId: "gone",
        columnKey: "title",
        value: { type: "text", value: "x" },
      }),
    ).toBeNull();

    expect(doc.read().records).toHaveLength(3);
  });

  it("a record in a different collection is not reachable through this one", () => {
    // `recordsIn` scopes by collection, so a mutation carrying an id from elsewhere
    // cannot be smuggled in by guessing it.
    const doc = boardWith(tasks());

    expect(
      applyRecordMutation(doc, "col-other", {
        kind: "setField",
        recordId: "rec-1",
        columnKey: "title",
        value: { type: "text", value: "x" },
      }),
    ).toBeNull();
  });

  it("an archived record is out of every projection", () => {
    // A withdrawn vote, or a deleted row. `archived` is the whole of "not in a
    // projection right now", and a projection that showed both would render one task
    // twice.
    const doc = boardWith(tasks());

    doc.commit([{ kind: "archiveRecords", ids: ["rec-3"] }]);

    expect(recordsIn(doc, "col-tasks").map((r) => r.id)).toEqual([
      "rec-1",
      "rec-2",
    ]);

    applyRecordMutation(doc, "col-tasks", {
      kind: "setField",
      recordId: "rec-3",
      columnKey: "title",
      value: { type: "text", value: "x" },
    });

    // Refused: the record is not in the collection as this projection sees it.
    expect(
      recordsIn(doc, "col-tasks").find((r) => r.id === "rec-3"),
    ).toBeUndefined();
  });

  it("an empty batch commits nothing at all", () => {
    const doc = boardWith(tasks());
    const before = doc.read().records;

    expect(applyRecordMutations(doc, "col-tasks", [])).toBeNull();
    expect(doc.read().records).toEqual(before);
  });

  it("one inapplicable mutation does not fail the others", () => {
    // A hundred rows re-laid out and one deleted in the same frame: applying 99 is a
    // better answer than applying none.
    const doc = boardWith(tasks());

    const result = applyRecordMutations(doc, "col-tasks", [
      {
        kind: "setField",
        recordId: "gone",
        columnKey: "title",
        value: { type: "text", value: "x" },
      },
      {
        kind: "setField",
        recordId: "rec-1",
        columnKey: "title",
        value: { type: "text", value: "Survivor" },
      },
    ]);

    expect(result?.applied).toBe(1);
    expect(recordsIn(doc, "col-tasks")[0].values.title).toEqual({
      type: "text",
      value: "Survivor",
    });
  });
});

describe("a rich-text column round-trips through the same path", () => {
  it("a ProseMirror value survives a drag-driven commit", () => {
    // ADR-0004's rule is that no text field is a string. The apply path reads and
    // rewrites a whole `values` map, so a rich-text column is the one most likely to be
    // mangled by a projection that assumed strings.
    const withNotes: Collection = {
      ...collection,
      columns: [
        ...collection.columns,
        { id: "c-3", key: "notes", name: "Notes", type: "richText" },
      ],
    };

    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      { kind: "createCollection", collection: withNotes },
      {
        kind: "createRecord",
        record: {
          ...row("rec-1", "Interview five teams", "Todo", "a0"),
          values: {
            ...row("rec-1", "Interview five teams", "Todo", "a0").values,
            notes: { type: "richText", value: emptyProseMirrorDoc() },
          },
        },
      },
    ]);

    const records = recordsIn(doc, "col-tasks");

    applyRecordMutation(doc, "col-tasks", {
      kind: "setField",
      recordId: "rec-1",
      columnKey: "title",
      value: { type: "text", value: "Interview six teams" },
    });

    const after = recordsIn(doc, "col-tasks")[0];

    expect(after.values.notes).toEqual({
      type: "richText",
      value: emptyProseMirrorDoc(),
    });
    expect(records.length).toBe(1);
  });
});

describe("mind-map reparent, through a real document", () => {
  /**
   * The mind map's drag writes a reparent intent that the projection turns
   * into a field mutation on the relation column. This pins the write path
   * that view relies on: one gesture is one commit is one undo step, and the
   * undo restores the previous parent exactly.
   */
  const ideasCollection: Collection = {
    id: "col-ideas",
    boardId: "b-1",
    name: "Ideas",
    order: asFractionalIndex("a0"),
    version: 1,
    columns: [
      { id: "c-title", key: "title", name: "Title", type: "text" },
      { id: "c-parent", key: "parent", name: "Parent", type: "relation" },
    ],
  };

  const idea = (
    id: string,
    title: string,
    parent: string | null,
    order: string,
  ): FiroRecord => ({
    id,
    collectionId: "col-ideas",
    values: {
      title: { type: "text", value: title },
      parent: { type: "relation", value: parent },
    },
    created: 0,
    updated: 0,
    order: asFractionalIndex(order),
    archived: false,
  });

  const ideasBoard = () => {
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      { kind: "createCollection", collection: ideasCollection },
      { kind: "createRecord", record: idea("root", "Root", null, "a0") },
      { kind: "createRecord", record: idea("c1", "Child", "root", "a1") },
      { kind: "createRecord", record: idea("g1", "Grandchild", "c1", "a2") },
    ]);
    return doc;
  };

  const parentOf = (doc: FiroDoc, recordId: string) =>
    recordsIn(doc, "col-ideas").find((r) => r.id === recordId)?.values.parent
      .value;

  it("a reparent is one undo step and restores the prior parent", () => {
    const doc = ideasBoard();
    const undo = doc.createUndoManager();

    const mutation = projectionFor("mindmap").interpret(
      ideasCollection,
      recordsIn(doc, "col-ideas"),
      { kind: "reparent", recordId: "g1", newParentId: "root" },
    );
    expect(mutation).not.toBeNull();
    applyRecordMutation(doc, "col-ideas", mutation!);

    expect(parentOf(doc, "g1")).toBe("root");

    undo.undo();

    expect(parentOf(doc, "g1")).toBe("c1");
  });

  it("an invalid reparent produces no mutation, so there is nothing to undo", () => {
    const doc = ideasBoard();
    // A record cannot become its own descendant's child.
    const mutation = projectionFor("mindmap").interpret(
      ideasCollection,
      recordsIn(doc, "col-ideas"),
      { kind: "reparent", recordId: "root", newParentId: "g1" },
    );
    expect(mutation).toBeNull();
  });
});
