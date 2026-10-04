import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import {
  boardIdConflict,
  VOTE_COLLECTION_ID,
  voteCollection,
} from "@firo/facilitation";

import { boardId, peekBoardId } from "../src/identity.js";

/*
 * Board identity, and the conflict it makes detectable.
 *
 * ## What was wrong
 *
 * `Collection.boardId` was the fixed string `"firo-board"`, and the comment above it
 * said a collision would therefore be "detectable". It was not: nothing compared the
 * field. The votes collection has a fixed id, so a second board's dots would land in
 * the first board's collection and `boardId` would sit there asserting nothing. A
 * field that claims to identify a board and identifies a constant is worse than no
 * field, because the next person reads it as evidence the problem is handled.
 *
 * ## The failure it prevents
 *
 * A **silent merge**: two sessions' dots in one tally, each participant's vote landing
 * among strangers', with no error anywhere. Not a wrong number that gets noticed — a
 * plausible number that does not.
 *
 * ## Why the tests below assert two boards rather than one
 *
 * The obvious test — "the board's votes carry its id" — passes against the old
 * constant, because `"firo-board"` *is* an id and it *is* on the collection. It
 * asserts that a field exists, not that it means anything. Every test here is therefore
 * written across two documents, because that is the only shape in which "identifies a
 * board" has a meaning.
 */

const docWith = () => new FiroDoc(new Y.Doc());

describe("a board's identity", () => {
  it("stamps one on first use and keeps it", () => {
    const doc = docWith();

    const first = boardId(() => doc);

    expect(first).toBeTruthy();
    expect(peekBoardId(() => doc)).toBe(first);
  });

  it("is the same on every later call", () => {
    // The whole point of storing it rather than deriving it: an identity that changed
    // when the board was edited would leave a board whose votes no longer match its own
    // history.
    const doc = docWith();
    boardId(() => doc);

    expect(boardId(() => doc)).toBe(boardId(() => doc));
  });

  it("survives being read back, so votes stay attributable across a session", () => {
    const doc = docWith();
    const stamped = boardId(() => doc);

    // Round-trip through the loader, which is what an exported board goes through.
    const reloaded = docWith();
    reloaded.load(doc.read() as never);

    expect(peekBoardId(() => reloaded)).toBe(stamped);
  });

  it("stamps exactly one durable write", () => {
    const doc = docWith();
    const before = doc.durableUpdates;

    boardId(() => doc);
    boardId(() => doc);
    boardId(() => doc);

    // Once per board, not once per vote. A stamp on every dot would be a durable write
    // per vote and would make the identity part of the undo stack.
    expect(doc.durableUpdates).toBe(before + 1);
  });

  it("does not mint one when peeking", () => {
    // `peekBoardId` exists for callers that must not write — a conflict check, an
    // export manifest. A fabricated id would differ from the one stamped a moment
    // later, and the two would disagree in a way nobody could see.
    const doc = docWith();
    const before = doc.durableUpdates;

    expect(peekBoardId(() => doc)).toBeNull();
    expect(doc.durableUpdates).toBe(before);
  });

  it("gives two boards different identities", () => {
    expect(boardId(() => docWith())).not.toBe(boardId(() => docWith()));
  });

  it("ignores an empty id rather than accepting it", () => {
    // `""` is falsy and would otherwise read as an identity, and every board with one
    // would share it.
    const doc = docWith();
    doc.commit([{ kind: "setMeta", entries: { id: "" } }]);

    expect(boardId(() => doc)).toBeTruthy();
  });
});

describe("two boards' votes cannot be merged", () => {
  it("reports a conflict when the collection belongs to another board", () => {
    const mine = boardId(() => docWith());
    const theirs = boardId(() => docWith());

    const collections = [voteCollection(theirs, "a0")];

    const conflict = boardIdConflict(collections, VOTE_COLLECTION_ID, mine);

    // The failure this prevents: two sessions' dots in one tally, each participant's
    // vote landing among strangers', with no error anywhere.
    expect(conflict).toBeTruthy();
    expect(conflict).toContain(theirs);
    expect(conflict).toContain(mine);
  });

  it("reports nothing for the board's own votes", () => {
    const mine = boardId(() => docWith());

    expect(
      boardIdConflict([voteCollection(mine, "a0")], VOTE_COLLECTION_ID, mine),
    ).toBeNull();
  });

  it("reports nothing when there is no votes collection yet", () => {
    // The ordinary first vote of a session. A guard that fired here would make voting
    // impossible.
    expect(
      boardIdConflict(
        [],
        VOTE_COLLECTION_ID,
        boardId(() => docWith()),
      ),
    ).toBeNull();
  });

  it("reports nothing when the existing collection has no board id at all", () => {
    /*
     * A board whose votes predate board identity.
     *
     * Refusing would strand those votes with no way forward except deleting them, which
     * is a far worse outcome than accepting them. The mismatch that matters is one id
     * against a *different* id.
     */
    const mine = boardId(() => docWith());
    const legacy = { ...voteCollection(mine, "a0"), boardId: undefined };

    expect(boardIdConflict([legacy], VOTE_COLLECTION_ID, mine)).toBeNull();
  });

  it("reports nothing about a collection that is not the votes one", () => {
    // A record collection a person made, carrying whatever board id it carries. Only
    // the votes collection is a merge hazard.
    const mine = boardId(() => docWith());
    const other = {
      id: "my-notes",
      name: "Notes",
      version: 1,
      boardId: "elsewhere",
    };

    expect(boardIdConflict([other], VOTE_COLLECTION_ID, mine)).toBeNull();
  });

  it("is decided across two real documents, not two strings", () => {
    /*
     * The integration the unit tests above cannot make: two boards, each with its own
     * votes collection, meeting in one document.
     *
     * This is the shape the old constant got wrong. With `"firo-board"` on both sides
     * there is nothing to disagree with, so the merge is silent — which is why every
     * other test here is written across two documents and this one is written across
     * two of those.
     */
    const alice = docWith();
    const bob = docWith();
    const aliceId = boardId(() => alice);
    const bobId = boardId(() => bob);

    // Bob's votes collection ends up in Alice's document — a merge, a hand-edited
    // file, a future multi-board sidebar. Any of those.
    const merged = [...alice.read().collections, voteCollection(bobId, "a0")];

    expect(aliceId).not.toBe(bobId);
    expect(boardIdConflict(merged, VOTE_COLLECTION_ID, aliceId)).toBeTruthy();
  });
});
