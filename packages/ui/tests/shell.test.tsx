import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  CreationRail,
  NavToolbar,
  BoardMenu,
  CollabBar,
  Inspector,
  SelectionToolbar,
  SelectIcon,
  RAIL_TOOL_ICONS,
  type RailToolItem,
} from "../src";

const railTools: RailToolItem[] = (
  ["selection", "rectangle", "laser"] as const
).map((id) => ({ id, label: `${id} tool`, icon: RAIL_TOOL_ICONS[id] }));

describe("@firo/ui shell components", () => {
  describe("CreationRail", () => {
    it("renders the supplied tools and marks the active tool", () => {
      const onSelectTool = vi.fn();
      render(
        <CreationRail
          activeTool="selection"
          onSelectTool={onSelectTool}
          tools={railTools}
        />,
      );

      const selectBtn = screen.getByRole("button", { name: "selection tool" });
      expect(selectBtn).toBeDefined();
      expect(selectBtn.getAttribute("aria-pressed")).toBe("true");

      const rectBtn = screen.getByRole("button", { name: "rectangle tool" });
      expect(rectBtn).toBeDefined();
      expect(rectBtn.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(rectBtn);
      expect(onSelectTool).toHaveBeenCalledWith("rectangle");
    });

    it("triggers undo and redo callbacks", () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      render(
        <CreationRail
          activeTool="selection"
          onSelectTool={vi.fn()}
          tools={railTools}
          onUndo={onUndo}
          onRedo={onRedo}
        />,
      );

      const undoBtn = screen.getByRole("button", { name: "Undo" });
      const redoBtn = screen.getByRole("button", { name: "Redo" });

      fireEvent.click(undoBtn);
      expect(onUndo).toHaveBeenCalledTimes(1);

      fireEvent.click(redoBtn);
      expect(onRedo).toHaveBeenCalledTimes(1);
    });
  });

  describe("NavToolbar", () => {
    it("displays formatted zoom percentage and handles zoom controls", () => {
      const onZoomIn = vi.fn();
      const onZoomOut = vi.fn();
      const onResetZoom = vi.fn();
      const onZoomToFit = vi.fn();

      render(
        <NavToolbar
          zoom={1.25}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          onZoomToFit={onZoomToFit}
        />,
      );

      expect(screen.getByText("125%")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
      expect(onZoomIn).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Zoom Out" }));
      expect(onZoomOut).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("125%"));
      expect(onResetZoom).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Fit to Screen" }));
      expect(onZoomToFit).toHaveBeenCalledTimes(1);
    });

    it("toggles grid and minimap when handlers provided", () => {
      const onToggleGrid = vi.fn();
      const onToggleMinimap = vi.fn();

      render(
        <NavToolbar
          zoom={1}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomToFit={vi.fn()}
          gridEnabled={true}
          onToggleGrid={onToggleGrid}
          minimapEnabled={false}
          onToggleMinimap={onToggleMinimap}
        />,
      );

      const gridBtn = screen.getByRole("button", { name: "Toggle Grid" });
      expect(gridBtn.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(gridBtn);
      expect(onToggleGrid).toHaveBeenCalledTimes(1);

      const minimapBtn = screen.getByRole("button", { name: "Toggle Minimap" });
      expect(minimapBtn.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(minimapBtn);
      expect(onToggleMinimap).toHaveBeenCalledTimes(1);
    });

    it("formats zoom < 1% with one decimal place and reflects gridType", () => {
      const { rerender } = render(
        <NavToolbar
          zoom={0.005}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomToFit={vi.fn()}
          gridEnabled={true}
          gridType="dots"
          onToggleGrid={vi.fn()}
        />,
      );

      expect(screen.getByText("0.5%")).toBeDefined();
      const gridBtn = screen.getByRole("button", { name: "Toggle Grid" });
      expect(gridBtn.getAttribute("data-grid-type")).toBe("dots");
      expect(gridBtn.getAttribute("title")).toContain("dots");

      rerender(
        <NavToolbar
          zoom={0.001}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomToFit={vi.fn()}
          gridEnabled={true}
          gridType="isometric"
          onToggleGrid={vi.fn()}
        />,
      );

      expect(screen.getByText("0.1%")).toBeDefined();
      expect(gridBtn.getAttribute("data-grid-type")).toBe("isometric");
      expect(gridBtn.getAttribute("title")).toContain("isometric");
    });
  });

  describe("BoardMenu", () => {
    it("renders board title and triggers menu button", () => {
      const onOpenMenu = vi.fn();
      render(<BoardMenu boardName="Sprint Planning" onOpenMenu={onOpenMenu} />);

      expect(screen.getByText("Sprint Planning")).toBeDefined();

      const menuBtn = screen.getByRole("button", { name: "Main Menu" });
      fireEvent.click(menuBtn);
      expect(onOpenMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe("CollabBar", () => {
    it("renders children container", () => {
      render(
        <CollabBar>
          <span data-testid="child-element">Collaborators</span>
        </CollabBar>,
      );

      expect(screen.getByTestId("child-element")).toBeDefined();
    });
  });

  describe("Icons", () => {
    it("renders SVG icon components with customizable size", () => {
      const { container } = render(
        <SelectIcon size={24} data-testid="select-icon" />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeDefined();
      expect(svg?.getAttribute("width")).toBe("24");
      expect(svg?.getAttribute("height")).toBe("24");
    });
  });

  describe("Inspector", () => {
    it("labels the panel and renders its content", () => {
      render(
        <Inspector>
          <span data-testid="control">Stroke</span>
        </Inspector>,
      );

      const panel = screen.getByRole("complementary", { name: "Properties" });
      expect(panel).toBeDefined();
      expect(screen.getByTestId("control")).toBeDefined();
    });

    it("uses a custom title and renders a working close control", () => {
      const onClose = vi.fn();
      render(
        <Inspector title="2 objects selected" onClose={onClose}>
          <span />
        </Inspector>,
      );

      expect(screen.getByRole("heading").textContent).toBe(
        "2 objects selected",
      );
      expect(
        screen.getByRole("complementary", { name: "2 objects selected" }),
      ).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Close properties" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("SelectionToolbar", () => {
    it("renders nothing without items", () => {
      const { container } = render(<SelectionToolbar x={0} y={0} items={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("anchors to the selection and invokes an action", () => {
      const onClick = vi.fn();
      render(
        <SelectionToolbar
          x={120}
          y={80}
          items={[
            {
              id: "duplicate",
              label: "Duplicate",
              icon: <SelectIcon />,
              onClick,
            },
            {
              id: "lock",
              label: "Lock",
              icon: <SelectIcon />,
              onClick: vi.fn(),
              pressed: true,
            },
          ]}
        />,
      );

      const toolbar = screen.getByRole("toolbar", {
        name: "Selection actions",
      });
      expect(toolbar.style.left).toBe("120px");
      expect(toolbar.style.top).toBe("80px");

      const duplicate = screen.getByRole("button", { name: "Duplicate" });
      // `aria-pressed` is only rendered for toggles.
      expect(duplicate.getAttribute("aria-pressed")).toBeNull();
      fireEvent.click(duplicate);
      expect(onClick).toHaveBeenCalledTimes(1);

      expect(
        screen
          .getByRole("button", { name: "Lock" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });
});
