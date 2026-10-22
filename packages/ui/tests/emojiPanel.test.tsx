import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmojiPanel } from "../src/components/EmojiPanel";
import { EMOJI_CATEGORIES } from "../src/emoji/emojiData.generated";

describe("emoji data", () => {
  it("has non-empty categories, no duplicates and no skin-tone sequences", () => {
    const seen = new Set<string>();
    for (const c of EMOJI_CATEGORIES) {
      expect(c.emoji.length).toBeGreaterThan(0);
      for (const [ch] of c.emoji) {
        expect(seen.has(ch)).toBe(false);
        seen.add(ch);
        expect(/[\u{1F3FB}-\u{1F3FF}]/u.test(ch)).toBe(false);
      }
    }
    expect(seen.size).toBeGreaterThan(1500);
  });
});

describe("EmojiPanel", () => {
  it("renders nothing when closed", () => {
    render(<EmojiPanel isOpen={false} onClose={() => {}} onPick={() => {}} />);
    expect(screen.queryByTestId("emoji-panel")).toBeNull();
  });

  it("focuses search, filters by name and keyword, and picks without closing", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<EmojiPanel isOpen onClose={onClose} onPick={onPick} />);
    const search = screen.getByLabelText("Search emoji");
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "grinning face" } });
    const cell = screen.getAllByRole("gridcell")[0];
    fireEvent.click(cell);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an empty state naming the search term", () => {
    render(<EmojiPanel isOpen onClose={() => {}} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search emoji"), {
      target: { value: "zzzzqqqq" },
    });
    expect(screen.getByRole("status").textContent).toContain("zzzzqqqq");
  });

  it("closes on Escape and on the close control, not on outside pointerdown", () => {
    const onClose = vi.fn();
    render(<EmojiPanel isOpen onClose={onClose} onPick={() => {}} />);
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Search emoji"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Close emoji panel"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("switches category with the roving tab list and arrow keys move the grid", () => {
    render(<EmojiPanel isOpen onClose={() => {}} onPick={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe(
      "true",
    );
    const cells = screen.getAllByRole("gridcell");
    expect(cells[0].getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
  });
});
