import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as Y from "yjs";
import { FiroDoc } from "@firo/doc";
import { asFractionalIndex } from "@firo/schema";

import { NavToolbar } from "@firo/ui";

import { Minimap } from "../components/Minimap";

const withDocument = (): FiroDoc => {
  const doc = new FiroDoc(new Y.Doc());
  vi.doMock("../board/board", () => ({
    boardDoc: () => doc,
    refreshBoard: vi.fn(),
  }));
  return doc;
};

let doc: FiroDoc;

beforeEach(() => {
  vi.resetModules();
  doc = withDocument();
});

afterEach(() => {
  vi.doUnmock("../board/board");
  vi.resetModules();
});

const sampleStickyNote = (id: string, x = 100, y = 150) =>
  ({
    id,
    type: "stickynote",
    text: `Note ${id}`,
    x,
    y,
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
  } as any);

describe("Canvas Minimap Overlay", () => {
  it("renders minimap header, title, and close button", () => {
    const onClose = vi.fn();
    render(<Minimap onClose={onClose} elements={[]} />);

    expect(
      screen.getByRole("region", { name: "Canvas Minimap" }),
    ).toBeDefined();
    expect(screen.getByText("Minimap")).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: "Close Minimap" });
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders canvas and computes bounding box including elements", () => {
    const elements = [
      sampleStickyNote("n1", 0, 0),
      sampleStickyNote("n2", 500, 400),
    ];

    const mockApp = {
      state: {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 1000,
        height: 800,
      },
      scene: {
        getNonDeletedElements: () => elements,
      },
      viewport: {
        translate: vi.fn(),
      },
    };

    render(<Minimap app={mockApp} />);

    const minimapEl = screen.getByTestId("canvas-minimap");
    expect(minimapEl).toBeDefined();
    expect(minimapEl.getAttribute("data-element-count")).toBe("2");
  });

  it("pans canvas viewport smoothly on pointer click/drag without touching Yjs document", () => {
    const docUpdateSpy = vi.fn();
    doc.onUpdate(docUpdateSpy);

    const translateMock = vi.fn();
    const mockApp = {
      state: {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        width: 1000,
        height: 800,
      },
      scene: {
        getNonDeletedElements: () => [sampleStickyNote("n1", 100, 100)],
      },
      viewport: {
        translate: translateMock,
      },
    };

    const { container } = render(<Minimap app={mockApp} />);

    const canvas = container.querySelector("canvas")!;
    expect(canvas).toBeDefined();

    // Mock getBoundingClientRect for canvas
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 100,
      right: 320,
      bottom: 240,
      width: 220,
      height: 140,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Pointer down in center of minimap
    fireEvent.pointerDown(canvas, {
      clientX: 210,
      clientY: 170,
      pointerId: 1,
    });

    expect(translateMock).toHaveBeenCalled();
    const callArg = translateMock.mock.calls[0][0];
    expect(callArg).toHaveProperty("scrollX");
    expect(callArg).toHaveProperty("scrollY");

    // Pointer move while dragging
    fireEvent.pointerMove(canvas, {
      clientX: 230,
      clientY: 190,
      pointerId: 1,
    });
    expect(translateMock.mock.calls.length).toBeGreaterThan(1);

    // Release drag
    fireEvent.pointerUp(canvas, {
      clientX: 230,
      clientY: 190,
      pointerId: 1,
    });

    // Ephemeral rule check: Minimap interaction MUST NEVER write to Yjs document
    expect(docUpdateSpy).not.toHaveBeenCalled();
  });

  it("updates via excalidrawAPI when app.viewport is not present", () => {
    const updateSceneMock = vi.fn();
    const mockApi: any = {
      getAppState: () => ({
        scrollX: 50,
        scrollY: 80,
        zoom: { value: 1.5 },
        width: 1200,
        height: 900,
      }),
      getSceneElements: () => [sampleStickyNote("n1", 50, 50)],
      updateScene: updateSceneMock,
      onScrollChange: vi.fn(() => vi.fn()),
      onChange: vi.fn(() => vi.fn()),
    };

    const { container } = render(<Minimap excalidrawAPI={mockApi} />);
    const canvas = container.querySelector("canvas")!;

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 220,
      bottom: 140,
      width: 220,
      height: 140,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(canvas, { clientX: 110, clientY: 70, pointerId: 1 });
    expect(updateSceneMock).toHaveBeenCalled();
    expect(updateSceneMock.mock.calls[0][0].appState).toHaveProperty("scrollX");
    expect(updateSceneMock.mock.calls[0][0].appState).toHaveProperty("scrollY");
  });

  it("NavToolbar toggles minimap and reflects active state", () => {
    const onToggleMinimap = vi.fn();
    const { rerender } = render(
      <NavToolbar
        zoom={1}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetZoom={vi.fn()}
        onZoomToFit={vi.fn()}
        minimapEnabled={false}
        isMinimapOpen={false}
        onToggleMinimap={onToggleMinimap}
      />,
    );

    const minimapBtn = screen.getByRole("button", { name: "Toggle Minimap" });
    expect(minimapBtn.getAttribute("aria-pressed")).toBe("false");
    // The key is advertised where the command lives, so the toolbar is the
    // place a user discovers it (Miro parity: `M`).
    expect(minimapBtn.getAttribute("aria-keyshortcuts")).toBe("M");
    expect(
      minimapBtn.classList.contains("firo-nav-toolbar__button--active"),
    ).toBe(false);

    fireEvent.click(minimapBtn);
    expect(onToggleMinimap).toHaveBeenCalledTimes(1);

    // Rerender as open
    rerender(
      <NavToolbar
        zoom={1}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetZoom={vi.fn()}
        onZoomToFit={vi.fn()}
        minimapEnabled={true}
        isMinimapOpen={true}
        onToggleMinimap={onToggleMinimap}
      />,
    );

    expect(minimapBtn.getAttribute("aria-pressed")).toBe("true");
    expect(
      minimapBtn.classList.contains("firo-nav-toolbar__button--active"),
    ).toBe(true);
  });
});
