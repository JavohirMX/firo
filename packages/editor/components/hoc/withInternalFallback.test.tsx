import { render as renderInIsolation } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import { TunnelsContext, useInitializeTunnels } from "../../context/tunnels";
import { Excalidraw, MainMenu } from "../../index";
import { render, queryAllByTestId } from "../../tests/test-utils";

import { withInternalFallback } from "./withInternalFallback";

describe("Test internal component fallback rendering", () => {
  it("should render only one menu per excalidraw instance (custom menu first scenario)", async () => {
    const { container } = await render(
      <div>
        <Excalidraw>
          <MainMenu>test</MainMenu>
        </Excalidraw>
        <Excalidraw />
      </div>,
    );

    expect(queryAllByTestId(container, "main-menu-trigger")?.length).toBe(2);

    const excalContainers = container.querySelectorAll<HTMLDivElement>(
      ".excalidraw-container",
    );

    expect(
      queryAllByTestId(excalContainers[0], "main-menu-trigger")?.length,
    ).toBe(1);
    expect(
      queryAllByTestId(excalContainers[1], "main-menu-trigger")?.length,
    ).toBe(1);
  });

  it("should render only one menu per excalidraw instance (default menu first scenario)", async () => {
    const { container } = await render(
      <div>
        <Excalidraw />
        <Excalidraw>
          <MainMenu>test</MainMenu>
        </Excalidraw>
      </div>,
    );

    expect(queryAllByTestId(container, "main-menu-trigger")?.length).toBe(2);

    const excalContainers = container.querySelectorAll<HTMLDivElement>(
      ".excalidraw-container",
    );

    expect(
      queryAllByTestId(excalContainers[0], "main-menu-trigger")?.length,
    ).toBe(1);
    expect(
      queryAllByTestId(excalContainers[1], "main-menu-trigger")?.length,
    ).toBe(1);
  });

  it("should render only one menu per excalidraw instance (two custom menus scenario)", async () => {
    const { container } = await render(
      <div>
        <Excalidraw>
          <MainMenu>test</MainMenu>
        </Excalidraw>
        <Excalidraw>
          <MainMenu>test</MainMenu>
        </Excalidraw>
      </div>,
    );

    expect(queryAllByTestId(container, "main-menu-trigger")?.length).toBe(2);

    const excalContainers = container.querySelectorAll<HTMLDivElement>(
      ".excalidraw-container",
    );

    expect(
      queryAllByTestId(excalContainers[0], "main-menu-trigger")?.length,
    ).toBe(1);
    expect(
      queryAllByTestId(excalContainers[1], "main-menu-trigger")?.length,
    ).toBe(1);
  });

  it("should render only one menu per excalidraw instance (two default menus scenario)", async () => {
    const { container } = await render(
      <div>
        <Excalidraw />
        <Excalidraw />
      </div>,
    );

    expect(queryAllByTestId(container, "main-menu-trigger")?.length).toBe(2);

    const excalContainers = container.querySelectorAll<HTMLDivElement>(
      ".excalidraw-container",
    );

    expect(
      queryAllByTestId(excalContainers[0], "main-menu-trigger")?.length,
    ).toBe(1);
    expect(
      queryAllByTestId(excalContainers[1], "main-menu-trigger")?.length,
    ).toBe(1);
  });
});

/**
 * Mirrors how LayerUI provisions tunnels, so a wrapped component resolves the
 * same jotai scope it would in the real tree.
 */
const TunnelsProvider = ({ children }: { children: React.ReactNode }) => {
  const tunnels = useInitializeTunnels();
  const TunnelsJotaiProvider = tunnels.tunnelsJotai.Provider;

  return (
    <TunnelsJotaiProvider>
      <TunnelsContext.Provider value={tunnels}>
        {children}
      </TunnelsContext.Provider>
    </TunnelsJotaiProvider>
  );
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  constructor(props: {
    children: React.ReactNode;
    onError: (error: Error) => void;
  }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const makeProbe = (onRender: () => void) =>
  withInternalFallback("Probe", () => {
    onRender();
    return <div data-testid="probe" />;
  });

describe("withInternalFallback provider requirement", () => {
  // note: `renderInIsolation` is @testing-library's render, not the app-aware
  // one from test-utils, since these probes mount no canvas.
  it("renders the wrapped component when the tunnels provider is present", () => {
    const onRender = vi.fn();
    const Probe = makeProbe(onRender);

    const { queryByTestId } = renderInIsolation(
      <TunnelsProvider>
        <Probe />
      </TunnelsProvider>,
    );

    expect(onRender).toHaveBeenCalled();
    expect(queryByTestId("probe")).not.toBe(null);
  });

  /**
   * `TunnelsContext` is created as `createContext(null!)`, so consuming it with
   * no provider yields `null` and the destructure in `withInternalFallback`
   * throws. That throw is the contract: a component mounted outside its
   * required providers must fail loudly rather than silently render nothing,
   * because UI that quietly never appears is far harder to diagnose than a
   * thrown TypeError.
   */
  it("throws instead of silently rendering when the tunnels provider is missing", () => {
    const onRender = vi.fn();
    const Probe = makeProbe(onRender);

    let captured: Error | null = null;
    const onError = (error: Error) => {
      captured = error;
    };

    // react logs the error it caught; keep stdout clean
    const mock = vi.spyOn(console, "error").mockImplementation(() => {});

    const { queryByTestId } = renderInIsolation(
      <ErrorBoundary onError={onError}>
        <Probe />
      </ErrorBoundary>,
    );

    mock.mockRestore();

    expect(captured).toBeInstanceOf(TypeError);
    expect((captured as Error | null)?.message).toMatch(/tunnelsJotai/);

    // and it did not quietly render the wrapped component
    expect(onRender).not.toHaveBeenCalled();
    expect(queryByTestId("probe")).toBe(null);
  });
});
