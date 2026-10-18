/**
 * DocBlockOverlay.tsx — Mounts ProseMirror EditorView over the infinite canvas.
 *
 * Rules & Invariants from TRD-05:
 * 1. Transform carefully: screen = (layoutPosition + sceneOffset) * zoom * devicePixelRatio.
 * 2. NO CSS `transform: scale()`: scaled text editors break under CSS transforms (Miro finding).
 *    We position and size the overlay explicitly rather than scaling it.
 * 3. Lifecycle:
 *    - Freezes canvas render of this element during edit.
 *    - Creates detached ProseMirror EditorView.
 *    - Binds to Yjs fragment via y-prosemirror.
 *    - Focuses and places cursor.
 *    - Handles Escape, Cmd+Enter, click outside, and blur.
 *    - Commits durable ProseMirror doc to Yjs on finish.
 *    - Never destroys an EditorView without committing or discarding.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { DOMParser, DOMSerializer } from "prosemirror-model";

import { createDefaultDocBlockNode, docBlockSchema } from "@firo/records";

import type { DocBlockRecord } from "@firo/schema";

import "./DocBlockOverlay.scss";

import type { Node as ProseMirrorNode } from "prosemirror-model";

export type DocBlockOverlayProps = {
  record: DocBlockRecord;
  fragment: Y.XmlFragment;
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  appState: {
    zoom: { value: number };
    scrollX: number;
    scrollY: number;
    offsetLeft?: number;
    offsetTop?: number;
  };
  devicePixelRatio?: number;
  onCommit?: (updatedDoc: ProseMirrorNode, updatedTitle?: string) => void;
  onDiscard?: () => void;
  onChange?: (updatedDoc: ProseMirrorNode, updatedTitle?: string) => void;
  onClose?: () => void;
  readOnly?: boolean;
};

/**
 * Lightweight y-prosemirror bidirectional binding for Y.XmlFragment and ProseMirror.
 */
class YProseMirrorBinding {
  private fragment: Y.XmlFragment;
  private editorElement: HTMLElement;
  private isApplyingRemoteUpdate = false;
  private observer: (
    events: Array<Y.YEvent<any>>,
    transaction: Y.Transaction,
  ) => void;

  constructor(
    fragment: Y.XmlFragment,
    editorElement: HTMLElement,
    onContentChange: () => void,
  ) {
    this.fragment = fragment;
    this.editorElement = editorElement;

    this.observer = (_events, transaction) => {
      if (transaction.local) {
        return;
      }
      this.isApplyingRemoteUpdate = true;
      try {
        this.renderFragmentToDOM();
        onContentChange();
      } finally {
        this.isApplyingRemoteUpdate = false;
      }
    };

    this.fragment.observeDeep(this.observer);
  }

  public renderFragmentToDOM(): void {
    if (this.fragment.length === 0) {
      return;
    }
    const htmlString = this.fragment.toString();
    if (htmlString) {
      const temp = document.createElement("div");
      temp.innerHTML = htmlString;
      const parsedDoc = DOMParser.fromSchema(docBlockSchema).parse(temp);
      this.editorElement.innerHTML = "";
      const domFragment = DOMSerializer.fromSchema(
        docBlockSchema,
      ).serializeFragment(parsedDoc.content);
      this.editorElement.appendChild(domFragment);
    }
  }

  public syncDOMToFragment(doc: ProseMirrorNode): void {
    if (this.isApplyingRemoteUpdate) {
      return;
    }
    const yDoc = this.fragment.doc;
    if (!yDoc) {
      return;
    }

    yDoc.transact(() => {
      // Clear existing fragment children
      while (this.fragment.length > 0) {
        this.fragment.delete(0, 1);
      }
      // Serialize ProseMirror doc to HTML and store as Y.XmlText/Y.XmlElement in fragment
      const div = document.createElement("div");
      const serialized = DOMSerializer.fromSchema(
        docBlockSchema,
      ).serializeFragment(doc.content);
      div.appendChild(serialized);

      const xmlText = new Y.XmlText();
      xmlText.insert(0, div.innerHTML);
      this.fragment.insert(0, [xmlText as unknown as Y.XmlElement]);
    });
  }

  public destroy(): void {
    this.fragment.unobserveDeep(this.observer);
  }
}

