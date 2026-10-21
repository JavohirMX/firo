import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as Y from "yjs";
import { createDocBlockRecord } from "@firo/schema";
import { createDefaultDocBlockNode, docBlockSchema } from "@firo/records";

import { isWritableElement } from "@firo/common";

import {
  computeDocBlockLayout,
  renderDocBlock,
} from "../renderer/renderDocBlock";
import { DocBlockOverlay } from "../components/DocBlockOverlay";

describe("Doc Block Canvas Renderer (renderDocBlock)", () => {
  it("computes layout for structured blocks with word wrapping and caching", () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;

    const doc = docBlockSchema.nodes.doc.create(null, [
      docBlockSchema.nodes.heading.create(
        { level: 1 },
        docBlockSchema.text("Architecture Guide"),
      ),
      docBlockSchema.nodes.paragraph.create(
        null,
        docBlockSchema.text(
          "This is a paragraph explaining the system design.",
        ),
      ),
      docBlockSchema.nodes.bulletList.create(null, [
        docBlockSchema.nodes.listItem.create(
          null,
          docBlockSchema.nodes.paragraph.create(
            null,
            docBlockSchema.text("First point"),
          ),
        ),
      ]),
      docBlockSchema.nodes.blockquote.create(
        null,
        docBlockSchema.nodes.paragraph.create(
          null,
          docBlockSchema.text("Note this"),
        ),
      ),
      docBlockSchema.nodes.codeBlock.create(
        null,
        docBlockSchema.text("const a = 10;"),
      ),
    ]);

    const layout = computeDocBlockLayout(context, doc, 500);

    expect(layout.blocks).toHaveLength(5);
    expect(layout.blocks[0].type).toBe("heading");
    expect(layout.blocks[1].type).toBe("paragraph");
    expect(layout.blocks[2].type).toBe("bulletItem");
    expect(layout.blocks[3].type).toBe("blockquote");
    expect(layout.blocks[4].type).toBe("codeBlock");
  });

  it("renders doc block onto 2D canvas context", () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const fillTextSpy = vi.spyOn(context, "fillText");

    const record = createDocBlockRecord({
      title: "RFC 42",
      dimensions: { width: 560, height: 400 },
    });
    const doc = createDefaultDocBlockNode("RFC 42");

    renderDocBlock(context, record, doc, 50, 50, 560, 400, 1, false);

    expect(fillTextSpy).toHaveBeenCalled();
  });

  it("freezes content rendering on canvas during active editing per TRD-05", () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const fillTextSpy = vi.spyOn(context, "fillText");

    const record = createDocBlockRecord({
      title: "RFC Active Edit",
      dimensions: { width: 560, height: 400 },
    });
    const doc = createDefaultDocBlockNode("RFC Active Edit");

    // isEditing = true: canvas rendering of text content must be frozen
    renderDocBlock(context, record, doc, 50, 50, 560, 400, 1, true);

    expect(fillTextSpy).not.toHaveBeenCalled();
  });
});

