import { afterEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import type { Action } from "@firo/editor/actions/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { facilitatorActions } from "../facilitatorActions";
import {
  canDriveSession,
  getReveal,
  getTimer,
  setSessionShareRole,
  timerControls,
  toggleRevealMode,
} from "../facilitator";

/*
 * ADR-0039 section 9: "Viewer and commenter see the timer, private state,
 * slide, results, and badges; they cannot start or change a session or cast a
 * dot."
 *
 * The boundary is the action predicate, because the predicate is the one
 * place every entry point - the Alt chords, the command palette, and the
 * people-bar menu - passes through. The room itself was never at stake: a
 * watcher cannot publish a valid driver claim, so their toggle only painted
 * a private chip and a timer nobody else saw. But a control that lies is a
 * defect even when it is harmless, and guarding each entry point separately
 * would leave the next one free to reintroduce the mirage.
 *
 * Reactions, the frames panel and the vote tally stay watcher-open: section 7
 * gives the reaction to anyone in the room, and a readout is what a watcher
 * is for.
 */

const SESSION_CONTROLS = [
  "setupFacilitatorTimer",
  "toggleFacilitatorTimer",
  "resetFacilitatorTimer",
  "addMinuteToTimer",
  "toggleBoardReveal",
  "togglePresentation",
  "nextSlide",
  "previousSlide",
  "addVoteToSelection",
  "removeVoteFromSelection",
];

const WATCHER_OPEN = [
  "sendReactionThumbsUp",
  "sendReactionLove",
  "sendReactionFire",
  "sendReactionWow",
  "sendReactionCelebration",
  "sendReactionWave",
  "openFramesPanel",
  "openVotingPanel",
  "readVoteTally",
];

const build = () => {
  const document = new FiroDoc(new Y.Doc());
  const api = {
    registerAction: vi.fn(),
    setToast: vi.fn(),
  } as unknown as ExcalidrawImperativeAPI;
  return facilitatorActions(api, () => document, vi.fn());
};

const enabled = (action: Action): boolean => {
  const predicate = action.predicate;
  if (typeof predicate !== "function") {
    return predicate ?? true;
  }
  return predicate(
    [] as never,
    { selectedElementIds: {} } as never,
    { UIOptions: { canvasActions: {} } } as never,
    null as never,
  );
};

afterEach(() => {
  setSessionShareRole(null);
});

describe("session role boundary", () => {
  it("lets an owner or editor reach every session control", () => {
    setSessionShareRole(null);
    const actions = build();
    /*
     * Only the controls whose predicate is the role alone: next/previous
     * slide also need a live presentation, and the two vote commands need a
     * selection, so their owner-true case belongs to their own test files.
     * Their watcher-false case is asserted below, which is the boundary this
     * file exists for.
     */
    for (const name of [
      "setupFacilitatorTimer",
      "toggleFacilitatorTimer",
      "resetFacilitatorTimer",
      "addMinuteToTimer",
      "toggleBoardReveal",
      "togglePresentation",
      "openVotingPanel",
    ]) {
      const action = actions.find((entry) => entry.name === name);
      expect(action, name).toBeTruthy();
      expect(enabled(action!), name).toBe(true);
    }
  });

  it.each(["viewer", "commenter"] as const)(
    "refuses every session control to a %s",
    (role) => {
      setSessionShareRole(role);
      expect(canDriveSession()).toBe(false);
      const actions = build();
      for (const name of SESSION_CONTROLS) {
        const action = actions.find((entry) => entry.name === name);
        expect(action, name).toBeTruthy();
        expect(enabled(action!), name).toBe(false);
      }
    },
  );

  it.each(["viewer", "commenter"] as const)(
    "keeps reactions and readouts open to a %s",
    (role) => {
      setSessionShareRole(role);
      const actions = build();
      for (const name of WATCHER_OPEN) {
        const action = actions.find((entry) => entry.name === name);
        expect(action, name).toBeTruthy();
        expect(enabled(action!), name).toBe(true);
      }
    },
  );

  it.each(["viewer", "commenter"] as const)(
    "makes the module boundary itself a no-op for a %s",
    (role) => {
      /*
       * The predicate greys the palette, but `handleKeyDown` never consults
       * it -- so the mutations themselves must refuse, or the chords (and the
       * setup dialog's own Start button) would keep painting phantom local
       * state. These call the same functions the performs and dialogs call.
       */
      setSessionShareRole(role);
      const document = new FiroDoc(new Y.Doc());
      const before = getReveal(() => document);
      toggleRevealMode(() => document);
      expect(getReveal(() => document)).toEqual(before);
      timerControls(() => document).start();
      expect(getTimer(() => document)).toBeNull();
    },
  );

  it("restores the controls when the role clears", () => {
    setSessionShareRole("viewer");
    const before = build();
    expect(
      enabled(before.find((entry) => entry.name === "toggleBoardReveal")!),
    ).toBe(false);
    setSessionShareRole(null);
    const after = build();
    expect(
      enabled(after.find((entry) => entry.name === "toggleBoardReveal")!),
    ).toBe(true);
  });
});
