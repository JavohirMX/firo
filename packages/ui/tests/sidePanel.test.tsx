/*
 * The right-dock shell (Miro parity matrix row 16, ADR-0035 section 1): one
 * `<aside>` home for the activity, frames and voting lists. The contract the
 * tests pin down: an accessible name, a header with its own close control,
 * Escape does NOT close (observed Miro behaviour; the ADR-0032 Escape ladder
 * stays on the canvas), focus moves into the panel on open, and an optional
 * tab strip for the panels that have tabs.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { SidePanel } from "../src";

const baseProps = {
  title: "Activity",
  onClose: vi.fn(),
  children: <p>panel body</p>,
};

describe("SidePanel (ADR-0035 row 16)", () => {
  it("renders an aside landmark named by its title, with the body inside", () => {
    render(<SidePanel {...baseProps} />);
    const panel = screen.getByRole("complementary", { name: "Activity" });
    expect(panel.tagName).toBe("ASIDE");
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("closes by its own close control only", () => {
    const onClose = vi.fn();
    render(<SidePanel {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape (ADR-0035: the Escape ladder stays on the canvas)", () => {
    const onClose = vi.fn();
    render(<SidePanel {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("complementary"), {
      key: "Escape",
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the panel on open", () => {
    render(<SidePanel {...baseProps} />);
    const panel = screen.getByRole("complementary");
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("renders no tab strip without tabs", () => {
    render(<SidePanel {...baseProps} />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders the tab strip with the active tab selected", () => {
    const onTabChange = vi.fn();
    render(
      <SidePanel
        {...baseProps}
        tabs={[
          { id: "board", label: "This board" },
          { id: "all", label: "All boards" },
        ]}
        activeTab="board"
        onTabChange={onTabChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "This board",
      "All boards",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    fireEvent.click(tabs[1]);
    expect(onTabChange).toHaveBeenCalledWith("all");
  });

  it("marks the wide variant for the voting dock", () => {
    render(<SidePanel {...baseProps} wide />);
    const panel = screen.getByRole("complementary");
    expect(panel.className).toContain("firo-side-panel--wide");
  });
});
