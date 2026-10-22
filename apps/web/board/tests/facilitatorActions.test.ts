import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { boardId, createStickyNote } from "@firo/board";
import { randomId, reseed } from "@firo/common";
import { FiroDoc } from "@firo/doc";
import {
  formatRemaining,
  placeVote,
  remainingMs,
  votesFromRecords,
  voteCollection,
  VOTE_COLLECTION_ID,
} from "@firo/facilitation";

import type { Action } from "@firo/editor/actions/types";
import type { CommandPaletteItem } from "@firo/editor/components/CommandPalette/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  facilitatorActions,
  facilitatorCommandPaletteItems,
} from "../facilitatorActions";
import { resetFacilitationCache } from "../facilitator";

/*
 * The facilitator's commands, in the editor's action system.
 *
 * ## What is worth protecting, and why in this order
 *
 * 1. **Nothing throws.** Every one of these is a keystroke, and a keystroke that
 *    throws is an unhandled error in a keydown handler with no toast — which looks
 *    exactly like "the app is fine and the key does nothing". The facilitator
 *    pressing harder is the failure mode; the stack trace is not.
 * 2. **The bindings do not collide.** `handleKeyDown` runs an action only when
 *    *exactly one* registered action's `keyTest` matches. Two matches is not
 *    "the newer one wins" — it is *nothing happens at all*, plus a `console.warn`
 *    nobody in the room reads. So a collision is invisible in the product and has
 *    to be caught here, against the real inherited list.
 * 3. **The clock writes nothing and the dot writes something.** The Phase 5 exit
 *    criterion verbatim: a five-minute timer produces zero Yjs document updates.
 *    Votes are the opposite — they are records, and they must land in the file.
 */

type Toast = { message: unknown; closable?: boolean; duration?: number } | null;

/** Only the two things these actions touch on the imperative API. */
const fakeApi = () => {
  const toasts: Toast[] = [];
  const registered: Action[] = [];
  const api = {
    registerAction: (action: Action) => {
      registered.push(action);
    },
    setToast: (toast: Toast) => {
      toasts.push(toast);
    },
  } as unknown as ExcalidrawImperativeAPI;
  return { api, toasts, registered };
};

const setup = () => {
  resetFacilitationCache();
  reseed(1);
  const document = new FiroDoc(new Y.Doc());
  const refresh = vi.fn();
  const { api, toasts, registered } = fakeApi();
  const actions = facilitatorActions(api, () => document, refresh);
  for (const action of actions) {
    api.registerAction(action);
  }
  const byName = new Map(actions.map((action) => [action.name, action]));

  /**
   * Perform an action the way `ActionManager` does.
   *
   * `elements` defaults to the document's, because that is what the editor's scene
   * holds: `getSelectedElements` matches `selectedElementIds` against the list it is
   * given, so handing it an empty array would make every selection empty and this
   * file would test the refusal path and nothing else.
   */
  const run = (name: Action["name"], elements?: unknown[]) => {
    const action = byName.get(name);
    if (!action) {
      throw new Error(`no such action: ${name}`);
    }
    return action.perform(
      (elements ?? document.read().elements) as never,
      appState() as never,
      undefined,
      undefined as never,
    );
  };

  return { document, refresh, toasts, registered, actions, byName, run };
};

type AppStateLike = {
  selectedElementIds: Record<string, true>;
  viewModeEnabled: boolean;
  toast: Toast;
};

/** What `perform` sees as the current selection. Reassigned by `select`. */
let appState: () => AppStateLike;

beforeEach(() => {
  appState = () => ({
    selectedElementIds: {},
    viewModeEnabled: false,
    toast: null,
  });
});

const select = (...ids: string[]) => {
  appState = () => ({
    selectedElementIds: Object.fromEntries(
      ids.map((id) => [id, true as const]),
    ),
    viewModeEnabled: false,
    toast: null,
  });
};

/** Another ballot's dot, committed straight into the document. */
const foreignVote = (document: FiroDoc, elementId: string, voterId: string) => {
  const recordId = randomId();
  document.commit(
    placeVote(
      votesFromRecords(document.read().records),
      { elementId, voterId, placedAt: 1000 },
      { record: recordId, order: `a${recordId}`, board: "board-1" },
      document.read().collections.some((c) => c.id === VOTE_COLLECTION_ID),
    ),
  );
};

/** A note in the document, selected. Returns its id. */
const note = (document: FiroDoc, text: string): string => {
  const element = createStickyNote({ id: randomId(), x: 0, y: 0, text });
  document.commit([{ kind: "createElement", element }]);
  select(element.id);
  return element.id;
};

const lastToast = (toasts: Toast[]): string =>
  String(toasts[toasts.length - 1]?.message ?? "");

/* -------------------------------------------------------------------------- */

