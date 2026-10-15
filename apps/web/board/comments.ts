/**
 * The comment lane, as commands the UI can call.
 *
 * ## Why this file exists
 *
 * `@firo/doc` speaks in mutations — "set this field on this thread" — and a
 * component should not have to read a thread, build a new `comments` array, and
 * decide whether a reply reopens a resolved thread. That is domain knowledge, and
 * putting it in a click handler means the next surface that wants to reply
 * (the command palette, a keyboard shortcut, the inspector) re-derives it
 * slightly differently. This is the one place it lives, in the same spirit as
 * [`recordActions.ts`](./recordActions.ts): the package ends at the mutation, the
 * app owns the *act*.
 *
 * ## The pieces this build does not have yet
 *
 * The author is a literal. There is no identity in the product until the
 * collaboration work in version 2 gives it one, so every comment this build
 * writes says [`COMMENT_AUTHOR`](#COMMENT_AUTHOR) — an honest placeholder that is
 * wrong in exactly one way a reader can see, rather than a user id invented from
 * thin air. Mentions, permissions and read/unread state are deferred with it;
 * see [`../../docs/adr/0027-comments-are-their-own-lane.md`](../../docs/adr/0027-comments-are-their-own-lane.md).
 *
 * A thread is anchored to an element, by `elementId`, and its `anchor` is
 * **element-relative**: `(0, 0)` is the element's top-left. That is what makes a
 * note's comments travel with the note when it moves, without a single write on
 * the comment lane — the layer adds the element's position when it projects.
 */

import { randomId } from "@firo/common";

import type { FiroDoc } from "@firo/doc";
import type { CommentAnchor, CommentEntry, CommentThread } from "@firo/schema";

import { recordActivity } from "./activity";

/**
 * Who a comment is attributed to.
 *
 * A literal until there are identities. It reads as a placeholder on purpose:
 * a fabricated id would look real and be wrong, and this does not.
 */
export const COMMENT_AUTHOR = "You";

/** A fresh thread id. Prefixed so a reader can tell a thread from an element. */
export const newCommentThreadId = (): string => `ct-${randomId()}`;

/** A fresh comment id, within a thread. */
const newCommentEntryId = (): string => `cm-${randomId()}`;

/** Every thread in the board, oldest first (`@firo/doc` sorts them). */
export const threadsOf = (doc: FiroDoc): CommentThread[] => doc.read().comments;

/** The threads anchored to one element. */
export const threadsForElement = (
  threads: readonly CommentThread[],
  elementId: string,
): CommentThread[] =>
  threads.filter((thread) => thread.elementId === elementId);

/**
 * How many unresolved threads an element carries.
 *
 * Unresolved only: resolving is the signal that a thread is dealt with, and a
 * badge that keeps counting resolved threads is a badge nobody can clear. The
 * pin for a resolved thread stays on the canvas (dimmed) so the conversation is
 * still reachable; it simply stops asking for attention.
 */
export const unresolvedCountForElement = (
  threads: readonly CommentThread[],
  elementId: string,
): number =>
  threads.filter((thread) => thread.elementId === elementId && !thread.resolved)
    .length;

/** An entry for a brand-new comment. */
const entry = (body: string, at: number): CommentEntry => ({
  id: newCommentEntryId(),
  body,
  author: COMMENT_AUTHOR,
  createdAt: at,
});

/**
 * Start a thread on an element.
 *
 * `anchor` is element-relative and defaults to the element's top-right corner
 * when the caller passes `elementWidth`, which is where a comment pin reads as
 * attached to the shape rather than floating over its middle. A caller that does
 * not know the width gets the origin, which is still on the element.
 *
 * Returns the new thread's id, or `null` for an empty body: a thread with an
 * empty first comment is a thread nobody can read, and `commit`-ing one would
 * put a blank pin on the canvas. The guard is here rather than only in the
 * component because the component is not the only caller it will ever have.
 */