describe("DocBlockOverlay", () => {
  it("mounts EditorView at device scale without CSS transform: scale() per TRD-05", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-test-fragment");

    const record = createDocBlockRecord({
      title: "Roadmap Doc",
      dimensions: { width: 400, height: 300 },
    });

    const appState = {
      zoom: { value: 1.5 },
      scrollX: 100,
      scrollY: 50,
      offsetLeft: 10,
      offsetTop: 20,
    };

    const layout = {
      x: 200,
      y: 100,
      width: 400,
      height: 300,
    };

    const onCommit = vi.fn();
    const onDiscard = vi.fn();

    // A wide viewport, so the viewport-anchoring clamp does not engage and
    // the raw device-scale maths below is what the assertions see.
    Object.defineProperty(window, "innerWidth", {
      value: 2000,
      configurable: true,
    });

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={layout}
        appState={appState}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );

    const overlayEl = container.querySelector(
      ".DocBlockOverlay",
    ) as HTMLElement;
    expect(overlayEl).toBeDefined();

    // Verify explicit device-scale calculation without CSS transform: scale()
    // screenLeft = (200 + 100) * 1.5 + 10 = 460px
    // screenTop = (100 + 50) * 1.5 + 20 = 245px
    // screenWidth = 400 * 1.5 = 600px
    // screenHeight = 300 * 1.5 = 450px
    expect(overlayEl.style.left).toBe("460px");
    expect(overlayEl.style.top).toBe("245px");
    expect(overlayEl.style.width).toBe("600px");
    expect(overlayEl.style.height).toBe("450px");

    // MUST NOT use CSS transform: scale()
    expect(overlayEl.style.transform).toBe("");

    // ProseMirror editor mount
    const editor = overlayEl.querySelector(".ProseMirror");
    expect(editor).toBeDefined();
  });

  it("anchors the overlay inside the viewport and floors the editing scale at deep zoom", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-test-clamp");

    // Pin the jsdom default viewport: an earlier test widens it.
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
    });

    const record = createDocBlockRecord({
      title: "Clamped Doc",
      dimensions: { width: 400, height: 300 },
    });

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 2000, y: 100, width: 400, height: 300 }}
        appState={{ zoom: { value: 0.1 }, scrollX: 0, scrollY: 0 }}
      />,
    );

    const overlayEl = container.querySelector(
      ".DocBlockOverlay",
    ) as HTMLElement;

    // Deep zoom floors the editing scale at 0.75, so the editor stays usable:
    // width = 400 * 0.75 = 300px, height = 300 * 0.75 = 225px, font 16 * 0.75 = 12px.
    expect(overlayEl.style.width).toBe("300px");
    expect(overlayEl.style.height).toBe("225px");
    // Raw left = 2000 * 0.1 = 200px fits the 1024px jsdom viewport unclamped.
    expect(overlayEl.style.left).toBe("200px");
    // Raw top = 100 * 0.1 = 10px, above the 8px margin.
    expect(overlayEl.style.top).toBe("10px");
    const editor = overlayEl.querySelector(".ProseMirror") as HTMLElement;
    expect(editor.style.fontSize).toBe("12px");
  });

  it("clamps the overlay back into the viewport when it would overflow", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-test-clamp-edge");

    // Pin the jsdom default viewport: an earlier test widens it.
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
    });

    const record = createDocBlockRecord({
      title: "Overflow Doc",
      dimensions: { width: 400, height: 300 },
    });

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 200, y: 100, width: 400, height: 300 }}
        appState={{
          zoom: { value: 1.5 },
          scrollX: 100,
          scrollY: 50,
          offsetLeft: 10,
          offsetTop: 20,
        }}
      />,
    );

    const overlayEl = container.querySelector(
      ".DocBlockOverlay",
    ) as HTMLElement;

    // Raw left 460 + width 600 would overflow the 1024px jsdom viewport, so
    // the left edge clamps to 1024 - 600 - 8 = 416px. Top 245 + height 450
    // fits and stays.
    expect(overlayEl.style.left).toBe("416px");
    expect(overlayEl.style.top).toBe("245px");
    expect(overlayEl.style.width).toBe("600px");
    expect(overlayEl.style.height).toBe("450px");
  });

  it("is a writable element so canvas shortcuts do not eat typed keys", async () => {
    vi.useFakeTimers();
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-fragment-focus");
    const record = createDocBlockRecord({ title: "Focus" });

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 0, y: 0, width: 400, height: 300 }}
        appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
      />,
    );
    const editor = container.querySelector(".ProseMirror") as HTMLElement;

    // The editor's own typing must not be treated as canvas shortcuts
    // (space pans, "c" picks the comment tool, and so on).
    expect(isWritableElement(editor)).toBe(true);

    // The canvas takes focus after the placing click; focus comes back.
    (
      (document.body.querySelector("input,textarea") ??
        document.body) as HTMLElement
    ).focus();
    vi.runAllTimers();
    expect(document.activeElement).toBe(editor);
    vi.useRealTimers();
  });

  it("keeps focus inside the block on Tab and moves title to body on Enter", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-fragment-tab");
    const record = createDocBlockRecord({ title: "Tabs" });
    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 0, y: 0, width: 400, height: 300 }}
        appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
      />,
    );
    const editor = container.querySelector(".ProseMirror") as HTMLElement;
    const title = container.querySelector(
      ".DocBlockOverlay-title",
    ) as HTMLElement;

    editor.focus();
    const tab = fireEvent.keyDown(editor, { key: "Tab" });
    expect(tab).toBe(false); // default prevented, focus is not lost
    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(title);
    fireEvent.keyDown(title, { key: "Enter" });
    expect(document.activeElement).toBe(editor);
  });

  it("ignores the press that placed the block but commits on a later outside press", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-fragment-outside");
    const record = createDocBlockRecord({ title: "Outside" });
    const onCommit = vi.fn();
    const onDiscard = vi.fn();

    // The placing press exists before the overlay mounts.
    const placingPress = new MouseEvent("mousedown", { bubbles: true });

    render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 0, y: 0, width: 400, height: 300 }}
        appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );

    document.body.dispatchEvent(placingPress);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onCommit.mock.calls.length + onDiscard.mock.calls.length).toBe(1);
  });

  it("commits on Cmd+Enter", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-fragment-2");

    const record = createDocBlockRecord({ title: "Quick Notes" });
    const onCommit = vi.fn();
    const onDiscard = vi.fn();

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 0, y: 0, width: 400, height: 300 }}
        appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );

    const overlayEl = container.querySelector(
      ".DocBlockOverlay",
    ) as HTMLElement;

    fireEvent.keyDown(overlayEl, { key: "Enter", metaKey: true });
    expect(onCommit).toHaveBeenCalled();
  });

  it("discards on Escape when untouched", () => {
    const yDoc = new Y.Doc();
    const fragment = yDoc.getXmlFragment("doc-block-fragment-3");

    const record = createDocBlockRecord({ title: "Untouched Note" });
    const onCommit = vi.fn();
    const onDiscard = vi.fn();

    const { container } = render(
      <DocBlockOverlay
        record={record}
        fragment={fragment}
        layout={{ x: 0, y: 0, width: 400, height: 300 }}
        appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );

    const overlayEl = container.querySelector(
      ".DocBlockOverlay",
    ) as HTMLElement;

    fireEvent.keyDown(overlayEl, { key: "Escape" });
    expect(onDiscard).toHaveBeenCalled();
  });

  /*
   * Regression: React error #185 ("Maximum update depth exceeded") when
   * placing a doc block in the dev server. StrictMode mounts the overlay
   * with a setup -> cleanup -> setup cycle; the mount effect's cleanup
   * used to discard the session synchronously, which set the parent's
   * activeDocBlockId to null, and the still-selected element re-opened the
   * overlay on the next editor change — an unmount/remount loop that
   * crashed the app. The cleanup now defers the session end and the
   * re-setup cancels it.
   */
  it("survives StrictMode's simulated unmount without discarding the session", () => {
    vi.useFakeTimers();
    try {
      const yDoc = new Y.Doc();
      const fragment = yDoc.getXmlFragment("doc-block-strictmode-fragment");
      const record = createDocBlockRecord({
        title: "StrictMode Doc",
        dimensions: { width: 400, height: 300 },
      });
      const appState = { zoom: { value: 1 }, scrollX: 0, scrollY: 0 };
      const layout = { x: 0, y: 0, width: 400, height: 300 };
      const onCommit = vi.fn();
      const onDiscard = vi.fn();
      const onClose = vi.fn();

      const { container, unmount } = render(
        <React.StrictMode>
          <DocBlockOverlay
            record={record}
            fragment={fragment}
            layout={layout}
            appState={appState}
            onCommit={onCommit}
            onDiscard={onDiscard}
            onClose={onClose}
          />
        </React.StrictMode>,
      );

      // The simulated unmount must not end the session, even after the
      // deferred session-end task would have fired.
      vi.runAllTimers();
      expect(onDiscard).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(container.querySelector(".DocBlockOverlay")).not.toBeNull();

      // A real unmount still discards an untouched session (TRD-05).
      unmount();
      vi.runAllTimers();
      expect(onDiscard).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