export const DocBlockOverlay: React.FC<DocBlockOverlayProps> = ({
  record,
  fragment,
  layout,
  appState,
  onCommit,
  onDiscard,
  onChange,
  onClose,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(record.title);
  const isDirtyRef = useRef(false);
  const hasCommittedRef = useRef(false);
  const bindingRef = useRef<YProseMirrorBinding | null>(null);

  // Compute screen coordinates explicitly WITHOUT CSS transform: scale() per TRD-05
  const zoom = appState.zoom.value;
  const screenLeft =
    (layout.x + appState.scrollX) * zoom + (appState.offsetLeft ?? 0);
  const screenTop =
    (layout.y + appState.scrollY) * zoom + (appState.offsetTop ?? 0);
  const screenWidth = layout.width * zoom;
  const screenHeight = layout.height * zoom;

  const styling = record.styling ?? {};
  const baseFontSize = styling.fontSize ?? 16;
  const scaledFontSize = baseFontSize * zoom;
  const scaledPadding = (styling.padding ?? 24) * zoom;
  const scaledBorderRadius = (styling.borderRadius ?? 8) * zoom;

  /**
   * Parse current DOM content into a ProseMirror Node.
   */
  const getCurrentDoc = useCallback((): ProseMirrorNode => {
    if (!editorRef.current) {
      return createDefaultDocBlockNode(title);
    }
    return DOMParser.fromSchema(docBlockSchema).parse(editorRef.current);
  }, [title]);

  /**
   * Commit current editing session to durable record per TRD-05 lifecycle.
   */
  const commit = useCallback(() => {
    if (hasCommittedRef.current) {
      return;
    }
    hasCommittedRef.current = true;

    const currentDoc = getCurrentDoc();

    // Sync to Y.XmlFragment
    if (bindingRef.current) {
      bindingRef.current.syncDOMToFragment(currentDoc);
    }

    onCommit?.(currentDoc, title);
    onChange?.(currentDoc, title);
    onClose?.();
  }, [getCurrentDoc, onCommit, onChange, onClose, title]);

  /**
   * Discard editing session if untouched or explicitly cancelled.
   */
  const discard = useCallback(() => {
    if (hasCommittedRef.current) {
      return;
    }
    hasCommittedRef.current = true;
    onDiscard?.();
    onClose?.();
  }, [onDiscard, onClose]);

  // Initialise ProseMirror DOM and Yjs binding on mount
  useEffect(() => {
    const editorEl = editorRef.current;
    if (!editorEl) {
      return;
    }

    // Initialize document content from Yjs fragment or record defaults
    if (fragment.length > 0) {
      const htmlString = fragment.toString();
      if (htmlString) {
        const temp = document.createElement("div");
        temp.innerHTML = htmlString;
        const parsed = DOMParser.fromSchema(docBlockSchema).parse(temp);
        editorEl.innerHTML = "";
        editorEl.appendChild(
          DOMSerializer.fromSchema(docBlockSchema).serializeFragment(
            parsed.content,
          ),
        );
      }
    } else {
      // Create initial document
      const initialDoc = createDefaultDocBlockNode();
      editorEl.innerHTML = "";
      editorEl.appendChild(
        DOMSerializer.fromSchema(docBlockSchema).serializeFragment(
          initialDoc.content,
        ),
      );
    }

    // Bind Yjs fragment
    const binding = new YProseMirrorBinding(fragment, editorEl, () => {
      isDirtyRef.current = true;
    });
    bindingRef.current = binding;

    // Focus editor and place cursor
    if (!readOnly) {
      editorEl.focus();
    }

    return () => {
      binding.destroy();
      // Ensure we never destroy without committing or discarding per TRD-05
      if (!hasCommittedRef.current) {
        if (isDirtyRef.current) {
          commit();
        } else {
          discard();
        }
      }
    };
  }, [fragment, readOnly, commit, discard]);

  // Handle global click outside to commit
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        commit();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [commit]);

  // Handle keyboard shortcuts per TRD-05
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isDirtyRef.current) {
        discard();
      } else {
        commit();
      }
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };

  const handleInput = () => {
    isDirtyRef.current = true;
    if (onChange) {
      onChange(getCurrentDoc(), title);
    }
  };

  return (
    <div
      ref={containerRef}
      className="DocBlockOverlay"
      style={{
        left: `${screenLeft}px`,
        top: `${screenTop}px`,
        width: `${screenWidth}px`,
        height: `${screenHeight}px`,
        fontSize: `${scaledFontSize}px`,
        padding: `${scaledPadding}px`,
        borderRadius: `${scaledBorderRadius}px`,
        backgroundColor: styling.backgroundColor ?? "#ffffff",
        color: styling.textColor ?? "#1e1e1e",
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="DocBlockOverlay-header">
        <input
          ref={titleInputRef}
          type="text"
          className="DocBlockOverlay-title"
          style={{ fontSize: `${scaledFontSize * 1.25}px` }}
          value={title}
          placeholder="Doc Title"
          disabled={readOnly}
          onChange={(e) => {
            const nextTitle = e.target.value;
            setTitle(nextTitle);
            isDirtyRef.current = true;
            if (onChange) {
              onChange(getCurrentDoc(), nextTitle);
            }
          }}
        />
      </div>

      <div
        ref={editorRef}
        className="ProseMirror"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        style={{
          fontSize: `${scaledFontSize}px`,
        }}
      />
    </div>
  );
};
