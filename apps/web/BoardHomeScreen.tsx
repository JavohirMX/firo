import { BoardHome } from "@firo/ui";
import React from "react";

import type { BoardCardData, TemplateCardData } from "@firo/ui";

import {
  createBlankBoard,
  createBoardFromTemplate,
  createFolder,
  deleteBoardForever,
  deleteFolder,
  duplicateBoard,
  formatLastOpened,
  listBoards,
  listFolders,
  renameBoard,
  renameFolder,
  restoreTrashedBoard,
  setBoardFolder,
  toggleStarBoard,
  trashBoard,
} from "./board/library";
import { BOARD_TEMPLATES, templateById } from "./board/templates";
import { boardUrl } from "./board/routes";

import type { BoardFolder, BoardMeta } from "./board/library";

/**
 * The board home, wired to the board library.
 *
 * ## The split
 *
 * `BoardHome` is presentational and lives in `@firo/ui`, because it is chrome
 * ([ADR-0022](../../docs/adr/0022-ui-package-owns-the-chrome.md)). This file is
 * the app: it reads and writes storage, decides what "open" means, and hands the
 * component data with no storage in it. Every callback here is a library call
 * plus a refresh; none of them is UI.
 *
 * ## Why opening reloads
 *
 * `openBoard` navigates rather than switching a tree. See `./board/routes.ts`.
 * It also touches the board first, so recents reflects what was actually opened.
 */

const templateCards: TemplateCardData[] = BOARD_TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  tags: template.tags,
  color: template.color,
}));

const toCard = (meta: BoardMeta, foldersList: BoardFolder[]): BoardCardData => {
  const folder = meta.folderId
    ? foldersList.find((f) => f.id === meta.folderId)
    : undefined;
  return {
    id: meta.id,
    name: meta.name,
    tags: meta.tags,
    lastOpenedLabel: meta.trashedAt
      ? undefined
      : formatLastOpened(meta.lastOpened),
    color: meta.color,
    thumbnail: meta.thumbnail,
    trashed: Boolean(meta.trashedAt),
    folderId: meta.folderId,
    folderName: folder?.name,
    starred: Boolean(meta.starred),
    createdAt: meta.created,
    lastOpenedAt: meta.lastOpened,
  };
};

export const BoardHomeScreen: React.FC = () => {
  const [boards, setBoards] = React.useState<BoardMeta[] | null>(null);
  const [folders, setFolders] = React.useState<BoardFolder[]>([]);
  const [activeSection, setActiveSection] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = React.useState<"lastOpened" | "created" | "name">(
    "lastOpened",
  );

  const refresh = React.useCallback(async () => {
    const [allBoards, allFolders] = await Promise.all([
      listBoards(),
      listFolders(),
    ]);
    setBoards(allBoards);
    setFolders(allFolders);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (id: string) => {
    window.location.assign(boardUrl(id));
  };

  const handleCreateBlank = async () => {
    open((await createBlankBoard()).id);
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const template = templateById(templateId);
    if (!template) {
      return;
    }
    open((await createBoardFromTemplate(template)).id);
  };

  const handleRename = async (id: string, name: string) => {
    await renameBoard(id, name);
    await refresh();
  };

  const handleTrash = async (id: string) => {
    await trashBoard(id);
    await refresh();
  };

  const handleRestore = async (id: string) => {
    await restoreTrashedBoard(id);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteBoardForever(id);
    await refresh();
  };

  const handleToggleStar = async (id: string, starred: boolean) => {
    await toggleStarBoard(id, starred);
    await refresh();
  };

  const handleDuplicate = async (id: string) => {
    await duplicateBoard(id);
    await refresh();
  };

  const handleMoveToFolder = async (boardId: string, folderId?: string) => {
    await setBoardFolder(boardId, folderId);
    await refresh();
  };

  const handleCreateFolder = async (name: string, color?: string) => {
    await createFolder(name, color);
    await refresh();
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await renameFolder(id, name);
    await refresh();
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    if (activeSection === id) {
      setActiveSection("all");
    }
    await refresh();
  };

  // Filter boards based on activeSection
  const displayedBoards = React.useMemo(() => {
    if (!boards) {
      return [];
    }
    const live = boards.filter((b) => !b.trashedAt);
    const trashed = boards.filter((b) => Boolean(b.trashedAt));

    if (activeSection === "trash") {
      return trashed;
    }
    if (activeSection === "recent") {
      return [...live].sort((a, b) => b.lastOpened - a.lastOpened);
    }
    if (activeSection === "starred") {
      return live.filter((b) => Boolean(b.starred));
    }
    if (activeSection === "all") {
      return live;
    }
    // Folder ID
    return live.filter((b) => b.folderId === activeSection);
  }, [boards, activeSection]);

  // Storage is asynchronous, and rendering an empty home first would flash "no
  // boards yet" at someone who has boards. Nothing is shown until the answer is.
  if (boards === null) {
    return null;
  }

  return (
    <BoardHome
      boards={displayedBoards.map((b) => toCard(b, folders))}
      templates={activeSection === "trash" ? [] : templateCards}
      folders={folders}
      activeSection={activeSection}
      viewMode={viewMode}
      sortBy={sortBy}
      onCreateBlank={handleCreateBlank}
      onOpenBoard={open}
      onRenameBoard={handleRename}
      onTrashBoard={handleTrash}
      onRestoreBoard={handleRestore}
      onDeleteBoard={handleDelete}
      onCreateFromTemplate={handleCreateFromTemplate}
      onSelectSection={setActiveSection}
      onToggleStarBoard={handleToggleStar}
      onDuplicateBoard={handleDuplicate}
      onMoveBoardToFolder={handleMoveToFolder}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
      onChangeViewMode={setViewMode}
      onChangeSortBy={setSortBy}
    />
  );
};
