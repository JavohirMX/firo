import React from "react";

import { MenuHamburgerIcon } from "../icons";

import "./BoardMenu.scss";

export interface BoardMenuProps {
  boardName?: string;
  onOpenMenu?: () => void;
  children?: React.ReactNode;
}

export const BoardMenu: React.FC<BoardMenuProps> = ({
  boardName = "Untitled",
  onOpenMenu,
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
      <div className="firo-board-menu__title" title={boardName}>
        {boardName}
      </div>
      {children}
    </div>
  );
};
