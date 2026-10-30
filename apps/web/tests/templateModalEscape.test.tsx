/*
 * Escape rungs in the template gallery.
 *
 * Host dialogs render inside the editor container, which consumes Escape for
 * deselect before window listeners ever see it, so the gallery handles Escape
 * in `onKeyDown` on the dialog element with stopPropagation. The rungs matter:
 * an open card menu or edit dialog swallows the first Escape, and only an
 * unadorned gallery closes. Closing the gallery from under an open menu is the
 * regression this file pins (the menu would stay mounted over nothing).
 */
import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { saveTemplate } from "../board/templateStore";
import { TemplateModal } from "../components/TemplateModal";

const seedTemplate = () =>
  saveTemplate({
    name: "Escape target",
    description: "",
    tags: [],
    elements: [],
    files: {},
  });

describe("TemplateModal Escape rungs", () => {
  it("closes an open card menu before the gallery", async () => {
    const meta = await seedTemplate();
    const onClose = vi.fn();
    render(
      <TemplateModal isOpen={true} onClose={onClose} excalidrawAPI={null} />,
    );

    const trigger = await screen.findByTestId(
      `template-menu-trigger-${meta.id}`,
    );
    fireEvent.click(trigger);
    expect(document.querySelector(".firo-template-card__menu")).not.toBeNull();

    const dialog = screen.getByTestId("template-modal");
    fireEvent.keyDown(dialog, { key: "Escape" });

    // First Escape: the menu closes, the gallery stays.
    expect(document.querySelector(".firo-template-card__menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // Second Escape: nothing nested remains, so the gallery closes.
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the edit dialog before the gallery", async () => {
    const meta = await seedTemplate();
    const onClose = vi.fn();
    render(
      <TemplateModal isOpen={true} onClose={onClose} excalidrawAPI={null} />,
    );

    fireEvent.click(
      await screen.findByTestId(`template-menu-trigger-${meta.id}`),
    );
    fireEvent.click(await screen.findByTestId(`template-edit-${meta.id}`));
    await waitFor(() => {
      expect(screen.getByTestId("template-edit-dialog")).toBeDefined();
    });

    fireEvent.keyDown(screen.getByTestId("template-edit-dialog"), {
      key: "Escape",
    });

    await waitFor(() => {
      expect(screen.queryByTestId("template-edit-dialog")).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
