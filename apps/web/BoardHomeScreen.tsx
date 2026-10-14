import { BoardHome } from "@firo/ui";
import React from "react";

import type { BoardCardData, TemplateCardData } from "@firo/ui";

import {
  createBlankBoard,
  createBoardFromTemplate,
  deleteBoardForever,
  formatLastOpened,
  listBoards,
  renameBoard,
  restoreTrashedBoard,
  trashBoard,
} from "./board/library";
import { BOARD_TEMPLATES, templateById } from "./board/templates";
import { boardUrl } from "./board/routes";

import type { BoardMeta } from "./board/library";

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

const toCard = (meta: BoardMeta): BoardCardData => ({
  id: meta.id,
  name: meta.name,
  tags: meta.tags,
  lastOpenedLabel: meta.trashedAt
    ? undefined
    : formatLastOpened(meta.lastOpened),
  color: meta.color,
  thumbnail: meta.thumbnail,
  trashed: Boolean(meta.trashedAt),
});

export const BoardHomeScreen: React.FC = () => {
  const [boards, setBoards] = React.useState<BoardMeta[] | null>(null);

  const refresh = React.useCallback(async () => {
    setBoards(await listBoards());
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

  // Storage is asynchronous, and rendering an empty home first would flash "no
  // boards yet" at someone who has boards. Nothing is shown until the answer is.
  if (boards === null) {
    return null;
  }

  return (
    <BoardHome
      boards={boards.map(toCard)}
      templates={templateCards}
      onCreateBlank={handleCreateBlank}
      onOpenBoard={open}
      onRenameBoard={handleRename}
      onTrashBoard={handleTrash}
      onRestoreBoard={handleRestore}
      onDeleteBoard={handleDelete}
      onCreateFromTemplate={handleCreateFromTemplate}
    />
  );
};
