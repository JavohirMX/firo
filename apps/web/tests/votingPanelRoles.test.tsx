import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_VOTING_SETTINGS, startRound } from "@firo/facilitation";
import { openBoardMemory } from "@firo/doc";

import { VotingPanel } from "../components/VotingPanel";
import { setSessionShareRole } from "../board/facilitator";

const state = vi.hoisted(() => ({ doc: null as any, execute: vi.fn() }));
vi.mock("@firo/editor", () => ({
  useExcalidrawActionManager: () => ({
    executeAction: state.execute,
    actions: {},
  }),
}));
vi.mock("../board/board", () => ({ boardDoc: () => state.doc }));
const setup = (role: string | null) => {
  state.doc = openBoardMemory();
  const peer = state.doc.awareness.clientID + 1;
  state.doc.awareness.getStates().set(peer, { firo: {} });
  // A local claim is enough for the controls/readout tests; role still wins.
  state.doc.setEphemeral({
    session: { leader: state.doc.awareness.clientID },
    voting: startRound(DEFAULT_VOTING_SETTINGS, Date.now()),
  });
  setSessionShareRole(role);
  return render(
    <VotingPanel
      isOpen
      onClose={() => {}}
      excalidrawAPI={null}
      readOnlyRole={role}
    />,
  );
};
afterEach(() => setSessionShareRole(null));
describe("voting panel roles", () => {
  it.each(["viewer", "commenter"])(
    "keeps %s readouts without cast/end or live settings controls",
    (role) => {
      setup(role);
      expect(screen.getByRole("status").textContent).toContain("Session open");
      expect(screen.queryByRole("button", { name: "Give a dot" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Take back a dot" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
      expect(
        (
          screen.getByRole("checkbox", {
            name: "Show results on the board",
          }) as HTMLInputElement
        ).disabled,
      ).toBe(true);
      fireEvent.click(screen.getByRole("tab", { name: "Results" }));
      expect(
        screen.getByText(
          "No dots yet. Results will appear here when participants vote.",
        ),
      ).toBeDefined();
      expect(screen.queryByText(/press Alt\+D/)).toBeNull();
      expect(
        screen
          .getByRole("tab", { name: "Results" })
          .getAttribute("aria-selected"),
      ).toBe("true");
    },
  );
  it("keeps editor casting and live result visibility", () => {
    setup("editor");
    expect(screen.getByRole("button", { name: "Give a dot" })).toBeDefined();
    expect(screen.getByRole("button", { name: "End session" })).toBeDefined();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show results on the board" }),
    );
    expect(state.doc.getEphemeral().voting.settings.showResults).toBe(false);
  });
  it("refuses the retained live switch after viewer downgrade", () => {
    setup("editor");
    setSessionShareRole("viewer");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show results on the board" }),
    );
    expect(state.doc.getEphemeral().voting.settings.showResults).toBe(true);
  });
});
