import "fake-indexeddb/auto";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as Y from "yjs";
import { createFiroDoc } from "@firo/doc";
import {
  createDocBlockRecord,
  createDocBlockCollection,
  DOC_BLOCK_COLLECTION_ID,
  isDocBlockRecord,
} from "@firo/schema";
import {
  docBlockRecordToFiroRecord,
  docBlockRecordFromFiroRecord,
} from "@firo/records";
import { DEFAULT_CREATION_ITEMS, DEFAULT_RAIL_TOOLS } from "@firo/ui";
import { DocBlockOverlay } from "@firo/editor";

import { CREATION_TOOLS, WebCreationRail, insertDocBlockOnBoard } from "../App";

const setActiveToolMock = vi.fn();
const handleButtonPointerDownMock = vi.fn();
const executeActionMock = vi.fn();

const mockAppState: any = {
  activeTool: { type: "selection", locked: false },
  zoom: { value: 1.5 },
  scrollX: 100,
  scrollY: 50,
  width: 1000,
  height: 800,
};

vi.mock("@firo/editor", async () => {
  const actual = await vi.importActual<any>("@firo/editor");
  return {
    ...actual,
    useApp: () => ({
      state: mockAppState,
      setActiveTool: setActiveToolMock,
      toolDrag: {
        handleButtonPointerDown: handleButtonPointerDownMock,
      },
    }),
    useExcalidrawActionManager: () => ({
      actions: {
        undo: "undoAction",
        redo: "redoAction",
      },
      executeAction: executeActionMock,
    }),
  };
});

