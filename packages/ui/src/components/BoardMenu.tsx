import React from "react";

import { MenuHamburgerIcon } from "../icons";

import "./BoardMenu.scss";

export interface BoardMenuProps {
  boardName?: string;
  onOpenMenu?: () => void;
  /**
   * Where to go when the board's name is activated — the board home.
   *
   * Provided by the host rather than assumed, because navigation is the app's
   * ([ADR-0022]): `@firo/ui` draws the control and the host decides that
   * clicking a board's name leaves the board. When it is absent the title is
   * plain text, so a host that embeds the chrome without a home still renders.
   */
  onOpenHome?: () => void;
  children?: React.ReactNode;
}

export const BoardMenu: React.FC<BoardMenuProps> = ({
  boardName = "Untitled",
  onOpenMenu,
  onOpenHome,
  children,
}) => {
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
      {onOpenHome ? (
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
