/**
 * Tests verifying 100% undoability of all AI operations via FiroDoc.
 *
 * Strict guardrail: Every AI action commits through @firo/doc as an atomic transaction.
 * The user can always undo via doc.undo() to restore exact original canvas state.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openBoardMemory } from "@firo/doc";
import { generateKeyBetween } from "@firo/fractional-indexing";

import { asElementId, asFractionalIndex } from "@firo/schema";

import type { Collection, StickyNoteElement } from "@firo/schema";
import type { FiroDoc } from "@firo/doc";

import { createLlmClient } from "../src/client.js";
import {
  applyClustering,
  applyDiagram,
  applyRecords,
} from "../src/executor.js";
import { clusterStickyNotes } from "../src/operations/cluster.js";
import { textToDiagram } from "../src/operations/diagram.js";
import { textToRecords } from "../src/operations/records.js";

const makeNote = (
  id: string,
  text: string,
  x = 0,
  y = 0,
): StickyNoteElement => ({
  id: asElementId(id),
  type: "stickynote",
  text,
  x,
  y,
  width: 200,
  height: 200,
  angle: 0 as any,
  strokeColor: "#1e1e1e",
  backgroundColor: "#fff9b1",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  fontSize: 16,
  fontFamily: 1,
  textAlign: "center",
  verticalAlign: "middle",
  isContainer: false,
  version: 1,
  versionNonce: 100,
  index: asFractionalIndex(generateKeyBetween(null, null)),
  created: 1000,
  updated: 1000,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
});

describe("AI Mutation Undoability", () => {
  let doc: FiroDoc;

  beforeEach(() => {
    doc = openBoardMemory();
  });

  afterEach(() => {
    doc.destroy();
  });

  test("AI text-to-diagram is 100% undoable with a single doc.undo()", async () => {
    // Seed initial canvas with 1 note
    const initialNote = makeNote("seed-note", "Initial seed note", 10, 10);
    doc.commit([{ kind: "createElement", element: initialNote }]);

    const initialSnapshot = doc.read();
    expect(initialSnapshot.elements).toHaveLength(1);
    expect(initialSnapshot.elements[0].id).toBe("seed-note");

    const mockResponse = {
      title: "Flow",
      nodes: [
        { id: "step1", label: "Step 1", shape: "rectangle" },
        { id: "step2", label: "Step 2", shape: "rectangle" },
      ],
      edges: [{ from: "step1", to: "step2" }],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      }) as any,
    });

    const diagram = await textToDiagram("Step 1 then Step 2", mockClient);
    expect(diagram.elements.length).toBeGreaterThan(0);

    // Apply AI operation
    const commitRes = applyDiagram(doc, diagram);
    expect(commitRes.changed).toBe(true);

    // Verify canvas changed
    const afterDiagram = doc.read();
    expect(afterDiagram.elements.length).toBe(1 + diagram.elements.length);

    // Undo operation
    const undone = doc.undo();
    expect(undone).toBe(true);

    // Verify exact original canvas state restored
    const restored = doc.read();
    expect(restored.elements).toHaveLength(1);
    expect(restored.elements[0].id).toBe("seed-note");
    expect(restored.elementOrder).toEqual(["seed-note"]);

    // Verify redo works cleanly
    const redone = doc.redo();
    expect(redone).toBe(true);
    expect(doc.read().elements.length).toBe(1 + diagram.elements.length);
  });

  test("AI sticky note clustering is 100% undoable with a single doc.undo()", async () => {
    const note1 = makeNote("n1", "Fix login bug", 50, 50);
    const note2 = makeNote("n2", "Reset password bug", 300, 50);
    const note3 = makeNote("n3", "Color contrast", 600, 50);

    doc.commit([
      { kind: "createElement", element: note1 },
      { kind: "createElement", element: note2 },
      { kind: "createElement", element: note3 },
    ]);

    const initialSnapshot = doc.read();
    expect(initialSnapshot.elements).toHaveLength(3);

    const mockResponse = {
      clusters: [
        {
          id: "auth",
          title: "Auth",
          topic: "Login issues",
          sentiment: "negative",
          keywords: ["login"],
          noteIds: ["n1", "n2"],
        },
        {
          id: "a11y",
          title: "Accessibility",
          topic: "Visual a11y",
          sentiment: "neutral",
          keywords: ["contrast"],
          noteIds: ["n3"],
        },
      ],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: JSON.stringify(mockResponse) },
        }),
      }) as any,
    });

    const clustering = await clusterStickyNotes(
      doc.read().elements,
      mockClient,
    );
    expect(clustering.frames).toHaveLength(2);

    // Apply clustering to doc
    applyClustering(doc, clustering);

    // Elements should now include 2 frames, and notes should have moved
    const updated = doc.read();
    expect(updated.elements.filter((e) => e.type === "frame")).toHaveLength(2);
    const updatedNote1 = doc.element("n1") as StickyNoteElement;
    expect(updatedNote1.frameId).not.toBeNull();

    // Single undo step must revert frames AND restore note coordinates/frameIds
    const undone = doc.undo();
    expect(undone).toBe(true);

    const reverted = doc.read();
    expect(reverted.elements.filter((e) => e.type === "frame")).toHaveLength(0);

    const revertedNote1 = doc.element("n1") as StickyNoteElement;
    expect(revertedNote1.x).toBe(50);
    expect(revertedNote1.y).toBe(50);
    expect(revertedNote1.frameId).toBeNull();

    const revertedNote3 = doc.element("n3") as StickyNoteElement;
    expect(revertedNote3.x).toBe(600);
    expect(revertedNote3.y).toBe(50);
    expect(revertedNote3.frameId).toBeNull();
  });

  test("AI text-to-records is 100% undoable with a single doc.undo()", async () => {
    const col: Collection = {
      id: "tasks-col",
      boardId: "b1",
      name: "Tasks",
      order: asFractionalIndex(generateKeyBetween(null, null)),
      version: 1,
      columns: [{ id: "c1", key: "title", name: "Title", type: "text" }],
    };
    doc.commit([{ kind: "createCollection", collection: col }]);

    expect(doc.read().records).toHaveLength(0);

    const mockResponse = {
      records: [{ title: "Task 1" }, { title: "Task 2" }, { title: "Task 3" }],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      }) as any,
    });

    const recordsResult = await textToRecords(
      { collection: col, text: "Three tasks" },
      mockClient,
    );
    expect(recordsResult.records).toHaveLength(3);

    applyRecords(doc, recordsResult);
    expect(doc.read().records).toHaveLength(3);

    // Single undo reverts all 3 records
    const undone = doc.undo();
    expect(undone).toBe(true);
    expect(doc.read().records).toHaveLength(0);

    // Redo restores them
    const redone = doc.redo();
    expect(redone).toBe(true);
    expect(doc.read().records).toHaveLength(3);
  });
});
