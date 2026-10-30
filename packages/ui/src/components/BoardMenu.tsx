import React from "react";

import { BoardsIcon, MenuHamburgerIcon } from "../icons";

import "./BoardMenu.scss";

export interface BoardMenuProps {
  boardName?: string;
  onOpenMenu?: () => void;
  /**
   * Where the home control goes — the board home.
   *
   * Provided by the host rather than assumed, because navigation is the app's
   * ([ADR-0022]): `@firo/ui` draws the control and the host decides that it
   * leaves the board. On its own (no `onRenameBoard`) the title stays the
   * home control, as before; once the title becomes a rename field, home
   * moves to a dedicated boards button beside it.
   */
  onOpenHome?: () => void;
  /**
   * Rename the board from its title (Miro parity row 1: the board-bar title
   * is click-to-rename). When provided, clicking the title turns it into an
   * inline field; Enter or blur commits a trimmed, non-empty change and
   * Escape cancels. When absent the title keeps its previous behaviour.
   */
  onRenameBoard?: (name: string) => void | Promise<void>;
  children?: React.ReactNode;
}

export const BoardMenu: React.FC<BoardMenuProps> = ({
  boardName = "Untitled",
  onOpenMenu,
  onOpenHome,
  onRenameBoard,
  children,
}) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(boardName);

  const startEditing = () => {
    setDraft(boardName);
    setEditing(true);
  };

  const commit = () => {
    const name = draft.trim();
    setEditing(false);
    if (name && name !== boardName) {
      void onRenameBoard?.(name);
    }
  };

  return (
    <div className="firo-board-menu" role="region" aria-label="Board Menu">
      {onOpenMenu && (
        <button
          type="button"
          className="firo-board-menu__button"
          onClick={onOpenMenu}
          title="Main Menu"
          aria-label="Main Menu"
        >
          <MenuHamburgerIcon size={18} />
        </button>
      )}
      {onRenameBoard && onOpenHome && (
        <button
          type="button"
          className="firo-board-menu__button"
          onClick={onOpenHome}
          title="All boards"
          aria-label="All boards"
          data-testid="board-menu-home"
        >
          <BoardsIcon size={18} />
        </button>
      )}
      {onRenameBoard ? (
        editing ? (
          <input
            className="firo-board-menu__title-input"
            value={draft}
            aria-label="Board name"
            data-testid="board-menu-rename-input"
            // The visible title's width cap, so the field stays inside the bar.
            maxLength={120}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="firo-board-menu__title firo-board-menu__title--button"
            onClick={startEditing}
            title="Rename board"
            // The visible text is the board's name, so the accessible name has
            // to contain it (WCAG 2.5.3, Label in Name) while still saying
            // what the control does.
            aria-label={`Rename board — ${boardName}`}
            data-testid="board-menu-rename"
          >
            {boardName}
          </button>
        )
      ) : onOpenHome ? (
        <button
          type="button"
          className="firo-board-menu__title firo-board-menu__title--button"
          onClick={onOpenHome}
          title="All boards"
          // The visible text is the board's name, so the accessible name has to
          // contain it (WCAG 2.5.3, Label in Name) while still saying what the
          // control does.
          aria-label={`All boards — ${boardName}`}
        >
          {boardName}
        </button>
      ) : (
        <div className="firo-board-menu__title" title={boardName}>
          {boardName}
        </div>
      )}
      {children}
    </div>
  );
};
