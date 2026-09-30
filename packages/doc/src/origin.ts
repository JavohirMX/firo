/**
 * Transaction origins.
 *
 * ## Why the origin tag is the load-bearing part of this package
 *
 * A Yjs transaction carries an `origin`, and it is the only thing distinguishing
 * "the local user did this" from "a peer did this" from "something reached in and
 * mutated the document directly". Three separate guarantees rest on being able to
 * tell those apart:
 *
 * - **Undo is local.** `Y.UndoManager` tracks only `LOCAL_ORIGIN`, so a peer's
 *   change never lands in your undo stack. This is not a nicety -- it is the
 *   difference between undo and a race.
 * - **The write path is enforceable.** A transaction with an unrecognised origin
 *   is a bug, and the guard in `doc.ts` throws on it.
 * - **Updates are attributable.** A stored update can be traced to a client and
 *   a kind, which is what makes a corrupt board diagnosable.
 *
 * The tags are unique frozen objects rather than strings. Yjs compares origins
 * with `===`, so a string would work -- and a string would also be forgeable by
 * any module that guessed the name, which would silently disable the guard. An
 * object identity cannot be guessed, and a tag that leaked into a public export
 * could be used to bypass the check, so these are module-private and handed out
 * through typed accessors.
 */

/**
 * The origin for a local, user-initiated, durable change.
 *
 * Made by `commit()`. Everything undoable and everything that should be synced
 * carries this.
 */
export const LOCAL_ORIGIN: unique symbol = Symbol("firo.local");

/**
 * The origin for an update applied from a peer.
 *
 * v1 has no provider, so nothing in this package produces it yet. It exists now
 * because a guard that only knows one origin would have to be widened later, and
 * widening a security-shaped guard is exactly the change that gets skipped.
 */
export const REMOTE_ORIGIN: unique symbol = Symbol("firo.remote");

/**
 * The origin for the initial load from a file or a persisted store.
 *
 * Distinct from `REMOTE_ORIGIN` on purpose. A loaded board's contents are not
 * something the user can undo back to nothing, and they must not appear in the
 * undo stack as a step -- otherwise the first Ctrl-Z after opening a board
 * silently empties it.
 */
export const LOAD_ORIGIN: unique symbol = Symbol("firo.load");

const ALL_ORIGINS: ReadonlySet<unknown> = new Set([
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
  LOAD_ORIGIN,
]);

/** Whether an origin is one this package vouches for. */
export const isKnownOrigin = (origin: unknown): boolean =>
  ALL_ORIGINS.has(origin);
