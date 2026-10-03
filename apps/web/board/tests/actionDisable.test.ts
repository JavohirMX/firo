import { DEFAULT_UI_OPTIONS } from "@firo/common";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { Action } from "@firo/editor/actions/types";

import { facilitatorActions } from "../facilitatorActions";

/*
 * Switching a facilitator command off.
 *
 * ## The requirement
 *
 * Phase 3 §3.6: "Single-key shortcuts must be individually disableable. Voice-control
 * and screen-reader users need single keys to do other things."
 *
 * ## Why it could not be done before
 *
 * `handleKeyDown` gates an action on `action.name in canvasActions ? value : true`,
 * and `isActionEnabled` asks `action.predicate`. `CanvasActions` was the only list
 * of names that could ever be present in either, and it held seven inherited names.
 * The facilitator commands were therefore impossible to switch off: the requirement
 * failing by construction rather than by oversight.
 *
 * The workaround was `Alt`-prefixing every chord so none of them stole a bare
 * letter. That reduces the harm and does not provide the capability.
 *
 * ## What is asserted here, and what is not
 *
 * Asserted: that a host's `UIOptions` switches a command off, that omission leaves
 * it on, that the commands are independent, and that the default enables them.
 *
 * **Not asserted here: the keyboard chord itself.** `handleKeyDown`'s gate is
 * pre-existing behaviour that this change does not touch -- adding a name to a list
 * it already reads cannot alter it. An earlier version of this file tried to drive
 * a synthetic keydown through the real editor and was thrown away: `Keyboard.keyPress`
 * sets `key` rather than `code` (so the chord never matched), and `codeDown` did not
 * reach the app's handler reliably enough to be worth the flake. Worse, the
 * "does not fire when disabled" case *passed throughout*, for two wrong reasons in a
 * row -- first because a stub was too thin and `handleKeyDown` threw before reaching
 * the gate, then because the chord matched nothing at all. A negative assertion is
 * worth nothing until the matching positive one is known to pass.
 *
 * So the capability is asserted where it can be asserted honestly: on the
 * `predicate`, which is the API a host-facing toggle goes through, and which decides
 * the menu item and the palette entry.
 */

/** Just the props an action's `predicate` reads. */
const propsWith = (canvasActions: Record<string, boolean>) =>
  ({ UIOptions: { canvasActions } } as never);

const appState = {} as never;

/**
 * The `app` a predicate receives, when one reads it.
 *
 * None of these predicates do — they answer from `props` — so it is `undefined`
 * rather than a fake. If one ever reaches for it, `ActionManager.isActionEnabled`
 * would be the real caller and this would need building; a stub here would only
 * make that failure look like a pass.
 */
const noApp = undefined as never;

const actionNamed = (name: Action["name"]): Action => {
  const action = facilitatorActions(
    {} as ExcalidrawImperativeAPI,
    // Throwing rather than returning a stub: a predicate has no business reading the
    // document, so if one ever starts, this fails loudly instead of quietly passing
    // against an empty board.
    () => {
      throw new Error("predicates must not read the document");
    },
    () => {},
  ).find((candidate) => candidate.name === name);
  if (!action) {
    throw new Error(`no such action: ${name}`);
  }
  return action;
};

/** Whether the host has this command switched on. */
const isOn = (name: Action["name"], canvasActions: Record<string, boolean>) =>
  actionNamed(name).predicate?.(
    [],
    appState,
    propsWith(canvasActions),
    noApp,
  ) ?? true;

const EVERY: Action["name"][] = [
  "toggleFacilitatorTimer",
  "resetFacilitatorTimer",
  "addMinuteToTimer",
  "toggleBoardReveal",
  "readVoteTally",
];

describe("a host can switch a facilitator command off", () => {
  it("reports every command enabled when the host lists none of them", () => {
    // Omission means enabled. That is what makes adding names to `CanvasActions`
    // backwards-compatible for an existing host.
    for (const name of EVERY) {
      expect({ name, enabled: isOn(name, {}) }).toEqual({
        name,
        enabled: true,
      });
    }
  });

  it("switches one off when the host says false", () => {
    // The capability the requirement asks for, on a name that could not previously
    // be listed in `canvasActions` at all.
    expect(
      isOn("toggleFacilitatorTimer", { toggleFacilitatorTimer: false }),
    ).toBe(false);
  });

  it("leaves the others alone", () => {
    // Individually, not as a group: one voice-control user may need `Alt+T` for
    // something else and not `Alt+M`.
    const on = (name: Action["name"]) =>
      isOn(name, { toggleFacilitatorTimer: false });

    expect(on("addMinuteToTimer")).toBe(true);
    expect(on("readVoteTally")).toBe(true);
    expect(on("toggleBoardReveal")).toBe(true);
  });

  it("switches every command off independently", () => {
    for (const name of EVERY) {
      expect({ name, enabled: isOn(name, { [name]: false }) }).toEqual({
        name,
        enabled: false,
      });
    }
  });

  it("still requires a selection for the two vote commands", () => {
    // Disabling is not the only reason a command can be unavailable, and turning
    // the flag off must not quietly *enable* a command that had nothing selected.
    const off = { addVoteToSelection: false } as Record<string, boolean>;
    const action = actionNamed("addVoteToSelection");

    // Disabled: unavailable whatever the selection.
    expect(action.predicate?.([], appState, propsWith(off), noApp)).toBe(false);

    // Enabled, still nothing selected: unavailable, as before.
    const on = { addVoteToSelection: true } as Record<string, boolean>;
    expect(action.predicate?.([], appState, propsWith(on), noApp)).toBe(false);
  });
});

describe("the defaults", () => {
  it("enable every facilitator command", () => {
    // Spelled out in `DEFAULT_UI_OPTIONS` rather than left out, because
    // `handleKeyDown` reads `name in canvasActions` — an absent name is *always*
    // enabled, not "enabled by default", and the distinction matters for the seven
    // names a host is allowed to switch off.
    for (const name of EVERY) {
      const canvasActions = DEFAULT_UI_OPTIONS.canvasActions as Record<
        string,
        unknown
      >;
      expect({ name, value: canvasActions[name] }).toEqual({
        name,
        value: true,
      });
    }
  });

  it("leave a host's `false` in place when merged", () => {
    // The merge in Excalidraw's entry point is `{...defaults, ...host}`, so the
    // host wins. Asserted on the same object the merge reads, since the merge
    // itself is not exported.
    const merged = {
      ...DEFAULT_UI_OPTIONS.canvasActions,
      toggleFacilitatorTimer: false,
    } as Record<string, boolean>;

    expect(merged.toggleFacilitatorTimer).toBe(false);
    expect(merged.readVoteTally).toBe(true);
  });
});
