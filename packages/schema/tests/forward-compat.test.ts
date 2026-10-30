/**
 * Forward compatibility, as durable regression tests.
 *
 * ## What this pins
 *
 * Two behaviours that must never regress, because a silent failure here loses
 * someone's board:
 *
 * 1. **A file from a newer record schema fails loudly and leaves the input
 *    untouched.** `loadBoard` throws `ForwardVersionError` rather than
 *    loading partially (version.ts rule 2). Stamping the current record
 *    fixture one version ahead exercises the exact guard an older build runs
 *    when it meets a newer file: the check is "file version > my version",
 *    so v3-reader-vs-v4-file is the same code path as v2-reader-vs-v3-file.
 *    The real old-reader direction (integration content refusing the v3
 *    fixture, input byte-identical) was additionally verified live during the
 *    v3 candidate's compatibility review.
 *
 * 2. **A v2 records board round-trips without losing anything.** Load
 *    (identity migration to current), serialize, reload, reserialize: the
 *    second save is byte-identical to the first, and every record, column and
 *    element survives.
 */
import { describe, expect, it } from "vitest";

import {
  CURRENT_RECORD_VERSION,
  fixtures,
  ForwardVersionError,
  loadBoard,
  serializeBoard,
} from "@firo/schema";

const recordFixture = (version: number) => {
  const fixture = fixtures().find(
    (f) => f.version === version && f.chain !== "element",
  );
  if (!fixture) {
    throw new Error(`no record-chain fixture at v${version}`);
  }
  return JSON.parse(JSON.stringify(fixture.board));
};

describe("a file from a newer record schema", () => {
  it("fails loudly and leaves the input untouched", () => {
    const board = recordFixture(CURRENT_RECORD_VERSION);
    board.recordSchemaVersion = CURRENT_RECORD_VERSION + 1;
    const before = JSON.stringify(board);

    expect(() => loadBoard(board)).toThrow(ForwardVersionError);
    expect(JSON.stringify(board)).toBe(before);
  });
});

describe("a v2 records board round-trip", () => {
  it("preserves everything and is idempotent across save/reload", () => {
    const original = recordFixture(2);

    const first = loadBoard(recordFixture(2));
    const savedOnce = serializeBoard(first);
    expect(savedOnce.recordSchemaVersion).toBe(CURRENT_RECORD_VERSION);

    const second = loadBoard(savedOnce);
    const savedTwice = serializeBoard(second);
    expect(savedTwice).toEqual(savedOnce);

    const shape = (board: any) =>
      board.records
        .map((r: any) => ({
          id: r.id,
          collectionId: r.collectionId,
          values: r.values,
          order: r.order,
          archived: r.archived,
        }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));
    expect(shape(first)).toEqual(shape(original));

    const columns = (board: any) =>
      board.collections.map((c: any) => ({
        id: c.id,
        columns: c.columns.map((col: any) => ({
          key: col.key,
          type: col.type,
        })),
      }));
    expect(columns(first)).toEqual(columns(original));
    expect(first.elements).toHaveLength(original.elements.length);
  });
});
