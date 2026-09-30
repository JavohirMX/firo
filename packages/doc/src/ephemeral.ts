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

/** The state a freshly-joined client starts with: present, and empty. */
export const EMPTY_EPHEMERAL_STATE: EphemeralState = Object.freeze({
  cursor: null,
  dragPreview: null,
  selection: [],
  hover: null,
  laser: null,
  idleSince: null,
  viewport: null,
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
