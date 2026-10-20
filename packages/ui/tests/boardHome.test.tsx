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

  it("triggers import board when import button is clicked", () => {
    const onImportBoard = vi.fn();
    render(<BoardHome boards={[]} onImportBoard={onImportBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Import board" }));
    expect(onImportBoard).toHaveBeenCalledTimes(1);
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

  it("selects the whole name when rename starts, so typing replaces it", () => {
    render(<BoardHome boards={[boards[1]]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Roadmap" }));
    const input = screen.getByRole("textbox", {
      name: "Rename Roadmap",
    }) as HTMLInputElement;
    fireEvent.focus(input);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Roadmap".length);
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

  describe("Miro-style navigation and controls", () => {
    const extendedBoards: BoardCardData[] = [
      {
        id: "b1",
        name: "Alpha board",
        tags: ["Design"],
        lastOpenedLabel: "1 hour ago",
        starred: true,
        folderId: "f1",
        folderName: "Work",
      },
      {
        id: "b2",
        name: "Beta board",
        tags: ["Engineering"],
        starred: false,
      },
      {
        id: "b3",
        name: "Old trashed",
        tags: [],
        trashed: true,
      },
    ];

    const testFolders = [
      { id: "f1", name: "Work" },
      { id: "f2", name: "Personal" },
    ];

    it("navigates through sidebar sections and triggers onSelectSection", () => {
      const onSelectSection = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          folders={testFolders}
          onSelectSection={onSelectSection}
        />,
      );

      // Click Recent
      fireEvent.click(screen.getByRole("button", { name: "Recent" }));
      expect(onSelectSection).toHaveBeenCalledWith("recent");
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.queryByText("Beta board")).toBeNull();

      // Click Starred
      fireEvent.click(screen.getByRole("button", { name: "Starred" }));
      expect(onSelectSection).toHaveBeenCalledWith("starred");
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.queryByText("Beta board")).toBeNull();

      // Click Folder Work
      fireEvent.click(screen.getByRole("button", { name: "Folder Work" }));
      expect(onSelectSection).toHaveBeenCalledWith("f1");
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.queryByText("Beta board")).toBeNull();

      // Click Trash
      fireEvent.click(screen.getByRole("button", { name: "Trash" }));
      expect(onSelectSection).toHaveBeenCalledWith("trash");
      expect(screen.getByText("Old trashed")).toBeDefined();
      expect(screen.queryByText("Alpha board")).toBeNull();

      // Click All Boards
      fireEvent.click(screen.getByRole("button", { name: "All Boards" }));
      expect(onSelectSection).toHaveBeenCalledWith("all");
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.getByText("Beta board")).toBeDefined();
    });

    it("supports controlled activeSection prop", () => {
      const { rerender } = render(
        <BoardHome boards={extendedBoards} activeSection="starred" />,
      );
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.queryByText("Beta board")).toBeNull();

      rerender(<BoardHome boards={extendedBoards} activeSection="all" />);
      expect(screen.getByText("Alpha board")).toBeDefined();
      expect(screen.getByText("Beta board")).toBeDefined();
    });

    it("toggles star status on card", () => {
      const onToggleStarBoard = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          onToggleStarBoard={onToggleStarBoard}
        />,
      );

      // Star Beta board
      fireEvent.click(screen.getByRole("button", { name: "Star Beta board" }));
      expect(onToggleStarBoard).toHaveBeenCalledWith("b2", true);

      // Unstar Alpha board
      fireEvent.click(
        screen.getByRole("button", { name: "Unstar Alpha board" }),
      );
      expect(onToggleStarBoard).toHaveBeenCalledWith("b1", false);
    });

    it("duplicates a board", () => {
      const onDuplicateBoard = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          onDuplicateBoard={onDuplicateBoard}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Duplicate Alpha board" }),
      );
      expect(onDuplicateBoard).toHaveBeenCalledWith("b1");
    });

    it("toggles between grid and list views", () => {
      const onChangeViewMode = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          onChangeViewMode={onChangeViewMode}
        />,
      );

      // Switch to list view
      fireEvent.click(screen.getByRole("button", { name: "List view" }));
      expect(onChangeViewMode).toHaveBeenCalledWith("list");
      expect(screen.getByRole("table", { name: "Boards" })).toBeDefined();

      // Switch back to grid view
      fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
      expect(onChangeViewMode).toHaveBeenCalledWith("grid");
      expect(screen.queryByRole("table", { name: "Boards" })).toBeNull();
    });

    it("creates a new folder via the sidebar prompt", () => {
      const onCreateFolder = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          folders={testFolders}
          onCreateFolder={onCreateFolder}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
      const input = screen.getByRole("textbox", { name: "New folder name" });
      fireEvent.change(input, { target: { value: "Designs" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm folder" }));

      expect(onCreateFolder).toHaveBeenCalledWith("Designs");
    });

    it("renames and deletes folders", () => {
      const onRenameFolder = vi.fn();
      const onDeleteFolder = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          folders={testFolders}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />,
      );

      // Rename
      fireEvent.click(
        screen.getByRole("button", { name: "Rename folder Work" }),
      );
      const renameInput = screen.getByRole("textbox", {
        name: "Rename folder Work",
      });
      fireEvent.change(renameInput, { target: { value: "Workplace" } });
      fireEvent.keyDown(renameInput, { key: "Enter" });
      expect(onRenameFolder).toHaveBeenCalledWith("f1", "Workplace");

      // Delete
      fireEvent.click(
        screen.getByRole("button", { name: "Delete folder Work" }),
      );
      expect(onDeleteFolder).toHaveBeenCalledWith("f1");
    });

    it("moves a board to a folder using the dialog", () => {
      const onMoveBoardToFolder = vi.fn();
      render(
        <BoardHome
          boards={extendedBoards}
          folders={testFolders}
          onMoveBoardToFolder={onMoveBoardToFolder}
        />,
      );

      // Open context menu on Alpha board and click move
      fireEvent.click(
        screen.getByRole("button", { name: "More actions for Alpha board" }),
      );
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Move to folder..." }),
      );

      // The dialog opens
      expect(
        screen.getByRole("dialog", { name: "Move Alpha board to folder" }),
      ).toBeDefined();

      // Click Personal folder in the dialog
      fireEvent.click(screen.getByRole("button", { name: "Personal" }));
      expect(onMoveBoardToFolder).toHaveBeenCalledWith("b1", "f2");
    });

    it("sorts boards by name, creation, or last opened", () => {
      const onChangeSortBy = vi.fn();
      render(
        <BoardHome boards={extendedBoards} onChangeSortBy={onChangeSortBy} />,
      );

      const sortSelect = screen.getByRole("combobox", { name: "Sort boards" });
      fireEvent.change(sortSelect, { target: { value: "name" } });
      expect(onChangeSortBy).toHaveBeenCalledWith("name");
    });
  });
});