describe("Canvas DocBlock Integration (§10.5)", () => {
  beforeEach(() => {
    setActiveToolMock.mockClear();
    handleButtonPointerDownMock.mockClear();
    executeActionMock.mockClear();
    window.localStorage.clear();
    mockAppState.activeTool.type = "selection";
  });

  describe("Rail Tool Registration & UI Exposure", () => {
    it("registers 'docblock' as an active creation tool in CREATION_TOOLS", () => {
      expect(CREATION_TOOLS.has("docblock")).toBe(true);
    });

    it("includes 'docblock' in default creation items and rail tools with DocIcon", () => {
      const docItem = DEFAULT_CREATION_ITEMS.find(
        (item) => item.id === "docblock",
      );
      expect(docItem).toBeDefined();
      expect(docItem?.label).toBe("Document");
      expect(docItem?.icon).toBeDefined();

      const docRailTool = DEFAULT_RAIL_TOOLS.find((t) => t.id === "docblock");
      expect(docRailTool).toBeDefined();
    });

    it("renders the Document rail button and triggers onToggleDocBlockMode on click", () => {
      const onToggleDocBlockMode = vi.fn();
      render(
        <WebCreationRail
          appState={mockAppState}
          onToggleDocBlockMode={onToggleDocBlockMode}
        />,
      );

      const docButton = screen.getByRole("button", { name: /Document/i });
      expect(docButton).toBeDefined();

      fireEvent.click(docButton);
      expect(onToggleDocBlockMode).toHaveBeenCalledTimes(1);
    });
  });

  describe("insertDocBlockOnBoard", () => {
    it("creates docblock collection and record in FiroDoc and returns corresponding scene element", () => {
      const doc = createFiroDoc();
      const mockElements: any[] = [];
      const updateSceneMock = vi.fn((opts) => {
        mockElements.push(...opts.elements);
      });

      const mockExcalidrawAPI: any = {
        getAppState: () => mockAppState,
        getSceneElements: () => mockElements,
        updateScene: updateSceneMock,
      };

      const { record, element } = insertDocBlockOnBoard(
        () => doc,
        mockExcalidrawAPI,
        { x: 300, y: 400 },
      );

      // Verify record creation
      expect(record.id).toBeDefined();
      expect(record.title).toBe("Untitled Document");
      expect(record.collectionId).toBe(DOC_BLOCK_COLLECTION_ID);

      // Verify FiroDoc state committed
      const docState = doc.read();
      expect(
        docState.collections.some((c) => c.id === DOC_BLOCK_COLLECTION_ID),
      ).toBe(true);
      const savedRecord = docState.records.find((r) => r.id === record.id);
      expect(savedRecord).toBeDefined();
      expect(savedRecord?.collectionId).toBe(DOC_BLOCK_COLLECTION_ID);

      // Verify canvas element
      expect(element.type).toBe("rectangle");
      expect(element.x).toBe(300);
      expect(element.y).toBe(400);
      expect(element.width).toBe(record.dimensions.width);
      expect(element.height).toBe(record.dimensions.height);
      expect(element.customData?.isDocBlock).toBe(true);
      expect(element.customData?.recordId).toBe(record.id);
      expect((element as any).recordId).toBe(record.id);

      // Verify Excalidraw scene updated
      expect(updateSceneMock).toHaveBeenCalledTimes(1);
    });

    it("calculates viewport center position when point is omitted", () => {
      const doc = createFiroDoc();
      const mockExcalidrawAPI: any = {
        getAppState: () => ({
          zoom: { value: 2 },
          scrollX: 50,
          scrollY: 100,
          width: 800,
          height: 600,
        }),
        getSceneElements: () => [],
        updateScene: vi.fn(),
      };

      const { element } = insertDocBlockOnBoard(() => doc, mockExcalidrawAPI);

      // The viewport is 400 x 300 world units, so the new block is sized
      // down to fit it: width = min(560, 400 - 32) = 368 and
      // height = max(200, min(400, 0.6 * 300)) = 200.
      // x = -scrollX + (width / 2) / zoom - 368 / 2 = -50 + 200 - 184 = -34
      // y = -scrollY + (height / 2) / zoom - 200 / 2 = -100 + 150 - 100 = -50
      expect(element.width).toBe(368);
      expect(element.height).toBe(200);
      expect(element.x).toBe(-34);
      expect(element.y).toBe(-50);
    });

    it("does not duplicate collection if DOC_BLOCK_COLLECTION_ID already exists", () => {
      const doc = createFiroDoc();
      doc.commit([
        {
          kind: "createCollection",
          collection: createDocBlockCollection("board-1"),
        },
      ]);

      const { record } = insertDocBlockOnBoard(() => doc);
      const collections = doc
        .read()
        .collections.filter((c) => c.id === DOC_BLOCK_COLLECTION_ID);
      expect(collections).toHaveLength(1);
      expect(record.collectionId).toBe(DOC_BLOCK_COLLECTION_ID);
    });
  });

  describe("DocBlock Record & Schema Conversion", () => {
    it("round-trips DocBlockRecord through FiroRecord conversion", () => {
      const original = createDocBlockRecord({
        title: "Architecture Specification",
        dimensions: { width: 640, height: 480 },
      });

      const firoRecord = docBlockRecordToFiroRecord(original);
      expect(firoRecord.id).toBe(original.id);
      expect(firoRecord.collectionId).toBe(DOC_BLOCK_COLLECTION_ID);

      const reconstructed = docBlockRecordFromFiroRecord(firoRecord);
      expect(isDocBlockRecord(original)).toBe(true);
      expect(isDocBlockRecord(reconstructed)).toBe(true);
      expect(reconstructed.id).toBe(original.id);
      expect(reconstructed.title).toBe(original.title);
      expect(reconstructed.dimensions.width).toBe(640);
      expect(reconstructed.dimensions.height).toBe(480);
      expect(reconstructed.fragmentKey).toBe(original.fragmentKey);
    });
  });

  describe("DocBlockOverlay Mounting & Editor Interaction", () => {
    it("mounts overlay with device-scale positioning and ProseMirror editor", () => {
      const yDoc = new Y.Doc();
      const fragment = yDoc.getXmlFragment("test-fragment-canvas");

      const record = createDocBlockRecord({
        title: "Sprint Planning",
        dimensions: { width: 500, height: 350 },
      });

      const layout = {
        x: 100,
        y: 150,
        width: 500,
        height: 350,
      };

      const appState = {
        zoom: { value: 1.25 },
        scrollX: 80,
        scrollY: 40,
        offsetLeft: 15,
        offsetTop: 25,
      };

      const onChange = vi.fn();
      const onClose = vi.fn();

      const { container } = render(
        <DocBlockOverlay
          record={record}
          fragment={fragment}
          layout={layout}
          appState={appState}
          onChange={onChange}
          onClose={onClose}
        />,
      );

      const overlayEl = container.querySelector(
        ".DocBlockOverlay",
      ) as HTMLElement;
      expect(overlayEl).toBeDefined();

      // Device scale verification:
      // left = (100 + 80) * 1.25 + 15 = 240px
      // top = (150 + 40) * 1.25 + 25 = 262.5px
      // width = 500 * 1.25 = 625px
      // height = 350 * 1.25 = 437.5px
      expect(overlayEl.style.left).toBe("240px");
      expect(overlayEl.style.top).toBe("262.5px");
      expect(overlayEl.style.width).toBe("625px");
      expect(overlayEl.style.height).toBe("437.5px");
      expect(overlayEl.style.transform).toBe("");

      // Editor mount
      const proseMirrorEl = overlayEl.querySelector(".ProseMirror");
      expect(proseMirrorEl).toBeDefined();
    });

    it("triggers onChange when title is edited in the overlay", () => {
      const yDoc = new Y.Doc();
      const fragment = yDoc.getXmlFragment("test-fragment-title");
      const record = createDocBlockRecord({ title: "Old Title" });
      const onChange = vi.fn();

      render(
        <DocBlockOverlay
          record={record}
          fragment={fragment}
          layout={{ x: 0, y: 0, width: 400, height: 300 }}
          appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
          onChange={onChange}
        />,
      );

      const titleInput = screen.getByDisplayValue("Old Title");
      fireEvent.change(titleInput, { target: { value: "New Title" } });

      expect(onChange).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith(expect.anything(), "New Title");
    });

    it("calls onClose and onDiscard when Escape is pressed", () => {
      const yDoc = new Y.Doc();
      const fragment = yDoc.getXmlFragment("test-fragment-esc");
      const record = createDocBlockRecord({ title: "Draft Doc" });
      const onClose = vi.fn();
      const onDiscard = vi.fn();

      const { container } = render(
        <DocBlockOverlay
          record={record}
          fragment={fragment}
          layout={{ x: 0, y: 0, width: 400, height: 300 }}
          appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
          onClose={onClose}
          onDiscard={onDiscard}
        />,
      );

      const overlayEl = container.querySelector(
        ".DocBlockOverlay",
      ) as HTMLElement;
      fireEvent.keyDown(overlayEl, { key: "Escape" });

      expect(onClose).toHaveBeenCalled();
      expect(onDiscard).toHaveBeenCalled();
    });

    it("calls onClose and onCommit when Cmd+Enter is pressed", () => {
      const yDoc = new Y.Doc();
      const fragment = yDoc.getXmlFragment("test-fragment-enter");
      const record = createDocBlockRecord({ title: "Meeting Notes" });
      const onClose = vi.fn();
      const onCommit = vi.fn();

      const { container } = render(
        <DocBlockOverlay
          record={record}
          fragment={fragment}
          layout={{ x: 0, y: 0, width: 400, height: 300 }}
          appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0 }}
          onClose={onClose}
          onCommit={onCommit}
        />,
      );

      const overlayEl = container.querySelector(
        ".DocBlockOverlay",
      ) as HTMLElement;
      fireEvent.keyDown(overlayEl, { key: "Enter", metaKey: true });

      expect(onClose).toHaveBeenCalled();
      expect(onCommit).toHaveBeenCalled();
    });
  });
});
