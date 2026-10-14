import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import {
  COMMENT_AUTHOR,
  createCommentThread,
  deleteCommentThread,
  reanchorCommentThread,
  reopenCommentThread,
  replyToCommentThread,
  resolveCommentThread,
  threadsForElement,
  threadsOf,
  unresolvedCountForElement,
} from "../comments";

describe("the comment domain operations", () => {
  let doc: FiroDoc;

  beforeEach(() => {
    doc = new FiroDoc(new Y.Doc());
  });

  it("creates a thread with the placeholder author and an unresolved state", () => {
    const id = createCommentThread(doc, "el-1", "  Please clarify  ");
    expect(id).not.toBeNull();

    const thread = doc.comment(id!);
    expect(thread).toMatchObject({
      elementId: "el-1",
      resolved: false,
      author: COMMENT_AUTHOR,
    });
    // The body is trimmed: a leading space is not content.
    expect(thread?.comments).toHaveLength(1);
    expect(thread?.comments[0]).toMatchObject({
      body: "Please clarify",
      author: COMMENT_AUTHOR,
    });
  });

  it("refuses an empty body rather than putting a blank pin on the canvas", () => {
    expect(createCommentThread(doc, "el-1", "   ")).toBeNull();
    expect(threadsOf(doc)).toHaveLength(0);
  });

  it("anchors a new thread at the element's top-right when given a width", () => {
    const id = createCommentThread(doc, "el-1", "Hi", { elementWidth: 180 });
    expect(doc.comment(id!)?.anchor).toEqual({ x: 180, y: 0 });
  });

  it("filters threads and counts only the unresolved ones per element", () => {
    const a1 = createCommentThread(doc, "el-a", "one")!;
    createCommentThread(doc, "el-a", "two");
    createCommentThread(doc, "el-b", "other");

    expect(threadsForElement(threadsOf(doc), "el-a")).toHaveLength(2);
    expect(unresolvedCountForElement(threadsOf(doc), "el-a")).toBe(2);

    resolveCommentThread(doc, a1);
    // Resolving drops it from the badge count but keeps the thread.
    expect(unresolvedCountForElement(threadsOf(doc), "el-a")).toBe(1);
    expect(threadsForElement(threadsOf(doc), "el-a")).toHaveLength(2);
  });

  it("appends a reply and reopens a resolved thread in the same commit", () => {
    const id = createCommentThread(doc, "el-1", "Original")!;
    resolveCommentThread(doc, id);
    expect(doc.comment(id)?.resolved).toBe(true);

    expect(replyToCommentThread(doc, id, "Actually one more thing")).toBe(true);

    const thread = doc.comment(id)!;
    expect(thread.comments).toHaveLength(2);
    expect(thread.comments[1].body).toBe("Actually one more thing");
    // Replying is reopening: a new message in a "resolved" thread would be hidden
    // work.
    expect(thread.resolved).toBe(false);
  });

  it("reopens, reanchors and deletes", () => {
    const id = createCommentThread(doc, "el-1", "Hi")!;
    resolveCommentThread(doc, id);
    expect(reopenCommentThread(doc, id)).toBe(true);
    expect(doc.comment(id)?.resolved).toBe(false);

    expect(reanchorCommentThread(doc, id, { x: 5, y: 9 })).toBe(true);
    expect(doc.comment(id)?.anchor).toEqual({ x: 5, y: 9 });

    expect(deleteCommentThread(doc, id)).toBe(true);
    expect(doc.comment(id)).toBeNull();
  });

  it("is a no-op returning false for a thread that is already gone", () => {
    // Not a throw: these are called from click handlers on possibly-stale ids.
    expect(replyToCommentThread(doc, "ghost", "?")).toBe(false);
    expect(resolveCommentThread(doc, "ghost")).toBe(false);
    expect(reopenCommentThread(doc, "ghost")).toBe(false);
    expect(reanchorCommentThread(doc, "ghost", { x: 0, y: 0 })).toBe(false);
    expect(deleteCommentThread(doc, "ghost")).toBe(false);
  });

  it("treats a reply with an empty body as nothing to say", () => {
    const id = createCommentThread(doc, "el-1", "Original")!;
    expect(replyToCommentThread(doc, id, "   ")).toBe(false);
    expect(doc.comment(id)?.comments).toHaveLength(1);
  });
});
