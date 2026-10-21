/*
 * Tag chips in the template gallery dedupe case-insensitively: a saved
 * template tagged "workshop" and a built-in tagged "Workshop" share one chip,
 * and that chip filters both. Two chips for one tag is how the filter row
 * fills with duplicates that each hide half the matching cards.
 */
import "fake-indexeddb/auto";

import { fireEvent, render, screen } from "@testing-library/react";

import { saveTemplate } from "../board/templateStore";
import { TemplateModal } from "../components/TemplateModal";

describe("TemplateModal tag chips", () => {
  it("dedupes tags case-insensitively and filters both sources", async () => {
    await saveTemplate({
      name: "Lowercase tagged",
      description: "",
      tags: ["workshop"],
      elements: [],
      files: {},
    });
    render(
      <TemplateModal isOpen={true} onClose={() => {}} excalidrawAPI={null} />,
    );

    // One chip for the tag across both sources, not one per spelling.
    await screen.findByTestId("template-chip-workshop");
    expect(screen.queryByTestId("template-chip-Workshop")).toBeNull();

    fireEvent.click(screen.getByTestId("template-chip-workshop"));

    // The lowercase-tagged saved template and the "Workshop"-tagged built-in
    // both match the shared chip.
    await screen.findByText("Lowercase tagged");
    expect(screen.getByText("Brainstorm")).toBeDefined();
  });
});
