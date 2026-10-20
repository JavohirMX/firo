import React, { useCallback, useEffect, useRef, useState } from "react";

import { CheckIcon, CommentIcon, TrashIcon } from "@firo/ui";

import type { CommentThread, FiroElement } from "@firo/schema";
import type { AppState, ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc } from "../board/board";
import {
  COMMENT_AUTHOR,
  createCommentThread,
  deleteCommentThread,
  reopenCommentThread,
  replyToCommentThread,
  resolveCommentThread,
  threadsOf,
} from "../board/comments";

import "./CommentLayer.scss";

export type CommentTarget =
  | string
  | { elementId?: string; point?: { x: number; y: number } };

interface CommentLayerProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  /**
   * The element or point a comment is being written about, or null. Owned by the
   * app shell.
   */
  composerTarget: CommentTarget | null;
  onCloseComposer: () => void;
}

/** The canvas position a thread's pin should sit at, or null if its element is gone. */
const pinPosition = (
  thread: CommentThread,
  elements: readonly FiroElement[],
  viewport: { scrollX: number; scrollY: number; zoom: number },
): { left: number; top: number } | null => {
  if (!thread.elementId) {
    const left = (thread.anchor.x + viewport.scrollX) * viewport.zoom;
    const top = (thread.anchor.y + viewport.scrollY) * viewport.zoom;
    return { left, top };
  }
  const element = elements.find(
    (candidate) => candidate.id === thread.elementId,
  );
  // A thread whose element was deleted keeps its conversation but loses its pin:
  // the anchor is element-relative, so without the element there is nowhere on the
  // canvas to put it. It is still reachable wherever threads are listed.
  if (!element || element.isDeleted) {
    return null;
  }
  const left = (element.x + thread.anchor.x + viewport.scrollX) * viewport.zoom;
  const top = (element.y + thread.anchor.y + viewport.scrollY) * viewport.zoom;
  return { left, top };
};

/** A short, local "how long ago". Deliberately coarse; exact times are noise here. */
const relativeTime = (at: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * The comment lane, drawn over the canvas.
 *
 * ## Why an overlay and not canvas rendering
 *
 * A comment pin is chrome, not board content: it must not be exported, must not
 * be hit-tested by the editor's selection logic, and must scale with zoom while
 * staying the same on-screen size. Drawing it into the scene would put it in
 * every PNG export and in the element list. So it is an absolutely-positioned DOM
 * layer, projected from scene coordinates the same way
 * [`ProjectionView`](./ProjectionView.tsx) is — `(scene + scroll) * zoom`.
 *
 * ## What re-renders it
 *
 * Two subscriptions, for two different sources of change:
 *
 * - `doc.onUpdate` when a thread is created, replied to, resolved or deleted.
 * - `excalidrawAPI.onScrollChange` when the board pans or zooms, so a pin stays
 *   over its element instead of drifting.
 *
 * Neither is the editor's own change event, which fires on every pointer move
 * while drawing and would repaint this layer for no reason.
 */
export const CommentLayer: React.FC<CommentLayerProps> = ({
  excalidrawAPI,
  composerTarget,
  onCloseComposer,
}) => {
  const [, setDocRevision] = useState(0);
  const [, setViewportRevision] = useState(0);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Re-render when the comment lane changes. Gated like `ProjectionView`'s: if
  // there are no threads and none appeared, a stroke being drawn commits many
  // times and none of them concern us.
  useEffect(() => {
    const doc = boardDoc();
    let last = doc.read().comments.length > 0;
    const unsubscribe = doc.onUpdate(() => {
      const now = doc.read().comments.length > 0;
      if (now || now !== last) {
        setDocRevision((prev) => prev + 1);
      }
      last = now;
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Re-render on pan and zoom so pins track the canvas.
  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined;
    }
    const unsubscribe = excalidrawAPI.onScrollChange(() => {
      setViewportRevision((prev) => prev + 1);
    });
    return () => {
      unsubscribe();
    };
  }, [excalidrawAPI]);

  const closeAll = useCallback(() => {
    setOpenThreadId(null);
    setDraft("");
    onCloseComposer();
  }, [onCloseComposer]);

  // Escape closes whichever surface is open, from anywhere on the layer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeAll]);

  const doc = boardDoc();
  const elements = doc.read().elements;
  const threads = threadsOf(doc);
  const appState: AppState | undefined = excalidrawAPI?.getAppState();
  const viewport = {
    scrollX: appState?.scrollX ?? 0,
    scrollY: appState?.scrollY ?? 0,
    zoom: appState?.zoom.value ?? 1,
  };

  const targetElementId =
    typeof composerTarget === "string"
      ? composerTarget
      : composerTarget?.elementId ?? null;
  const targetPoint =
    typeof composerTarget === "object" && composerTarget !== null
      ? composerTarget.point ?? null
      : null;

  const composerPosition = targetElementId
    ? (() => {
        const element = elements.find(
          (candidate) => candidate.id === targetElementId,
        );
        if (!element) {
          return null;
        }
        return {
          left: (element.x + element.width + viewport.scrollX) * viewport.zoom,
          top: (element.y + viewport.scrollY) * viewport.zoom,
        };
      })()
    : targetPoint
    ? {
        left: (targetPoint.x + viewport.scrollX) * viewport.zoom,
        top: (targetPoint.y + viewport.scrollY) * viewport.zoom,
      }
    : null;

  const submitComposer = () => {
    if (!composerTarget) {
      return;
    }
    let id: string | null = null;
    if (targetElementId) {
      const element = elements.find(
        (candidate) => candidate.id === targetElementId,
      );
      id = createCommentThread(doc, targetElementId, draft, {
        elementWidth: element?.width,
      });
    } else if (targetPoint) {
      id = createCommentThread(doc, "", draft, {
        anchor: targetPoint,
      });
    }
    setDraft("");
    onCloseComposer();
    if (id) {
      setOpenThreadId(id);
    }
  };

  return (
    <div className="firo-comments-layer" data-testid="firo-comments-layer">
      {threads.map((thread) => {
        const position = pinPosition(thread, elements, viewport);
        if (!position) {
          return null;
        }
        const count = thread.comments.length;
        const label = `Comment thread, ${count} ${
          count === 1 ? "comment" : "comments"
        }${thread.resolved ? ", resolved" : ""}`;
        return (
          <button
            key={thread.id}
            type="button"
            className={`firo-comment-pin${
              thread.resolved ? " is-resolved" : ""
            }`}
            style={{ left: position.left, top: position.top }}
            aria-label={label}
            aria-expanded={openThreadId === thread.id}
            data-testid={`comment-pin-${thread.id}`}
            onClick={() =>
              setOpenThreadId((current) =>
                current === thread.id ? null : thread.id,
              )
            }
          >
            {thread.resolved ? (
              <CheckIcon size={16} />
            ) : (
              <>
                <CommentIcon size={16} />
                {count > 1 && (
                  <span className="firo-comment-pin__count">{count}</span>
                )}
              </>
            )}
          </button>
        );
      })}

      {composerTarget && composerPosition && (
        <div
          className="firo-comment-popover"
          style={{ left: composerPosition.left, top: composerPosition.top }}
          role="dialog"
          aria-label="New comment"
          data-testid="comment-composer"
        >
          <textarea
            className="firo-comment-popover__input"
            placeholder="Add a comment…"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submitComposer();
              }
            }}
            data-testid="comment-composer-input"
            aria-label="Comment"
          />
          <div className="firo-comment-popover__actions">
            <span className="firo-comment-popover__hint">
              {COMMENT_AUTHOR} · ⌘↵ to send
            </span>
            <button
              type="button"
              className="firo-comment-popover__send"
              disabled={!draft.trim()}
              onClick={submitComposer}
              data-testid="comment-composer-send"
            >
              Comment
            </button>
          </div>
        </div>
      )}

      {openThreadId && (
        <ThreadPopover
          threadId={openThreadId}
          elements={elements}
          viewport={viewport}
          onClose={() => setOpenThreadId(null)}
        />
      )}
    </div>
  );
};

