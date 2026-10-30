import React from "react";

import { queryFocusableElements } from "@firo/common";

import { Excalidraw } from "../index";

import { act, fireEvent, render, waitFor } from "./test-utils";

const { h } = window;

const modal = () =>
  document.querySelector<HTMLDivElement>(".excalidraw-modal-container .Modal");

/**
 * The editor's dialogs, driven the way the app drives them.
 *
 * `Modal` declares `role="dialog" aria-modal="true"` and nothing contained
 * focus; `Dialog` wraps the *island* inside it, which covers tabbing between a
 * dialog's controls but not the two things `trd/09` actually asks for: focus
 * must be inside the dialog, and it must never be lost to `<body>`.
 *
 * The second test is the one that fails without the trap. `Dialog` restores
 * focus in its own `onClose`, which never runs when the dialog is dismissed by
 * `openDialog` changing under it — so focus is destroyed along with the DOM
 * node that held it and lands on `<body>`.
 */
describe("editor dialog render slots", () => {
  it("passes renderHelpDialogExtra through to the Help dialog", async () => {
    /*
     * Regression: the prop reached the editor's types and the Help dialog's
     * `extraSections` slot, but the Excalidraw entry component never forwarded
     * it to the App class — a host's section (Firo's facilitation chords)
     * silently never appeared. This renders the full entry boundary, the way
     * a host does.
     */
    await render(
      <Excalidraw
        renderHelpDialogExtra={() => <div>Facilitation extra section</div>}
      />,
    );

    act(() => h.app.setState({ openDialog: { name: "help" } }));

    await waitFor(() => {
      expect(modal()?.textContent).toContain("Facilitation extra section");
    });
  });
});

describe("editor dialog focus", () => {
  it("returns focus to the opener when the dialog is closed by state", async () => {
    await render(<Excalidraw />);

    // stands in for whatever opened the dialog — a menu item, a toolbar button
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();

    act(() => h.app.setState({ openDialog: { name: "help" } }));

    const dialog = await waitFor(() => {
      const dialog = modal();
      expect(dialog).not.toBeNull();
      return dialog!;
    });

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    act(() => h.app.setState({ openDialog: null }));

    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it("keeps Tab inside the dialog", async () => {
    // A guard rather than the trap's own red test: `Dialog` already wraps Tab
    // across the island it owns, so this passes either way and exists to catch
    // that behaviour being dropped, not to prove the trap was added.
    await render(<Excalidraw />);

    act(() => h.app.setState({ openDialog: { name: "help" } }));

    const dialog = await waitFor(() => {
      const dialog = modal();
      expect(dialog).not.toBeNull();
      return dialog!;
    });

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    const focusables = queryFocusableElements(dialog);
    expect(focusables.length).toBeGreaterThan(0);

    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });

    expect(dialog.contains(document.activeElement)).toBe(true);

    const first = focusables[0];
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });

    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
