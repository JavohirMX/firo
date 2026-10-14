/**
 * The comment lane's schema tests.
 *
 * The comment lane arrived under the record chain ([`../src/version.ts`](../src/version.ts)),
 * so most of its promise is already pinned by the fixture harness. These tests
 * cover the three things the harness cannot:
 *
 * 1. The migration *repairs* a malformed thread rather than dropping the
 *    conversation (the harness only loads well-formed fixtures).
 * 2. A board written before comments existed re-saves **without** gaining a
 *    `comments` key -- the whole-file-churn property `SerializedBoard` documents.
 * 3. A board from a *newer* record version is refused rather than loaded with the
 *    comments dropped, which is the silent-loss failure the version bump exists
 *    to make loud (AC-10).
 */
import { describe, expect, test } from "vitest";

import {
  CURRENT_RECORD_VERSION,
  ForwardVersionError,
  loadBoard,
  migrateCommentThread,
  RepairLog,
  serializeBoard,
} from "@firo/schema";

import type { CommentThread } from "@firo/schema";

const wellFormed: CommentThread = {
  id: "ct-1",
  elementId: "el-1",
  anchor: { x: 12, y: 4 },
  comments: [
    { id: "cm-1", body: "First", author: "ada", createdAt: 1750000000000 },
  ],
  resolved: false,
  author: "ada",
  createdAt: 1750000000000,
  updatedAt: 1750000000000,
};

describe("migrateCommentThread", () => {
  test("is the identity on a well-formed thread, with no repairs", () => {
    const log = new RepairLog();
    const migrated = migrateCommentThread(wellFormed, log, "comment");
    expect(migrated).toEqual(wellFormed);
    // The strongest statement: not one field was touched. This is what makes the
    // committed record-v2 fixture round-trip byte-identically.
    expect(log.hasRepairs).toBe(false);
  });

  test("keeps an unknown field rather than dropping it", () => {
    const log = new RepairLog();
    const migrated = migrateCommentThread(
      { ...wellFormed, colour: "amber" },
      log,
      "comment",
    );
    expect(migrated).toHaveProperty("colour", "amber");
    // Preserved, not repaired; see `RepairLog.hasRepairs`.
    expect(log.hasRepairs).toBe(false);
    expect(log.all.some((entry) => entry.kind === "keptUnknown")).toBe(true);
  });

  test("repairs a malformed field and keeps the thread", () => {
    const log = new RepairLog();
    const migrated = migrateCommentThread(
      {
        ...wellFormed,
        anchor: { x: "left", y: 4 },
        resolved: "yes",
        comments: [
          { id: "cm-1", body: 42, author: "ada", createdAt: 1 },
          "not an object",
        ],
      },
      log,
      "comment",
    );
    expect(migrated.anchor).toEqual({ x: 0, y: 4 });
    expect(migrated.resolved).toBe(false);
    expect(migrated.comments).toHaveLength(1);
    expect(migrated.comments[0].body).toBe("");
    expect(log.hasRepairs).toBe(true);
  });

  test("refuses a thread that is not an object, rather than inventing one", () => {
    expect(() => migrateCommentThread("nope", new RepairLog())).toThrow(
      TypeError,
    );
    expect(() => migrateCommentThread(null, new RepairLog())).toThrow(
      TypeError,
    );
  });

  test("treats a missing `comments` array as an empty thread", () => {
    const log = new RepairLog();
    const { comments, ...withoutComments } = wellFormed;
    void comments;
    const migrated = migrateCommentThread(withoutComments, log, "comment");
    expect(migrated.comments).toEqual([]);
    // Absent and empty are the same event on this lane: a thread with nothing in
    // it is odd but not corrupt, so nothing is reported. That is what keeps a
    // foreign board with a bare thread loading clean rather than as "damaged".
    expect(log.hasRepairs).toBe(false);
  });
});

describe("the board round trip and the comment lane", () => {
  test("a board with no comments re-saves without gaining a comments key", () => {
    // The whole-file-churn guard. A board written before comments existed must be
    // byte-identical after a load and a save, so `comments` cannot be
    // materialised as `[]` on the way out.
    const board = {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: [],
      elements: [],
      collections: [],
      records: [],
      meta: { id: "b", name: "No comments" },
    };
    const written = serializeBoard(loadBoard(board));
    expect(written).not.toHaveProperty("comments");
  });

  test("carries comments through a load and a save", () => {
    const board = {
      elementSchemaVersion: 2,
      recordSchemaVersion: 2,
      elementOrder: [],
      elements: [],
      collections: [],
      records: [],
      comments: [wellFormed],
      meta: { id: "b" },
    };
    const loaded = loadBoard(board);
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments[0]).toEqual(wellFormed);
    expect(serializeBoard(loaded)).toHaveProperty("comments", [wellFormed]);
  });

  test("a thread survives its anchor element being gone", () => {
    // `elementId` names nothing in the board; the thread still loads. A
    // conversation is not destroyed because the note it was about was.
    const loaded = loadBoard({
      elementSchemaVersion: 2,
      recordSchemaVersion: 2,
      elementOrder: [],
      elements: [],
      collections: [],
      records: [],
      comments: [{ ...wellFormed, elementId: "deleted-long-ago" }],
      meta: {},
    });
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments[0].elementId).toBe("deleted-long-ago");
  });

  test("a board from a newer record version is refused, not silently stripped", () => {
    // The reason the lane is gated under the record chain rather than added as an
    // unversioned field: an older build cannot understand `comments`, so it must
    // refuse the file rather than drop them on the next save.
    expect(() =>
      loadBoard({
        elementSchemaVersion: 2,
        recordSchemaVersion: CURRENT_RECORD_VERSION + 1,
        elementOrder: [],
        elements: [],
        collections: [],
        records: [],
        comments: [wellFormed],
        meta: {},
      }),
    ).toThrow(ForwardVersionError);
  });
});