describe("registration", () => {
  it("registers every facilitator command, once each", () => {
    const { registered } = setup();
    expect(registered.map((action) => action.name)).toEqual([
      "toggleFacilitatorTimer",
      "resetFacilitatorTimer",
      "addMinuteToTimer",
      "toggleBoardReveal",
      "togglePresentation",
      "nextSlide",
      "previousSlide",
      "openVotingPanel",
      "addVoteToSelection",
      "removeVoteFromSelection",
      "readVoteTally",
      "setupFacilitatorTimer",
      "bulkCreateStickyNotes",
    ]);
  });

  it("gives every command a keyTest and palette keywords", () => {
    // A command with no `keyTest` is reachable only from a menu, which is what
    // AC-8 rules out. A command with no keywords is in the palette and unfindable
    // in it.
    const { actions } = setup();
    for (const action of actions) {
      /*
       * `openVotingPanel` is the deliberate exception: ADR-0039 gives the
       * panel no single-key shortcut (the palette and the facilitation menu
       * are the paths), so it has no `keyTest` to assert.
       */
      if (action.name !== "openVotingPanel") {
        expect(typeof action.keyTest, action.name).toBe("function");
      }
      expect(action.keywords?.length ?? 0, action.name).toBeGreaterThan(0);
    }
  });

  it("labels them with literals, not translation keys", () => {
    // `t()` *throws* on an unknown key outside production and the palette calls it
    // on every label it is handed. A key here is a dev-only crash and a production
    // label rendering as "".
    const { actions } = setup();
    for (const action of actions) {
      expect(typeof action.label, action.name).toBe("string");
      expect(String(action.label), action.name).not.toContain(".");
    }
  });
});

