/**
 * The facilitator's commands, in the editor's action system.
 *
 * ## Why actions and not more buttons
 *
 * The three reasons [`fileActions.ts`](./fileActions.ts) gives, plus one that only
 * matters here:
 *
 * - `excalidrawAPI.registerAction` is the supported extension point, and it puts
 *   these where "Export image" already is. The alternative is a second, hand-wired
 *   path to the same three functions.
 * - The keyboard comes for free. `ActionManager.handleKeyDown` walks every
 *   registered action's `keyTest`, and AC-8 — "a full workshop on the keyboard
 *   alone" — is a gate, not a goal.
 * - `FacilitatorBar` renders a clock and a state and *no controls*, on the
 *   argument that a chip with four buttons would be a second, mouse-only path to
 *   the same three things and the two would drift. This file is the rest of that
 *   argument.
 *
 * ## The one thing the action system does *not* do for free
 *
 * A registered action does **not** appear in the command palette.
 * `CommandPalette.tsx` builds `commandsFromActions` from a hand-written list of
 * `actionManager.actions.<name>`, which is why `exportFiroFile` is in the menu and
 * not in the palette. The palette's documented role is "the accessibility
 * backstop" (Phase 3 §3.6), so a command that stops at `registerAction` is a
 * command a screen-reader user cannot find. `facilitatorCommandPaletteItems` below
 * hands the app the palette descriptors, built from the same action objects, so the
 * keyboard and the palette cannot drift apart.
 *
 * Labels here are literals, and must stay literals *and* must not be routed
 * through `t()`: `t()` throws on an unknown key outside production, and the
 * palette's `getActionLabel` calls it on every action label it is handed. That is
 * the same reasoning `fileActions.ts` gives for its own literal labels, with the
 * consequence spelled out.
 *
 * ## Why every `perform` here refuses rather than throws
 *
 * A shortcut is a key that can be pressed with nothing selected. `handleKeyDown`
 * wraps nothing around `perform`, so an exception here is an unhandled error in a
 * keydown handler with no toast — the failure `fileActions.ts`'s `complain`
 * exists to prevent, in its purest form: the key appears to have done nothing and
 * the facilitator presses it again, harder. So the vote actions check their target
 * first and report, and every commit is wrapped.
 *
 * ## One cycle, named
 *
 * `./facilitator` is imported for its behaviour, and `./facilitator` re-exports
 * `boardDoc` from `./board`. So registering this from `board.ts` — which is where
 * `registerFileActions` is registered from, and therefore where this should be too —
 * closes `board` → `facilitatorActions` → `facilitator` → `board`.
 *
 * It is benign today, and "benign" is not "sound": the offending edge is a re-export
 * of one function that nothing imports, so it can be deleted. That is a change to a
 * file this module does not own, so it is named here rather than made.
 */

import { randomId } from "@firo/common";
import { getShortcutFromShortcutName } from "@firo/editor/actions/shortcuts";
import { getSelectedElements } from "@firo/editor/scene";
import {
  isRunning,
  leaders,
  placeVote,
  removeVote,
  votesFromRecords,
  VOTE_COLLECTION_ID,
} from "@firo/facilitation";
import { generateKeyBetween } from "@firo/fractional-indexing";
import { isFractionalIndex } from "@firo/schema";

import type { FiroDoc } from "@firo/doc";
import type { ExcalidrawElement } from "@firo/element/types";
import type { ShortcutName } from "@firo/editor/actions/shortcuts";
import type { Action, ActionResult } from "@firo/editor/actions/types";
import type { CommandPaletteItem } from "@firo/editor/components/CommandPalette/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@firo/editor/types";
import type { Vote } from "@firo/facilitation";
import type { FiroRecord } from "@firo/schema";

