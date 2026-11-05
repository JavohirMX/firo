import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FramesPanel } from "../components/FramesPanel";

const state = vi.hoisted(() => ({
  presentation: { active: true, slideIds: ["a", "b"], index: 0 },
  refresh: () => {},
  unsubscribe: vi.fn(),
}));
vi.mock("../board/board", () => ({
  boardDoc: () => ({
    subscribe: () => () => {},
    read: () => ({ elements: [] }),
  }),
}));
vi.mock("../board/frames", () => ({
  listFrames: () => [
    { id: "a", position: 1, name: "First" },
    { id: "b", position: 2, name: "Second" },
  ],
  frameLabel: (row: { name: string }) => row.name,
  deleteFrame: vi.fn(),
  renameFrame: vi.fn(),
}));
vi.mock("../board/presentation", () => ({
  getPresentation: () => state.presentation,
  focusFrame: vi.fn(),
}));
vi.mock("../board/facilitator", () => ({
  subscribeToFacilitation: (_: unknown, refresh: () => void) => {
    state.refresh = refresh;
    return state.unsubscribe;
  },
}));

afterEach(() => vi.clearAllMocks());

describe("the current presentation frame", () => {
  it("tracks ephemeral steps and clears on stop without a durable edit", () => {
    const view = render(
      <FramesPanel isOpen onClose={() => {}} excalidrawAPI={null} />,
    );
    const first = screen.getByRole("button", { name: /First Presenting/ });
    expect(first.getAttribute("aria-current")).toBe("step");
    act(() => {
      state.presentation = { ...state.presentation, index: 1 };
      state.refresh();
    });
    expect(first.hasAttribute("aria-current")).toBe(false);
    expect(
      screen
        .getByRole("button", { name: /Second Presenting/ })
        .getAttribute("aria-current"),
    ).toBe("step");
    act(() => {
      state.presentation = { ...state.presentation, active: false };
      state.refresh();
    });
    expect(screen.queryByText("Presenting")).toBeNull();
    view.unmount();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
  });
});
