/*
 * The zoom cluster's navigation menu (Miro parity row 11). The percentage
 * trigger opens preset stops, fit, grid, full screen and host entries, and
 * the stops run the same constrained viewport math as the other zoom
 * actions. The trigger replaced the bare reset button; resetting is the
 * 100% stop.
 */
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, fireEvent, render, screen, waitFor } from "./test-utils";

const { h } = window;

describe("zoom navigation menu", () => {
  it("opens from the percentage trigger and lists the navigation entries", async () => {
    await render(<Excalidraw />);

    const trigger = screen.getByTestId("zoom-menu-trigger");
    expect(trigger.textContent).toBe("100%");

    fireEvent.click(trigger);

    expect(screen.getByTestId("zoom-menu-stop-50")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-stop-70")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-stop-100")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-stop-400")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-fit")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-grid")).toBeDefined();
    expect(screen.getByTestId("zoom-menu-fullscreen")).toBeDefined();
  });

  it("zooms to a preset stop from the menu", async () => {
    await render(<Excalidraw />);

    fireEvent.click(screen.getByTestId("zoom-menu-trigger"));
    fireEvent.click(screen.getByTestId("zoom-menu-stop-400"));

    await waitFor(() => {
      expect(h.app.state.zoom.value).toBe(4);
    });
  });

  it("resets to 100% from the menu after zooming", async () => {
    await render(<Excalidraw />);

    act(() => {
      h.app.setAppState({
        zoom: { ...h.app.state.zoom, value: 2.5 as never },
      });
    });
    expect(h.app.state.zoom.value).toBe(2.5);

    fireEvent.click(screen.getByTestId("zoom-menu-trigger"));
    fireEvent.click(screen.getByTestId("zoom-menu-stop-100"));

    await waitFor(() => {
      expect(h.app.state.zoom.value).toBe(1);
    });
  });

  it("toggles the grid from the menu", async () => {
    await render(<Excalidraw />);
    expect(h.app.state.gridModeEnabled).toBe(false);

    fireEvent.click(screen.getByTestId("zoom-menu-trigger"));
    fireEvent.click(screen.getByTestId("zoom-menu-grid"));

    await waitFor(() => {
      expect(h.app.state.gridModeEnabled).toBe(true);
    });
  });

  it("renders host-provided entries and calls back on select", async () => {
    const onSelect = vi.fn();
    await render(
      <Excalidraw
        zoomMenuExtraItems={[
          {
            id: "minimap",
            label: "Minimap",
            shortcut: "M",
            checked: true,
            onSelect,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId("zoom-menu-trigger"));
    const item = screen.getByTestId("zoom-menu-minimap");
    expect(item.textContent).toContain("Minimap");

    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the selection's dimensions while objects are selected", async () => {
    await render(<Excalidraw />);
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    fireEvent.click(screen.getByTestId("zoom-menu-trigger"));
    expect(screen.getByTestId("zoom-menu-dimensions").textContent).toBe(
      "200 × 100",
    );
  });
});