import {
  getTimer,
  getVotes,
  timerControls,
  toggleRevealMode,
} from "./facilitator";
import { complain } from "./fileActions";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/* -------------------------------------------------------------------------- */
/* Shortcuts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `KeyboardEvent.code` for the letters these commands use.
 *
 * Local rather than added to `CODES`, which is inherited and holds only the
 * letters upstream happened to name. `code` rather than `key` because these are
 * `Alt` chords: macOS *produces* a character for `Alt+T` — "‡" on a US layout —
 * so `event.key` is the wrong question and matching on it would make every one of
 * these shortcuts work on a US layout and die on a French one.
 */
const ALT_CODES = {
  timer: "KeyT",
  minute: "KeyM",
  privateMode: "KeyP",
  dot: "KeyD",
  withdraw: "KeyW",
  leaders: "KeyL",
} as const;

/**
 * The event `keyTest` is handed.
 *
 * `ActionManager` calls `handleKeyDown` from React's synthetic handler *and* from a
 * window listener, so a `keyTest` sees both shapes. Annotated as the union rather
 * than widened to `any` — every field used below (`altKey`, `shiftKey`, `ctrlKey`,
 * `metaKey`, `code`) is on both, which is the whole reason the fields were chosen.
 */
type KeyEvent = ReactKeyboardEvent | KeyboardEvent;

/**
 * No command modifier, on either platform.
 *
 * `KEYS.CTRL_OR_CMD` is `metaKey` on macOS and `ctrlKey` elsewhere, and the
 * inherited `Alt` bindings exclude only the one that applies where they were
 * written — so `Ctrl+Alt+T` satisfies `Alt+T` on macOS. Excluding both is what
 * makes "these are `Alt` and only `Alt`" true everywhere, and it is the
 * difference between a shortcut and a shortcut that also fires inside somebody's
 * browser gesture.
 */
const noCommandModifier = (event: KeyEvent): boolean =>
  !event.ctrlKey && !event.metaKey;

/**
 * An `Alt` chord, with or without `Shift`.
 *
 * A factory rather than seven near-identical `keyTest` bodies, and the reason is a
 * mistake this file is one copy away from repeating: `Alt+Z` and `Alt+Shift+Z` are
 * the *same* action upstream, because `actionToggleZenMode`'s `keyTest` does not
 * look at `shiftKey`. Written out longhand, one of these seven would forget the
 * check, two actions would match one keystroke, and `handleKeyDown` answers that
 * by running **neither** — with a `console.warn` nobody in the room will see.
 */
const altChord =
  (code: string, shift: boolean) =>
  (event: KeyEvent): boolean =>
    event.altKey &&
    event.shiftKey === shift &&
    noCommandModifier(event) &&
    event.code === code;

/**
 * The names a host may switch off.
 *
 * Spelled out rather than derived with a nested `NonNullable`, because
 * `canvasActions` is itself optional and `keyof` over that is `never` -- a type
 * error that reads as though the names had not been added at all.
 */
type FacilitatorToggleName =
  | "toggleFacilitatorTimer"
  | "resetFacilitatorTimer"
  | "addMinuteToTimer"
  | "toggleBoardReveal"
  | "addVoteToSelection"
  | "removeVoteFromSelection"
  | "readVoteTally";

/*
 * Whether the host has switched this command off.
 *
 * ## Why a `predicate` and not `handleKeyDown`'s `name in canvasActions` check
 *
 * `handleKeyDown` does gate on that list, so listing the names in `CanvasActions`
 * would have been enough for the *chord*. But `isActionEnabled` — which decides
 * whether the menu renders the item at all — asks `action.predicate` instead, and
 * that is the API a host-facing toggle is meant to go through. `actionToggleTheme`
 * has always done it this way.
 *
 * Going through `predicate` therefore gets all three surfaces at once: the chord, the
 * menu item, and anything else that asks whether the action is available. Relying on
 * the chord alone would have left the menu entry live for a command the keyboard
 * could not reach, which is a worse inconsistency than either behaviour alone.
 *
 * ## Omission means enabled
 *
 * `!== false` rather than a truthiness test, so a host that lists none of these is
 * unaffected. That is what makes adding the names to `CanvasActions`
 * backwards-compatible. The cost is the obvious one, named here because it is a
 * trap rather than a subtlety: a typo in a host's configuration disables nothing and
 * reports no error.
 */
