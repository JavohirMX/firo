/**
 * Ephemeral state.
 *
 * ## The rule this file exists to enforce
 *
 * Rule 1 in [`../../../AGENTS.md`](../../../AGENTS.md): ephemeral state never
 * enters the Yjs document. Cursor position, in-progress drags, live selection,
 * hover, and the laser pointer go to awareness and nowhere else.
 *
 * ## What the failure actually costs
 *
 * If a pointer-move handler writes to the document, a five-second drag produces
 * hundreds of updates. Each one is persisted, each enters the undo history, and
 * -- once a provider exists -- each is broadcast and applied by every peer. The
 * document ends up orders of magnitude larger than its content, undo becomes
 * useless because it has 300 steps to walk back through, and remote cursors lag
 * behind local ones because they are queued behind the flood.
 *
 * That is not a performance problem that degrades gracefully. Awareness exists
 * precisely for this state: it is relayed rather than stored, discarded when a
 * peer disconnects, and never enters the document's history.
 *
 * ## Why this is typed as one object rather than free-form keys
 *
 * `Awareness.setLocalStateField` accepts anything. A typo in a key produces
 * state that is set, relayed, and never read -- invisible, and expensive. Making
 * the state one typed object means a key that is not in the type does not exist.
 */

export type EphemeralState = Readonly<{
  /** Where this client is looking, in board coordinates. */
  cursor: { x: number; y: number } | null;

  /**
   * An in-progress drag or resize.
   *
   * The *preview*. The committed result arrives as a durable mutation on
   * pointer-up. This exists so collaborators see movement rather than nothing --
   * which is why it is here and not in the document.
   */
  dragPreview: DragPreview | null;

  /** Ids currently selected, by this client. */
  selection: readonly string[];

  /** Id the pointer is over, or null. */
  hover: string | null;

  /** The laser pointer's current position, or null. */
  laser: { x: number; y: number } | null;

  /** Whether this client is idle, and since when. */
  idleSince: number | null;

  /** Scrolled viewport offset, per collaborator. */
  viewport: { scrollX: number; scrollY: number; zoom: number } | null;

  /**
   * The workshop timer, or null when no facilitator has started one.
   *
   * Ephemeral because a clock is a property of the *session*, not of the board.
   * A `.firo` file must never reopen with a timer frozen at 3:41, and two runs
   * of the same workshop should not share a countdown -- which is the same
   * reason the laser pointer is here and not in the document.
   *
   * The value is an *anchor*, not a countdown: when the run began and for how
   * long, with every client deriving the remainder from its own clock. That is
   * not a detail of the type but the whole reason the field can be ephemeral at
   * all -- see the field notes in
   * [`@firo/facilitation/src/timer.ts`](../../facilitation/src/timer.ts).
   */
  timer: EphemeralTimer | null;

  /**
   * The board-level private/revealed toggle.
   *
   * Only the *toggle* lives here. Which elements are hidden is durable, on the
   * element itself as `hiddenUntilRevealed`, and the two sit on opposite sides
   * of this split on purpose: a facilitator who closes the tab should not leave
   * the board stuck in private mode, while a note marked "hide until reveal"
   * must still be hidden tomorrow and must survive the export that carries the
   * board to the next facilitator. Getting either half onto the wrong side is a
   * real bug in both directions, and
   * [`@firo/facilitation/src/reveal.ts`](../../facilitation/src/reveal.ts) is
   * where that reasoning lives.
   *
   * Required rather than nullable, because there is no third answer. `mode` has
   * two values and one of them is the state of a board nobody has made private,
   * so a `null` here could only ever be a slower way of spelling `"revealed"`
   * -- and a client that read `null` as anything else would hide a board that
   * nobody hid.
   */
  reveal: EphemeralReveal;
}>;

export type DragPreview = Readonly<{
  /** The element being dragged. */
  elementId: string;
  /** The position it would land at if released now. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** For a multi-selection drag, the whole selection. */
  elements?: readonly { id: string; x: number; y: number }[];
}>;

/**
 * The facilitator's shared clock, as it travels.
 *
 * ## Why this is declared here rather than imported
 *
 * `@firo/facilitation` already depends on this package -- `voting.ts` imports
 * `Mutation` from it -- so importing `TimerState` back from there closes a
 * dependency cycle: two workspace packages each naming the other as a
 * dependency. Yarn resolves that, and `tsc` frequently accepts it too, which is
 * precisely why it is dangerous: the cost does not appear as a build error, it
 * appears later as an intermittently `undefined` binding at module load,
 * depending on which side of the cycle the entry point happened to reach first.
 *
 * So the *shape* is restated here and the domain type stays where it belongs.
 * The duplication is close to free, because this is a structural type over
 * three `number`s and nothing more: `@firo/facilitation`'s `TimerState` and this
 * one are mutually assignable with no cast, so a caller passing a real timer is
 * checked by the compiler at the call site rather than trusted. What the
 * duplication costs is that the two declarations *can* drift -- and that shows up
 * as a type error at the first `setEphemeral({ timer })`, not as a clock that
 * quietly reads the wrong number.
 */
