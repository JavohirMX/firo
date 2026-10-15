import React, { useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { FiroElement } from "@firo/schema";

import { boardDoc } from "../board/board";

import "./TagLayer.scss";

export interface TagLayerProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  onSelectTag?: (tag: string) => void;
}

/**
 * The element tags layer, drawn over the canvas.
 *
 * ## Why an HTML overlay
 *
 * Like CommentLayer, tags are chrome, not exported board content: they must
 * not be drawn into exported PNGs/SVGs and must scale with zoom while remaining
 * clean and legible. Tags are positioned at the bottom of each tagged element.
 */
export const TagLayer: React.FC<TagLayerProps> = ({
  excalidrawAPI,
  onSelectTag,
}) => {
  const [, setDocRevision] = useState(0);
  const [, setViewportRevision] = useState(0);

  // Re-render when elements change in the document
  useEffect(() => {
    const doc = boardDoc();
    const unsubscribe = doc.onUpdate(() => {
      setDocRevision((prev) => prev + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Re-render on pan and zoom so tags track elements
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

  const appState = excalidrawAPI?.getAppState();
  const viewport = {
    scrollX: appState?.scrollX ?? 0,
    scrollY: appState?.scrollY ?? 0,
    zoom: appState?.zoom?.value ?? 1,
  };

  const doc = boardDoc();
  const elements = (doc.read().elements as readonly FiroElement[]).filter(
    (el) => !el.isDeleted && Boolean(el.tags && el.tags.length > 0),
  );

  if (!elements.length) {
    return null;
  }

  return (
    <div className="firo-tags-layer" data-testid="firo-tags-layer">
      {elements.map((element) => {
        const left = (element.x + viewport.scrollX) * viewport.zoom;
        const top =
          (element.y + element.height + viewport.scrollY) * viewport.zoom;

        return (
          <div
            key={element.id}
            className="firo-element-tags-container"
            style={{ left: `${left}px`, top: `${top}px` }}
            data-testid={`element-tags-${element.id}`}
          >
            {element.tags!.map((tag) => (
              <span
                key={tag}
                className="firo-element-tag-badge"
                data-testid={`tag-badge-${element.id}-${tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTag?.(tag);
                }}
                title={`Filter by tag #${tag}`}
              >
                #{tag}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default TagLayer;
