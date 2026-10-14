/**
 * The comment lane in the document.
 *
 * The schema tests cover migration and serialisation; these cover the *write
 * path* -- the three mutations, the referential checks `commit()` runs before it
 * opens a transaction, the chronological read order, and the round trip through a
 * second document. The property that matters most is that a comment is durable
 * board state and not ephemeral: it must survive a save, and a load must not turn
 * it into an undo step.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { openBoardMemory } from "@firo/doc";
import { asFractionalIndex, loadBoard, serializeBoard } from "@firo/schema";

import type { FiroDoc } from "@firo/doc";
import type { CommentThread, FiroElement } from "@firo/schema";

const note = (id: string): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 10,
    y: 20,
    width: 200,
    height: 200,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1750000000000,
    updated: 1750000000000,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
  } as unknown as FiroElement);

const thread = (
  id: string,
  over: Partial<CommentThread> = {},
): CommentThread => ({
  id,
  elementId: "el-1",
  anchor: { x: 4, y: 8 },
  comments: [
    { id: `${id}-c1`, body: "First thought", author: "ada", createdAt: 1000 },
  ],
  resolved: false,
  author: "ada",
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

let doc: FiroDoc;

beforeEach(() => {
  doc = openBoardMemory();
});

afterEach(() => {
  doc.destroy();
});

describe("the comment write path", () => {
  test("create, reply, resolve and delete all land", () => {
    doc.commit([{ kind: "createCommentThread", thread: thread("t1") }]);
    expect(doc.comment("t1")).toMatchObject({
      id: "t1",
      elementId: "el-1",
      resolved: false,
    });
    expect(doc.read().comments).toHaveLength(1);

    // A reply rewrites the whole `comments` array (the field is atomic; per-message
    // merge is a v2 rich-text concern).
    doc.commit([
      {
        kind: "updateCommentThread",
        id: "t1",
        changes: {
          comments: [
            ...thread("t1").comments,
            {
              id: "t1-c2",
              body: "Agreed",
              author: "grace",
              createdAt: 2000,
            },
          ],
        },
      },
    ]);
    expect(doc.comment("t1")?.comments).toHaveLength(2);

    doc.commit([
      { kind: "updateCommentThread", id: "t1", changes: { resolved: true } },
    ]);
    expect(doc.comment("t1")?.resolved).toBe(true);

    doc.commit([{ kind: "deleteCommentThread", id: "t1" }]);
    expect(doc.comment("t1")).toBeNull();
    expect(doc.read().comments).toHaveLength(0);
  });

  test("an update stamps `updatedAt` from the write path, not the caller", () => {
    doc.commit([{ kind: "createCommentThread", thread: thread("t1") }]);
    const before = doc.comment("t1")!.updatedAt;
    doc.commit([
      { kind: "updateCommentThread", id: "t1", changes: { resolved: true } },
    ]);
    // Default `Date.now()` is well past the fixture's epoch timestamps.
    expect(doc.comment("t1")!.updatedAt).toBeGreaterThan(before);
  });

  test("a comment survives a change to its anchor element", () => {
    // The anchor is element-relative, so moving the element does not touch the
    // thread -- and deleting the element does not cascade to it.
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createCommentThread", thread: thread("t1") },
    ]);

    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    expect(doc.comment("t1")).not.toBeNull();
    expect(doc.read().comments).toHaveLength(1);
  });

  test("reads back oldest first, by `createdAt` then `id`", () => {
    doc.commit([
      {
        kind: "createCommentThread",
        thread: thread("later", { createdAt: 9000 }),
      },
      {
        kind: "createCommentThread",
        thread: thread("same-b", { createdAt: 5000 }),
      },
      {
        kind: "createCommentThread",
        thread: thread("same-a", { createdAt: 5000 }),
      },
      {
        kind: "createCommentThread",
        thread: thread("first", { createdAt: 100 }),
      },
    ]);
    // Creation order above is deliberately not the read order: a map has no
    // order, so `readAllComments` supplies a total one.
    expect(doc.read().comments.map((c) => c.id)).toEqual([
      "first",
      "same-a",
      "same-b",
      "later",
    ]);
  });
});

describe("the referential checks guard the comment lane", () => {
  test("updating a thread that does not exist is refused before anything is written", () => {
    expect(() =>
      doc.commit([
        {
          kind: "updateCommentThread",
          id: "ghost",
          changes: { resolved: true },
        },
      ]),
    ).toThrow(/ghost/);
    expect(doc.read().comments).toHaveLength(0);
  });

  test("deleting a thread that does not exist is refused", () => {
    expect(() =>
      doc.commit([{ kind: "deleteCommentThread", id: "ghost" }]),
    ).toThrow(/ghost/);
  });

  test("a commit that creates and then deletes one thread is valid", () => {
    // The validator walks mutations in order, carrying the ids earlier ones will
    // create -- the same way `applyMutation` will. So this is legal even though t1
    // is not in the document when the commit starts.
    doc.commit([
      { kind: "createCommentThread", thread: thread("t1") },
      { kind: "deleteCommentThread", id: "t1" },
    ]);
    expect(doc.comment("t1")).toBeNull();
  });
});

describe("comments round-trip and are durable, not ephemeral", () => {
  test("a thread survives the document and the file", () => {
    doc.commit([{ kind: "createCommentThread", thread: thread("t1") }]);

    const other = openBoardMemory();
    const loaded = loadBoard(serializeBoard(doc.read()));
    expect(loaded.log.hasRepairs, loaded.log.summary()).toBe(false);
    other.load(loaded as never);

    expect(other.read().comments).toHaveLength(1);
    expect(other.comment("t1")).toMatchObject({
      elementId: "el-1",
      anchor: { x: 4, y: 8 },
    });
    other.destroy();
  });

  test("a commit on a thread is a durable update", () => {
    const before = doc.durableUpdates;
    doc.commit([{ kind: "createCommentThread", thread: thread("t1") }]);
    expect(doc.durableUpdates).toBe(before + 1);
  });

  test("a load of a board with comments is not an undo step", () => {
    // Same promise as every other lane: opening a board must not put its contents
    // (comments included) in the undo stack.
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.load({
      elements: [],
      collections: [],
      records: [],
      comments: [thread("t1")],
      meta: {},
    });
    expect(doc.read().comments).toHaveLength(1);
    expect(undo.undoStack.length).toBe(0);
  });
});