export type EphemeralTimer = Readonly<{
  /** When the current run began, in epoch ms. Null when not running. */
  startedAt: number | null;
  /** How long the current run lasts, in ms. */
  durationMs: number;
  /**
   * Milliseconds left at the moment the timer was paused or reset.
   *
   * Only meaningful while `startedAt` is null, and that is not an oversight: a
   * paused timer has no anchor to derive from, so this is the only place its
   * position can live.
   */
  remainingMs: number;
}>;

/**
 * The board-level private/revealed toggle, as it travels.
 *
 * Restated rather than imported for the reason given on [`EphemeralTimer`](#ephemeraltimer)
 * -- the cycle. It is two literals wide, so the structural match is exact in
 * both directions and there is nothing to keep in sync but the two strings.
 */
export type EphemeralReveal = Readonly<{
  /**
   * `"private"` hides the elements flagged `hiddenUntilRevealed`; `"revealed"`
   * draws them.
   */
  mode: "private" | "revealed";
}>;

/**
 * The mode a client starts in: nothing hidden.
 *
 * Module-private, and frozen. This object is reachable from every state derived
 * from `EMPTY_EPHEMERAL_STATE` -- a patch that does not mention `reveal`
 * replaces nothing -- so a mutable default would be *shared* by all of them and
 * one stray write would make every board on the client private. `Readonly<>`
 * already refuses that at compile time; the freeze is the same belt-and-braces
 * the top-level one below is, and it matters more here because this is the
 * first nested object in the type.
 */
const REVEALED: EphemeralReveal = Object.freeze({ mode: "revealed" });

/** The state a freshly-joined client starts with: present, and empty. */
export const EMPTY_EPHEMERAL_STATE: EphemeralState = Object.freeze({
  cursor: null,
  dragPreview: null,
  selection: [],
  hover: null,
  laser: null,
  idleSince: null,
  viewport: null,
  // Required-but-nullable on purpose. Both are non-optional keys, so a new
  // field added above without an entry here is a compile error rather than an
  // `undefined` that every consumer has to defend against -- which is the
  // mistake this line exists to make impossible.
  timer: null,
  reveal: REVEALED,
});

/** The `y-protocols` awareness key. Not exported as a mutable binding. */
export const AWARENESS_KEY = "firo";

/**
 * A partial update to ephemeral state.
 *
 * Partial on purpose: a pointer-move handler updates `cursor` and must not have
 * to restate `selection`, `laser` and the rest. Passing a whole object would
 * mean a drag handler either clobbers concurrent ephemeral updates or has to
 * read-modify-write, and the latter is a race on a field that is by definition
 * disposable.
 */
export type EphemeralPatch = Partial<EphemeralState>;

/**
 * Merge a patch into a state.
 *
 * Pure, and exported so the merge is testable without an `Awareness` instance --
 * which matters, because the interesting bug in this file is a merge that drops
 * a key, and that bug is only visible in a pure function.
 *
 * ## Why the spread, and not a per-field conditional
 *
 * `{ ...state, ...patch }` is what makes `timer: null` mean *clear the clock*.
 * The natural alternative -- the shape `selection` below needs, where a truthy
 * check guards the copy -- would silently invert that: `null` is falsy, so
 * `patch.timer ? { timer: patch.timer } : {}` keeps the old timer, and the
 * facilitator hits stop and the clock keeps running. A stale clock on every
 * participant's screen for the rest of the session, from a patch that looked
 * correct and typechecked.
 *
 * So the rule is: conditional guards belong only where the field is copied, and
 * a `null` anywhere else is a value, not an absence.
 */
export const applyEphemeralPatch = (
  state: EphemeralState,
  patch: EphemeralPatch,
): EphemeralState => {
  // `selection` is the one field that is replaced rather than merged: a patch
  // saying `selection: []` means "nothing is selected", not "leave it as it was",
  // and an additive merge could never express a deselect-all.
  const next: EphemeralState = {
    ...state,
    ...patch,
    ...(patch.selection ? { selection: [...patch.selection] } : {}),
  };
  return Object.freeze(next);
};
