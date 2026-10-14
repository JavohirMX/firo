import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import { asFractionalIndex } from "@firo/schema";

import type { FiroElement } from "@firo/schema";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { CommentLayer } from "../../components/CommentLayer";
import { createCommentThread, resolveCommentThread } from "../comments";
import * as boardModule from "../board";

const note = (id: string): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 100,
    y: 50,
    width: 200,
    height: 120,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1,
    updated: 1,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
  } as unknown as FiroElement);

/**
 * A stand-in for the editor, with only the two things the layer touches: the app
 * state it projects with, and the scroll subscription it re-renders on.
 */
const fakeEditor = (): ExcalidrawImperativeAPI =>
  ({
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
    }),
    onScrollChange: () => () => {},
  } as unknown as ExcalidrawImperativeAPI);

describe("CommentLayer", () => {
  const setup = () => {
    const doc = new FiroDoc(new Y.Doc());
    const spyBoardDoc = vi.spyOn(boardModule, "boardDoc").mockReturnValue(doc);
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    return { doc, spyBoardDoc };
  };

  it("places a pin per thread and opens the thread on click", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "First point", {
      elementWidth: 200,
    })!;

    const { getByTestId, queryByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    const pin = getByTestId(`comment-pin-${id}`);
    expect(pin).toBeDefined();
    // Projected at `(element + anchor + scroll) * zoom`; the default anchor is the
    // element's top-right (width 200), so left = 100 + 200 = 300.
    expect(pin.getAttribute("style")).toContain("left: 300px");
    expect(pin.getAttribute("style")).toContain("top: 50px");

    expect(queryByTestId(`comment-thread-${id}`)).toBeNull();
    act(() => {
      fireEvent.click(pin);
    });
    expect(getByTestId(`comment-thread-${id}`)).toBeDefined();

    spyBoardDoc.mockRestore();
  });

  it("replies and resolves from the thread popover", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "First point")!;

    const { getByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(getByTestId(`comment-pin-${id}`));
    });

    const reply = getByTestId("comment-reply-input") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(reply, { target: { value: "Agreed" } });
    });
    act(() => {
      fireEvent.click(getByTestId("comment-reply-send"));
    });
    expect(doc.comment(id)?.comments).toHaveLength(2);

    act(() => {
      fireEvent.click(getByTestId("comment-resolve-toggle"));
    });
    expect(doc.comment(id)?.resolved).toBe(true);
    // The toggle's label flips once resolved.
    expect(getByTestId("comment-resolve-toggle").textContent).toBe("Reopen");

    spyBoardDoc.mockRestore();
  });

  it("shows a resolved thread as resolved without hiding its pin", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "Done")!;
    resolveCommentThread(doc, id);

    const { getByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    const pin = getByTestId(`comment-pin-${id}`);
    expect(pin.className).toContain("is-resolved");
    expect(pin.getAttribute("aria-label")).toContain("resolved");

    spyBoardDoc.mockRestore();
  });

  it("writes a new thread from the composer", () => {
    const { doc, spyBoardDoc } = setup();
    const onCloseComposer = vi.fn();

    const { getByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget="el-1"
        onCloseComposer={onCloseComposer}
      />,
    );

    const input = getByTestId("comment-composer-input") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(input, { target: { value: "A fresh comment" } });
    });
    act(() => {
      fireEvent.click(getByTestId("comment-composer-send"));
    });

    const threads = doc.read().comments;
    expect(threads).toHaveLength(1);
    expect(threads[0].elementId).toBe("el-1");
    expect(threads[0].comments[0].body).toBe("A fresh comment");
    expect(onCloseComposer).toHaveBeenCalled();

    spyBoardDoc.mockRestore();
  });

  it("does not place a pin for a thread whose element is gone", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "Orphan to be")!;
    // Delete the anchor element; the thread survives, its pin does not.
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);

    const { queryByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    expect(queryByTestId(`comment-pin-${id}`)).toBeNull();
    expect(doc.comment(id)).not.toBeNull();

    spyBoardDoc.mockRestore();
  });

  it("re-renders when a thread is committed from outside", () => {
    const { doc, spyBoardDoc } = setup();

    const { queryByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    let id = "";
    act(() => {
      id = createCommentThread(doc, "el-1", "From outside")!;
    });
    expect(queryByTestId(`comment-pin-${id}`)).not.toBeNull();

    spyBoardDoc.mockRestore();
  });

  it("dismisses open thread and composer on Escape key", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "Dismiss me")!;
    const onCloseComposer = vi.fn();

    const { getByTestId, queryByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget="el-1"
        onCloseComposer={onCloseComposer}
      />,
    );

    // Click pin to open thread
    act(() => {
      fireEvent.click(getByTestId(`comment-pin-${id}`));
    });
    expect(getByTestId(`comment-thread-${id}`)).toBeDefined();

    // Press Escape
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(queryByTestId(`comment-thread-${id}`)).toBeNull();
    expect(onCloseComposer).toHaveBeenCalled();

    spyBoardDoc.mockRestore();
  });

  it("submits composer and reply with Cmd+Enter", () => {
    const { doc, spyBoardDoc } = setup();
    const onCloseComposer = vi.fn();

    const { getByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget="el-1"
        onCloseComposer={onCloseComposer}
      />,
    );

    const input = getByTestId("comment-composer-input") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(input, { target: { value: "Cmd+Enter comment" } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    });

    const threads = doc.read().comments;
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].body).toBe("Cmd+Enter comment");
    expect(onCloseComposer).toHaveBeenCalled();

    // Now reply with Cmd+Enter
    const threadId = threads[0].id;
    const replyInput = getByTestId(
      "comment-reply-input",
    ) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(replyInput, { target: { value: "Cmd+Enter reply" } });
    });
    act(() => {
      fireEvent.keyDown(replyInput, { key: "Enter", metaKey: true });
    });

    expect(doc.comment(threadId)?.comments).toHaveLength(2);
    expect(doc.comment(threadId)?.comments[1].body).toBe("Cmd+Enter reply");

    spyBoardDoc.mockRestore();
  });

  it("deletes a thread from the thread popover", () => {
    const { doc, spyBoardDoc } = setup();
    const id = createCommentThread(doc, "el-1", "Delete me")!;

    const { getByTestId, queryByTestId } = render(
      <CommentLayer
        excalidrawAPI={fakeEditor()}
        composerTarget={null}
        onCloseComposer={() => {}}
      />,
    );

    act(() => {
      fireEvent.click(getByTestId(`comment-pin-${id}`));
    });
    expect(getByTestId(`comment-thread-${id}`)).toBeDefined();

    act(() => {
      fireEvent.click(getByTestId("comment-delete"));
    });

    expect(doc.comment(id)).toBeNull();
    expect(queryByTestId(`comment-thread-${id}`)).toBeNull();
    expect(queryByTestId(`comment-pin-${id}`)).toBeNull();

    spyBoardDoc.mockRestore();
  });
});
