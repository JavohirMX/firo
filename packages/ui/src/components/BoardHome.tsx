import React from "react";

import {
  ActivityIcon,
  BoardsIcon,
  ClockIcon,
  CloseIcon,
  DuplicateIcon,
  FolderIcon,
  GridViewIcon,
  ListViewIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  SortIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "../icons";

import { ActivityFeed, type ActivityFeedItem } from "./ActivityFeed";
import "./BoardHome.scss";

/**
 * The board home, drawn from data the host supplies.
 *
 * ## Why it is presentational
 *
 * This is chrome, so it lives in `@firo/ui` ([ADR-0022]). It owns no storage and
 * imports nothing from the app: the host passes boards, templates and callbacks,
 * and every fact on screen — names, tags, timestamps — arrives already resolved.
 * The board list itself is app state, because it is persistence, and persistence
 * is the app's.
 *
 * ## Timestamps arrive pre-formatted
 *
 * A card shows "2 days ago", but the *relative* wording is computed by the host
 * (`apps/web/board/library.ts`), not here. Formatting against a clock inside a
 * presentational component is the thing that makes snapshots flake and locale
 * leak into a shared surface; the host passes `lastOpenedLabel` and this renders
 * it.
 */

export interface BoardFolderData {
  id: string;
  name: string;
  color?: string;
}

export interface BoardCardData {
  id: string;
  name: string;
  tags: string[];
  /** Human wording, e.g. "2 days ago". Omitted for a board never opened. */
  lastOpenedLabel?: string;
  /** Accent for the thumbnail placeholder. */
  color?: string;
  /** A data URL, when one exists. */
  thumbnail?: string;
  /** Rendered in the trash section rather than the board grid. */
  trashed?: boolean;
  folderId?: string;
  folderName?: string;
  starred?: boolean;
  createdAt?: number | string;
  lastOpenedAt?: number | string;
}

export interface TemplateCardData {
  id: string;
  name: string;
  description: string;
  tags: string[];
  color: string;
}

export interface BoardHomeProps {
  boards: BoardCardData[];
  templates?: TemplateCardData[];
  folders?: BoardFolderData[];
  activities?: readonly ActivityFeedItem[];
  onClearActivity?: () => void;
  activeSection?:
    | "all"
    | "recent"
    | "starred"
    | "trash"
    | "activity"
    | (string & {});
  viewMode?: "grid" | "list";
  sortBy?: "lastOpened" | "created" | "name";
  onCreateBlank?: () => void;
  onImportBoard?: () => void;
  onOpenBoard?: (id: string) => void;
  onRenameBoard?: (id: string, name: string) => void;
  onTrashBoard?: (id: string) => void;
  onRestoreBoard?: (id: string) => void;
  onDeleteBoard?: (id: string) => void;
  onCreateFromTemplate?: (templateId: string) => void;
  onSelectSection?: (section: string) => void;
  onToggleStarBoard?: (id: string, starred: boolean) => void;
  onDuplicateBoard?: (id: string) => void;
  onMoveBoardToFolder?: (id: string, folderId?: string) => void;
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onChangeViewMode?: (mode: "grid" | "list") => void;
  onChangeSortBy?: (sort: "lastOpened" | "created" | "name") => void;
}

export interface BoardCardProps {
  board: BoardCardData;
  folders?: BoardFolderData[];
  onOpen?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  onDuplicate?: (id: string) => void;
  onMoveToFolder?: (id: string, folderId?: string) => void;
  onOpenMoveDialog?: (board: BoardCardData) => void;
}

export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  folders = [],
  onOpen,
  onRename,
  onTrash,
  onRestore,
  onDelete,
  onToggleStar,
  onDuplicate,
  onMoveToFolder,
  onOpenMoveDialog,
}) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(board.name);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleDocumentClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Keep the field in step with the board unless it is the thing being edited:
  // a rename that round-trips through storage can land a moment later, and the
  // input must not clobber it or be clobbered mid-keystroke.
  React.useEffect(() => {
    if (!editing) {
      setDraft(board.name);
    }
  }, [board.name, editing]);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== board.name) {
      onRename?.(board.id, name);
    } else {
      setDraft(board.name);
    }
  };

  return (
    <article className="firo-board-card" aria-label={board.name}>
      {!board.trashed && (
        <button
          type="button"
          className={`firo-board-card__star ${
            board.starred ? "firo-board-card__star--active" : ""
          }`}
          aria-label={
            board.starred ? `Unstar ${board.name}` : `Star ${board.name}`
          }
          title={board.starred ? "Unstar" : "Star"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar?.(board.id, !board.starred);
          }}
        >
          <StarIcon size={16} filled={Boolean(board.starred)} />
        </button>
      )}

      <button
        type="button"
        className="firo-board-card__open"
        onClick={() => onOpen?.(board.id)}
        aria-label={`Open ${board.name}`}
        title={`Open ${board.name}`}
      >
        <span
          className="firo-board-card__thumb"
          style={board.color ? { backgroundColor: board.color } : undefined}
        >
          {board.thumbnail ? (
            <img
              className="firo-board-card__thumb-image"
              src={board.thumbnail}
              alt=""
            />
          ) : (
            <BoardsIcon size={28} />
          )}
        </span>
      </button>

      <div className="firo-board-card__body">
        {editing ? (
          <input
            className="firo-board-card__name-input"
            value={draft}
            autoFocus
            aria-label={`Rename ${board.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit();
              }
              if (event.key === "Escape") {
                setDraft(board.name);
                setEditing(false);
              }
            }}
            onBlur={commit}
          />
        ) : (
          <div className="firo-board-card__name" title={board.name}>
            {board.name}
          </div>
        )}

        {board.folderName && (
          <span
            className="firo-board-card__folder-badge"
            title={`Folder: ${board.folderName}`}
          >
            <FolderIcon size={12} />
            <span>{board.folderName}</span>
          </span>
        )}

        {board.tags.length > 0 && (
          <ul className="firo-board-card__tags">
            {board.tags.map((tag) => (
              <li key={tag} className="firo-board-card__tag">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {board.lastOpenedLabel && (
          <div className="firo-board-card__meta">
            <ClockIcon size={13} />
            <span>{board.lastOpenedLabel}</span>
          </div>
        )}
      </div>

      <div className="firo-board-card__actions">
        {board.trashed ? (
          <>
            <button
              type="button"
              className="firo-board-card__action"
              aria-label={`Restore ${board.name}`}
              title="Restore"
              onClick={() => onRestore?.(board.id)}
            >
              <RestoreIcon size={16} />
            </button>
            <button
              type="button"
              className="firo-board-card__action firo-board-card__action--danger"
              aria-label={`Delete ${board.name} permanently`}
              title="Delete forever"
              onClick={() => onDelete?.(board.id)}
            >
              <TrashIcon size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="firo-board-card__action"
              aria-label={`Rename ${board.name}`}
              title="Rename"
              onClick={() => {
                setDraft(board.name);
                setEditing(true);
              }}
            >
              <PencilIcon size={16} />
            </button>
            {onDuplicate && (
              <button
                type="button"
                className="firo-board-card__action"
                aria-label={`Duplicate ${board.name}`}
                title="Duplicate"
                onClick={() => onDuplicate(board.id)}
              >
                <DuplicateIcon size={16} />
              </button>
            )}
            <button
              type="button"
              className="firo-board-card__action"
              aria-label={`Move ${board.name} to trash`}
              title="Move to trash"
              onClick={() => onTrash?.(board.id)}
            >
              <TrashIcon size={16} />
            </button>
            <div className="firo-board-card__menu-wrapper" ref={menuRef}>
              <button
                type="button"
                className="firo-board-card__action"
                aria-label={`More actions for ${board.name}`}
                title="More actions"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
              >
                <MoreVerticalIcon size={16} />
              </button>
              {menuOpen && (
                <div className="firo-board-card__dropdown" role="menu">
                  <button
                    type="button"
                    className="firo-board-card__dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setDraft(board.name);
                      setEditing(true);
                    }}
                  >
                    <PencilIcon size={14} />
                    <span>Rename</span>
                  </button>
                  {onDuplicate && (
                    <button
                      type="button"
                      className="firo-board-card__dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate(board.id);
                      }}
                    >
                      <DuplicateIcon size={14} />
                      <span>Duplicate</span>
                    </button>
                  )}
                  {(onOpenMoveDialog || onMoveToFolder) && (
                    <button
                      type="button"
                      className="firo-board-card__dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (onOpenMoveDialog) {
                          onOpenMoveDialog(board);
                        } else if (folders.length > 0) {
                          onMoveToFolder?.(board.id, folders[0].id);
                        }
                      }}
                    >
                      <FolderIcon size={14} />
                      <span>Move to folder...</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="firo-board-card__dropdown-item firo-board-card__dropdown-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onTrash?.(board.id);
                    }}
                  >
                    <TrashIcon size={14} />
                    <span>Move to trash</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
};

interface TemplateGalleryProps {
  templates: TemplateCardData[];
  onCreate?: (templateId: string) => void;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  templates,
  onCreate,
}) => (
  <div className="firo-template-grid">
    {templates.map((template) => (
      <button
        key={template.id}
        type="button"
        className="firo-template-card"
        aria-label={`Start from the ${template.name} template`}
        onClick={() => onCreate?.(template.id)}
      >
        <span
          className="firo-template-card__swatch"
          style={{ backgroundColor: template.color }}
        />
        <span className="firo-template-card__body">
          <span className="firo-template-card__name">{template.name}</span>
          <span className="firo-template-card__desc">
            {template.description}
          </span>
        </span>
      </button>
    ))}
  </div>
);

export const BoardHome: React.FC<BoardHomeProps> = ({
  boards,
  templates = [],
  folders,
  activeSection,
  viewMode,
  sortBy,
  onCreateBlank,
  onImportBoard,
  onOpenBoard,
  onRenameBoard,
  onTrashBoard,
  onRestoreBoard,
  onDeleteBoard,
  onCreateFromTemplate,
  onSelectSection,
  onToggleStarBoard,
  onDuplicateBoard,
  onMoveBoardToFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onChangeViewMode,
  onChangeSortBy,
  activities,
  onClearActivity,
}) => {
  const [internalSection, setInternalSection] = React.useState<string>("all");
  const [internalViewMode, setInternalViewMode] = React.useState<
    "grid" | "list"
  >("grid");
  const [internalSortBy, setInternalSortBy] = React.useState<
    "lastOpened" | "created" | "name"
  >("lastOpened");
  const [internalFolders, setInternalFolders] = React.useState<
    BoardFolderData[]
  >([]);

  const [query, setQuery] = React.useState("");
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(
    null,
  );
  const [editFolderName, setEditFolderName] = React.useState("");
  const [movingBoard, setMovingBoard] = React.useState<BoardCardData | null>(
    null,
  );

  const currentSection = activeSection ?? internalSection;
  const currentViewMode = viewMode ?? internalViewMode;
  const currentSortBy = sortBy ?? internalSortBy;
  const currentFolders = folders ?? internalFolders;

  const handleSelectSection = (section: string) => {
    setInternalSection(section);
    onSelectSection?.(section);
  };

  const handleChangeViewMode = (mode: "grid" | "list") => {
    setInternalViewMode(mode);
    onChangeViewMode?.(mode);
  };

  const handleChangeSortBy = (sort: "lastOpened" | "created" | "name") => {
    setInternalSortBy(sort);
    onChangeSortBy?.(sort);
  };

  const handleConfirmCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      if (onCreateFolder) {
        onCreateFolder(trimmed);
      } else {
        const created: BoardFolderData = {
          id: `folder-${Date.now()}`,
          name: trimmed,
        };
        setInternalFolders((prev) => [...prev, created]);
      }
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const handleConfirmRenameFolder = (id: string) => {
    const trimmed = editFolderName.trim();
    if (trimmed) {
      if (onRenameFolder) {
        onRenameFolder(id, trimmed);
      } else {
        setInternalFolders((prev) =>
          prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
        );
      }
    }
    setEditingFolderId(null);
    setEditFolderName("");
  };

  const live = boards.filter((board) => !board.trashed);
  const trashed = boards.filter((board) => board.trashed);

  // Section filtering
  let sectionBoards: BoardCardData[];
  if (currentSection === "trash") {
    sectionBoards = trashed;
  } else if (currentSection === "starred") {
    sectionBoards = live.filter((board) => Boolean(board.starred));
  } else if (currentSection === "recent") {
    sectionBoards = live.filter(
      (board) => board.lastOpenedLabel != null || board.lastOpenedAt != null,
    );
  } else if (currentSection === "all") {
    sectionBoards = live;
  } else {
    // Treat as folder id
    sectionBoards = live.filter((board) => board.folderId === currentSection);
  }

  // Search filter
  const needle = query.trim().toLowerCase();
  const searchFiltered = needle
    ? sectionBoards.filter(
        (board) =>
          board.name.toLowerCase().includes(needle) ||
          board.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
    : sectionBoards;

  // Sorting
  const sortedBoards = [...searchFiltered].sort((a, b) => {
    if (currentSortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (currentSortBy === "created") {
      const aCreated = a.createdAt ? Number(new Date(a.createdAt)) : 0;
      const bCreated = b.createdAt ? Number(new Date(b.createdAt)) : 0;
      return bCreated - aCreated;
    }
    // "lastOpened"
    const aOpened = a.lastOpenedAt
      ? Number(new Date(a.lastOpenedAt))
      : a.lastOpenedLabel
      ? 1
      : 0;
    const bOpened = b.lastOpenedAt
      ? Number(new Date(b.lastOpenedAt))
      : b.lastOpenedLabel
      ? 1
      : 0;
    return bOpened - aOpened;
  });

  const activeFolder = currentFolders.find((f) => f.id === currentSection);
  const sectionTitle =
    currentSection === "all"
      ? "Your boards"
      : currentSection === "recent"
      ? "Recent"
      : currentSection === "starred"
      ? "Starred"
      : currentSection === "trash"
      ? "Trash"
      : currentSection === "activity"
      ? "Activity"
      : activeFolder?.name ?? "Folder";

  const emptyText = () => {
    if (needle) {
      return "No boards match that filter.";
    }
    if (currentSection === "all") {
      return live.length === 0
        ? "No boards yet. Create one, or start from a template."
        : "No boards match that filter.";
    }
    if (currentSection === "recent") {
      return "No recent boards yet.";
    }
    if (currentSection === "starred") {
      return "No starred boards yet.";
    }
    if (currentSection === "trash") {
      return "Trash is empty.";
    }
    return "No boards in this folder.";
  };

  return (
    <div className="firo-board-home" role="region" aria-label="Boards">
      <aside className="firo-board-sidebar" aria-label="Navigation">
        <div className="firo-board-sidebar__top">
          <div className="firo-board-sidebar__nav">
            <button
              type="button"
              className={`firo-board-sidebar__item ${
                currentSection === "recent"
                  ? "firo-board-sidebar__item--active"
                  : ""
              }`}
              onClick={() => handleSelectSection("recent")}
            >
              <ClockIcon size={18} />
              <span>Recent</span>
            </button>
            <button
              type="button"
              className={`firo-board-sidebar__item ${
                currentSection === "starred"
                  ? "firo-board-sidebar__item--active"
                  : ""
              }`}
              onClick={() => handleSelectSection("starred")}
            >
              <StarIcon size={18} filled={currentSection === "starred"} />
              <span>Starred</span>
            </button>
            <button
              type="button"
              className={`firo-board-sidebar__item ${
                currentSection === "all"
                  ? "firo-board-sidebar__item--active"
                  : ""
              }`}
              onClick={() => handleSelectSection("all")}
            >
              <BoardsIcon size={18} />
              <span>All Boards</span>
            </button>
            <button
              type="button"
              className={`firo-board-sidebar__item ${
                currentSection === "activity"
                  ? "firo-board-sidebar__item--active"
                  : ""
              }`}
              onClick={() => handleSelectSection("activity")}
            >
              <ActivityIcon size={18} />
              <span>Activity</span>
            </button>
          </div>

          <div className="firo-board-sidebar__folders">
            <div className="firo-board-sidebar__section-header">
              <span className="firo-board-sidebar__section-title">Folders</span>
              <button
                type="button"
                className="firo-board-sidebar__add-folder-btn"
                aria-label="Create folder"
                title="Create folder"
                onClick={() => setIsCreatingFolder(true)}
              >
                <PlusIcon size={16} />
              </button>
            </div>

            {isCreatingFolder && (
              <div className="firo-board-sidebar__folder-create">
                <input
                  type="text"
                  className="firo-board-sidebar__folder-input"
                  placeholder="Folder name"
                  aria-label="New folder name"
                  value={newFolderName}
                  autoFocus
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleConfirmCreateFolder();
                    }
                    if (event.key === "Escape") {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                />
                <div className="firo-board-sidebar__folder-create-actions">
                  <button
                    type="button"
                    className="firo-board-sidebar__folder-btn"
                    onClick={handleConfirmCreateFolder}
                    aria-label="Confirm folder"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="firo-board-sidebar__folder-btn firo-board-sidebar__folder-btn--cancel"
                    onClick={() => {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }}
                    aria-label="Cancel folder"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="firo-board-sidebar__folder-list">
              {currentFolders.map((folder) => {
                const isEditing = editingFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    className={`firo-board-sidebar__folder-item ${
                      currentSection === folder.id
                        ? "firo-board-sidebar__folder-item--active"
                        : ""
                    }`}
                  >
                    {isEditing ? (
                      <input
                        className="firo-board-sidebar__folder-rename-input"
                        autoFocus
                        aria-label={`Rename folder ${folder.name}`}
                        value={editFolderName}
                        onChange={(event) =>
                          setEditFolderName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleConfirmRenameFolder(folder.id);
                          }
                          if (event.key === "Escape") {
                            setEditingFolderId(null);
                          }
                        }}
                        onBlur={() => handleConfirmRenameFolder(folder.id)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="firo-board-sidebar__item firo-board-sidebar__folder-btn-select"
                          onClick={() => handleSelectSection(folder.id)}
                          aria-label={`Folder ${folder.name}`}
                        >
                          <FolderIcon size={18} />
                          <span className="firo-board-sidebar__folder-name">
                            {folder.name}
                          </span>
                        </button>
                        <div className="firo-board-sidebar__folder-actions">
                          {onRenameFolder && (
                            <button
                              type="button"
                              className="firo-board-sidebar__folder-action"
                              aria-label={`Rename folder ${folder.name}`}
                              title="Rename folder"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditFolderName(folder.name);
                              }}
                            >
                              <PencilIcon size={12} />
                            </button>
                          )}
                          {onDeleteFolder && (
                            <button
                              type="button"
                              className="firo-board-sidebar__folder-action"
                              aria-label={`Delete folder ${folder.name}`}
                              title="Delete folder"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteFolder(folder.id);
                              }}
                            >
                              <TrashIcon size={12} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="firo-board-sidebar__bottom">
          <button
            type="button"
            className={`firo-board-sidebar__item ${
              currentSection === "trash"
                ? "firo-board-sidebar__item--active"
                : ""
            }`}
            onClick={() => handleSelectSection("trash")}
          >
            <TrashIcon size={18} />
            <span>Trash</span>
          </button>
        </div>
      </aside>

      <main className="firo-board-home__main">
        <header className="firo-board-home__header">
          <h1 className="firo-board-home__title">Boards</h1>
          <div className="firo-board-home__actions">
            <label className="firo-board-home__search">
              <SearchIcon size={16} />
              <input
                type="search"
                value={query}
                placeholder="Filter boards"
                aria-label="Filter boards"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div
              className="firo-board-home__view-toggle"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                className={`firo-board-home__view-btn ${
                  currentViewMode === "grid"
                    ? "firo-board-home__view-btn--active"
                    : ""
                }`}
                aria-label="Grid view"
                aria-pressed={currentViewMode === "grid"}
                title="Grid view"
                onClick={() => handleChangeViewMode("grid")}
              >
                <GridViewIcon size={16} />
              </button>
              <button
                type="button"
                className={`firo-board-home__view-btn ${
                  currentViewMode === "list"
                    ? "firo-board-home__view-btn--active"
                    : ""
                }`}
                aria-label="List view"
                aria-pressed={currentViewMode === "list"}
                title="List view"
                onClick={() => handleChangeViewMode("list")}
              >
                <ListViewIcon size={16} />
              </button>
            </div>
            <div className="firo-board-home__sort">
              <SortIcon size={16} />
              <select
                className="firo-board-home__sort-select"
                aria-label="Sort boards"
                value={currentSortBy}
                onChange={(event) =>
                  handleChangeSortBy(
                    event.target.value as "lastOpened" | "created" | "name",
                  )
                }
              >
                <option value="lastOpened">Last opened</option>
                <option value="created">Recently created</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
            {onImportBoard && (
              <button
                type="button"
                className="firo-board-home__import"
                onClick={onImportBoard}
                aria-label="Import board"
              >
                <UploadIcon size={18} />
                Import
              </button>
            )}
            {onCreateBlank && (
              <button
                type="button"
                className="firo-board-home__new"
                onClick={onCreateBlank}
              >
                <PlusIcon size={18} />
                New board
              </button>
            )}
          </div>
        </header>

        {currentSection === "all" && templates.length > 0 && (
          <section
            className="firo-board-home__section"
            aria-label="Start from a template"
          >
            <h2 className="firo-board-home__section-title">
              Start from a template
            </h2>
            <TemplateGallery
              templates={templates}
              onCreate={onCreateFromTemplate}
            />
          </section>
        )}

        <section className="firo-board-home__section" aria-label={sectionTitle}>
          <h2 className="firo-board-home__section-title">{sectionTitle}</h2>
          {currentSection === "activity" ? (
            <ActivityFeed
              isOpen={true}
              entries={activities ?? []}
              onClose={() => handleSelectSection("all")}
              onSelectBoard={onOpenBoard}
              onClear={onClearActivity}
              title="Workspace Activity"
            />
          ) : sortedBoards.length > 0 ? (
            currentViewMode === "list" ? (
              <div className="firo-board-table-container">
                <table className="firo-board-table" aria-label="Boards">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="firo-board-table__th firo-board-table__th--star"
                      >
                        <span className="firo-sr-only">Star</span>
                      </th>
                      <th
                        scope="col"
                        className="firo-board-table__th firo-board-table__th--name"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="firo-board-table__th firo-board-table__th--folder"
                      >
                        Project / Folder
                      </th>
                      <th
                        scope="col"
                        className="firo-board-table__th firo-board-table__th--opened"
                      >
                        Last opened
                      </th>
                      <th
                        scope="col"
                        className="firo-board-table__th firo-board-table__th--actions"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBoards.map((board) => (
                      <tr key={board.id} className="firo-board-table-row">
                        <td className="firo-board-table__td firo-board-table__td--star">
                          {!board.trashed && (
                            <button
                              type="button"
                              className={`firo-board-card__star ${
                                board.starred
                                  ? "firo-board-card__star--active"
                                  : ""
                              }`}
                              aria-label={
                                board.starred
                                  ? `Unstar ${board.name}`
                                  : `Star ${board.name}`
                              }
                              title={board.starred ? "Unstar" : "Star"}
                              onClick={() =>
                                onToggleStarBoard?.(board.id, !board.starred)
                              }
                            >
                              <StarIcon
                                size={16}
                                filled={Boolean(board.starred)}
                              />
                            </button>
                          )}
                        </td>
                        <td className="firo-board-table__td firo-board-table__td--name">
                          <div className="firo-board-table__name-cell">
                            <span className="firo-board-table__thumb">
                              {board.thumbnail ? (
                                <img src={board.thumbnail} alt="" />
                              ) : (
                                <BoardsIcon size={16} />
                              )}
                            </span>
                            <button
                              type="button"
                              className="firo-board-table__name-btn"
                              onClick={() => onOpenBoard?.(board.id)}
                              aria-label={`Open ${board.name}`}
                            >
                              {board.name}
                            </button>
                            {board.tags.length > 0 && (
                              <ul className="firo-board-card__tags">
                                {board.tags.map((tag) => (
                                  <li
                                    key={tag}
                                    className="firo-board-card__tag"
                                  >
                                    {tag}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                        <td className="firo-board-table__td firo-board-table__td--folder">
                          {board.folderName ? (
                            <span className="firo-board-card__folder-badge">
                              <FolderIcon size={12} />
                              <span>{board.folderName}</span>
                            </span>
                          ) : (
                            <span className="firo-board-table__empty-cell">
                              —
                            </span>
                          )}
                        </td>
                        <td className="firo-board-table__td firo-board-table__td--opened">
                          {board.lastOpenedLabel ?? "—"}
                        </td>
                        <td className="firo-board-table__td firo-board-table__td--actions">
                          {board.trashed ? (
                            <div className="firo-board-table__action-group">
                              <button
                                type="button"
                                className="firo-board-card__action"
                                aria-label={`Restore ${board.name}`}
                                title="Restore"
                                onClick={() => onRestoreBoard?.(board.id)}
                              >
                                <RestoreIcon size={16} />
                              </button>
                              <button
                                type="button"
                                className="firo-board-card__action firo-board-card__action--danger"
                                aria-label={`Delete ${board.name} permanently`}
                                title="Delete forever"
                                onClick={() => onDeleteBoard?.(board.id)}
                              >
                                <TrashIcon size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="firo-board-table__action-group">
                              <button
                                type="button"
                                className="firo-board-card__action"
                                aria-label={`Rename ${board.name}`}
                                title="Rename"
                                onClick={() =>
                                  onRenameBoard?.(board.id, board.name)
                                }
                              >
                                <PencilIcon size={16} />
                              </button>
                              {onDuplicateBoard && (
                                <button
                                  type="button"
                                  className="firo-board-card__action"
                                  aria-label={`Duplicate ${board.name}`}
                                  title="Duplicate"
                                  onClick={() => onDuplicateBoard(board.id)}
                                >
                                  <DuplicateIcon size={16} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="firo-board-card__action"
                                aria-label={`Move ${board.name} to folder`}
                                title="Move to folder"
                                onClick={() => setMovingBoard(board)}
                              >
                                <FolderIcon size={16} />
                              </button>
                              <button
                                type="button"
                                className="firo-board-card__action"
                                aria-label={`Move ${board.name} to trash`}
                                title="Move to trash"
                                onClick={() => onTrashBoard?.(board.id)}
                              >
                                <TrashIcon size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="firo-board-grid">
                {sortedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    folders={currentFolders}
                    onOpen={onOpenBoard}
                    onRename={onRenameBoard}
                    onTrash={onTrashBoard}
                    onRestore={onRestoreBoard}
                    onDelete={onDeleteBoard}
                    onToggleStar={onToggleStarBoard}
                    onDuplicate={onDuplicateBoard}
                    onMoveToFolder={onMoveBoardToFolder}
                    onOpenMoveDialog={(b) => setMovingBoard(b)}
                  />
                ))}
              </div>
            )
          ) : (
            <p className="firo-board-home__empty">{emptyText()}</p>
          )}
        </section>

        {currentSection === "all" && trashed.length > 0 && (
          <section className="firo-board-home__section" aria-label="Trash">
            <h2 className="firo-board-home__section-title">Trash</h2>
            <div className="firo-board-grid">
              {trashed.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  folders={currentFolders}
                  onOpen={onOpenBoard}
                  onRename={onRenameBoard}
                  onTrash={onTrashBoard}
                  onRestore={onRestoreBoard}
                  onDelete={onDeleteBoard}
                  onToggleStar={onToggleStarBoard}
                  onDuplicate={onDuplicateBoard}
                  onMoveToFolder={onMoveBoardToFolder}
                  onOpenMoveDialog={(b) => setMovingBoard(b)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {movingBoard && (
        <div
          className="firo-board-modal-overlay"
          onClick={() => setMovingBoard(null)}
        >
          <div
            className="firo-board-modal"
            role="dialog"
            aria-label={`Move ${movingBoard.name} to folder`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="firo-board-modal__header">
              <h3 className="firo-board-modal__title">
                Move &ldquo;{movingBoard.name}&rdquo; to folder
              </h3>
              <button
                type="button"
                className="firo-board-modal__close"
                aria-label="Close dialog"
                onClick={() => setMovingBoard(null)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="firo-board-modal__body">
              <div className="firo-board-modal__folder-list">
                <button
                  type="button"
                  className={`firo-board-modal__folder-option ${
                    !movingBoard.folderId
                      ? "firo-board-modal__folder-option--active"
                      : ""
                  }`}
                  onClick={() => {
                    onMoveBoardToFolder?.(movingBoard.id, undefined);
                    setMovingBoard(null);
                  }}
                >
                  <span>No folder</span>
                </button>
                {currentFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`firo-board-modal__folder-option ${
                      movingBoard.folderId === f.id
                        ? "firo-board-modal__folder-option--active"
                        : ""
                    }`}
                    onClick={() => {
                      onMoveBoardToFolder?.(movingBoard.id, f.id);
                      setMovingBoard(null);
                    }}
                  >
                    <FolderIcon size={16} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
