/*
 * The NavToolbar zoom readout's navigation menu (Miro parity row 11). The
 * toolbar already surfaces fit, grid and minimap as buttons; the menu
 * carries only what they do not: preset stops, full screen and the
 * selection's dimensions. Without `onZoomTo` the readout stays a bare
 * reset button.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { NavToolbar } from "../src";

const baseProps = {
  zoom: 1,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onResetZoom: vi.fn(),
  onZoomToFit: vi.fn(),
};

describe("NavToolbar zoom navigation menu", () => {
  it("stays a bare reset button without onZoomTo", () => {
    render(<NavToolbar {...baseProps} />);
    expect(screen.queryByTestId("nav-zoom-trigger")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Current Zoom/));
    expect(baseProps.onResetZoom).toHaveBeenCalledTimes(1);
  });

  it("opens the menu with stops, fullscreen and dimensions", () => {
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        onToggleFullscreen={vi.fn()}
        selectionSize={{ width: 200, height: 100 }}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(screen.getByTestId("nav-zoom-stop-50")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-stop-70")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-stop-100")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-stop-400")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-fullscreen")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-dimensions").textContent).toBe(
      "200 × 100",
    );
  });

  it("calls onZoomTo with the chosen stop and marks the current zoom", () => {
    const onZoomTo = vi.fn();
    render(<NavToolbar {...baseProps} zoom={0.7} onZoomTo={onZoomTo} />);
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(
      screen.getByTestId("nav-zoom-stop-70").getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("nav-zoom-stop-400"));
    expect(onZoomTo).toHaveBeenCalledWith(4);
    // selecting closes the menu
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
  });

  it("omits the grid section without onSelectGridType", () => {
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        gridEnabled
        gridType="dots"
        onToggleGrid={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(screen.queryByTestId("nav-zoom-grid-dots")).toBeNull();
  });

  it("lists the grid variants and marks the enabled one", () => {
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        gridEnabled
        gridType="lines"
        onToggleGrid={vi.fn()}
        onSelectGridType={vi.fn()}
        onHideGrid={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(screen.getByTestId("nav-zoom-grid-dots")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-grid-lines")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-grid-crosses")).toBeDefined();
    expect(screen.getByTestId("nav-zoom-grid-isometric")).toBeDefined();
    expect(
      screen.getByTestId("nav-zoom-grid-lines").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByTestId("nav-zoom-grid-dots").getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByTestId("nav-zoom-grid-off")).toBeDefined();
  });

  it("selecting a variant reports it and closes the menu", () => {
    const onSelectGridType = vi.fn();
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        gridEnabled={false}
        gridType="dots"
        onToggleGrid={vi.fn()}
        onSelectGridType={onSelectGridType}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    // no variant is current while the grid is off
    expect(
      screen.getByTestId("nav-zoom-grid-dots").getAttribute("aria-checked"),
    ).toBe("false");
    // and "Hide grid" only makes sense while the grid is on
    expect(screen.queryByTestId("nav-zoom-grid-off")).toBeNull();
    fireEvent.click(screen.getByTestId("nav-zoom-grid-isometric"));
    expect(onSelectGridType).toHaveBeenCalledWith("isometric");
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
  });

  it("hides the grid from the menu while it is enabled", () => {
    // onHideGrid must be used, not onToggleGrid: the toggle cycles through
    // the variants before switching off, so it would hide nothing.
    const onHideGrid = vi.fn();
    const onToggleGrid = vi.fn();
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        gridEnabled
        gridType="dots"
        onToggleGrid={onToggleGrid}
        onSelectGridType={vi.fn()}
        onHideGrid={onHideGrid}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    fireEvent.click(screen.getByTestId("nav-zoom-grid-off"));
    expect(onHideGrid).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).not.toHaveBeenCalled();
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
  });

  it("keeps the hide item absent without onHideGrid", () => {
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        gridEnabled
        gridType="dots"
        onToggleGrid={vi.fn()}
        onSelectGridType={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(screen.queryByTestId("nav-zoom-grid-off")).toBeNull();
  });

  it("toggles the object-dimensions overlay from the menu", () => {
    const onToggleSelectionDimensions = vi.fn();
    render(
      <NavToolbar
        {...baseProps}
        onZoomTo={vi.fn()}
        showSelectionDimensions
        onToggleSelectionDimensions={onToggleSelectionDimensions}
      />,
    );
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    const item = screen.getByTestId("nav-zoom-dimensions-toggle");
    expect(item.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(item);
    expect(onToggleSelectionDimensions).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
  });

  it("omits the dimensions toggle without a handler", () => {
    render(<NavToolbar {...baseProps} onZoomTo={vi.fn()} />);
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    expect(screen.queryByTestId("nav-zoom-dimensions-toggle")).toBeNull();
  });

  it("closes on Escape without selecting anything", () => {
    const onZoomTo = vi.fn();
    render(<NavToolbar {...baseProps} onZoomTo={onZoomTo} />);
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
    expect(onZoomTo).not.toHaveBeenCalled();
  });
});
