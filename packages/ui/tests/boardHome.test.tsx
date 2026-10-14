import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  BoardHome,
  BoardCard,
  TemplateGallery,
  BoardMenu,
  type BoardCardData,
} from "../src";

const boards: BoardCardData[] = [
  {
    id: "retro",
    name: "Sprint retro",
    tags: ["Team", "Retrospective"],
    lastOpenedLabel: "2 days ago",
  },
  { id: "roadmap", name: "Roadmap", tags: ["Product"] },
];

const templates = [
  {
    id: "retrospective",
    name: "Retrospective",
    description: "What went well, what did not, and what to change.",
    tags: ["Retrospective", "Team"],
    color: "#a5d8ff",
  },
];

describe("@firo/ui BoardHome", () => {
  it("lists boards with their tags and last-opened wording", () => {
    render(<BoardHome boards={boards} />);

    expect(screen.getByRole("heading", { name: "Boards" })).toBeDefined();
    expect(screen.getByText("Sprint retro")).toBeDefined();
    expect(screen.getByText("Roadmap")).toBeDefined();
    expect(screen.getByText("2 days ago")).toBeDefined();
    expect(screen.getByText("Team")).toBeDefined();
  });

  it("opens a board when its card is activated", () => {
    const onOpenBoard = vi.fn();
    render(<BoardHome boards={boards} onOpenBoard={onOpenBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Roadmap" }));
    expect(onOpenBoard).toHaveBeenCalledWith("roadmap");
  });

  it("filters by name and by tag", () => {
    render(<BoardHome boards={boards} />);

    const filter = screen.getByRole("searchbox", { name: "Filter boards" });

    fireEvent.change(filter, { target: { value: "road" } });
    expect(screen.queryByText("Sprint retro")).toBeNull();
    expect(screen.getByText("Roadmap")).toBeDefined();

    // A tag matches too — the filter is not only a name search.
    fireEvent.change(filter, { target: { value: "retrospective" } });
    expect(screen.getByText("Sprint retro")).toBeDefined();
    expect(screen.queryByText("Roadmap")).toBeNull();
  });

  it("says so when a filter matches nothing", () => {
    render(<BoardHome boards={boards} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter boards" }), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No boards match that filter.")).toBeDefined();
  });

  it("invites a first board when there are none", () => {
    render(<BoardHome boards={[]} />);
    expect(
      screen.getByText("No boards yet. Create one, or start from a template."),
    ).toBeDefined();
  });

  it("starts a blank board", () => {
    const onCreateBlank = vi.fn();
    render(<BoardHome boards={[]} onCreateBlank={onCreateBlank} />);

    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    expect(onCreateBlank).toHaveBeenCalledTimes(1);
  });

  it("starts a board from a template", () => {
    const onCreateFromTemplate = vi.fn();
    render(
      <BoardHome
        boards={boards}
        templates={templates}
        onCreateFromTemplate={onCreateFromTemplate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Start from the Retrospective template",
      }),
    );
    expect(onCreateFromTemplate).toHaveBeenCalledWith("retrospective");
  });

  it("renames a board on Enter, and not on Escape", () => {
    const onRenameBoard = vi.fn();
    render(<BoardHome boards={boards} onRenameBoard={onRenameBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Roadmap" }));
    const input = screen.getByRole("textbox", { name: "Rename Roadmap" });

    fireEvent.change(input, { target: { value: "Q3 roadmap" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRenameBoard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rename Roadmap" }));
    const second = screen.getByRole("textbox", { name: "Rename Roadmap" });
    fireEvent.change(second, { target: { value: "Q3 roadmap" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(onRenameBoard).toHaveBeenCalledWith("roadmap", "Q3 roadmap");
  });

  it("ignores a rename that only adds whitespace", () => {
    const onRenameBoard = vi.fn();
    render(<BoardHome boards={[boards[1]]} onRenameBoard={onRenameBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Roadmap" }));
    const input = screen.getByRole("textbox", { name: "Rename Roadmap" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRenameBoard).not.toHaveBeenCalled();
  });

  it("trashes a board", () => {
    const onTrashBoard = vi.fn();
    render(<BoardHome boards={boards} onTrashBoard={onTrashBoard} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Move Roadmap to trash" }),
    );
    expect(onTrashBoard).toHaveBeenCalledWith("roadmap");
  });

  it("shows trashed boards apart, with restore and delete", () => {
    const onRestoreBoard = vi.fn();
    const onDeleteBoard = vi.fn();
    render(
      <BoardHome
        boards={[{ id: "gone", name: "Old board", tags: [], trashed: true }]}
        onRestoreBoard={onRestoreBoard}
        onDeleteBoard={onDeleteBoard}
      />,
    );

    // A trashed board is out of the grid, and its honest actions are not
    // "rename" and "trash" — it is already trashed.
    expect(screen.getByRole("region", { name: "Trash" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Rename Old board" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Restore Old board" }));
    expect(onRestoreBoard).toHaveBeenCalledWith("gone");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Old board permanently" }),
    );
    expect(onDeleteBoard).toHaveBeenCalledWith("gone");
  });

  it("renders a card on its own", () => {
    const onOpen = vi.fn();
    render(<BoardCard board={boards[1]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Roadmap" }));
    expect(onOpen).toHaveBeenCalledWith("roadmap");
  });

  it("renders the template gallery", () => {
    render(<TemplateGallery templates={templates} />);
    expect(
      screen.getByRole("button", {
        name: "Start from the Retrospective template",
      }),
    ).toBeDefined();
  });

  describe("BoardMenu", () => {
    it("makes the title a control that leaves the board", () => {
      const onOpenHome = vi.fn();
      render(<BoardMenu boardName="Sprint planning" onOpenHome={onOpenHome} />);

      fireEvent.click(
        screen.getByRole("button", { name: "All boards — Sprint planning" }),
      );
      expect(onOpenHome).toHaveBeenCalledTimes(1);
    });

    it("keeps the title plain text when there is nowhere to go", () => {
      render(<BoardMenu boardName="Sprint planning" />);
      expect(screen.queryByRole("button", { name: "All boards" })).toBeNull();
      expect(screen.getByText("Sprint planning")).toBeDefined();
    });
  });
});
