import { createFiroDoc } from "@firo/doc";
import { describe, expect, it } from "vitest";

import { isExcalidrawJson } from "../excalidraw";
import { importBoardFile } from "../files";

const docBlockElement = {
  id: "el-doc-1",
  type: "rectangle",
  strokeColor: "#1e1e1e",
  customData: { isDocBlock: true, recordId: "rec-doc-1" },
};

const exportedBoard = {
  collections: [
    {
      boardId: "4oppMcsgVkYxJNQDDAHFc",
      columns: [
        {
          id: "c-title",
          key: "title",
          name: "Title",
          type: "text",
        },
        {
          id: "c-fragment-key",
          key: "fragmentKey",
          name: "Fragment Key",
          type: "text",
        },
        {
          id: "c-width",
          key: "width",
          name: "Width",
          type: "number",
        },
        {
          id: "c-height",
          key: "height",
          name: "Height",
          type: "number",
        },
        {
          id: "c-styling",
          key: "styling",
          name: "Styling",
          type: "text",
        },
      ],
      id: "col-doc-blocks",
      name: "Doc Blocks",
      order: "a0",
      version: 1,
    },
  ],
  elementOrder: ["W5k-oTotcc2ff7hHy8l38"],
  elementSchemaVersion: 4,
  elements: [
    {
      angle: 0,
      backgroundColor: "#ffffff",
      bindings: [],
      created: 1792524252419,
      customData: {
        isDocBlock: true,
        recordId: "doc-1792524252417-23o12",
      },
      fillStyle: "solid",
      frameId: null,
      groupIds: [],
      height: 400,
      id: "W5k-oTotcc2ff7hHy8l38",
      index: "a0",
      isDeleted: false,
      link: null,
      locked: false,
      opacity: 100,
      roughness: 0,
      roundness: {
        type: 3,
      },
      strokeColor: "#1e1e1e",
      strokeStyle: "solid",
      strokeWidth: 1,
      type: "rectangle",
      updated: 1792524252420,
      version: 2,
      versionNonce: 374441841,
      width: 560,
      x: 500,
      y: 300,
    },
  ],
  meta: {
    id: "4oppMcsgVkYxJNQDDAHFc",
  },
  recordSchemaVersion: 2,
  records: [
    {
      archived: false,
      collectionId: "col-doc-blocks",
      created: 1792524252417,
      id: "doc-1792524252417-23o12",
      order: "a0",
      updated: 1792524253732,
      values: {
        contentJson: {
          type: "text",
          value:
            '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"export me please"}]},{"type":"paragraph"}]}',
        },
        fragmentKey: {
          type: "text",
          value: "fragment-doc-1792524252417-23o12",
        },
        height: {
          type: "number",
          value: 400,
        },
        styling: {
          type: "text",
          value:
            '{"backgroundColor":"#ffffff","textColor":"#1e1e1e","fontSize":16,"padding":24,"borderRadius":8}',
        },
        title: {
          type: "text",
          value: "Untitled Document",
        },
        width: {
          type: "number",
          value: 560,
        },
      },
    },
  ],
};

describe("native Firo board files are not Excalidraw files", () => {
  it("is not detected as Excalidraw when it carries Firo schema versions", () => {
    expect(
      isExcalidrawJson({
        elementSchemaVersion: 4,
        recordSchemaVersion: 2,
        elements: [docBlockElement],
        records: [],
      }),
    ).toBe(false);
  });

  it("still detects a real Excalidraw scene", () => {
    expect(
      isExcalidrawJson({ type: "excalidraw", elements: [docBlockElement] }),
    ).toBe(true);
    expect(isExcalidrawJson({ elements: [docBlockElement] })).toBe(true);
  });

  it("keeps the doc block record when a native export is imported", async () => {
    const target = createFiroDoc();
    const result = await importBoardFile(
      target,
      JSON.stringify(exportedBoard),
      {
        force: true,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).not.toBe("excalidraw");
    }
    const snap = target.read();
    expect(snap.records.map((r) => r.id)).toEqual(["doc-1792524252417-23o12"]);
    expect(snap.elements[0].customData).toMatchObject({
      isDocBlock: true,
      recordId: "doc-1792524252417-23o12",
    });
  });

  it("keeps the current board's id instead of the file's", async () => {
    const target = createFiroDoc();
    target.load({
      elements: [],
      collections: [],
      records: [],
      elementOrder: [],
      meta: {
        id: "my-board-id",
        name: "Mine",
        created: 1,
        updated: 1,
      } as never,
    });
    const result = await importBoardFile(
      target,
      JSON.stringify(exportedBoard),
      { force: true },
    );
    expect(result.ok).toBe(true);
    expect(target.read().meta?.id).toBe("my-board-id");
    expect(target.read().records.length).toBe(1);
  });
});
