import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ActivityFeed } from "../src/components/ActivityFeed";

import type { ActivityFeedItem } from "../src/components/ActivityFeed";

describe("ActivityFeed component", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <ActivityFeed entries={[]} isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders empty state when there are no entries", () => {
    render(<ActivityFeed entries={[]} isOpen={true} onClose={() => {}} />);

    expect(screen.getByText("No activity recorded yet.")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Close activity feed" }),
    ).toBeDefined();
  });

  it("groups entries by date and calls onSelectBoard and onClear", () => {
    const now = Date.now();
    const onClose = vi.fn();
    const onSelectBoard = vi.fn();
    const onClear = vi.fn();

    const entries: ActivityFeedItem[] = [
      {
        id: "act-1",
        boardId: "board-1",
        boardName: "Roadmap",
        timestamp: now - 1000 * 60, // 1m ago -> today
        kind: "comment",
        summary: "Commented on sticky note",
      },
      {
        id: "act-2",
        boardId: "board-2",
        timestamp: now - 1000 * 60 * 60 * 26, // 26h ago -> yesterday or earlier
        kind: "create",
        summary: "Created board",
      },
    ];

    render(
      <ActivityFeed
        entries={entries}
        isOpen={true}
        onClose={onClose}
        onSelectBoard={onSelectBoard}
        onClear={onClear}
        title="Recent Activity"
      />,
    );

    expect(screen.getByText("Recent Activity")).toBeDefined();
    expect(screen.getByText("Commented on sticky note")).toBeDefined();
    expect(screen.getByText("Created board")).toBeDefined();

    // Clicking board badge triggers onSelectBoard
    const boardBtn = screen.getByRole("button", { name: "Roadmap" });
    fireEvent.click(boardBtn);
    expect(onSelectBoard).toHaveBeenCalledWith("board-1");

    // Clicking clear triggers onClear
    const clearBtn = screen.getByTestId("activity-clear-btn");
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);

    // Clicking close triggers onClose
    const closeBtn = screen.getByRole("button", {
      name: "Close activity feed",
    });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("attaches dialogRef to the inline container element", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(
      <ActivityFeed
        entries={[]}
        isOpen={true}
        onClose={() => {}}
        dialogRef={ref}
        presentation="inline"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(ref.current).toBe(dialog);
    expect(dialog.classList.contains("firo-activity-feed")).toBe(true);
  });

  /*
   * The dock presentation is the ADR-0035 right dock: a complementary
   * landmark, not a modal dialog, and Escape does not close it -- the
   * ADR-0032 Escape ladder stays on the canvas.
   */
  it("docks as a non-modal panel that Escape does not close", () => {
    const onClose = vi.fn();
    render(<ActivityFeed entries={[]} isOpen={true} onClose={onClose} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    const panel = screen.getByRole("complementary", {
      name: "Activity History",
    });
    expect(panel).toBeDefined();
    expect(panel.getAttribute("aria-modal")).toBeNull();

    fireEvent.keyDown(panel, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
