/**
 * The mind-map view wiring (ADR-0040 section 4): the switcher tab, the empty
 * state that adds the relation column, node/edge rendering, double-click edit,
 * drag-reparent, and the table's parent picker. The projection itself is
 * covered in packages/records/tests/mindmap.test.ts; this file covers the
 * component turning intents into document mutations.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as Y from "yjs";

import { asFractionalIndex } from "@firo/schema";
import { FiroDoc } from "@firo/doc";

import type { Collection, FiroRecord } from "@firo/schema";

import { ProjectionView } from "../components/ProjectionView";

let document: FiroDoc;

vi.mock("../board/board", () => ({
  boardDoc: () => document,
  refreshBoard: vi.fn(),
}));

const relationColumn = {
  id: "col-parent",
  key: "parent",
  name: "Parent",
  type: "relation" as const,
};

const baseCollection = (over: Partial<Collection> = {}): Collection => ({
  id: "col-ideas",
  boardId: "b-1",
  name: "Ideas",
  order: asFractionalIndex("a0"),
  version: 1,
  columns: [
    { id: "col-title", key: "title", name: "Title", type: "text" },
    relationColumn,
  ],
  ...over,
});

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

const setup = (collection: Collection, records: readonly FiroRecord[]) => {
  document = new FiroDoc(new Y.Doc());
  document.commit([
    { kind: "createCollection", collection },
    ...records.map((record) => ({ kind: "createRecord" as const, record })),
  ]);
  return render(<ProjectionView excalidrawAPI={null} />);
};

const switchToMindmap = () =>
  fireEvent.click(screen.getByTestId("switch-projection-mindmap"));

describe("the empty state", () => {
  it("offers to add the parent relation, and adds it with the key parent", () => {
    setup(
      baseCollection({
        columns: [
          { id: "col-title", key: "title", name: "Title", type: "text" },
        ],
      }),
      [idea("a", "Root", null, "a0")],
    );
    switchToMindmap();

    expect(screen.getByTestId("mindmap-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-parent-relation"));

    const after = document
      .read()
      .collections.find((c) => c.id === "col-ideas")!;
    expect(after.columns.map((c) => `${c.key}:${c.type}`)).toContain(
      "parent:relation",
    );
  });

  it("uses parent-2 when a different column already owns the key", () => {
    setup(
      baseCollection({
        columns: [
          { id: "col-title", key: "title", name: "Title", type: "text" },
          { id: "col-p", key: "parent", name: "Old parent", type: "text" },
        ],
      }),
      [idea("a", "Root", null, "a0")],
    );
    switchToMindmap();
    fireEvent.click(screen.getByTestId("add-parent-relation"));

    const after = document
      .read()
      .collections.find((c) => c.id === "col-ideas")!;
    expect(after.columns.map((c) => `${c.key}:${c.type}`)).toContain(
      "parent-2:relation",
    );
  });
});

describe("nodes and edges", () => {
  beforeEach(() => {
    setup(baseCollection(), [
      idea("root", "Root cause", null, "a0"),
      idea("c1", "Factor one", "root", "a1"),
      idea("c2", "Factor two", "root", "a2"),
    ]);
    switchToMindmap();
  });

  it("renders one node per record and one edge per child", () => {
    expect(screen.getByTestId("mindmap-node-root")).toBeTruthy();
    expect(screen.getByTestId("mindmap-node-c1")).toBeTruthy();
    expect(screen.getByTestId("mindmap-node-c2")).toBeTruthy();
    expect(screen.getByTestId("edge:c1")).toBeTruthy();
    expect(screen.getByTestId("edge:c2")).toBeTruthy();
    expect(screen.queryByTestId("edge:root")).toBeNull();
  });

  it("double-click edits the title into the record", () => {
    fireEvent.doubleClick(screen.getByTestId("mindmap-node-c1"));
    const input = screen.getByTestId("inline-cell-input");
    fireEvent.change(input, { target: { value: "Factor ONE" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const record = document.read().records.find((r) => r.id === "c1")!;
    expect(record.values.title).toEqual({ type: "text", value: "Factor ONE" });
  });

  it("dropping a node on another re-parents it", () => {
    fireEvent.dragStart(screen.getByTestId("mindmap-node-c2"), {
      dataTransfer: { setData: vi.fn(), getData: () => "c2" },
    });
    fireEvent.drop(screen.getByTestId("mindmap-node-c1"), {
      dataTransfer: { getData: () => "c2" },
    });

    const record = document.read().records.find((r) => r.id === "c2")!;
    expect(record.values.parent).toEqual({ type: "relation", value: "c1" });
  });

  it("dropping a node on the background roots it, and a cycle drop is a no-op", () => {
    // Root onto c1 would be a cycle (c1's parent is root): nothing happens.
    fireEvent.drop(screen.getByTestId("mindmap-node-c1"), {
      dataTransfer: { getData: () => "root" },
    });
    let record = document.read().records.find((r) => r.id === "root")!;
    expect(record.values.parent).toEqual({ type: "relation", value: null });

    // c2 onto the background becomes a root.
    fireEvent.drop(screen.getByTestId("firo-mindmap-view"), {
      dataTransfer: { getData: () => "c2" },
    });
    record = document.read().records.find((r) => r.id === "c2")!;
    expect(record.values.parent).toEqual({ type: "relation", value: null });
  });
});

describe("the table's parent picker", () => {
  it("offers None and every record except self and descendants", () => {
    setup(baseCollection(), [
      idea("root", "Root cause", null, "a0"),
      idea("c1", "Factor one", "root", "a1"),
      idea("g1", "Detail", "c1", "a2"),
    ]);
    fireEvent.click(screen.getByTestId("switch-projection-table"));

    const picker = screen.getByTestId(
      "select-relation-root",
    ) as HTMLSelectElement;
    const offered = Array.from(picker.options).map((option) => option.value);
    // root's descendants are c1 and g1, so only None and... nobody else.
    expect(offered).toEqual([""]);

    const gPicker = screen.getByTestId(
      "select-relation-g1",
    ) as HTMLSelectElement;
    const gOffered = Array.from(gPicker.options).map((option) => option.value);
    expect(gOffered).toEqual(["", "root", "c1"]);

    // Picking writes the relation.
    fireEvent.change(gPicker, { target: { value: "root" } });
    const record = document.read().records.find((r) => r.id === "g1")!;
    expect(record.values.parent).toEqual({ type: "relation", value: "root" });
  });
});
