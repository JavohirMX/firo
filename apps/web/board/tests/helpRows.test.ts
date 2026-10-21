import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { reseed } from "@firo/common";
import { FiroDoc } from "@firo/doc";

import type { Action } from "@firo/editor/actions/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { facilitatorActions, facilitatorHelpRows } from "../facilitatorActions";
import { resetFacilitationCache } from "../facilitator";

/*
 * The Help dialog's facilitation rows (parity matrix row 9). The contract
 * that matters: **a row can never advertise a chord that does not work**,
 * because the row's key text is the same string the action's keyTest was
 * built with. The second contract is the reverse — every chorded command
 * gets a row, so a new shortcut cannot silently ship undocumented.
 */

const fakeApi = () =>
  ({
    registerAction: () => {},
    setToast: () => {},
  } as unknown as ExcalidrawImperativeAPI);

let actions: readonly Action[];

beforeEach(() => {
  resetFacilitationCache();
  reseed(1);
  const document = new FiroDoc(new Y.Doc());
  actions = facilitatorActions(fakeApi(), () => document, vi.fn());
});

describe("facilitatorHelpRows", () => {
  it("covers every action that has a chord", () => {
    const rows = facilitatorHelpRows(actions);
    const chorded = actions.filter(
      (action) =>
        typeof (action.keyTest as { chord?: string } | undefined)?.chord ===
        "string",
    );
    expect(rows).toHaveLength(chorded.length);
    expect(chorded.length).toBeGreaterThan(0);
  });

  it("prints the chord the action actually tests for", () => {
    const rows = facilitatorHelpRows(actions);
    const timer = rows.find((row) => row.name === "toggleFacilitatorTimer");
    const reset = rows.find((row) => row.name === "resetFacilitatorTimer");
    expect(timer?.chord).toBe("Alt+T");
    expect(reset?.chord).toBe("Alt+Shift+T");
  });

  it("names the non-letter keys readably", () => {
    const rows = facilitatorHelpRows(actions);
    const next = rows.find((row) => row.name === "nextSlide");
    expect(next?.chord).toBe("Alt+→");
  });

  it("covers the dialog openers with their own chords", () => {
    const rows = facilitatorHelpRows(actions);
    expect(
      rows.find((row) => row.name === "setupFacilitatorTimer")?.chord,
    ).toBe("Alt+Shift+M");
    expect(
      rows.find((row) => row.name === "bulkCreateStickyNotes")?.chord,
    ).toBe("Alt+B");
  });
});
