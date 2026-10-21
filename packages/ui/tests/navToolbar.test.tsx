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

  it("closes on Escape without selecting anything", () => {
    const onZoomTo = vi.fn();
    render(<NavToolbar {...baseProps} onZoomTo={onZoomTo} />);
    fireEvent.click(screen.getByTestId("nav-zoom-trigger"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("nav-zoom-menu")).toBeNull();
    expect(onZoomTo).not.toHaveBeenCalled();
  });
});
