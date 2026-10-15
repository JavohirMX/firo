import { describe, expect, it } from "vitest";

import { openBoardMemory } from "@firo/doc";

import {
  declarativeToSvg,
  serializeDocToDeclarative,
} from "../src/declarative";
import { applyDeclarativeBoard, applyDiff, computeDiff } from "../src/diff";

import type { DeclarativeBoard } from "../src/declarative";

describe("Declarative Diff Engine", () => {
  it("serializes FiroDoc to declarative format with stable IDs and produces valid SVG", () => {
    const doc = openBoardMemory();

    // Insert two sticky notes
    applyDiff(doc, {
      elements: {
        insert: [
          {
            id: "note-1",
            type: "stickynote",
            x: 100,
            y: 200,
            width: 200,
            height: 200,
            text: "First Idea",
            backgroundColor: "#fff9b1",
          },
          {
            id: "note-2",
            type: "stickynote",
            x: 350,
            y: 200,
            width: 200,
            height: 200,
            text: "Second Idea",
            backgroundColor: "#c0f2c2",
          },
        ],
      },
    });

    const board = serializeDocToDeclarative(doc, {
      boardId: "board-test-1",
      title: "Brainstorming",
    });

    expect(board.id).toBe("board-test-1");
    expect(board.title).toBe("Brainstorming");
    expect(board.elements.length).toBe(2);
    expect(board.elements[0].id).toBe("note-1");
    expect(board.elements[0].text).toBe("First Idea");
    expect(board.elements[0].x).toBe(100);
    expect(board.elements[1].id).toBe("note-2");
    expect(board.elements[1].text).toBe("Second Idea");

    // SVG projection
    const svg = declarativeToSvg(board);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('data-firo-id="note-1"');
    expect(svg).toContain('data-firo-id="note-2"');
    expect(svg).toContain("First Idea");
    expect(svg).toContain("Second Idea");
  });

  it("inserts sticky notes and connectors with valid fractional indices and CRDT fields", () => {
    const doc = openBoardMemory();

    const insertResult = applyDiff(doc, {
      elements: {
        insert: [
          {
            id: "note-root",
            type: "stickynote",
            x: 50,
            y: 50,
            width: 200,
            height: 200,
            text: "Root Problem",
          },
          {
            id: "arrow-1",
            type: "arrow",
            x: 250,
            y: 150,
            width: 100,
            height: 0,
            points: [
              [0, 0],
              [100, 0],
            ],
            endArrowhead: "arrow",
          },
        ],
      },
    });

    expect(insertResult.changed).toBe(true);
    expect(insertResult.applied).toBe(1);

    const snapshot = doc.read();
    expect(snapshot.elements.length).toBe(2);
    expect(snapshot.elements[0].id).toBe("note-root");
    expect(snapshot.elements[0].version).toBeGreaterThanOrEqual(1);
    expect(snapshot.elements[0].index).toBeTruthy();
    expect(snapshot.elements[1].id).toBe("arrow-1");
    expect(snapshot.elements[1].type).toBe("arrow");
  });

  it("modifies coordinates, styling, and text", () => {
    const doc = openBoardMemory();

    applyDiff(doc, {
      elements: {
        insert: [
          {
            id: "note-editable",
            type: "stickynote",
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            text: "Draft v1",
            backgroundColor: "#fff9b1",
          },
        ],
      },
    });

    const updateResult = applyDiff(doc, {
      elements: {
        update: [
          {
            id: "note-editable",
            x: 180,
            y: 220,
            text: "Final Release v2",
            backgroundColor: "#ffc9c9",
          },
        ],
      },
    });

    expect(updateResult.changed).toBe(true);

    const board = serializeDocToDeclarative(doc);
    expect(board.elements.length).toBe(1);
    expect(board.elements[0].id).toBe("note-editable");
    expect(board.elements[0].x).toBe(180);
    expect(board.elements[0].y).toBe(220);
    expect(board.elements[0].text).toBe("Final Release v2");
    expect(board.elements[0].backgroundColor).toBe("#ffc9c9");
  });

  it("deletes elements through CRDT tombstones while keeping stable IDs", () => {
    const doc = openBoardMemory();

    applyDiff(doc, {
      elements: {
        insert: [
          {
            id: "note-keep",
            type: "stickynote",
            x: 0,
            y: 0,
            width: 200,
            height: 200,
            text: "Keep me",
          },
          {
            id: "note-drop",
            type: "stickynote",
            x: 250,
            y: 0,
            width: 200,
            height: 200,
            text: "Drop me",
          },
        ],
      },
    });

    const deleteResult = applyDiff(doc, {
      elements: {
        delete: ["note-drop"],
      },
    });

    expect(deleteResult.changed).toBe(true);

    // Live view filters out deleted items
    const liveBoard = serializeDocToDeclarative(doc);
    expect(liveBoard.elements.length).toBe(1);
    expect(liveBoard.elements[0].id).toBe("note-keep");

    // CRDT keeps tombstone for conflict resolution and undo
    const snapshotWithDeleted = serializeDocToDeclarative(doc, {
      includeDeleted: true,
    });
    expect(snapshotWithDeleted.elements.length).toBe(2);
    const dropped = snapshotWithDeleted.elements.find(
      (e) => e.id === "note-drop",
    );
    expect(dropped?.isDeleted).toBe(true);
  });

  it("computes minimal declarative diff between two board snapshots and applies it", () => {
    const doc = openBoardMemory();

    applyDiff(doc, {
      elements: {
        insert: [
          {
            id: "el-a",
            type: "stickynote",
            x: 10,
            y: 10,
            width: 200,
            height: 200,
            text: "Note A",
          },
          {
            id: "el-b",
            type: "stickynote",
            x: 250,
            y: 10,
            width: 200,
            height: 200,
            text: "Note B",
          },
        ],
      },
    });

    const boardOld = serializeDocToDeclarative(doc);

    // Agent modifies board: edits el-a, removes el-b, adds el-c
    const boardNew: DeclarativeBoard = {
      ...boardOld,
      elements: [
        { ...boardOld.elements[0], text: "Note A modified", x: 50 },
        {
          id: "el-c",
          type: "rectangle",
          x: 500,
          y: 10,
          width: 120,
          height: 80,
          strokeColor: "#0969da",
        },
      ],
    };

    const diff = computeDiff(boardOld, boardNew);

    expect(diff.elements?.insert?.length).toBe(1);
    expect(diff.elements?.insert?.[0].id).toBe("el-c");
    expect(diff.elements?.update?.length).toBe(1);
    expect(diff.elements?.update?.[0].id).toBe("el-a");
    expect(diff.elements?.update?.[0].text).toBe("Note A modified");
    expect(diff.elements?.delete).toEqual(["el-b"]);

    // Apply computed diff
    applyDiff(doc, diff);

    const finalBoard = serializeDocToDeclarative(doc);
    expect(finalBoard.elements.map((e) => e.id)).toEqual(["el-a", "el-c"]);
    expect(finalBoard.elements[0].text).toBe("Note A modified");
  });

  it("applies full declarative board directly via applyDeclarativeBoard", () => {
    const doc = openBoardMemory();

    const initialBoard: DeclarativeBoard = {
      id: "board-direct",
      title: "Direct Update Test",
      elements: [
        {
          id: "box-1",
          type: "rectangle",
          x: 20,
          y: 20,
          width: 100,
          height: 100,
        },
      ],
      collections: [],
      records: [],
      comments: [],
    };

    applyDeclarativeBoard(doc, initialBoard);
    let board = serializeDocToDeclarative(doc);
    expect(board.elements.length).toBe(1);

    const nextBoard: DeclarativeBoard = {
      ...board,
      elements: [
        {
          id: "box-1",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 150,
          height: 150,
        },
        {
          id: "box-2",
          type: "ellipse",
          x: 300,
          y: 50,
          width: 100,
          height: 100,
        },
      ],
    };

    applyDeclarativeBoard(doc, nextBoard);
    board = serializeDocToDeclarative(doc);
    expect(board.elements.length).toBe(2);
    expect(board.elements[0].x).toBe(50);
    expect(board.elements[1].id).toBe("box-2");
  });
});