const enabledUnless =
  <T>(name: FacilitatorToggleName) =>
  (
    _elements: readonly T[],
    _appState: unknown,
    props: ExcalidrawProps,
  ): boolean =>
    props.UIOptions?.canvasActions?.[name] !== false;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every vote these commands place is anonymous, and the reason is not privacy.
 *
 * `phase-5-facilitation.md` §5.1 says it outright: *"In single-player v1,
 * 'anonymous' is meaningless. Say so in the UI rather than offering a mode that
 * does not work."* So there is no toggle and nothing to type — an empty `voterId`
 * is the whole mechanism, and the labels say "dot" rather than "your vote".
 *
 * A constant *name* would be worse than nothing, and `placeVote` is where that
 * breaks. For a non-empty `voterId` it **moves** that voter's dot instead of adding
 * one; that is right for a person, who has exactly one dot. A facilitator casting
 * five dots by hand has five, and a fixed name would archive four of them on the
 * fifth press — the board would show a single dot and the tally would be a lie.
 * Anonymous dots accumulate, and `findVote` matches only the *first* anonymous dot
 * on an element, which is precisely "take one of mine back".
 *
 * This becomes wrong the moment a second participant exists and there is an
 * identity to record, which is the v2 the plan defers it to.
 */
const ANONYMOUS_VOTER = "";

/**
 * `Collection.boardId` for the votes collection.
 *
 * `voteCollection` takes the board id as a parameter so that "a board which
 * exported its votes must not collide with another board's on import" is a
 * decision the caller cannot miss. v1 has no board identity — one board per tab,
 * with nothing in `meta` naming it — so this is a fixed string, and *fixed* is the
 * right failure: two boards' votes meeting in one document is then a `boardId`
 * conflict someone can see, rather than a silent merge. It becomes the real board
 * id when boards are addressable, which is Phase 7.
 */
const VOTE_BOARD_ID = "firo-board";

/** How many of the leaders a tally report names. */
const REPORT_LIMIT = 3;

/**
 * How much of a thing's own words a toast will carry.
 *
 * A toast is a small box with a timer on it, and someone reading one across a room
 * does not need a whole paragraph off a sticky note.
 */
const LABEL_LIMIT = 28;

/** The palette's category. See the note on ordering in `toPaletteItem`. */
const FACILITATOR_CATEGORY = "Facilitation";

/* -------------------------------------------------------------------------- */
/* Reading the document                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every vote on the board, through the facilitator's own seam.
 *
 * Through `getVotes` rather than `votesFromRecords(document.read().records)` inline,
 * so there is exactly one place that knows how a board's facilitator state is read
 * — the same argument `facilitator.ts` makes for its cache.
 */
const votesOn = (getDocument: () => FiroDoc): Vote[] =>
  getVotes(getDocument, votesFromRecords);

/**
 * `count` order keys for records being added to the votes collection, ascending.
 *
 * Each is one past the greatest order already used, by **code unit**. Not
 * `localeCompare`, for the reason `leaders` gives: `localeCompare` takes the
 * runtime's default locale, so two clients in one room would derive different keys
 * from the same record store. A fractional index is defined by code-unit order, so
 * `<` compares the thing itself rather than an approximation of it.
 *
 * Three details, each of which is a bug the obvious version has:
 *
 * - **Archived records are included.** Their order key is spent. Reusing one is how
 *   a table projection ends up with two rows that claim the same place.
 * - **Corrupt keys are skipped, not repaired.** `generateKeyBetween` *throws* on an
 *   invalid key, so one record whose `order` came out of a hand-edited file would
 *   turn a keyboard shortcut into a stack trace. Skipping it still yields a key
 *   that is valid and sorts after every good one, which is the honest degradation
 *   — and the same reason `voteFromRecord` skips a record it cannot read rather
 *   than taking the whole tally down.
 * - **They are distinct from each other.** Dots placed on a multi-selection in one
 *   press are several votes, and two records sharing an order key is exactly the
 *   ambiguity this exists to avoid.
 */
