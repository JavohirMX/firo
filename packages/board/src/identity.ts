import { randomId } from "@firo/common";

import type { FiroDoc } from "@firo/doc";

/**
 * What a board calls itself.
 *
 * ## Why this exists
 *
 * `Collection.boardId` has always been a fixed string, on the reasoning that a
 * collision would then be *detectable*. It is not detectable: nothing compared it.
 * The votes collection has a fixed id (`VOTE_COLLECTION_ID`), so a second board's
 * votes would land in the first board's collection and `boardId` would sit there
 * asserting nothing. The field claimed to identify a board and identified a
 * constant.
 *
 * ## Why it was not reachable in v1, and why that is not the reason to leave it
 *
 * Import refuses a non-empty board, and the autosave is a single record, so one
 * document holds one board at a time and two boards' votes cannot actually meet
 * through the product today. That is a real reason it has not bitten.
 *
 * It is not a reason to keep a field that lies. The moment anything puts two boards
 * in one document — a merge, a "duplicate this board" feature, a future multi-board
 * sidebar, or a hand-edited file — the failure is a **silent merge**: two sessions'
 * dots in one tally, each participant's vote landing among strangers', with no error
 * anywhere. And the guard that would catch it has to exist *before* the first case
 * that needs it, because a conflict check written after the merge has already shipped
 * is a check written by someone who has already seen the data it would have rejected.
 *
 * ## Why the id is stored in the document and not derived
 *
 * Derived from something else — the element set, the autosave key, the creation
 * timestamp — it would change when that thing changes, and a board that changed its
 * own identity by being edited is a board whose votes stop matching its own history.
 * Stored, it is written once and never again, and it travels inside `board.json`, so
 * an exported board keeps the identity its votes were cast under.
 *
 * It also makes `manifest.board.id` in the `.firo` format real rather than a
 * placeholder: that field read `meta.id ?? "board"`, so every exported board claimed
 * to be called "board".
 *
 * ## The fallback, and why it is a fallback rather than the rule
 *
 * A document with no `meta.id` gets one stamped on first use. `meta` is a
 * free-form `Record<string, unknown>` in the schema with no key allowlist, so this
 * round-trips through the file with no migration and no version bump — checked
 * against `migrate.ts`'s `meta: plainObject(raw.meta) ? raw.meta : {}`, which passes
 * every key through untouched.
 *
 * One stamp is a durable write on the first vote of a session. That is the right
 * trade: it happens once per board, it is not undoable (undo restores an *element*,
 * not board identity), and it is far cheaper than the alternative of votes that
 * cannot be attributed.
 */

/**
 * A board's id and the mutation that records it — **without committing**.
 *
 * The pair, rather than a bare string, because the caller usually wants to commit the
 * identity *in the same transaction as the thing that needed it*. A first vote would
 * otherwise be two commits and therefore two undo steps, and undo stops at a real
 * change — so a facilitator pressing undo once would find the dot gone and be right,
 * and pressing it again to tidy up would remove the board's identity for no visible
 * reason.
 *
 * Returning the mutation rather than committing it is also what lets the vote path
 * check for a conflict *before* writing anything, so a refusal leaves the board
 * untouched rather than half-changed.
 */
export const mintBoardId = (): {
  id: string;
  mutation: { kind: "setMeta"; entries: { id: string } };
} => {
  const id = randomId();
  return { id, mutation: { kind: "setMeta", entries: { id } } };
};

/** Read a board's id, stamping one on first use if it has none. */
export const boardId = (getDocument: () => FiroDoc): string => {
  const existing = peekBoardId(getDocument);
  if (existing !== null) {
    return existing;
  }

  const { id, mutation } = mintBoardId();
  getDocument().commit([mutation]);
  return id;
};

/**
 * The board's id **without** stamping one.
 *
 * For a caller that must not write — a conflict check, a comparison, an export
 * manifest. Returns null for a board that has never been identified, which is the
 * honest answer rather than a fabricated id that would differ from the one stamped a
 * moment later.
 */
export const peekBoardId = (getDocument: () => FiroDoc): string | null => {
  const existing = getDocument().read().meta.id;
  return typeof existing === "string" && existing.length > 0 ? existing : null;
};