interface ThreadPopoverProps {
  threadId: string;
  elements: readonly FiroElement[];
  viewport: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
}

const ThreadPopover: React.FC<ThreadPopoverProps> = ({
  threadId,
  elements,
  viewport,
  onClose,
}) => {
  const doc = boardDoc();
  const thread = doc.comment(threadId);
  const [reply, setReply] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // The thread can disappear under us (a delete elsewhere). Close rather than
  // render a popover for a thread that is no longer there.
  if (!thread) {
    return null;
  }

  const position = pinPosition(thread, elements, viewport);
  if (!position) {
    return null;
  }

  const send = () => {
    if (replyToCommentThread(doc, threadId, reply)) {
      setReply("");
      replyRef.current?.focus();
    }
  };

  return (
    <div
      className="firo-comment-popover firo-comment-thread"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Comment thread"
      data-testid={`comment-thread-${thread.id}`}
    >
      <div className="firo-comment-thread__header">
        <span
          className={`firo-comment-thread__status${
            thread.resolved ? " is-resolved" : ""
          }`}
        >
          {thread.resolved ? "Resolved" : "Open"}
        </span>
        <button
          type="button"
          className="firo-comment-thread__close"
          aria-label="Close thread"
          onClick={onClose}
          data-testid="comment-thread-close"
        >
          ×
        </button>
      </div>

      <ul className="firo-comment-thread__messages">
        {thread.comments.map((comment) => (
          <li key={comment.id} className="firo-comment-thread__message">
            <div className="firo-comment-thread__meta">
              <span className="firo-comment-thread__author">
                {comment.author}
              </span>
              <span className="firo-comment-thread__time">
                {relativeTime(comment.createdAt)}
              </span>
            </div>
            <p className="firo-comment-thread__body">{comment.body}</p>
          </li>
        ))}
      </ul>

      <textarea
        ref={replyRef}
        className="firo-comment-popover__input"
        placeholder="Reply…"
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
        data-testid="comment-reply-input"
        aria-label="Reply"
      />

      <div className="firo-comment-thread__actions">
        <button
          type="button"
          className="firo-comment-thread__action"
          disabled={!reply.trim()}
          onClick={send}
          data-testid="comment-reply-send"
        >
          Reply
        </button>
        <button
          type="button"
          className="firo-comment-thread__action"
          onClick={() =>
            thread.resolved
              ? reopenCommentThread(doc, threadId)
              : resolveCommentThread(doc, threadId)
          }
          data-testid="comment-resolve-toggle"
        >
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          className="firo-comment-thread__action is-danger"
          aria-label="Delete thread"
          onClick={() => {
            deleteCommentThread(doc, threadId);
            onClose();
          }}
          data-testid="comment-delete"
        >
          <TrashIcon size={16} />
        </button>
      </div>
    </div>
  );
};

export default CommentLayer;