describe("the clock", () => {
  it("starts, pauses and resumes from one command", () => {
    // Three states, one command: a facilitator thinks "run the clock", and cannot
    // see from the board which state the clock is in.
    const { document, run } = setup();

    run("toggleFacilitatorTimer");
    expect(document.getEphemeral().timer?.startedAt).not.toBeNull();

    run("toggleFacilitatorTimer");
    expect(document.getEphemeral().timer?.startedAt).toBeNull();

    const paused = document.getEphemeral().timer?.remainingMs ?? 0;
    run("toggleFacilitatorTimer");
    // Resumed where it stopped, not from the beginning.
    expect(document.getEphemeral().timer?.remainingMs).toBe(paused);
  });

  it("starts at five minutes when no clock has ever existed", () => {
    const { document, run } = setup();
    expect(document.getEphemeral().timer).toBeNull();

    run("toggleFacilitatorTimer");

    const timer = document.getEphemeral().timer!;
    expect(formatRemaining(remainingMs(timer, Date.now()))).toBe("5:00");
  });

  it("resets to the top and stops, rather than pausing where it stood", () => {
    // The distinguishing case is a clock that has *run down*: then reset and pause
    // differ, and they differ exactly the way a facilitator would notice. Pausing a
    // clock that was just started and then given a minute reads the same as
    // resetting it, which is why the earlier version of this test could not tell
    // them apart — see the mutation table.
    const { document, run } = setup();
    // Two minutes of five gone.
    document.setEphemeral({
      timer: {
        startedAt: Date.now() - 120_000,
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });

    run("resetFacilitatorTimer");

    const timer = document.getEphemeral().timer!;
    expect(timer.startedAt).toBeNull();
    // The *derived* reading, because that is what is on the projector. A pause here
    // would read 3:00, and a reset that left the anchor in place would read 5:00 and
    // then fall — so both wrong answers are excluded by this one line.
    expect(formatRemaining(remainingMs(timer, Date.now()))).toBe("5:00");
  });

  it("adds a minute without restarting a running clock", () => {
    const { document, run } = setup();
    run("toggleFacilitatorTimer");
    const before = document.getEphemeral().timer!;

    run("addMinuteToTimer");

    const after = document.getEphemeral().timer!;
    expect(after.durationMs).toBe(before.durationMs + 60_000);
    expect(after.startedAt).toBe(before.startedAt);
  });

  it("writes nothing durable, through all five commands", () => {
    // The Phase 5 exit criterion, verbatim. Counted on the document, not on
    // awareness — a per-tick write to the wrong channel would pass an
    // awareness-only assertion, which is precisely how the first version of this
    // test in `FacilitatorBar` passed for the wrong reason.
    const { document, run } = setup();
    const updates: unknown[] = [];
    document.ydoc.on("update", (update: unknown) => updates.push(update));

    run("toggleFacilitatorTimer");
    run("addMinuteToTimer");
    run("addMinuteToTimer");
    run("toggleFacilitatorTimer");
    run("resetFacilitatorTimer");

    expect(updates).toEqual([]);
    expect(document.durableUpdates).toBe(0);
  });

  it("reaches awareness anyway, so it is not simply lost", () => {
    // Zero durable updates is only correct if the state went *somewhere*. Awareness
    // — and this is the half that would otherwise pass by doing nothing at all.
    const { document, run } = setup();
    run("toggleFacilitatorTimer");

    expect(document.awareness.getLocalState()?.firo).toMatchObject({
      timer: { startedAt: expect.any(Number) },
    });
  });
});

describe("reveal", () => {
  it("flips the mode and asks the canvas to repaint", () => {
    // The integration that is easy to miss. Reveal is ephemeral, so flipping it
    // commits nothing and `BoardSync` never hears about it. Without `refresh` the
    // canvas keeps showing the notes it was supposed to hide, which reads as the
    // feature working because the facilitator's own UI did change.
    const { document, refresh, run } = setup();

    run("toggleBoardReveal");
    expect(document.getEphemeral().reveal.mode).toBe("private");
    expect(refresh).toHaveBeenCalledTimes(1);

    run("toggleBoardReveal");
    expect(document.getEphemeral().reveal.mode).toBe("revealed");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not leave a board stuck private", () => {
    // The ephemeral half of the split. The counterpart is the durable
    // per-element flag, which must *not* behave this way.
    const { run } = setup();
    run("toggleBoardReveal");

    expect(new FiroDoc(new Y.Doc()).getEphemeral().reveal.mode).toBe(
      "revealed",
    );
  });
});

describe("placing a dot", () => {
  it("lands in the record store", () => {
    const { document, run } = setup();
    const id = note(document, "the quiet one");

    run("addVoteToSelection");

    const votes = votesFromRecords(document.read().records);
    expect(votes).toHaveLength(1);
    expect(votes[0].elementId).toBe(id);
  });

  it("creates the votes collection on the first dot", () => {
    // One commit, so one undo step. Two commits would make one press of undo leave
    // a collection containing nothing — and history stops at a real change, so a
    // second undo would be needed to remove something nobody can see.
    const { document, run } = setup();
    note(document, "first");

    run("addVoteToSelection");

    expect(document.read().collections.map((c) => c.id)).toEqual([
      VOTE_COLLECTION_ID,
    ]);
  });

  it("is one commit on the first dot, identity and all", () => {
    /*
     * Locked in because it was nearly lost.
     *
     * Naming a board is a durable write, so the obvious implementation commits it and
     * then commits the dot — two transactions, and undo stops at a real change, so a
     * facilitator pressing undo once finds the dot gone (correct) and pressing again
     * to tidy up unnames their board for no visible reason.
     *
     * So the identity is minted rather than committed and folded into the dot's own
     * transaction. Asserted as an exact count because that is what makes it a
     * constraint rather than an observation.
     */
    const { document, run } = setup();
    note(document, "the quiet one");

    const before = document.durableUpdates;
    run("addVoteToSelection");

    expect(document.durableUpdates).toBe(before + 1);
    expect(document.read().meta.id).toBeTruthy();
    expect(votesFromRecords(document.read().records)).toHaveLength(1);
  });

  it("names the board only once, however many dots follow", () => {
    const { document, run } = setup();
    note(document, "first");

    run("addVoteToSelection");
    const afterFirst = document.read().meta.id;

    note(document, "second");
    run("addVoteToSelection");
    note(document, "third");
    run("addVoteToSelection");

    // A stamp per dot would be a durable write per vote and would put board identity
    // into the undo stack, where it does not belong.
    expect(document.read().meta.id).toBe(afterFirst);
    expect(votesFromRecords(document.read().records)).toHaveLength(3);
  });

  it("records the board's own identity on the collection", () => {
    /*
     * The point of replacing the fixed `"firo-board"`.
     *
     * The obvious version of this test — "the collection has a boardId" — passes
     * against the constant, because `"firo-board"` *is* an id and it *is* on the
     * collection. It asserts that a field exists, not that it means anything. So this
     * asserts the id is *this board's*, by checking it against a second board's.
     */
    const { document, run } = setup();
    note(document, "the quiet one");

    run("addVoteToSelection");

    const collection = document
      .read()
      .collections.find((c) => c.id === VOTE_COLLECTION_ID)!;
    const other = boardId(() => new FiroDoc(new Y.Doc()));

    expect(collection.boardId).toBeTruthy();
    expect(collection.boardId).not.toBe(other);
    expect(collection.boardId).not.toBe("firo-board");
  });

  it("refuses to add to another board's votes, and says why", () => {
    /*
     * The silent merge this prevents.
     *
     * Bob's votes collection, in Alice's document: a merge, a hand-edited file, a
     * future multi-board sidebar. The failure without the check is two sessions' dots
     * in one tally, each participant's vote among strangers', with no error anywhere —
     * a plausible number that does not get noticed.
     */
    const { document, run, toasts } = setup();
    note(document, "the quiet one");

    // Bob's collection, with Bob's identity, landed in this document.
    const bob = boardId(() => new FiroDoc(new Y.Doc()));
    document.commit([
      {
        kind: "createCollection",
        collection: {
          ...voteCollection(bob, "a0"),
          version: 1,
          created: 1000,
          updated: 2000,
        },
      },
    ] as never);

    run("addVoteToSelection");

    // Nothing was added: the board is exactly as it was.
    expect(votesFromRecords(document.read().records)).toHaveLength(0);
    // And it was explained rather than silently ignored, because a vote that does not
    // appear and says nothing is the failure AC-1's "no prompt, no surprise" is about.
    expect(toasts.at(-1)?.message).toContain(bob);
  });

  it("accumulates, one dot per press per target", () => {
    // Outside a round the rule is one dot per ballot per target (ADR-0039
    // section 3), so three presses on three notes are three dots.
    const { document, run } = setup();
    note(document, "one");
    run("addVoteToSelection");
    note(document, "two");
    run("addVoteToSelection");
    note(document, "three");
    run("addVoteToSelection");

    expect(votesFromRecords(document.read().records)).toHaveLength(3);
  });

  it("refuses a second dot on the same target outside a round, and says why", () => {
    // The whole-press refusal: nothing is written, and the facilitator is told
    // how to move the dot instead of wondering why the tally did not change.
    const { document, run, toasts } = setup();
    note(document, "popular");
    run("addVoteToSelection");
    const before = document.durableUpdates;

    run("addVoteToSelection");

    expect(document.durableUpdates).toBe(before);
    expect(lastToast(toasts)).toMatch(/already on/i);
  });

  it("gives every dot a distinct record id and a distinct order", () => {
    // A shared id is one record overwriting another — a tally short by one with
    // nothing on the board to explain it. A shared order key is two rows claiming
    // the same place in a table projection.
    const { document, run } = setup();
    note(document, "busy one");
    run("addVoteToSelection");
    note(document, "busy two");
    run("addVoteToSelection");
    note(document, "busy three");
    run("addVoteToSelection");

    const records = document.read().records;
    expect(new Set(records.map((r) => r.id)).size).toBe(3);
    expect(new Set(records.map((r) => r.order)).size).toBe(3);
  });

  it("orders a new dot after every existing one", () => {
    const { document, run } = setup();
    note(document, "one");
    run("addVoteToSelection");
    const first = document.read().records[0].order;

    note(document, "two");
    run("addVoteToSelection");
    const second = document.read().records.at(-1)!.order;

    expect(second > first).toBe(true);
  });

  it("gives each element in a multi-selection its own dot, its own order, one commit", () => {
    // Five notes selected and Alt+D once is five votes, not one. Collapsing them
    // would make the tally disagree with the thing the facilitator just did.
    //
    // All three properties are here because they are all one implementation away from
    // being wrong: the ids, the order keys, and the transaction. The transaction is
    // the one that only shows up with more than one target — one commit per element
    // would be indistinguishable from the right thing for a single vote, which is
    // how it survived being written.
    const { document, run } = setup();
    const a = note(document, "one");
    const b = note(document, "two");
    select(a, b);
    const before = document.durableUpdates;

    run("addVoteToSelection");

    const votes = votesFromRecords(document.read().records);
    expect(votes.map((vote) => vote.elementId).sort()).toEqual([a, b].sort());

    const records = document.read().records;
    expect(new Set(records.map((r) => r.order)).size).toBe(2);

    // One transaction for the whole press, so one undo step. Two commits would leave
    // an undo stack where the first press of undo removes one of five dots and the
    // facilitator has to press it five times to undo one gesture.
    expect(document.durableUpdates).toBe(before + 1);
  });

  it("is durable — a dot is in the file, unlike a clock", () => {
    const { document, run } = setup();
    note(document, "counted");
    const before = document.durableUpdates;

    run("addVoteToSelection");

    expect(document.durableUpdates).toBe(before + 1);
  });

  it("says so, and writes nothing, on an empty selection", () => {
    // The property the whole file is built around. `predicate` is *not* consulted by
    // `handleKeyDown`, so the shortcut runs and has to explain itself.
    const { document, toasts, run } = setup();

    expect(() => run("addVoteToSelection")).not.toThrow();

    expect(votesFromRecords(document.read().records)).toEqual([]);
    expect(lastToast(toasts)).toMatch(/nothing is selected/i);
  });

  it("does not vote on a deleted element", () => {
    // `perform` is handed `getElementsIncludingDeleted()`, tombstones included. A
    // dot on a tombstone is a vote nobody can see and nobody can take back.
    const { document, toasts, run } = setup();
    const id = note(document, "doomed");
    document.commit([{ kind: "deleteElements", ids: [id] }]);

    // The document keeps the element, marked `isDeleted` — which is exactly what the
    // editor's scene holds after a delete.
    expect(document.element(id)?.isDeleted).toBe(true);

    expect(() => run("addVoteToSelection")).not.toThrow();

    expect(votesFromRecords(document.read().records)).toEqual([]);
    expect(lastToast(toasts)).toMatch(/nothing is selected/i);
  });
});

describe("taking a dot back", () => {
  it("archives the record rather than deleting it", () => {
    // Archived, so an un-archive brings it back. `votesFromRecords` skips archived
    // records, so withdrawal works; deleting instead would make it irreversible for
    // no reason.
    const { document, run } = setup();
    note(document, "regretted");
    run("addVoteToSelection");
    const [before] = document.read().records;

    run("removeVoteFromSelection");

    const [after] = document.read().records;
    expect(after.id).toBe(before.id);
    expect(after.archived).toBe(true);
    expect(votesFromRecords(document.read().records)).toEqual([]);
  });

  it("takes back only the caller's own dots, never anyone else's", () => {
    // `Alt+W` matches the caller's ballot key, so a dot someone else placed on
    // the same note is never theirs to remove — and pressing again, once their
    // own dot is gone, refuses rather than eating a vote that is not theirs.
    const { document, toasts, run } = setup();
    const target = note(document, "contested");
    run("addVoteToSelection");
    foreignVote(document, target, "someone-else");

    run("removeVoteFromSelection");

    const remaining = votesFromRecords(document.read().records);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].voterId).toBe("someone-else");

    run("removeVoteFromSelection");
    expect(lastToast(toasts)).toMatch(/no dot/i);
    expect(votesFromRecords(document.read().records)).toHaveLength(1);
  });

  it("says so, and writes nothing, when there is no dot to take back", () => {
    // `archiveRecords` *silently skips* an absent id. That is deliberate — it is
    // exactly how "remove my vote" would otherwise look like it worked — so the
    // reporting has to be here or a key that did nothing is indistinguishable from a
    // key that worked.
    const { document, toasts, run } = setup();
    note(document, "unvoted");
    const before = document.durableUpdates;

    expect(() => run("removeVoteFromSelection")).not.toThrow();

    expect(document.durableUpdates).toBe(before);
    expect(lastToast(toasts)).toMatch(/no dot/i);
  });

  it("says so on an empty selection", () => {
    const { document, toasts, run } = setup();

    expect(() => run("removeVoteFromSelection")).not.toThrow();

    expect(lastToast(toasts)).toMatch(/nothing is selected/i);
    expect(votesFromRecords(document.read().records)).toEqual([]);
  });
});

