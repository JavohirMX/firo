/*
 * The no-results state must render on a fresh device too. The gallery gates
 * the "No templates match" message on saved templates existing, so a device
 * with none (entries.length === 0) shows a blank body under the filter chips
 * for a nonsense search instead of the designed empty state. Built-ins
 * always exist, so a query that matches nothing makes anyVisible false
 * regardless of saved entries.
 */
import "fake-indexeddb/auto";

import { fireEvent, render, screen } from "@testing-library/react";

import { TemplateModal } from "../components/TemplateModal";

describe("TemplateModal no-results state", () => {
  it("shows the empty state on a fresh device when nothing matches", async () => {
    render(
      <TemplateModal isOpen={true} onClose={() => {}} excalidrawAPI={null} />,
    );

    // Wait for the gallery to finish loading its (empty) saved list.
    await screen.findAllByText("Retrospective");

    fireEvent.change(screen.getByLabelText("Search templates"), {
      target: { value: "zzzzqq" },
    });

    await screen.findByTestId("template-no-results");
    expect(screen.getByText("No templates match.")).toBeDefined();
    expect(screen.getByTestId("template-clear-filters")).toBeDefined();
  });

  it("clear-filters restores the built-in cards", async () => {
    render(
      <TemplateModal isOpen={true} onClose={() => {}} excalidrawAPI={null} />,
    );

    await screen.findAllByText("Retrospective");
    fireEvent.change(screen.getByLabelText("Search templates"), {
      target: { value: "zzzzqq" },
    });
    await screen.findByTestId("template-no-results");

    fireEvent.click(screen.getByTestId("template-clear-filters"));

    await screen.findAllByText("Retrospective");
    expect(screen.queryByTestId("template-no-results")).toBeNull();
  });
});