const voteOrders = (
  records: readonly FiroRecord[],
  count: number,
): string[] => {
  const keys: string[] = [];
  let last = records
    .filter((record) => record.collectionId === VOTE_COLLECTION_ID)
    .map((record) => record.order)
    .filter(isFractionalIndex)
    .reduce((max, key) => (key > max ? key : max), "");

  for (let i = 0; i < count; i += 1) {
    // `generateKeyBetween(null, null)` is `"a0"`, which is also the order
    // `voteCollection` gives itself — so a first record sorts after the collection
    // holding it rather than colliding with it.
    last = generateKeyBetween(last === "" ? null : last, null);
    keys.push(last);
  }

  return keys;
};

/* -------------------------------------------------------------------------- */
/* The selection                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The ids of the selected, still-present elements.
 *
 * ## Why the action's own arguments and not `api.getAppState()`
 *
 * `perform(elements, appState, …)` receives the state the action was *judged*
 * against. `ActionManager` reads `this.getAppState()` once and hands that same
 * snapshot to `keyTest`, to `predicate` and to `perform`. `api.getAppState()` reads
 * it a second time, and a `setState` from anywhere in the editor can land in
 * between — at which point a shortcut votes on a selection that is no longer there,
 * or refuses for one that is. Reading the arguments means "is this enabled" and
 * "what does it act on" are decided from a single snapshot, and it is what lets
 * these commands be tested with no `App` at all.
 *
 * `getSelectedElements` rather than reading `selectedElementIds` directly, because
 * it is the one function that answers "what is selected, and is it still here": it
 * drops tombstones, which `getElementsIncludingDeleted()` hands to `perform` and
 * which must never become a vote target. A vote on a tombstone is a dot nobody can
 * see and nobody can take back.
 */
const selectedIds = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
): string[] =>
  getSelectedElements(elements, appState).map((element) => element.id);

/* -------------------------------------------------------------------------- */
/* Announcing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Say something that is a result rather than a refusal.
 *
 * `complain` is right for "there was nothing to act on" and wrong here: a tally is
 * an answer, and it should not print a warning to the console. The toast is the
 * same `setToast` call for the same reason — a facilitator on the keyboard has no
 * other way to read either.
 */
const announce = (
  api: ExcalidrawImperativeAPI,
  message: string,
  duration: number,
): void => {
  api.setToast?.({ message, closable: true, duration });
};

/** Shortened to fit a toast, with the shortening visible. */
const ellipsize = (text: string): string =>
  text.length <= LABEL_LIMIT ? text : `${text.slice(0, LABEL_LIMIT - 1)}…`;

/**
 * What to call a thing in a tally.
 *
 * Read from the *document*, because that is what a vote points at. The editor's
 * scene carries a note's words on a derived label element with an id of its own,
 * and finding that needs the `App` instance — which a `perform` deliberately does
 * not have. `doc.element(id)` is one node, so this stays cheap.
 *
 * Only a note's own string is used. Every other element type carries
 * `text?: ProseMirrorDoc`, and turning that into a string means
 * `parseProseMirrorDoc`, which **throws** on a document it does not recognise —
 * trading "perform must not throw" for a label that cannot appear in v1, where the
 * only votable things are notes.
 *
 * A vote pointing at something that has gone says so, and `element()` returning a
 * tombstone counts as gone — that is the same rule `selectedIds` applies, and for
 * the same reason: the canvas does not draw it, so calling it a note is a lie. Quietly
 * dropping such a vote from the tally would make a board that lost an element look
 * like a board nobody ever voted on.
 *
 * Whether a vote on a deleted element should have been *archived* along with it is
 * Phase 5.1's edge case, and it is deliberately not decided here — only reported.
 */
