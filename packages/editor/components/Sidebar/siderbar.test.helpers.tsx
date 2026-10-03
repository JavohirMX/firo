import React from "react";

// `../../index` and NOT `"../.."`. The latter is the *package directory*, so
// resolution consults packages/editor/package.json and binds to the built
// bundle (`main`/`exports` -> dist/prod/index.js) instead of the source. The
// bundle carries its own `TunnelsContext`, so a source component passed as a
// host child reads a context nothing provides and `useTunnels()` returns null.
import { Excalidraw } from "../../index";
import {
  GlobalTestState,
  queryByTestId,
  render,
  withExcalidrawDimensions,
} from "../../tests/test-utils";

export const assertSidebarDockButton = async <T extends boolean>(
  hasDockButton: T,
): Promise<
  T extends false
    ? { dockButton: null; sidebar: HTMLElement }
    : { dockButton: HTMLElement; sidebar: HTMLElement }
> => {
  const sidebar =
    GlobalTestState.renderResult.container.querySelector<HTMLElement>(
      ".sidebar",
    );
  expect(sidebar).not.toBe(null);
  const dockButton = queryByTestId(sidebar!, "sidebar-dock");
  if (hasDockButton) {
    expect(dockButton).not.toBe(null);
    return { dockButton: dockButton!, sidebar: sidebar! } as any;
  }
  expect(dockButton).toBe(null);
  return { dockButton: null, sidebar: sidebar! } as any;
};

export const assertExcalidrawWithSidebar = async (
  sidebar: React.ReactNode,
  name: string,
  test: () => void,
) => {
  await render(
    <Excalidraw initialData={{ appState: { openSidebar: { name } } }}>
      {sidebar}
    </Excalidraw>,
  );
  await withExcalidrawDimensions({ width: 1920, height: 1080 }, test);
};
