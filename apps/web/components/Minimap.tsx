import React, { useEffect, useRef, useState, useCallback } from "react";
import { CloseIcon } from "@firo/ui";
import { useApp, useExcalidrawAPI } from "@firo/editor";

import type { AppState, ExcalidrawImperativeAPI } from "@firo/editor/types";
import type {
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@firo/element/types";

import { boardDoc } from "../board/board";

import "./Minimap.scss";

export interface MinimapProps {
  app?: any;
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
  elements?: readonly (
    | NonDeletedExcalidrawElement
    | OrderedExcalidrawElement
  )[];
  onClose?: () => void;
}

export const MINIMAP_WIDTH = 220;
export const MINIMAP_HEIGHT = 140;

export const Minimap: React.FC<MinimapProps> = ({
  app: propApp,
  excalidrawAPI: propApi,
  elements: propElements,
  onClose,
}) => {
  const appFromContext = useApp();
  const apiFromContext = useExcalidrawAPI();

  const app = propApp ?? appFromContext;
  const excalidrawAPI = propApi ?? apiFromContext;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportRev, setViewportRev] = useState(0);
  const [docRev, setDocRev] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorMode, setCursorMode] = useState<"default" | "grab" | "grabbing">(
    "default",
  );

  // Subscribe to pan & zoom changes
  useEffect(() => {
    if (excalidrawAPI?.onScrollChange) {
      const unsubscribe = excalidrawAPI.onScrollChange(() => {
        setViewportRev((v) => v + 1);
      });
      return () => {
        unsubscribe();
      };
    }
  }, [excalidrawAPI]);

  // Subscribe to document updates for canvas content changes
  useEffect(() => {
    try {
      const doc = boardDoc();
      const unsubscribe = doc.onUpdate(() => {
        setDocRev((v) => v + 1);
      });
      return () => {
        unsubscribe();
      };
    } catch {
      // boardDoc not initialized
    }
  }, []);

  // Also subscribe to editor onChange if present
  useEffect(() => {
    if (excalidrawAPI?.onChange) {
      const unsubscribe = excalidrawAPI.onChange(() => {
        setDocRev((v) => v + 1);
      });
      return () => {
        unsubscribe();
      };
    }
  }, [excalidrawAPI]);

  const getElements = useCallback((): readonly (
    | NonDeletedExcalidrawElement
    | OrderedExcalidrawElement
  )[] => {
    if (propElements) {
      return propElements;
    }
    if (app?.scene?.getNonDeletedElements) {
      return app.scene.getNonDeletedElements();
    }
    if (excalidrawAPI?.getSceneElements) {
      return excalidrawAPI.getSceneElements().filter((el) => !el.isDeleted);
    }
    return [];
  }, [propElements, app, excalidrawAPI]);

  const getViewport = useCallback(() => {
    const appState: Partial<AppState> =
      app?.state ?? excalidrawAPI?.getAppState() ?? {};
    const scrollX = appState.scrollX ?? 0;
    const scrollY = appState.scrollY ?? 0;
    const zoom =
      (typeof appState.zoom === "object"
        ? appState.zoom.value
        : appState.zoom) ?? 1;
    const width =
      appState.width ||
      (typeof window !== "undefined" ? window.innerWidth : 800);
    const height =
      appState.height ||
      (typeof window !== "undefined" ? window.innerHeight : 600);

    return { scrollX, scrollY, zoom, width, height };
  }, [app, excalidrawAPI]);

  const calculateBoundsAndScale = useCallback(
    (
      elements: readonly (
        | NonDeletedExcalidrawElement
        | OrderedExcalidrawElement
      )[],
      viewport: {
        scrollX: number;
        scrollY: number;
        zoom: number;
        width: number;
        height: number;
      },
    ) => {
      const viewMinX = -viewport.scrollX;
      const viewMinY = -viewport.scrollY;
      const viewWidth = viewport.width / viewport.zoom;
      const viewHeight = viewport.height / viewport.zoom;
      const viewMaxX = viewMinX + viewWidth;
      const viewMaxY = viewMinY + viewHeight;

      let elemMinX = Infinity;
      let elemMinY = Infinity;
      let elemMaxX = -Infinity;
      let elemMaxY = -Infinity;
      let hasElements = false;

      for (const el of elements) {
        if (el.isDeleted) {
          continue;
        }
        hasElements = true;
        elemMinX = Math.min(elemMinX, el.x);
        elemMinY = Math.min(elemMinY, el.y);
        elemMaxX = Math.max(elemMaxX, el.x + (el.width || 0));
        elemMaxY = Math.max(elemMaxY, el.y + (el.height || 0));
      }

      if (!hasElements) {
        elemMinX = viewMinX;
        elemMinY = viewMinY;
        elemMaxX = viewMaxX;
        elemMaxY = viewMaxY;
      }

      const allMinX = Math.min(elemMinX, viewMinX);
      const allMinY = Math.min(elemMinY, viewMinY);
      const allMaxX = Math.max(elemMaxX, viewMaxX);
      const allMaxY = Math.max(elemMaxY, viewMaxY);

      const padX = Math.max(100, (allMaxX - allMinX) * 0.1);
      const padY = Math.max(100, (allMaxY - allMinY) * 0.1);
      const boundsMinX = allMinX - padX;
      const boundsMinY = allMinY - padY;
      const boundsMaxX = allMaxX + padX;
      const boundsMaxY = allMaxY + padY;
      const boundsW = Math.max(1, boundsMaxX - boundsMinX);
      const boundsH = Math.max(1, boundsMaxY - boundsMinY);

      const scale = Math.min(MINIMAP_WIDTH / boundsW, MINIMAP_HEIGHT / boundsH);
      const offsetX = (MINIMAP_WIDTH - boundsW * scale) / 2;
      const offsetY = (MINIMAP_HEIGHT - boundsH * scale) / 2;

      const toMinimapX = (x: number) => offsetX + (x - boundsMinX) * scale;
      const toMinimapY = (y: number) => offsetY + (y - boundsMinY) * scale;
      const toSceneX = (mx: number) => boundsMinX + (mx - offsetX) / scale;
      const toSceneY = (my: number) => boundsMinY + (my - offsetY) / scale;

      const vRectX = toMinimapX(viewMinX);
      const vRectY = toMinimapY(viewMinY);
      const vRectW = viewWidth * scale;
      const vRectH = viewHeight * scale;

      return {
        scale,
        offsetX,
        offsetY,
        boundsMinX,
        boundsMinY,
        boundsW,
        boundsH,
        viewWidth,
        viewHeight,
        toMinimapX,
        toMinimapY,
        toSceneX,
        toSceneY,
        vRectX,
        vRectY,
        vRectW,
        vRectH,
      };
    },
    [],
  );

  const panToMinimapPoint = useCallback(
    (mx: number, my: number) => {
      const elements = getElements();
      const viewport = getViewport();
      const { toSceneX, toSceneY, viewWidth, viewHeight } =
        calculateBoundsAndScale(elements, viewport);

      const targetSceneX = toSceneX(mx);
      const targetSceneY = toSceneY(my);

      const newScrollX = -(targetSceneX - viewWidth / 2);
      const newScrollY = -(targetSceneY - viewHeight / 2);

      // Ephemeral update only: never touches the Yjs document
      if (app?.viewport?.translate) {
        app.viewport.translate({ scrollX: newScrollX, scrollY: newScrollY });
      } else if (app?.setState) {
        app.setState({ scrollX: newScrollX, scrollY: newScrollY });
      } else if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          appState: { scrollX: newScrollX, scrollY: newScrollY },
        });
      }
      setViewportRev((v) => v + 1);
    },
    [app, excalidrawAPI, getElements, getViewport, calculateBoundsAndScale],
  );

  // Redraw canvas on viewport/document change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const elements = getElements();
    const viewport = getViewport();
    const { toMinimapX, toMinimapY, scale, vRectX, vRectY, vRectW, vRectH } =
      calculateBoundsAndScale(elements, viewport);

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Subtle background
    ctx.fillStyle = "rgba(245, 246, 248, 0.4)";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw miniature elements
    for (const el of elements) {
      if (el.isDeleted) {
        continue;
      }
      const ex = toMinimapX(el.x);
      const ey = toMinimapY(el.y);
      const ew = Math.max(2, (el.width || 0) * scale);
      const eh = Math.max(2, (el.height || 0) * scale);

      let fill = el.backgroundColor;
      if (!fill || fill === "transparent") {
        fill =
          el.strokeColor && el.strokeColor !== "transparent"
            ? el.strokeColor
            : "#94a3b8";
      }
      ctx.fillStyle = fill;

      ctx.beginPath();
      if (el.type === "ellipse") {
        ctx.ellipse(
          ex + ew / 2,
          ey + eh / 2,
          Math.max(1, ew / 2),
          Math.max(1, eh / 2),
          0,
          0,
          Math.PI * 2,
        );
      } else if (typeof ctx.roundRect === "function") {
        ctx.roundRect(ex, ey, ew, eh, 1.5);
      } else {
        ctx.rect(ex, ey, ew, eh);
      }
      ctx.fill();
    }

    // Draw viewport frame
    ctx.fillStyle = "rgba(91, 75, 255, 0.12)";
    ctx.strokeStyle = "#5b4bff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(vRectX, vRectY, vRectW, vRectH, 3);
    } else {
      ctx.rect(vRectX, vRectY, vRectW, vRectH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }, [viewportRev, docRev, getElements, getViewport, calculateBoundsAndScale]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setCursorMode("grabbing");
    panToMinimapPoint(mx, my);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging) {
      panToMinimapPoint(mx, my);
    } else {
      const elements = getElements();
      const viewport = getViewport();
      const { vRectX, vRectY, vRectW, vRectH } = calculateBoundsAndScale(
        elements,
        viewport,
      );
      const isInsideViewport =
        mx >= vRectX &&
        mx <= vRectX + vRectW &&
        my >= vRectY &&
        my <= vRectY + vRectH;
      setCursorMode(isInsideViewport ? "grab" : "default");
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignored
    }
    setIsDragging(false);
    setCursorMode("default");
  };

  const currentElements = getElements();
  const currentViewport = getViewport();
  const { vRectX, vRectY, vRectW, vRectH } = calculateBoundsAndScale(
    currentElements,
    currentViewport,
  );

  return (
    <div
      className="firo-minimap"
      role="region"
      aria-label="Canvas Minimap"
      data-testid="canvas-minimap"
      data-viewport-x={Math.round(vRectX)}
      data-viewport-y={Math.round(vRectY)}
      data-viewport-w={Math.round(vRectW)}
      data-viewport-h={Math.round(vRectH)}
      data-element-count={currentElements.length}
    >
      <div className="firo-minimap__header">
        <span className="firo-minimap__title">Minimap</span>
        {onClose && (
          <button
            type="button"
            className="firo-minimap__close-btn"
            onClick={onClose}
            aria-label="Close Minimap"
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      <div className="firo-minimap__body">
        <canvas
          ref={canvasRef}
          className={`firo-minimap__canvas ${
            cursorMode === "grabbing"
              ? "firo-minimap__canvas--grabbing"
              : cursorMode === "grab"
              ? "firo-minimap__canvas--grab"
              : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
    </div>
  );
};