const describe = (document: FiroDoc, elementId: string): string => {
  const element = document.element(elementId);
  if (!element || element.isDeleted) {
    return "something no longer on the board";
  }
  if (element.type === "stickynote") {
    const text = element.text.trim();
    return text === "" ? "an empty note" : `“${ellipsize(text)}”`;
  }
  return element.type;
};

/* -------------------------------------------------------------------------- */
/* The actions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The facilitator's actions, built for one editor.
 *
 * Exported as the list rather than only as the registration, because the palette
 * descriptors are *derived from these objects* — including `perform`, which the
 * palette reaches through `actionManager.executeAction` exactly as the palette
 * reaches every inherited action. Two implementations of "add a dot" would be two
 * things to keep in step, and the one that drifts is the one nobody clicks.
 *
 * @param refresh - repaint the canvas. Not optional in practice: the reveal toggle
 * is ephemeral, so nothing else repaints when it flips. See `toggleRevealMode`.
 */
export const facilitatorActions = (
  api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
  refresh: () => void,
): Action[] => {
  const timer = timerControls(getDocument);

  /**
   * Run something that touches the document, and never throw at the keyboard.
   *
   * The belt to each `perform`'s own checks. A `keydown` handler with an unhandled
   * rejection in it produces no toast, no console output anyone reads, and no
   * visible change — so "the vote did not save" and "the app is broken" look the
   * same to the person holding the room.
   */
  const run = (work: () => void): ActionResult => {
    try {
      work();
    } catch (error) {
      complain(
        api,
        `That did not work: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return false;
  };

  return [
    {
      name: "toggleFacilitatorTimer",
      label: "Start or pause the timer",
      keywords: ["timer", "clock", "start", "pause", "facilitate", "countdown"],
      trackEvent: { category: "facilitation", action: "toggleTimer" },
      /*
       * Allowed in view mode: a facilitator presenting a board must be able to
       * start the clock without leaving presentation to do it.
       */
      viewMode: true,
      predicate: enabledUnless("toggleFacilitatorTimer"),
      keyTest: altChord(ALT_CODES.timer, false),

      perform: (): ActionResult =>
        run(() => {
          /*
           * Three cases, and the middle one is why this is a single action.
           *
           * A facilitator thinks "run the clock", not "transition the state
           * machine", and separate start/pause/resume actions would make them
           * remember which state they are in — the one thing they cannot see on the
           * board. `null` means no clock has ever existed, and `timerControls`
           * substitutes the default five minutes for it; a clock that is not running
           * is paused, and resumes from where it stopped; a clock that *is* running
           * pauses.
           */
          const current = getTimer(getDocument);
          if (current !== null && isRunning(current)) {
            timer.pause();
          } else {
            timer.start();
          }
        }),
    },

    {
      name: "resetFacilitatorTimer",
      label: "Reset the timer",
      keywords: ["timer", "clock", "reset", "restart", "zero"],
      trackEvent: { category: "facilitation", action: "resetTimer" },
      viewMode: true,
      /*
       * `Shift` is part of the binding rather than an afterthought. `Alt+T` is
       * start/pause and `Alt+Shift+T` is reset; if the shift check were dropped
       * they would be one action reachable two ways, which is what `Alt+Z` already
       * is upstream and nobody chose.
       */
      predicate: enabledUnless("resetFacilitatorTimer"),
      keyTest: altChord(ALT_CODES.timer, true),

      perform: (): ActionResult =>
        run(() => {
          /*
           * Reset outright rather than pause-then-reset, because a paused-but-still
           * anchored clock reads 5:00 and then falls, and the falling is invisible
           * on a projector. `resetTimer` clears the anchor in one step.
           */
          timer.reset();
        }),
    },

    {
      name: "addMinuteToTimer",
      label: "Add a minute to the timer",
      keywords: ["timer", "clock", "minute", "longer", "extend", "more time"],
      trackEvent: { category: "facilitation", action: "addMinute" },
      viewMode: true,
      predicate: enabledUnless("addMinuteToTimer"),
      keyTest: altChord(ALT_CODES.minute, false),

      perform: (): ActionResult =>
        run(() => {
          /*
           * No argument, and that is load-bearing. `timerControls.addMinute` takes
           * a *delta*; a `now` where a delta is expected adds sixty thousand
           * milliseconds to a date near the epoch, which is a plausible-looking and
           * completely wrong duration. `facilitator.ts` records that bug.
           */
          timer.addMinute();
        }),
    },

    {
      name: "toggleBoardReveal",
      label: "Hide or reveal the board",
      keywords: ["reveal", "private", "hide", "brainstorm", "secret"],
      trackEvent: { category: "facilitation", action: "toggleReveal" },
      viewMode: true,
      /*
       * `Alt+Shift+P`, and not the letter anyone would guess.
       *
       * `Alt+R` is `viewMode` — the editor's own "stop me editing this board" — and
       * nobody holding a room should have to tell view mode from reveal. `P` for
       * private is the mnemonic, so it takes the shifted chord and leaves `Alt+P`
       * for the reset above.
       */
      predicate: enabledUnless("toggleBoardReveal"),
      keyTest: altChord(ALT_CODES.privateMode, true),

      perform: (): ActionResult =>
        run(() => {
          /*
           * `refresh` is the whole reason this command is more than a write. The
           * toggle is ephemeral, so flipping it commits nothing, `FiroDoc.subscribe`
           * never fires and `BoardSync` never repaints: without the call the canvas
           * keeps showing the notes it was supposed to hide, which reads as the
           * feature working because the facilitator's own UI did change.
           */
          toggleRevealMode(getDocument, refresh);
        }),
    },

    {
      name: "addVoteToSelection",
      label: "Give the selection a dot",
      keywords: ["vote", "dot", "ballot", "favourites", "rank", "priority"],
      trackEvent: { category: "facilitation", action: "addVote" },
      /*
       * `Alt+D`, for "dot". `Alt+V` is `distributeVertically`, and `Alt+Shift+V` is
       * too — that `keyTest` does not check `shiftKey` — so the obvious letter for
       * "vote" cannot be had. The symmetric `Alt+Shift+D` is `toggleTheme`, which is
       * why remove-vote is a different letter rather than a different modifier.
       */
      keyTest: altChord(ALT_CODES.dot, false),
      /*
       * The palette's "grey this out" switch, and deliberately *not* a guard
       * inside `perform`: `predicate` is not consulted by `handleKeyDown`, so the
       * shortcut still runs on an empty selection and explains itself. A predicate
       * that also blocked the keyboard would make the shortcut silently do nothing,
       * which is the failure AC-8 exists to prevent.
       */
      predicate: (elements, appState, props) =>
        enabledUnless("addVoteToSelection")(elements, appState, props) &&
        selectedIds(elements, appState).length > 0,

      perform: (elements, appState): ActionResult =>
        run(() => {
          const targets = selectedIds(elements, appState);
          if (targets.length === 0) {
            complain(
              api,
              "Nothing is selected, so there is nothing to give a dot. Click a " +
                "note, or press Tab to walk the board, then try again.",
            );
            return;
          }

          const document = getDocument();
          const snapshot = document.read();
          const orders = voteOrders(snapshot.records, targets.length);
          const hasCollection = snapshot.collections.some(
            (collection) => collection.id === VOTE_COLLECTION_ID,
          );

          /*
           * One `commit`, so one undo step.
           *
           * The first vote creates the collection *and* the record. Split across two
           * commits they would be two undos, and history stops at a real change —
           * so one press of undo would leave a votes collection containing nothing,
           * and the second would be needed to remove a thing nobody can see.
           *
           * Every selected element gets its own dot. A facilitator putting five dots
           * on a five-note selection is casting five votes; collapsing them into one
           * would make the tally disagree with the thing they just did.
           */
          document.commit(
            targets.flatMap((elementId, index) =>
              placeVote(
                votesFromRecords(snapshot.records),
                { elementId, voterId: ANONYMOUS_VOTER, placedAt: Date.now() },
                {
                  /*
                   * `randomId`, not a counter and not a timestamp. Two dots placed in
                   * the same millisecond must not share an id, and a colliding id is
                   * one record overwriting another — a tally short by one, with
                   * nothing on the board to explain it.
                   */
                  record: randomId(),
                  order: orders[index],
                  board: VOTE_BOARD_ID,
                },
                hasCollection,
              ),
            ),
          );

          /*
           * No `refresh()` here. A vote is a record, nothing on the canvas renders
           * records yet, and a repaint would be a full document read plus a scene
           * rewrite for no pixels. When the dot badge lands this is the one line
           * that has to change.
           */
        }),
    },

    {
      name: "removeVoteFromSelection",
      label: "Take back a dot from the selection",
      keywords: ["vote", "dot", "unvote", "withdraw", "undo", "retract"],
      trackEvent: { category: "facilitation", action: "removeVote" },
      /*
       * `Alt+W`, for "withdraw". `Alt+Shift+D` would be the symmetric answer and
       * `toggleTheme` already has it; `Alt+D` is add.
       */
      keyTest: altChord(ALT_CODES.withdraw, false),
      predicate: (elements, appState, props) =>
        enabledUnless("removeVoteFromSelection")(elements, appState, props) &&
        selectedIds(elements, appState).length > 0,

      perform: (elements, appState): ActionResult =>
        run(() => {
          const targets = selectedIds(elements, appState);
          if (targets.length === 0) {
            complain(
              api,
              "Nothing is selected, so there is no dot to take back. Click a note, " +
                "or press Tab to walk the board, then try again.",
            );
            return;
          }

          const document = getDocument();
          const votes = votesFromRecords(document.read().records);

          /*
           * One commit for the whole selection, and it is empty when nothing
           * matches: `removeVote` returns no mutation rather than archiving an id it
           * did not find. That is right on its side — `archiveRecords` silently skips
           * an absent id, which is precisely how "remove my vote" would have looked
           * like it worked — so the *reporting* is here instead. A key that did
           * nothing has to say so.
           *
           * For an anonymous voter `findVote` matches the first dot on the element,
           * so one press takes back one of several rather than all of them. That is
           * the intended reading of "take back a dot", and it is the only reading
           * available while anonymous dots are indistinguishable from each other.
           */
          const mutations = targets.flatMap((elementId) =>
            removeVote(votes, elementId, ANONYMOUS_VOTER),
          );

          if (mutations.length === 0) {
            complain(
              api,
              "There is no dot on what is selected to take back. Give it one with " +
                "Alt+D first.",
            );
            return;
          }

          document.commit(mutations);
        }),
    },

    {
      name: "readVoteTally",
      label: "Read the vote tally",
      keywords: ["tally", "votes", "results", "leaders", "winner", "count"],
      trackEvent: { category: "facilitation", action: "readTally" },
      viewMode: true,
      predicate: enabledUnless("readVoteTally"),
      keyTest: altChord(ALT_CODES.leaders, false),

      perform: (): ActionResult =>
        run(() => {
          const document = getDocument();
          const votes = votesOn(getDocument);

          if (votes.length === 0) {
            /*
             * Not a `complain`. Nobody did anything wrong, and an unvoted board is
             * what a facilitator sees first. It carries the two keys needed next,
             * which is the difference between a message and a dead end.
             */
            announce(
              api,
              "No dots yet. Select something — click a note, or press Tab — and " +
                "then Alt+D gives it a dot.",
              8000,
            );
            return;
          }

          /*
           * `leaders`, not a sort written here: it breaks ties on id by code unit,
           * so two clients in one room name the same top three. A tally that
           * flickered between two level options on a projector reads as a bug in the
           * tool, which it would be.
           */
          const counts = new Map<string, number>();
          for (const vote of votes) {
            counts.set(vote.elementId, (counts.get(vote.elementId) ?? 0) + 1);
          }

          const summary = leaders(votes, REPORT_LIMIT)
            .map((elementId, index) => {
              const dots = counts.get(elementId) ?? 0;
              return `${index + 1}. ${describe(document, elementId)} (${dots})`;
            })
            .join("  ·  ");

          announce(
            api,
            `${votes.length} dot${votes.length === 1 ? "" : "s"} on ` +
              `${counts.size} thing${counts.size === 1 ? "" : "s"}. ${summary}`,
            10_000,
          );
        }),
    },
  ];
};

/**
 * Register the facilitator's commands with the editor.
 *
 * Call once per editor, for the reason `board.ts` spells out at length: there is no
 * supported way to *remove* an action, so a second registration leaves two
 * identically-named entries in the keyboard map, and `handleKeyDown` then refuses
 * to run **either** of them because two actions matched. A `WeakSet` per editor,
 * not a boolean, because React double-invokes effects in development and a boolean
 * leaves the editor you are actually looking at with no commands at all.
 */
export const registerFacilitatorActions = (
  api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
  refresh: () => void,
): void => {
  for (const action of facilitatorActions(api, getDocument, refresh)) {
    api.registerAction(action);
  }
};

/* -------------------------------------------------------------------------- */
/* The command palette                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One registered action as a command palette entry.
 *
 * Structurally the same translation `CommandPalette.tsx`'s own `actionToCommand`
 * performs, including `perform` going through `actionManager.executeAction` rather
 * than calling the closure directly: that is the only path which keeps the
 * editor's "is interaction enabled" and "is this blocked" rules in force, and a
 * palette entry that bypassed them would work in view mode and in a read-only
 * embed.
 *
 * `category` is a literal rather than one of `DEFAULT_CATEGORIES`, and the
 * consequence is that `getCategoryOrder` gives it 10 — these entries sort after
 * every built-in category. That is the right order for facilitation in a workshop
 * and the wrong one for the palette generally; adding a `Facilitation` entry to
 * `DEFAULT_CATEGORIES` is a one-line editor change when the palette gets a
 * designed order.
 */
const toPaletteItem = (action: Action): CommandPaletteItem => ({
  label: typeof action.label === "string" ? action.label : action.name,
  keywords: action.keywords,
  category: FACILITATOR_CATEGORY,
  // Reads from `actions/shortcuts.ts`, so the hint here and the `keyTest` above
  // are two views of one entry — and a shortcut the palette cannot name is a
  // shortcut nobody discovers.
  shortcut: getShortcutFromShortcutName(action.name as ShortcutName),
  predicate: action.predicate,
  viewMode: action.viewMode,
  perform: ({ actionManager }) => {
    actionManager.executeAction(action, "commandPalette");
  },
});

/**
 * The facilitator's commands as palette entries, for `customCommandPaletteItems`.
 *
 * ## Why these exist
 *
 * `registerAction` puts a command on the keyboard and in nothing else. The palette
 * enumerates actions from its own hand-written list, so without this the whole of
 * Phase 5 §5.7 is reachable by a keyboard and by nothing else — and Phase 3 §3.6
 * calls the palette "the accessibility backstop", which is only true if everything
 * is in it.
 *
 * `apps/web/App.tsx` already renders a `<CommandPalette customCommandPaletteItems={…}>`,
 * so wiring these in is one import and one spread in a file this module must not
 * touch. They are built here rather than in the app so the label, the keywords and
 * the behaviour stay next to the action they mirror — and because they are derived
 * from the same `Action` objects, the palette entry and the shortcut cannot
 * disagree about what pressing the key does.
 */
export const facilitatorCommandPaletteItems = (
  api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
  refresh: () => void,
): CommandPaletteItem[] =>
  facilitatorActions(api, getDocument, refresh).map(toPaletteItem);
