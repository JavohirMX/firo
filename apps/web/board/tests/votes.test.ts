import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  leaders,
  placeVote,
  removeVote,
  tally,
  VOTE_COLLECTION_ID,
  votesFromRecords,
} from "@firo/facilitation";

import { createStickyNote } from "@firo/board";
import { FiroDoc } from "@firo/doc";

/*
 * Votes against a real document.
 *
 * `@firo/facilitation`'s own tests drive plain objects, which is the right
 * isolation for the pure logic. This file exists for the one thing they cannot
 * check: that the mutations `placeVote` *returns* are actually applicable to a
 * `FiroDoc` and produce a vote that comes back out again.
 *
 * That gap is worth closing explicitly, because the failure it would miss is
 * silent in a way that matters. `placeVote` returns `createCollection` and
 * `createRecord`; if either were inapplicable — a mutation kind the write guard
 * rejects, a collection id that does not resolve, a field the record validator
 * drops — the commit throws, and a facilitator pressing "vote" gets nothing. But
 * if the vote were instead *stored and unreadable*, every pure test would still
 * pass and the tally would silently be empty.
 */

const BOARD = "board-1";

const newDoc = () => new FiroDoc(new Y.Doc());

/** Place a vote through the real mutation path, as the actions will. */
const vote = (
  doc: FiroDoc,
  elementId: string,
  voterId: string,
  recordId: string,
) => {
  const existing = votesFromRecords(doc.read().records);
  doc.commit(
    placeVote(
      existing,
      { elementId, voterId, placedAt: 1000 },
      { record: recordId, order: `a${recordId}`, board: BOARD },
      doc.read().collections.some((c) => c.id === VOTE_COLLECTION_ID),
    ),
  );
};

describe("a vote, committed for real", () => {
  it("creates its collection and lands in the record store", () => {
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");

    const votes = votesFromRecords(doc.read().records);
    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({
      recordId: "r1",
      elementId: "note-a",
      voterId: "ada",
    });
    expect(doc.read().collections.map((c) => c.id)).toContain(
      VOTE_COLLECTION_ID,
    );
  });

  it("reads back out of the document rather than out of a local copy", () => {
    // The gap this file exists for. A vote held in a component and mirrored into
    // the document would satisfy every pure test in the package while the tally
    // built from the document came back empty.
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");

    const fromDoc = votesFromRecords(doc.read().records);
    expect(fromDoc).toHaveLength(1);
    expect(tally(fromDoc).get("note-a")).toBe(1);
  });

  it("survives a reload of the board from its own serialisation", () => {
    // AC-1's "all facilitation state survives a save/load cycle". A vote that did
    // not survive would be the single most infuriating thing to lose in a
    // workshop, and it would be lost silently.
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");
    vote(doc, "note-b", "bob", "r2");

    const reloaded = new FiroDoc(new Y.Doc());
    reloaded.load(doc.read() as never);

    const votes = votesFromRecords(reloaded.read().records);
    expect(votes).toHaveLength(2);
    expect(leaders(votes, 2)).toEqual(["note-a", "note-b"]);
  });

  it("tallies across participants", () => {
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");
    vote(doc, "note-a", "bob", "r2");
    vote(doc, "note-b", "cy", "r3");

    const votes = votesFromRecords(doc.read().records);
    expect(tally(votes).get("note-a")).toBe(2);
    expect(tally(votes).get("note-b")).toBe(1);
    expect(leaders(votes, 1)).toEqual(["note-a"]);
  });

  it("does not stack a second dot when one person votes twice", () => {
    // "One vote per person" is the rule the plan states, and it is what makes
    // holding down the key not produce fifty dots.
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");
    vote(doc, "note-b", "ada", "r2");

    const votes = votesFromRecords(doc.read().records);
    expect(votes).toHaveLength(1);
    expect(votes[0].elementId).toBe("note-b");
  });

  it("withdraws a vote rather than deleting it", () => {
    // Archive, not delete: a vote can come back, which is the same reason the
    // record store archives rather than removes.
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");

    const votes = votesFromRecords(doc.read().records);
    doc.commit(removeVote(votes, "note-a", "ada"));

    expect(votesFromRecords(doc.read().records)).toEqual([]);
    // The record is still there, archived.
    expect(doc.read().records).toHaveLength(1);
    expect(doc.read().records[0].archived).toBe(true);
  });

  it("keeps anonymous votes apart", () => {
    // Two anonymous participants are not the same person. Collapsing them would
    // make withdrawal impossible for exactly the people who need it.
    const doc = newDoc();
    vote(doc, "note-a", "", "r1");
    vote(doc, "note-a", "", "r2");

    expect(votesFromRecords(doc.read().records)).toHaveLength(2);

    doc.commit(removeVote(votesFromRecords(doc.read().records), "note-a", ""));
    expect(votesFromRecords(doc.read().records)).toHaveLength(1);
  });

  it("does not disturb the board's own elements", () => {
    // A vote is a record, never element metadata. If a vote ever reached an
    // element it would travel with the board's content forever, and there would
    // be no way to remove it.
    const doc = newDoc();
    // A real element, not a hand-rolled one: `commit` stores the fields it is
    // given and validation only fills the rest in on *load*, so a minimal object
    // has no `isDeleted` and asserting on it would be asserting on my own stub.
    doc.commit([
      {
        kind: "createElement",
        element: createStickyNote({ id: "note-a", x: 0, y: 0 }),
      },
    ]);
    const before = JSON.stringify(doc.element("note-a"));

    vote(doc, "note-a", "ada", "r1");

    // Byte-identical: the element is exactly what it was.
    expect(JSON.stringify(doc.element("note-a"))).toBe(before);
    // And nothing about the vote leaked onto it.
    const serialised = JSON.stringify(doc.element("note-a"));
    expect(serialised).not.toContain("ada");
    expect(serialised).not.toContain("firo-votes");
    expect(doc.read().records).toHaveLength(1);
  });

  it("produces no extra document updates when a vote is withdrawn twice", () => {
    // Withdrawing something already withdrawn must be a no-op, not a second
    // archive -- which on a busy board would be a write per keystroke.
    const doc = newDoc();
    vote(doc, "note-a", "ada", "r1");

    doc.commit(
      removeVote(votesFromRecords(doc.read().records), "note-a", "ada"),
    );
    const after = doc.durableUpdates;

    doc.commit(
      removeVote(votesFromRecords(doc.read().records), "note-a", "ada"),
    );
    expect(doc.durableUpdates).toBe(after);
  });
});
