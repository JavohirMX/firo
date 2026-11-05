import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FramesPanel } from "../components/FramesPanel";

const state = vi.hoisted(() => ({
  mayEdit: true,
  updateScene: vi.fn(),
  focusFrame: vi.fn(),
  renameFrame: vi.fn(() => []),
  deleteFrame: vi.fn(() => []),
}));
vi.mock("../board/board", () => ({
  boardDoc: () => ({
    subscribe: () => () => {},
    read: () => ({ elements: [] }),
  }),
}));
vi.mock("../board/frames", () => ({
  listFrames: () => [{ id: "a", position: 1, name: "First" }],
  frameLabel: () => "First",
  deleteFrame: state.deleteFrame,
  renameFrame: state.renameFrame,
}));
vi.mock("../board/presentation", () => ({
  getPresentation: () => ({ active: false, slideIds: [], index: 0 }),
  focusFrame: state.focusFrame,
}));
vi.mock("../board/facilitator", () => ({
  canDriveSession: () => state.mayEdit,
  subscribeToFacilitation: () => () => {},
}));
const props = {
  isOpen: true,
  onClose: () => {},
  excalidrawAPI: { updateScene: state.updateScene } as never,
};
beforeEach(() => {
  state.mayEdit = true;
});
afterEach(() => vi.clearAllMocks());

describe("frame panel editing roles", () => {
  it.each(["viewer", "commenter"])(
    "keeps navigation but no editing for %s",
    (role) => {
      render(<FramesPanel {...props} readOnlyRole={role} />);
      expect(screen.queryByRole("button", { name: "Rename First" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Delete First" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /First/ }));
      expect(state.focusFrame).toHaveBeenCalledOnce();
    },
  );
  it("preserves ordinary editor rename and delete", () => {
    render(<FramesPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename First" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Frame name" }), {
      target: { value: "Renamed" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Frame name" }));
    expect(state.renameFrame).toHaveBeenCalledWith([], "a", "Renamed");
    fireEvent.click(screen.getByRole("button", { name: "Delete First" }));
    expect(state.deleteFrame).toHaveBeenCalledOnce();
    expect(state.updateScene).toHaveBeenCalledTimes(2);
  });
  it("refuses a retained delete control after a role downgrade", () => {
    render(<FramesPanel {...props} />);
    state.mayEdit = false;
    fireEvent.click(screen.getByRole("button", { name: "Delete First" }));
    expect(state.deleteFrame).not.toHaveBeenCalled();
    expect(state.updateScene).not.toHaveBeenCalled();
  });
  it("refuses an in-progress rename after a live role downgrade", () => {
    render(<FramesPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename First" }));
    state.mayEdit = false;
    fireEvent.blur(screen.getByRole("textbox", { name: "Frame name" }));
    expect(state.renameFrame).not.toHaveBeenCalled();
    expect(state.updateScene).not.toHaveBeenCalled();
  });
  it("removes an in-progress rename when the role prop changes", () => {
    const view = render(<FramesPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename First" }));
    view.rerender(<FramesPanel {...props} readOnlyRole="viewer" />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete First" })).toBeNull();
    expect(state.updateScene).not.toHaveBeenCalled();
  });
});
