import React from "react";

import { KEYS } from "@firo/common";

import { Excalidraw } from "../index";

import {
  actionAlignBottom,
  actionAlignLeft,
  actionAlignRight,
  actionAlignTop,
} from "../actions/actionAlign";
import { getShortcutFromShortcutName } from "../actions/shortcuts";

import { findShapeByKey, getToolShortcuts, TOOLS } from "../components/Tools";
import {
  isEyeDropperBackgroundKey,
  isEyeDropperStrokeKey,
} from "../eyeDropperKeys";

import { act, render, waitFor } from "./test-utils";

import type { ToolbarToolType } from "../components/Tools";

const { h } = window;

/**
 * The cheat sheet's rows and the keys that actually fire are maintained as
 * "two views of one entry": a printable registry (`actions/shortcuts.ts`,
 * `TOOLS`) and the binding (an action's `keyTest`, `findShapeByKey`, or the
 * eye dropper predicates). These suites fail when one view changes without
 * the other, so the modal cannot keep advertising a dead chord.
 */

/** app stub shaped for `findShapeByKey`'s only app read */
const APP_STUB = {
  state: { preferredSelectionTool: { type: "selection" } },
} as unknown as Parameters<typeof findShapeByKey>[1];

/** tools with a row in the cheat sheet's tool island */
const DIALOG_TOOLS: readonly ToolbarToolType[] = [
  "hand",
  "selection",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "stickynote",
  "image",
  "eraser",
  "frame",
  "laser",
  "bucketfill",
];

describe("cheat-sheet tool rows", () => {
  it.each(DIALOG_TOOLS)(
    "%s: every advertised key activates the tool",
    (type) => {
      const { numericKey, shiftKey } = TOOLS[type];
      const advertised = getToolShortcuts(type);
      expect(advertised.length).toBeGreaterThan(0);

      for (const key of advertised) {
        const numeric = key === numericKey;
        const letter = key.replace(/^Shift\+/, "").toLowerCase();
        expect(
          findShapeByKey(
            numeric ? key : letter,
            APP_STUB,
            !numeric && Boolean(shiftKey),
          ),
        ).toBe(type === "selection" ? "selection" : type);
      }
    },
  );

  it.each(DIALOG_TOOLS)(
    "%s: every bound key is advertised (no hidden aliases)",
    (type) => {
      const { letterKey, numericKey } = TOOLS[type];
      const advertised = getToolShortcuts(type);
      const letters = letterKey
        ? typeof letterKey === "string"
          ? [letterKey]
          : letterKey
        : [];
      for (const letter of letters) {
        expect(advertised).toContainEqual(letter);
      }
      if (numericKey != null) {
        expect(advertised).toContainEqual(numericKey);
      }
    },
  );

  it("shift-bound tools advertise the Shift prefix", () => {
    const advertised = getToolShortcuts("autoshape");
    expect(advertised).toHaveLength(1);
    expect(advertised[0]).toMatch(/^Shift\+/i);
    expect(
      findShapeByKey(
        advertised[0].replace(/^Shift\+/, "").toLowerCase(),
        APP_STUB,
        true,
      ),
    ).toBe("autoshape");
  });

  it("covers every tool the cheat sheet lists, and only existing tools", () => {
    for (const type of DIALOG_TOOLS) {
      expect(TOOLS[type]).toBeDefined();
    }
  });
});

type Chord = {
  key: string;
  shift?: boolean;
  ctrlOrCmd?: boolean;
};

const keyEvent = ({ key, shift = false, ctrlOrCmd = false }: Chord) =>
  ({
    key,
    shiftKey: shift,
    [KEYS.CTRL_OR_CMD]: ctrlOrCmd,
  } as KeyboardEvent);

