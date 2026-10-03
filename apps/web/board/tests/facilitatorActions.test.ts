import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { createStickyNote } from "@firo/board";
import { randomId, reseed } from "@firo/common";
import { FiroDoc } from "@firo/doc";
import {
  formatRemaining,
  remainingMs,
  votesFromRecords,
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
      "addVoteToSelection",
      "removeVoteFromSelection",
      "readVoteTally",
    ]);
  });

  it("gives every command a keyTest and palette keywords", () => {
    // A command with no `keyTest` is reachable only from a menu, which is what
    // AC-8 rules out. A command with no keywords is in the palette and unfindable
    // in it.
    const { actions } = setup();
    for (const action of actions) {
      expect(typeof action.keyTest, action.name).toBe("function");
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

  it("accumulates, one dot per press", () => {
    // Anonymous dots add up. A constant voter *name* would make `placeVote` move a
    // single dot instead, so five presses would leave one — and the tally would be a
    // lie nobody could see the cause of.
    const { document, run } = setup();
    note(document, "popular");

    run("addVoteToSelection");
    run("addVoteToSelection");
    run("addVoteToSelection");

    expect(votesFromRecords(document.read().records)).toHaveLength(3);
  });

  it("gives every dot a distinct record id and a distinct order", () => {
    // A shared id is one record overwriting another — a tally short by one with
    // nothing on the board to explain it. A shared order key is two rows claiming
    // the same place in a table projection.
    const { document, run } = setup();
    note(document, "busy");

    run("addVoteToSelection");
    run("addVoteToSelection");
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

  it("takes back one dot at a time", () => {
    // "Take back a dot", singular. Anonymous dots are indistinguishable from each
    // other, so removing all of them would throw away other people's votes.
    const { document, run } = setup();
    note(document, "triple");
    run("addVoteToSelection");
    run("addVoteToSelection");
    run("addVoteToSelection");

    run("removeVoteFromSelection");
    expect(votesFromRecords(document.read().records)).toHaveLength(2);

    run("removeVoteFromSelection");
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

    note(document, "everyone said this");
    run("addVoteToSelection");
    run("addVoteToSelection");
    run("addVoteToSelection");
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
  const items = (document: FiroDoc): CommandPaletteItem[] => {
    const { api } = fakeApi();
    return facilitatorCommandPaletteItems(api, () => document, vi.fn());
  };

  it("offers every facilitator command", () => {
    expect(items(new FiroDoc(new Y.Doc())).map((item) => item.label)).toEqual([
      "Start or pause the timer",
      "Reset the timer",
      "Add a minute to the timer",
      "Hide or reveal the board",
      "Give the selection a dot",
      "Take back a dot from the selection",
      "Read the vote tally",
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
    const predicate = addVote.predicate as unknown as (
      elements: unknown[],
      appState: unknown,
    ) => boolean;

    expect(predicate([], appState())).toBe(false);
    expect(
      predicate([{ id: "note-1" } as never], {
        selectedElementIds: { "note-1": true },
      }),
    ).toBe(true);
  });

  it("carries the keyboard shortcut it duplicates", () => {
    // One entry, two ways in, and the two must be the same command. If the palette
    // entry were built from a second list of strings it would drift, and the drift
    // would only show as a shortcut that prints but does nothing.
    const all = items(new FiroDoc(new Y.Doc()));
    const addVote = all.find(
      (item) => item.label === "Give the selection a dot",
    )!;

    expect(addVote.shortcut).toBeTruthy();
    expect(addVote.category).toBe("Facilitation");
  });
});
