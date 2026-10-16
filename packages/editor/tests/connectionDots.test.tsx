import { describe, it, expect, vi } from "vitest";
import { THEME, type EditorInterface } from "@firo/common";
import { getAllMidpoints, isBindableElement } from "@firo/element";
import { pointFrom, type GlobalPoint } from "@firo/math";

import type {
  ElementsMap,
  ExcalidrawBindableElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@firo/element/types";

import { getDefaultAppState } from "../appState";
import {
  renderConnectionDots,
  renderInteractiveScene,
  renderBindingHighlight,
  getHoveredBindableElement,
} from "../renderer/interactiveScene";

import { API } from "./helpers/api";

import type { InteractiveCanvasAppState } from "../types";
import type { InteractiveSceneRenderConfig } from "../scene/types";

const defaultState = getDefaultAppState();

const mockEditorInterface: EditorInterface = {
  formFactor: "desktop",
  desktopUIMode: "full",
  userAgent: {
    isMobileDevice: false,
    platform: "other",
  },
  isTouchScreen: false,
  canFitSidebar: true,
  isLandscape: true,
};

const createTool = (
  type: "selection" | "arrow" | "line" | "freedraw" | "rectangle",
) =>
  ({
    ...defaultState.activeTool,
    type,
    customType: null,
  } as InteractiveCanvasAppState["activeTool"]);

const createMockContext = () => {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    rotate: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    globalAlpha: 1,
    lineDashOffset: 0,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
};

const createMockAppState = (
  overrides?: Partial<InteractiveCanvasAppState>,
): InteractiveCanvasAppState => {
  return {
    ...defaultState,
    activeTool: createTool("selection"),
    zoom: { value: 1 as any },
    scrollX: 0,
    scrollY: 0,
    theme: THEME.LIGHT,
    hoveredElementIds: {},
    suggestedBinding: null,
    isBindingEnabled: true,
    isMidpointSnappingEnabled: true,
    gridModeEnabled: false,
    ...overrides,
  } as InteractiveCanvasAppState;
};

describe("Miro Visual Quick Connection Anchor Dots on Element Hover", () => {
  describe("Midpoint computation", () => {
    it("computes 4 edge midpoints (right, bottom, left, top) for a rectangle", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        angle: 0,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;

      const midpoints = getAllMidpoints(rect, elementsMap);
      expect(midpoints).toHaveLength(4);

      // [right, bottom, left, top]
      const [right, bottom, left, top] = midpoints;
      expect(right[0]).toBeCloseTo(300);
      expect(right[1]).toBeCloseTo(150);

      expect(bottom[0]).toBeCloseTo(200);
      expect(bottom[1]).toBeCloseTo(200);

      expect(left[0]).toBeCloseTo(100);
      expect(left[1]).toBeCloseTo(150);

      expect(top[0]).toBeCloseTo(200);
      expect(top[1]).toBeCloseTo(100);
    });

    it("computes 4 edge midpoints for a sticky note", () => {
      const stickyNote = API.createElement({
        type: "stickynote",
        x: 50,
        y: 80,
        width: 120,
        height: 120,
        angle: 0,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[stickyNote.id, stickyNote]]) as ElementsMap;

      expect(isBindableElement(stickyNote)).toBe(true);

      const midpoints = getAllMidpoints(stickyNote, elementsMap);
      expect(midpoints).toHaveLength(4);

      // [right, bottom, left, top]
      const [right, bottom, left, top] = midpoints;
      expect(right[0]).toBeCloseTo(170);
      expect(right[1]).toBeCloseTo(140);

      expect(bottom[0]).toBeCloseTo(110);
      expect(bottom[1]).toBeCloseTo(200);

      expect(left[0]).toBeCloseTo(50);
      expect(left[1]).toBeCloseTo(140);

      expect(top[0]).toBeCloseTo(110);
      expect(top[1]).toBeCloseTo(80);
    });

    it("correctly rotates midpoints for a rotated rectangle", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        angle: Math.PI / 2, // 90 degrees clockwise
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;

      const midpoints = getAllMidpoints(rect, elementsMap);
      expect(midpoints).toHaveLength(4);

      // Center is at (100, 50)
      // Right edge (200, 50) rotated 90 deg around (100, 50): dx = 100, dy = 0 -> (100, 150)
      const [right] = midpoints;
      expect(right[0]).toBeCloseTo(100);
      expect(right[1]).toBeCloseTo(150);
    });
  });

  describe("renderConnectionDots unit rendering", () => {
    it("renders 4 anchor dots with Miro blue fill and white stroke for a rectangle", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({ zoom: { value: 1 as any } });

      renderConnectionDots(context, rect, elementsMap, appState);

      // 4 midpoints = 4 circles drawn
      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fill).toHaveBeenCalledTimes(4);
      expect(context.stroke).toHaveBeenCalledTimes(4);

      // Miro blue fill in light theme
      expect(context.fillStyle).toBe("#4262ff");
      // White stroke
      expect(context.strokeStyle).toBe("#ffffff");
      // Dot radius: 4.5 / zoom
      expect(context.arc).toHaveBeenNthCalledWith(
        1,
        300,
        150,
        4.5,
        0,
        2 * Math.PI,
      );
      // Stroke width: 1.5 / zoom
      expect(context.lineWidth).toBe(1.5);

      // Each midpoint is wrapped in save and restore
      expect(context.save).toHaveBeenCalled();
      expect(context.restore).toHaveBeenCalled();
    });

    it("renders 4 anchor dots for a sticky note", () => {
      const context = createMockContext();
      const stickyNote = API.createElement({
        type: "stickynote",
        x: 200,
        y: 200,
        width: 150,
        height: 150,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[stickyNote.id, stickyNote]]) as ElementsMap;
      const appState = createMockAppState({ zoom: { value: 1 as any } });

      renderConnectionDots(context, stickyNote, elementsMap, appState);

      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
      expect(context.lineWidth).toBe(1.5);
    });

    it("renders with dark theme Miro blue (#6988ff) in dark mode", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({ theme: THEME.DARK });

      renderConnectionDots(context, rect, elementsMap, appState);

      expect(context.fillStyle).toBe("#6988ff");
      expect(context.strokeStyle).toBe("#ffffff");
    });

    it("scales dot radius and stroke width according to zoom", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({ zoom: { value: 2 as any } });

      renderConnectionDots(context, rect, elementsMap, appState);

      // Dot radius: 4.5 / 2 = 2.25
      expect(context.arc).toHaveBeenNthCalledWith(
        1,
        100,
        50,
        2.25,
        0,
        2 * Math.PI,
      );
      // Stroke width: 1.5 / 2 = 0.75
      expect(context.lineWidth).toBe(0.75);
    });
  });

  describe("Hover element resolution (getHoveredBindableElement)", () => {
    it("resolves hoveredElement from appState.hoveredElement", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        hoveredElement: rect,
      } as any);

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [rect],
      });
      expect(result).toBe(rect);
    });

    it("resolves hoveredElement from appState.hoveredElementId", () => {
      const stickyNote = API.createElement({
        type: "stickynote",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const elementsMap = new Map([[stickyNote.id, stickyNote]]) as ElementsMap;
      const appState = createMockAppState({
        hoveredElementId: stickyNote.id,
      } as any);

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [stickyNote],
      });
      expect(result).toBe(stickyNote);
    });

    it("resolves hoveredElement from appState.hoveredElementIds", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        hoveredElementIds: { [rect.id]: true },
      });

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [rect],
      });
      expect(result).toBe(rect);
    });

    it("resolves hoveredElement from appState.suggestedBinding.element", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        suggestedBinding: { element: rect, midPoint: null as any },
      });

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [rect],
      });
      expect(result).toBe(rect);
    });

    it("resolves hoveredElement from pointer coords hitting element", () => {
      const rect = API.createElement({
        type: "rectangle",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
      });
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        pointerCoords: pointFrom<GlobalPoint>(75, 75),
      } as any);

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [rect],
      });
      expect(result).toBe(rect);
    });

    it("returns null for non-bindable elements like lines", () => {
      const line = API.createElement({
        type: "line",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        points: [[0, 0] as any, [100, 100] as any],
      });
      const elementsMap = new Map([[line.id, line]]) as ElementsMap;
      const appState = createMockAppState({
        hoveredElement: line,
      } as any);

      const result = getHoveredBindableElement({
        appState,
        allElementsMap: elementsMap as any,
        elementsMap,
        visibleElements: [line],
      });
      expect(result).toBeNull();
    });
  });

  describe("renderInteractiveScene integration", () => {
    const runInteractiveScene = (
      appState: InteractiveCanvasAppState,
      elements: NonDeletedExcalidrawElement[],
      canvasCtx: CanvasRenderingContext2D,
    ) => {
      const elementsMap = new Map(
        elements.map((el) => [el.id, el]),
      ) as ElementsMap;
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      vi.spyOn(canvas, "getContext").mockReturnValue(canvasCtx);

      const config: InteractiveSceneRenderConfig = {
        app: {
          lastPointerMoveCoords: null,
          lastPointerMoveEvent: null,
          viewport: { lastPosition: null },
        } as any,
        canvas,
        elementsMap: elementsMap as any,
        visibleElements: elements,
        selectedElements: [],
        allElementsMap: elementsMap as any,
        scale: 1,
        appState,
        renderConfig: {
          remotePointerViewportCoords: new Map(),
          remotePointerButton: new Map(),
          remoteSelectedElementIds: new Map(),
          remotePointerUsernames: new Map(),
          remotePointerUserStates: new Map(),
          selectionColor: "#4262ff",
          renderScrollbars: false,
          lastViewportPosition: { x: 0, y: 0 },
        },
        editorInterface: mockEditorInterface,
        callback: vi.fn(),
        deltaTime: 0,
      };

      return renderInteractiveScene(config);
    };

    it("renders connection dots when hovering rectangle in selection tool mode", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      const appState = createMockAppState({
        activeTool: createTool("selection"),
        hoveredElementIds: { [rect.id]: true },
      });

      runInteractiveScene(appState, [rect], context);

      // Arc should have been called 4 times for the 4 anchor dots
      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
      expect(context.lineWidth).toBe(1.5);
    });

    it("renders connection dots when hovering sticky note in selection tool mode", () => {
      const context = createMockContext();
      const stickyNote = API.createElement({
        type: "stickynote",
        x: 150,
        y: 150,
        width: 120,
        height: 120,
      });
      const appState = createMockAppState({
        activeTool: createTool("selection"),
        hoveredElementIds: { [stickyNote.id]: true },
      });

      runInteractiveScene(appState, [stickyNote], context);

      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
    });

    it("renders connection dots when hovering in arrow tool mode", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      const appState = createMockAppState({
        activeTool: createTool("arrow"),
        hoveredElementIds: { [rect.id]: true },
      });

      runInteractiveScene(appState, [rect], context);

      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
    });

    it("renders connection dots when hovering in line tool mode", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      const appState = createMockAppState({
        activeTool: createTool("line"),
        hoveredElementIds: { [rect.id]: true },
      });

      runInteractiveScene(appState, [rect], context);

      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
    });

    it("does NOT render connection dots in non-connecting tool modes (e.g. freedraw)", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      const appState = createMockAppState({
        activeTool: createTool("freedraw"),
        hoveredElementIds: { [rect.id]: true },
      });

      runInteractiveScene(appState, [rect], context);

      expect(context.arc).not.toHaveBeenCalled();
    });

    it("does NOT render connection dots when no element is hovered", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      const appState = createMockAppState({
        activeTool: createTool("selection"),
        hoveredElementIds: {},
      });

      runInteractiveScene(appState, [rect], context);

      expect(context.arc).not.toHaveBeenCalled();
    });
  });

  describe("renderBindingHighlight integration", () => {
    it("renders connection dots when renderBindingHighlight is invoked for suggestedBinding", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        activeTool: createTool("arrow"),
        suggestedBinding: { element: rect, midPoint: null as any },
      });

      renderBindingHighlight(
        {
          lastPointerMoveCoords: null,
          lastPointerMoveEvent: null,
        } as any,
        context,
        appState.suggestedBinding,
        elementsMap as unknown as NonDeletedSceneElementsMap,
        appState,
        0,
      );

      // Check that 4 anchor dots were rendered
      expect(context.arc).toHaveBeenCalledTimes(4);
      expect(context.fillStyle).toBe("#4262ff");
      expect(context.strokeStyle).toBe("#ffffff");
    });
  });

  describe("Magnetic snapping and resize handle non-interference", () => {
    it("magnetically snaps and emphasizes anchor dot when cursor is within 8px radius", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;

      // Right midpoint is at (300, 150)
      // Cursor is at (304, 152), distance = sqrt(16 + 4) = ~4.47px <= 8px
      const appState = createMockAppState({
        zoom: { value: 1 as any },
        pointerCoords: pointFrom<GlobalPoint>(304, 152),
      } as any);

      renderConnectionDots(context, rect, elementsMap, appState);

      // The right midpoint is the first one in [right, bottom, left, top]
      // Magnetically snapped dot should have radius 6
      expect(context.arc).toHaveBeenNthCalledWith(
        1,
        300,
        150,
        6,
        0,
        2 * Math.PI,
      );
      // Non-snapped midpoints keep the standard 4.5 radius
      expect(context.arc).toHaveBeenNthCalledWith(
        2,
        200,
        200,
        4.5,
        0,
        2 * Math.PI,
      );
    });

    it("does NOT render connection dots when element is actively resizing", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        isResizing: true,
      } as any);

      renderConnectionDots(context, rect, elementsMap, appState);

      expect(context.arc).not.toHaveBeenCalled();
    });

    it("does NOT render connection dots when element is actively rotating", () => {
      const context = createMockContext();
      const rect = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      }) as unknown as NonDeleted<ExcalidrawBindableElement>;
      const elementsMap = new Map([[rect.id, rect]]) as ElementsMap;
      const appState = createMockAppState({
        isRotating: true,
      });

      renderConnectionDots(context, rect, elementsMap, appState);

      expect(context.arc).not.toHaveBeenCalled();
    });
  });
});