export const createCommentThread = (
  doc: FiroDoc,
  elementId: string,
  body: string,
  options: { anchor?: CommentAnchor; elementWidth?: number } = {},
): string | null => {
  const text = body.trim();
  if (!text) {
    return null;
  }

  const now = Date.now();
  const anchor: CommentAnchor = options.anchor ?? {
    x: options.elementWidth ?? 0,
    y: 0,
  };
  const id = newCommentThreadId();
  const thread: CommentThread = {
    id,
    elementId,
    anchor,
    comments: [entry(text, now)],
    resolved: false,
    author: COMMENT_AUTHOR,
    createdAt: now,
    updatedAt: now,
  };

  doc.commit([{ kind: "createCommentThread", thread }]);
  const boardId = (doc.read().meta as { id?: string })?.id ?? "default";
  void recordActivity({
    boardId,
    kind: "comment",
    summary: `Commented: "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`,
  });
  return id;
};

/**
 * Add a reply to a thread, reopening it if it was resolved.
 *
 * Replying *is* reopening: someone who answers a resolved thread has found
 * something left to say, and leaving the thread marked resolved while a new
 * message sits unread in it is the state that hides work. Reopening is therefore
 * part of the same commit, not a second one a caller could forget.
 *
 * Returns `false` when the thread has vanished (a concurrent delete in a later
 * version; a stale id today), rather than throwing into a click handler.
 */
export const replyToCommentThread = (
  doc: FiroDoc,
  threadId: string,
  body: string,
): boolean => {
  const text = body.trim();
  const thread = doc.comment(threadId);
  if (!thread || !text) {
    return false;
  }

  doc.commit([
    {
      kind: "updateCommentThread",
      id: threadId,
      changes: {
        comments: [...thread.comments, entry(text, Date.now())],
        resolved: false,
      },
    },
  ]);
  return true;
};

/** Mark a thread resolved. A no-op for an id that is already gone. */
export const resolveCommentThread = (
  doc: FiroDoc,
  threadId: string,
): boolean => {
  if (!doc.comment(threadId)) {
    return false;
  }
  doc.commit([
    { kind: "updateCommentThread", id: threadId, changes: { resolved: true } },
  ]);
  const boardId = (doc.read().meta as { id?: string })?.id ?? "default";
  void recordActivity({
    boardId,
    kind: "comment",
    summary: "Resolved comment thread",
  });
  return true;
};

/** Reopen a resolved thread. A no-op for an id that is already gone. */
export const reopenCommentThread = (
  doc: FiroDoc,
  threadId: string,
): boolean => {
  if (!doc.comment(threadId)) {
    return false;
  }
  doc.commit([
    { kind: "updateCommentThread", id: threadId, changes: { resolved: false } },
  ]);
  return true;
};

/**
 * Move a thread's pin.
 *
 * Not needed to keep a pin on a *moving* element — the anchor is element-relative,
 * so a drag carries it for free. This is for the case the relative anchor does not
 * cover: a person dragging the pin itself to a different spot on the shape. v1
 * exposes it as a function so the mutation path is tested even though the drag
 * gesture ships later; see the phase plan.
 */
export const reanchorCommentThread = (
  doc: FiroDoc,
  threadId: string,
  anchor: CommentAnchor,
): boolean => {
  if (!doc.comment(threadId)) {
    return false;
  }
  doc.commit([
    { kind: "updateCommentThread", id: threadId, changes: { anchor } },
  ]);
  return true;
};

/**
 * Delete a thread outright.
 *
 * Not a tombstone, unlike an element: a deleted conversation has nothing to be
 * restored *to*, and there is no undo step here that expects to find it. See the
 * note on `deleteCommentThread` in `@firo/doc`'s mutations.
 */
export const deleteCommentThread = (
  doc: FiroDoc,
  threadId: string,
): boolean => {
  if (!doc.comment(threadId)) {
    return false;
  }
  doc.commit([{ kind: "deleteCommentThread", id: threadId }]);
  return true;
};