describe("reading the tally", () => {
  it("names the leaders, most first", () => {
    // The dots are placed *against* the ranking on purpose: the second note is voted
    // for first and wins. A tally that reported insertion order would look correct
    // whenever the facilitator's first instinct is the right answer, which is
    // exactly when it is hardest to notice being wrong.
    const { document, toasts, run } = setup();
    note(document, "this one");
    run("addVoteToSelection");

    const winner = note(document, "everyone said this");
    run("addVoteToSelection");
    // The two extra dots are other ballots' votes, committed straight into the
    // document: one ballot can never stack a second dot on the same target
    // outside a round (ADR-0039 section 3), so piling them up through the
    // action itself is no longer a way to reach this state.
    foreignVote(document, winner, "someone-else");
    foreignVote(document, winner, "a-third-voice");
    run("readVoteTally");

    const message = lastToast(toasts);
    expect(message).toContain("4 dots on 2 things");
    // Ranked, and by name: a tally saying "3, 1" without saying what is at 3 is not
    // something a facilitator can act on.
    expect(message.indexOf("everyone said this")).toBeLessThan(
      message.indexOf("this one"),
    );
  });

  it("truncates a long note rather than overflowing the toast", () => {
    const { document, toasts, run } = setup();
    note(document, "x".repeat(200));
    run("addVoteToSelection");
    run("readVoteTally");

    expect(lastToast(toasts)).toContain("…");
    expect(lastToast(toasts).length).toBeLessThan(200);
  });

  it("invites the first dot instead of reporting nothing", () => {
    // Nobody did anything wrong, and an unvoted board is what a facilitator sees
    // first. A message carrying the keys needed next is a message; "no votes" is a
    // dead end.
    const { toasts, run } = setup();
    run("readVoteTally");

    expect(lastToast(toasts)).toMatch(/no dots yet/i);
    expect(lastToast(toasts)).toContain("Alt+D");
  });

  it("names a dot whose element has gone, rather than hiding it", () => {
    // Quietly dropping such a vote would make a board that lost an element look
    // like a board nobody voted on.
    const { document, toasts, run } = setup();
    const id = note(document, "temporary");
    run("addVoteToSelection");
    document.commit([{ kind: "deleteElements", ids: [id] }]);

    run("readVoteTally");

    expect(lastToast(toasts)).toMatch(/no longer on the board/i);
  });

  it("writes nothing", () => {
    const { document, toasts, run } = setup();
    note(document, "read only");
    run("addVoteToSelection");
    const before = document.durableUpdates;

    run("readVoteTally");

    expect(document.durableUpdates).toBe(before);
    expect(toasts).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                    */
/* -------------------------------------------------------------------------- */

type FacilitatorChord = Readonly<{
  code: string;
  shift: boolean;
  name: Action["name"];
}>;

/**
 * The bindings this file claims, written out by hand.
 *
 * Written rather than derived from the module's own constants on purpose: if a
 * shortcut is changed and this list is not, every expectation below fails, which is
 * the outcome a changed shortcut should have.
 *
 * An explicit type rather than `as const satisfies …`, because this repo's prettier
 * and eslint parser predate `satisfies` — the same reason `@firo/board`'s
 * `STICKY_NOTE_DEFAULTS` is annotated the long way.
 */
const FACILITATOR_CHORDS: readonly FacilitatorChord[] = [
  { code: "KeyT", shift: false, name: "toggleFacilitatorTimer" },
  { code: "KeyT", shift: true, name: "resetFacilitatorTimer" },
  { code: "KeyM", shift: false, name: "addMinuteToTimer" },
  { code: "KeyP", shift: true, name: "toggleBoardReveal" },
  { code: "KeyD", shift: false, name: "addVoteToSelection" },
  { code: "KeyW", shift: false, name: "removeVoteFromSelection" },
  { code: "KeyL", shift: false, name: "readVoteTally" },
  { code: "KeyM", shift: true, name: "setupFacilitatorTimer" },
  { code: "KeyB", shift: false, name: "bulkCreateStickyNotes" },
];

const keyEvent = (
  init: Partial<KeyboardEvent> & { code: string },
): KeyboardEvent =>
  ({
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    // `key` matters: several inherited `keyTest`s compare `event.key`, not `code`.
    key: init.code.slice(-1).toLowerCase(),
    ...init,
  } as KeyboardEvent);

const matchingNames = (
  actions: readonly Action[],
  event: KeyboardEvent,
): string[] =>
  actions
    .filter((action) => action.keyTest)
    .filter((action) =>
      action.keyTest!(event, {} as never, [], undefined as never),
    )
    .map((action) => action.name);

/**
 * Every inherited action, by the route that actually binds keys.
 *
 * `actions/register.ts` holds whatever the `register()` helper collected — nearly
 * all of them. *Not* undo and redo, which are built per editor from a `History`
 * instance and so cannot be enumerated; both are added by hand below.
 */
const inheritedActions = async () => {
  const register = await import("@firo/editor/actions/register");
  const history = await import("@firo/editor/actions/actionHistory");
  const stub = {} as never;
  return [
    ...register.actions,
    history.createUndoAction(stub),
    history.createRedoAction(stub),
  ];
};

describe("keyboard bindings", () => {
  it("every chord runs exactly one action, and it is the claimed one", async () => {
    // THE collision check. `handleKeyDown` collects every matching `keyTest` and
    // runs an action only when there is exactly one, so a collision does not mean
    // "the newer one wins" — it means nothing happens, with a console warning
    // nobody in the room reads.
    //
    // Measured against the real inherited list rather than a hand-written summary of
    // it, because the summary is what would have missed a collision.
    const { actions } = setup();
    const all = [...(await inheritedActions()), ...actions];

    for (const chord of FACILITATOR_CHORDS) {
      expect(
        matchingNames(
          all,
          keyEvent({ code: chord.code, shiftKey: chord.shift, altKey: true }),
        ),
        chord.name,
      ).toEqual([chord.name]);
    }
  });

  it("claims no chord it did not write down", async () => {
    // The other direction, and the one that catches a `keyTest` which forgets its
    // `shiftKey` check: both shift states of every letter used are swept, and only
    // the facilitator's own actions are counted.
    //
    // Sweeping the inherited actions here would be wrong — `Alt+Shift+D` belongs to
    // `toggleTheme`, which is exactly why "remove a dot" is not that chord.
    const { actions } = setup();
    const codes = [...new Set(FACILITATOR_CHORDS.map((chord) => chord.code))];

    for (const code of codes) {
      for (const shiftKey of [false, true]) {
        expect(
          matchingNames(actions, keyEvent({ code, shiftKey, altKey: true })),
          `Alt+${shiftKey ? "Shift+" : ""}${code}`,
        ).toEqual(
          FACILITATOR_CHORDS.filter(
            (chord) => chord.code === code && chord.shift === shiftKey,
          ).map((chord) => chord.name),
        );
      }
    }
  });

  it("the collision check is looking at the actions it thinks it is", async () => {
    // A guard on the guard. If the import graph stopped reaching some action module,
    // the check above would pass for the wrong reason: it would be comparing seven
    // commands against a list that had quietly shrunk to nothing.
    const names = (await inheritedActions()).map((action) => action.name);

    for (const name of [
      // The `Alt` bindings these chords were chosen around, plus undo and redo,
      // which are built rather than registered and are the two most likely to be
      // missing from a naive enumeration.
      "distributeHorizontally",
      "distributeVertically",
      "objectsSnapMode",
      "zenMode",
      "viewMode",
      "stats",
      "toggleTheme",
      "copyAsSvg",
      "undo",
      "redo",
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it("does not fire without Alt", () => {
    const { actions } = setup();

    for (const chord of FACILITATOR_CHORDS) {
      expect(
        matchingNames(
          actions,
          keyEvent({ code: chord.code, shiftKey: chord.shift }),
        ),
        chord.name,
      ).toEqual([]);
    }
  });

  it("does not fire when Ctrl or Cmd is held", () => {
    // `KEYS.CTRL_OR_CMD` is `metaKey` on macOS and `ctrlKey` elsewhere, and the
    // inherited `Alt` bindings exclude only the one that applies where they were
    // written — so `Ctrl+Alt+T` satisfies `Alt+T` on macOS.
    const { actions } = setup();

    for (const chord of FACILITATOR_CHORDS) {
      for (const modifier of ["ctrlKey", "metaKey"] as const) {
        expect(
          matchingNames(
            actions,
            keyEvent({
              code: chord.code,
              shiftKey: chord.shift,
              altKey: true,
              [modifier]: true,
            }),
          ),
          `${chord.name} ${modifier}`,
        ).toEqual([]);
      }
    }
  });

  it("start/pause and reset are different chords", () => {
    // `Alt+Z` and `Alt+Shift+Z` are the same action upstream, because
    // `actionToggleZenMode` does not check `shiftKey`. Two of these seven would have
    // been the same action for the same reason, and `handleKeyDown` would have run
    // neither.
    const { actions } = setup();

    expect(
      matchingNames(actions, keyEvent({ code: "KeyT", altKey: true })),
    ).toEqual(["toggleFacilitatorTimer"]);
    expect(
      matchingNames(
        actions,
        keyEvent({ code: "KeyT", shiftKey: true, altKey: true }),
      ),
    ).toEqual(["resetFacilitatorTimer"]);
  });

  it("names every chord in the palette's shortcut table", async () => {
    // A shortcut the palette cannot print is a shortcut nobody discovers. This reads
    // the same map `getShortcutFromShortcutName` reads, so a chord added to a
    // `keyTest` and forgotten here fails.
    const shortcuts = await import("@firo/editor/actions/shortcuts");

    for (const chord of FACILITATOR_CHORDS) {
      expect(
        shortcuts.getShortcutFromShortcutName(chord.name as never),
        chord.name,
      ).not.toBe("");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The import graph                                                            */
/* -------------------------------------------------------------------------- */

describe("the module graph", () => {
  it("loads in the order registering it from board.ts produces", async () => {
    // Registering these commands from `board.ts` — which is what
    // `registerFileActions` does, and therefore what this should do too — closes a
    // three-module cycle: `board` → `facilitatorActions` → `facilitator` → `board`.
    // The last edge is `facilitator.ts`'s `export { boardDoc }`, which nothing
    // imports.
    //
    // **What this does and does not prove.** It proves the graph loads and the
    // bindings are functions, which is the failure mode that actually shows up in
    // development. It does *not* prove the cycle is safe: a deliberately introduced
    // `board` → `fileActions` → `board` cycle was added to check, and every test
    // still passed. So the cycle is benign under Vitest's ESM handling today, and
    // benign is not the same as sound — `@firo/doc`'s `ephemeral.ts` refuses to
    // import back across a cycle for exactly the case where the bundler's module
    // order differs from this one's. The fix is one line and belongs to whoever owns
    // `facilitator.ts`: drop the `boardDoc` re-export.
    const board = await import("../board");
    const actions = await import("../facilitatorActions");

    expect(board.boardDoc).toBeTypeOf("function");
    expect(board.refreshBoard).toBeTypeOf("function");
    expect(actions.registerFacilitatorActions).toBeTypeOf("function");
    expect(actions.facilitatorCommandPaletteItems).toBeTypeOf("function");
    // The one a cycle would break: a re-exported binding read through a namespace.
    expect(board.boardDoc()).toBeTypeOf("object");
  });
});

/* -------------------------------------------------------------------------- */
/* The command palette                                                         */
/* -------------------------------------------------------------------------- */

describe("the command palette", () => {
  /**
   * The action behind a palette label.
   *
   * The palette item's own `perform` goes through the action manager, and the
   * manager holds the action object -- so the item and the action are already the
   * same object by the time the palette has been built. Reading it back out of a
   * fresh `facilitatorActions` call is the honest way to get at `keyTest`, which
   * `CommandPaletteItem` does not carry.
   */
  const actionsNamed = (label: string) => {
    const { api } = fakeApi();
    return facilitatorActions(
      api,
      () => new FiroDoc(new Y.Doc()),
      vi.fn(),
    ).find((action) => action.label === label);
  };

  /**
   * A printed shortcut's final segment, as a `KeyboardEvent.code`.
   *
   * Spelled out rather than driven from a key table, because the point is to check
   * what the *map* prints against what `keyTest` matches -- a table here would be a
   * third copy of the same fact, which is the drift this test exists to catch.
   */
  const codeFor = (key: string): string => {
    // Both spellings, because `getShortcutKey` prints "Alt+Enter" for the chord this
    // file writes as `Alt+Return`. Handling only one of them is how the mismatch test
    // below reported a false failure on its first run.
    if (key === "Return" || key === "Enter") {
      return "Enter";
    }
    if (key === "Right") {
      return "ArrowRight";
    }
    if (key === "Left") {
      return "ArrowLeft";
    }
    return `Key${key.toUpperCase()}`;
  };

  const items = (document: FiroDoc): CommandPaletteItem[] => {
    const { api } = fakeApi();
    return facilitatorCommandPaletteItems(api, () => document, vi.fn());
  };

  /**
   * Ask a palette item whether it is available, the way `CommandPalette` does.
   *
   * All four arguments, because the palette passes all four and a predicate that
   * reads `props` receives `undefined` if a caller invents its own arity. `canvasActions`
   * is spread into a bare props object rather than the editor's real `AppProps`,
   * which would drag in a dozen unrelated fields.
   */
  const available = (
    item: CommandPaletteItem,
    elements: unknown[],
    state: AppStateLike,
    canvasActions: Record<string, boolean> = {},
  ): boolean => {
    const predicate = item.predicate;
    if (typeof predicate !== "function") {
      return predicate ?? true;
    }
    return predicate(
      elements as never,
      state as never,
      { UIOptions: { canvasActions } } as never,
      null as never,
    );
  };

  it("offers every facilitator command", () => {
    expect(items(new FiroDoc(new Y.Doc())).map((item) => item.label)).toEqual([
      "Start or pause the timer",
      "Reset the timer",
      "Add a minute to the timer",
      "Hide or reveal the board",
      "Start or stop presenting",
      "Next slide",
      "Previous slide",
      "Open the voting panel",
      "Give the selection a dot",
      "Take back a dot from the selection",
      "Read the vote tally",
      "Set up timer with a chosen duration",
      "Bulk create sticky notes",
    ]);
  });

  it("reaches the action through the action manager, so the two cannot drift", () => {
    // The palette's own `actionToCommand` goes through `executeAction` for a
    // reason: it is the only path that keeps the editor's "is interaction enabled"
    // and "is this blocked" rules in force.
    const [first] = items(new FiroDoc(new Y.Doc()));
    const executeAction = vi.fn();

    first.perform({
      actionManager: { executeAction } as never,
      event: new KeyboardEvent("keydown"),
    });

    expect(executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "toggleFacilitatorTimer" }),
      "commandPalette",
    );
  });

  it("greys out a vote command when nothing is selected", () => {
    // `predicate` is the palette's availability switch. It must be false on an empty
    // selection, so the entry is visible-but-disabled rather than throwing when
    // chosen.
    const all = items(new FiroDoc(new Y.Doc()));
    const addVote = all.find(
      (item) => item.label === "Give the selection a dot",
    )!;

    expect(available(addVote, [], appState())).toBe(false);
    expect(
      available(addVote, [{ id: "note-1" } as never], {
        ...appState(),
        selectedElementIds: { "note-1": true },
      }),
    ).toBe(true);
  });

  it("greys out a command the host has switched off", () => {
    /*
     * The host's disable flag has to reach the palette, not just the keyboard.
     *
     * This assertion exists because it was violated when the flag was first
     * implemented: the palette item forwards `action.predicate` by reference, and
     * that predicate had begun reading the third argument, `props` -- which this test
     * was not passing. `props` arrived `undefined` and the palette predicate threw
     * on `props.UIOptions`. In the app the palette calls `isCommandAvailable` during
     * render for every command, so a throw there takes out the whole palette, not one
     * entry.
     *
     * `available` therefore calls it with the four arguments `CommandPalette` really
     * passes (`CommandPalette.tsx`, `isCommandAvailable`), rather than the two that
     * happened to work while every predicate ignored the rest.
     */
    const all = items(new FiroDoc(new Y.Doc()));
    const timer = all.find(
      (item) => item.label === "Start or pause the timer",
    )!;

    expect(available(timer, [], appState(), {})).toBe(true);
    expect(
      available(timer, [], appState(), { toggleFacilitatorTimer: false }),
    ).toBe(false);
  });

  it("carries the keyboard shortcut it duplicates", () => {
    // One entry, two ways in, and the two must be the same command. If the palette
    // entry were built from a second list of strings it would drift, and the drift
    // would only show as a shortcut that prints but does nothing.
    const all = items(new FiroDoc(new Y.Doc()));

    expect(all.every((item) => item.category === "Facilitation")).toBe(true);

    /*
     * Every entry, not one.
     *
     * This asserted a single item -- the vote command -- and so passed for every
     * other command that had been added to `shortcuts.ts` without a matching
     * `keyTest`, or the other way round. The three presentation commands were added
     * with exactly that gap: registered, wired, reachable by keyboard, and printing
     * no shortcut in the palette, which is the "a shortcut nobody discovers" case
     * the field's own comment describes. One item is not a check on a list.
     */
    const missing = all
      .filter((item) => !item.shortcut)
      // The panel opener prints no chord because it has none (ADR-0039: no
      // new single-key shortcut; the palette is the keyboard path).
      .filter((item) => item.label !== "Open the voting panel")
      .map((i) => i.label);
    expect(missing).toEqual([]);
  });

  it("prints the same chord the editor matches", () => {
    /*
     * The two halves, checked against each other rather than against a literal.
     *
     * `shortcutMap` is what the palette prints and `keyTest` is what the editor
     * matches, so a literal here would just be a third copy to drift. Instead the
     * printed chord is turned back into a key event and offered to the action's own
     * `keyTest`: if the two disagree, the match fails here.
     */
    const all = items(new FiroDoc(new Y.Doc()));
    const mismatched: string[] = [];

    for (const item of all) {
      const printed = item.shortcut;
      if (!printed) {
        continue;
      }
      // "Alt+Shift+T" -> modifiers plus a code.
      const parts = printed.split("+");
      const key = parts[parts.length - 1];
      const event = {
        altKey: printed.includes("Alt"),
        shiftKey: printed.includes("Shift"),
        ctrlKey: false,
        metaKey: false,
        code: codeFor(key),
      };
      const action = actionsNamed(item.label);
      if (
        !action?.keyTest?.(
          event as never,
          {} as never,
          [] as never,
          null as never,
        )
      ) {
        mismatched.push(`${item.label} prints ${printed}`);
      }
    }

    expect(mismatched).toEqual([]);
  });
});
