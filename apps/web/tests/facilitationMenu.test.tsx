import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

/*
 * The people bar's facilitation menu (parity matrix row 2).
 *
 * The property that matters here is indirection: every row executes the
 * **registered action** for its command, through the action manager, rather
 * than reaching for its own implementation. A menu with its own copies would
 * drift from the palette and the chords (row 9's honesty rule), and it would
 * skip the predicates that keep these commands honest in view mode and in
 * read-only shares. So these tests register marker actions on a fake manager
 * and assert the menu dispatched *those* objects -- not that some side effect
 * of a reimplementation happened.
 *
 * The other property is that the checkable Private mode row reads the same
 * ephemeral reveal state the facilitator bar shows, so the two surfaces can
 * never disagree about whether the board is private.
 */

const executed: string[] = [];

const markerAction = (name: string) => ({ name });

/** The fake action manager: a name-keyed map of markers plus a recorder. */
const fakeManager = () => {
  const actions: Record<string, { name: string }> = {};
  for (const name of [
    "sendReactionThumbsUp",
    "sendReactionLove",
    "sendReactionFire",
    "sendReactionWow",
    "sendReactionCelebration",
    "sendReactionWave",
    "setupFacilitatorTimer",
    "openVotingPanel",
    "toggleBoardReveal",
    "togglePresentation",
  ]) {
    actions[name] = markerAction(name);
  }
  return {
    actions,
    executeAction: vi.fn((action: { name: string }) => {
      executed.push(action.name);
    }),
  };
};

vi.mock("@firo/editor", () => ({
  useExcalidrawActionManager: () => fakeManagerSingleton,
}));

let fakeManagerSingleton = fakeManager();

const withDocument = (): FiroDoc => {
  const doc = new FiroDoc(new Y.Doc());
  vi.doMock("../board/board", () => ({
    boardDoc: () => doc,
    refreshBoard: vi.fn(),
  }));
  return doc;
};

let doc: FiroDoc;

beforeEach(async () => {
  vi.resetModules();
  executed.length = 0;
  fakeManagerSingleton = fakeManager();
  doc = withDocument();
});

afterEach(() => {
  vi.doUnmock("../board/board");
  vi.resetModules();
});

const renderMenu = async () => {
  const { FacilitationMenu } = await import("../components/FacilitationMenu");
  return render(<FacilitationMenu />);
};

const openMenu = async () => {
  await renderMenu();
  fireEvent.click(screen.getByTestId("facilitation-menu-trigger"));
  return screen.getByTestId("facilitation-menu");
};

describe("facilitation menu", () => {
  it("lists the six reactions and the four room tools", async () => {
    await openMenu();
    for (const kind of [
      "thumbsUp",
      "love",
      "fire",
      "wow",
      "celebration",
      "wave",
    ]) {
      expect(screen.getByTestId(`facilitation-reaction-${kind}`)).toBeTruthy();
    }
    expect(screen.getByTestId("facilitation-item-timer")).toBeTruthy();
    expect(screen.getByTestId("facilitation-item-voting")).toBeTruthy();
    expect(screen.getByTestId("facilitation-item-private")).toBeTruthy();
    expect(screen.getByTestId("facilitation-item-present")).toBeTruthy();
  });

  it("executes the registered reaction action, not a copy", async () => {
    await openMenu();
    fireEvent.click(screen.getByTestId("facilitation-reaction-fire"));
    expect(executed).toEqual(["sendReactionFire"]);
    expect(fakeManagerSingleton.executeAction).toHaveBeenCalledWith(
      fakeManagerSingleton.actions.sendReactionFire,
      "commandPalette",
    );
  });

  it("executes the timer setup, voting and presentation actions", async () => {
    await openMenu();
    fireEvent.click(screen.getByTestId("facilitation-item-timer"));
    fireEvent.click(screen.getByTestId("facilitation-menu-trigger"));
    fireEvent.click(screen.getByTestId("facilitation-item-voting"));
    fireEvent.click(screen.getByTestId("facilitation-menu-trigger"));
    fireEvent.click(screen.getByTestId("facilitation-item-present"));
    expect(executed).toEqual([
      "setupFacilitatorTimer",
      "openVotingPanel",
      "togglePresentation",
    ]);
  });

  it("closes after an item executes", async () => {
    await openMenu();
    fireEvent.click(screen.getByTestId("facilitation-item-voting"));
    expect(screen.queryByTestId("facilitation-menu")).toBeNull();
  });

  it("closes on Escape and on outside pointer, and reopens", async () => {
    const menu = await openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("facilitation-menu")).toBeNull();
    expect(menu).toBeTruthy();

    fireEvent.click(screen.getByTestId("facilitation-menu-trigger"));
    expect(screen.getByTestId("facilitation-menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("facilitation-menu")).toBeNull();
  });

  it("reflects the ephemeral reveal state on the Private mode row", async () => {
    await openMenu();
    const row = screen.getByTestId("facilitation-item-private");
    expect(row.getAttribute("aria-checked")).toBe("false");
    expect(row.getAttribute("role")).toBe("menuitemcheckbox");

    const { toggleRevealMode } = await import("../board/facilitator");
    toggleRevealMode(() => doc);
    const rowAfter = await screen.findByTestId("facilitation-item-private");
    expect(rowAfter.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(rowAfter);
    expect(executed).toEqual(["toggleBoardReveal"]);
  });
});
