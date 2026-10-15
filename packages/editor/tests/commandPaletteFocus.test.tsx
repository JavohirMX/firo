import React from "react";

import { queryFocusableElements } from "@firo/common";

import { CommandPalette, Excalidraw } from "../index";

import { act, fireEvent, render, waitFor } from "./test-utils";

const { h } = window;

const paletteDialog = () =>
  document.querySelector<HTMLDivElement>(
    ".excalidraw-modal-container .command-palette-dialog",
  );

describe("command palette focus guard", () => {
  it("focuses search input on open, keeps Tab inside, and restores opener on close", async () => {
    await render(
      <Excalidraw>
        <CommandPalette />
      </Excalidraw>,
    );

    const trigger = document.createElement("button");
    trigger.textContent = "open palette";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    act(() => h.app.setState({ openDialog: { name: "commandPalette" } }));

    const dialog = await waitFor(() => {
      const el = paletteDialog();
      expect(el).not.toBeNull();
      return el!;
    });

    const searchInput = dialog.querySelector<HTMLInputElement>(
      ".ExcTextField input",
    );
    expect(searchInput).not.toBeNull();

    await waitFor(() => {
      expect(document.activeElement).toBe(searchInput);
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

    act(() => h.app.setState({ openDialog: null }));

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });

    trigger.remove();
  });
});