const ALIGN_ROWS = [
  {
    name: "alignTop",
    action: actionAlignTop,
    chord: { key: KEYS.ARROW_UP, shift: true, ctrlOrCmd: true },
    directionToken: "Up",
  },
  {
    name: "alignBottom",
    action: actionAlignBottom,
    chord: { key: KEYS.ARROW_DOWN, shift: true, ctrlOrCmd: true },
    directionToken: "Down",
  },
  {
    name: "alignLeft",
    action: actionAlignLeft,
    chord: { key: KEYS.ARROW_LEFT, shift: true, ctrlOrCmd: true },
    directionToken: "Left",
  },
  {
    name: "alignRight",
    action: actionAlignRight,
    chord: { key: KEYS.ARROW_RIGHT, shift: true, ctrlOrCmd: true },
    directionToken: "Right",
  },
] as const;

describe("cheat-sheet align rows", () => {
  it.each(ALIGN_ROWS)(
    "$name: the advertised chord fires the action",
    ({ name, action, chord, directionToken }) => {
      expect(action.keyTest?.(keyEvent(chord), {} as never, {} as never)).toBe(
        true,
      );
      const advertised = getShortcutFromShortcutName(name);
      expect(advertised).toContain(directionToken);
      expect(advertised).toMatch(/shift/i);
    },
  );

  it.each(ALIGN_ROWS)(
    "$name: dropping any one modifier does not fire (the chord is the whole chord)",
    ({ action, chord }) => {
      const partialChords: Chord[] = [
        { key: chord.key },
        { key: chord.key, ctrlOrCmd: true },
        { key: chord.key, shift: true },
      ];
      for (const partial of partialChords) {
        expect(
          action.keyTest?.(keyEvent(partial), {} as never, {} as never),
        ).not.toBe(true);
      }
    },
  );
});

describe("cheat-sheet eye dropper row", () => {
  const advertised = [0, 1, 2].map((i) =>
    getShortcutFromShortcutName("eyeDropper", i),
  );

  it("every advertised chord opens the matching dropper", () => {
    expect(isEyeDropperBackgroundKey(keyEvent({ key: KEYS.I }))).toBe(true);
    expect(
      isEyeDropperBackgroundKey(keyEvent({ key: KEYS.G, shift: true })),
    ).toBe(true);
    expect(isEyeDropperStrokeKey(keyEvent({ key: KEYS.S, shift: true }))).toBe(
      true,
    );
    expect(advertised[0]).toBe(KEYS.I);
    expect(advertised[1]).toContain("S");
    expect(advertised[2]).toContain("G");
  });

  it("plain S and plain G type into text instead of picking", () => {
    expect(isEyeDropperStrokeKey(keyEvent({ key: KEYS.S }))).toBe(false);
    expect(isEyeDropperBackgroundKey(keyEvent({ key: KEYS.G }))).toBe(false);
  });

  it("Ctrl+S stays the browser's save, not the stroke picker", () => {
    expect(
      isEyeDropperStrokeKey(
        keyEvent({ key: KEYS.S, shift: true, ctrlOrCmd: true }),
      ),
    ).toBe(false);
  });
});

describe("rendered cheat sheet", () => {
  it("prints the tool rows from TOOLS, including every alias", async () => {
    await render(<Excalidraw />);

    act(() => h.app.setState({ openDialog: { name: "help" } }));

    const rowFor = (label: string) => {
      const el = Array.from(
        document.querySelectorAll(
          ".HelpDialog__island--tools .HelpDialog__shortcut",
        ),
      ).find((node) => node.textContent?.includes(label));
      if (!el) {
        throw new Error(`no cheat-sheet row for ${label}`);
      }
      return Array.from(el.querySelectorAll("kbd")).map(
        (kbd) => kbd.textContent,
      );
    };

    await waitFor(() => {
      // TOOLS.rectangle binds R *and* S (plus 2); the sheet used to drop S
      expect(rowFor("Rectangle")).toEqual(["R", "S", "2"]);
      // TOOLS.freedraw ("Draw" row) binds P *and* X (plus 7); the sheet used to drop X
      expect(rowFor("Draw")).toEqual(["P", "X", "7"]);
    });
  });
});
