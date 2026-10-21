import React from "react";

import {
  ActivityIcon,
  BoardsIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  DuplicateIcon,
  FilePdfIcon,
  FolderIcon,
  GridViewIcon,
  ListViewIcon,
  MenuHamburgerIcon,
  MoonIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  RestoreIcon,
  SearchIcon,
  SortIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from "../icons";

import { ActivityFeed, type ActivityFeedItem } from "./ActivityFeed";
import "./BoardHome.scss";

// Shared keyboard contract for the home's dialogs: Escape closes, and Tab
// cycles through the dialog's own buttons instead of escaping into the page
// behind it. Every dialog returns focus to its opener when it closes.
const trapDialogKeyDown = (
  event: React.KeyboardEvent<HTMLElement>,
  onClose: () => void,
) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key === "Tab") {
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => !b.disabled);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
};

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
  /** Human wording for when it was trashed, e.g. "2 days ago". */
  trashedLabel?: string;
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

/**
 * One board whose contents matched the home's filter. The host computes these
 * with the cross-board content search (`apps/web/board/search.ts`), grouped to
 * one row per board; this component only draws them. Matches on a board's name
 * or tags are excluded upstream, because those boards already show in the grid.
 */
export interface BoardContentMatchData {
  boardId: string;
  boardName: string;
  /** Snippet of the matching content, e.g. a sticky note's text. */
  snippet: string;
  /** What matched: "stickynote", "text", "card" or "comment". */
  matchType: string;
  /** Total content matches inside this board for the current filter. */
  matchCount: number;
}

/** Human label for a content match's type. */
const contentMatchTypeLabel = (matchType: string): string =>
  ((
    {
      stickynote: "Sticky note",
      text: "Text",
      card: "Card",
      comment: "Comment",
      tag: "Tag",
      title: "Title",
    } as Record<string, string>
  )[matchType] ?? "Content");

export interface BoardHomeProps {
  boards: BoardCardData[];
  templates?: TemplateCardData[];
  folders?: BoardFolderData[];
  activities?: readonly ActivityFeedItem[];
  onClearActivity?: () => void;
  /** Current chrome theme. With onToggleTheme, shows a theme button. */
  isDark?: boolean;
  onToggleTheme?: () => void;
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
  onExportBoard?: (id: string, format: "firo" | "pdf") => void;
  /** Content matches for the current filter text, one row per board. */
  contentMatches?: BoardContentMatchData[];
  /** True while the host is still scanning board contents for the filter. */
  contentSearching?: boolean;
  /** Reports the filter text so the host can search board contents with it. */
  onFilterChange?: (query: string) => void;
  /** Permanently deletes every trashed board, after the confirm dialog here. */
  onEmptyTrash?: () => void;
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
  onExportBoard?: (id: string, format: "firo" | "pdf") => void;
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
  onExportBoard,
}) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(board.name);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const renameBtnRef = React.useRef<HTMLButtonElement>(null);
  const pendingRenameFocusRef = React.useRef(false);
  // Focus returns to the rename button only after the editing state has
  // committed: focusing synchronously inside the key handler would blur the
  // input while the draft is still stale and commit it through onBlur.
  React.useEffect(() => {
    if (!editing && pendingRenameFocusRef.current) {
      pendingRenameFocusRef.current = false;
      renameBtnRef.current?.focus();
    }
  }, [editing]);

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
    const ownerDocument = menuRef.current?.ownerDocument ?? document;
    ownerDocument.addEventListener("mousedown", handleDocumentClick);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("mousedown", handleDocumentClick);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Keyboard contract for the card menu: opening it moves focus to the first
  // item, arrows move between items, and Escape returns focus to the trigger.
  React.useEffect(() => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    }
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
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Cancel the key's default action: after the commit moves
                // focus to the rename button, an unconsumed Enter would
                // activate that button and reopen the editor.
                event.preventDefault();
                pendingRenameFocusRef.current = true;
                commit();
              }
              if (event.key === "Escape") {
                pendingRenameFocusRef.current = true;
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

        {board.trashedLabel && (
          <div className="firo-board-card__meta">
            <ClockIcon size={13} />
            <span>Deleted {board.trashedLabel}</span>
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
              ref={renameBtnRef}
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
                ref={menuTriggerRef}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
              >
                <MoreVerticalIcon size={16} />
              </button>
              {menuOpen && (
                <div
                  className="firo-board-card__dropdown"
                  role="menu"
                  onKeyDown={(event) => {
                    const items = Array.from(
                      event.currentTarget.querySelectorAll<HTMLElement>(
                        "[role=menuitem]",
                      ),
                    );
                    const index = items.indexOf(
                      document.activeElement as HTMLElement,
                    );
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      items[(index + 1) % items.length]?.focus();
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      items[(index - 1 + items.length) % items.length]?.focus();
                    }
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setMenuOpen(false);
                      menuTriggerRef.current?.focus();
                    }
                  }}
                >
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
                  {onExportBoard && (
                    <>
                      <button
                        type="button"
                        className="firo-board-card__dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onExportBoard(board.id, "firo");
                        }}
                      >
                        <DownloadIcon size={14} />
                        <span>Export as .firo</span>
                      </button>
                      <button
                        type="button"
                        className="firo-board-card__dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onExportBoard(board.id, "pdf");
                        }}
                      >
                        <FilePdfIcon size={14} />
                        <span>Export as PDF</span>
                      </button>
                    </>
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
          className={`firo-template-card__swatch firo-template-card__swatch--${template.id}`}
          style={{ backgroundColor: template.color }}
          aria-hidden="true"
        >
          <span className="firo-template-card__chip" />
          <span className="firo-template-card__chip" />
          <span className="firo-template-card__chip" />
          <span className="firo-template-card__chip" />
        </span>
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
  onExportBoard,
  contentMatches,
  contentSearching,
  onFilterChange,
  onEmptyTrash,
  activities,
  onClearActivity,
  isDark,
  onToggleTheme,
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
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // "/" focuses the filter from anywhere on the home, the convention GitHub
  // and Miro share. It must not fire while the person is typing in a field:
  // renaming a board and hitting "/" should type a slash.
  React.useEffect(() => {
    const focusFilter = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", focusFilter);
    return () => document.removeEventListener("keydown", focusFilter);
  }, []);

  const applyQuery = (next: string) => {
    setQuery(next);
    onFilterChange?.(next);
  };

  const clearQuery = () => {
    applyQuery("");
    searchInputRef.current?.focus();
  };

  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Close the mobile navigation overlay with Escape, and lock body scroll
  // while it is open so the page behind it does not scroll under the sheet.
  React.useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(
    null,
  );
  const [editFolderName, setEditFolderName] = React.useState("");
  const [renamingBoardId, setRenamingBoardId] = React.useState<string | null>(
    null,
  );
  const [renameBoardDraft, setRenameBoardDraft] = React.useState("");
  const [moreBoard, setMoreBoard] = React.useState<BoardCardData | null>(null);
  const [movingBoard, setMovingBoard] = React.useState<BoardCardData | null>(
    null,
  );

  const currentSection = activeSection ?? internalSection;
  const currentViewMode = viewMode ?? internalViewMode;
  const currentSortBy = sortBy ?? internalSortBy;
  const currentFolders = folders ?? internalFolders;

  const handleSelectSection = (section: string) => {
    setInternalSection(section);
    setSidebarOpen(false);
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

  const commitTableRename = (board: BoardCardData) => {
    setRenamingBoardId(null);
    const name = renameBoardDraft.trim();
    if (name && name !== board.name) {
      onRenameBoard?.(board.id, name);
    }
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

  const [deletingBoard, setDeletingBoard] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [emptyingTrash, setEmptyingTrash] = React.useState(false);
  const emptyTrashOpenerRef = React.useRef<HTMLElement | null>(null);
  const openEmptyTrash = () => {
    emptyTrashOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEmptyingTrash(true);
  };
  const closeEmptyTrash = () => {
    setEmptyingTrash(false);
    emptyTrashOpenerRef.current?.focus?.();
  };
  const deleteOpenerRef = React.useRef<HTMLElement | null>(null);
  const requestDelete = (id: string) => {
    const target = boards.find((board) => board.id === id);
    if (!target) {
      return;
    }
    deleteOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDeletingBoard({ id: target.id, name: target.name });
  };
  const tableRenameBtnRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingTableRenameFocusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (renamingBoardId === null && pendingTableRenameFocusRef.current) {
      const id = pendingTableRenameFocusRef.current;
      pendingTableRenameFocusRef.current = null;
      tableRenameBtnRefs.current.get(id)?.focus();
    }
  }, [renamingBoardId]);
  const closeDeleteDialog = () => {
    setDeletingBoard(null);
    deleteOpenerRef.current?.focus?.();
  };
  const moreOpenerRef = React.useRef<HTMLElement | null>(null);
  const moveOpenerRef = React.useRef<HTMLElement | null>(null);
  const openMore = (board: BoardCardData) => {
    moreOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMoreBoard(board);
  };
  const closeMore = () => {
    setMoreBoard(null);
    moreOpenerRef.current?.focus?.();
  };
  const openMove = (board: BoardCardData) => {
    moveOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMovingBoard(board);
  };
  const closeMove = () => {
    setMovingBoard(null);
    moveOpenerRef.current?.focus?.();
  };
  const live = boards.filter((board) => !board.trashed);
  const trashed = boards.filter((board) => board.trashed);

  const emptyTrashButton =
    onEmptyTrash && trashed.length > 0 ? (
      <button
        type="button"
        className="firo-board-home__empty-trash"
        onClick={openEmptyTrash}
      >
        <TrashIcon size={14} />
        Empty trash
      </button>
    ) : null;

  // Sidebar folder rows carry the number of live boards inside them, so a
  // folder that looks empty at a glance is not mistaken for a deleted one.
  const folderBoardCounts = new Map<string, number>();
  for (const board of live) {
    if (board.folderId) {
      folderBoardCounts.set(
        board.folderId,
        (folderBoardCounts.get(board.folderId) ?? 0) + 1,
      );
    }
  }

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
      return "No board titles match that filter.";
    }
    if (currentSection === "all") {
      return live.length === 0
        ? "No boards yet. Create one, or start from a template."
        : "No boards match that filter.";
    }
    if (currentSection === "recent") {
      return "No recent boards yet. Boards you open show up here.";
    }
    if (currentSection === "starred") {
      return "No starred boards yet. Use the star on a board to pin it here.";
    }
    if (currentSection === "trash") {
      return "Trash is empty. Boards you move to trash wait here until you delete them.";
    }
    return "No boards in this folder. Use More actions on a board to move one here.";
  };

  return (
    <div className="firo-board-home" role="region" aria-label="Boards">
      <aside
        className={`firo-board-sidebar ${
          sidebarOpen ? "firo-board-sidebar--open" : ""
        }`}
        aria-label="Navigation"
      >
        <div className="firo-board-sidebar__top">
          <button
            type="button"
            className="firo-board-sidebar__close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <CloseIcon size={18} />
          </button>
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
                    className="firo-board-sidebar__folder-btn firo-board-sidebar__folder-btn--cancel"
                    onClick={() => {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }}
                    aria-label="Cancel folder"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="firo-board-sidebar__folder-btn"
                    onClick={handleConfirmCreateFolder}
                    aria-label="Confirm folder"
                    disabled={!newFolderName.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {currentFolders.length === 0 && !isCreatingFolder && (
              <p className="firo-board-sidebar__folder-hint">
                No folders yet. Use + to group boards.
              </p>
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
                        onFocus={(event) => event.currentTarget.select()}
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
                          title={folder.name}
                        >
                          <FolderIcon size={18} />
                          <span className="firo-board-sidebar__folder-name">
                            {folder.name}
                          </span>
                          <span
                            className="firo-board-sidebar__folder-count"
                            aria-hidden="true"
                          >
                            {folderBoardCounts.get(folder.id) ?? 0}
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

      {sidebarOpen && (
        <button
          type="button"
          className="firo-board-sidebar__backdrop"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="firo-board-home__main">
        <header className="firo-board-home__header">
          <button
            type="button"
            className="firo-board-home__nav-toggle"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <MenuHamburgerIcon size={18} />
          </button>
          <h1 className="firo-board-home__title">Boards</h1>
          <div className="firo-board-home__actions">
            {currentSection !== "activity" && (
              <label className="firo-board-home__search">
                <SearchIcon size={16} />
                <input
                  type="search"
                  ref={searchInputRef}
                  value={query}
                  placeholder="Filter boards"
                  title="Filter boards (press / to focus)"
                  aria-label="Filter boards"
                  onChange={(event) => applyQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      if (query) {
                        applyQuery("");
                      } else {
                        event.currentTarget.blur();
                      }
                    }
                  }}
                />
                {query && (
                  <button
                    type="button"
                    className="firo-board-home__search-clear"
                    aria-label="Clear filter"
                    title="Clear filter"
                    onClick={clearQuery}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </label>
            )}
            {currentSection !== "activity" && (
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
            )}
            {onToggleTheme && (
              <button
                type="button"
                className="firo-board-home__view-btn firo-board-home__theme-btn"
                aria-label={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                title={isDark ? "Light theme" : "Dark theme"}
                onClick={onToggleTheme}
              >
                {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
              </button>
            )}
            {currentSection !== "activity" && (
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
            )}
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
            className={`firo-board-home__section firo-board-home__section--templates${
              live.length > 0 ? " is-compact" : ""
            }`}
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
          {currentSection === "trash" ? (
            <div className="firo-board-home__section-heading">
              <h2 className="firo-board-home__section-title">{sectionTitle}</h2>
              {emptyTrashButton}
            </div>
          ) : (
            <h2 className="firo-board-home__section-title">{sectionTitle}</h2>
          )}
          {needle && currentSection !== "activity" && (
            <p className="firo-board-home__filter-status" role="status">
              {sortedBoards.length} of {sectionBoards.length} boards
            </p>
          )}
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
                            {renamingBoardId === board.id ? (
                              <input
                                className="firo-board-card__name-input"
                                value={renameBoardDraft}
                                autoFocus
                                aria-label={`Rename ${board.name}`}
                                onFocus={(event) =>
                                  event.currentTarget.select()
                                }
                                onChange={(event) =>
                                  setRenameBoardDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    // See BoardCard: an unconsumed Enter
                                    // would activate the refocused rename
                                    // button and reopen the editor.
                                    event.preventDefault();
                                    pendingTableRenameFocusRef.current =
                                      board.id;
                                    commitTableRename(board);
                                  }
                                  if (event.key === "Escape") {
                                    pendingTableRenameFocusRef.current =
                                      board.id;
                                    setRenamingBoardId(null);
                                  }
                                }}
                                onBlur={() => commitTableRename(board)}
                              />
                            ) : (
                              <button
                                type="button"
                                className="firo-board-table__name-btn"
                                onClick={() => onOpenBoard?.(board.id)}
                                aria-label={`Open ${board.name}`}
                              >
                                {board.name}
                              </button>
                            )}
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
                          {board.trashed && board.trashedLabel
                            ? `Deleted ${board.trashedLabel}`
                            : board.lastOpenedLabel ?? "—"}
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
                                onClick={() => requestDelete(board.id)}
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
                                ref={(el) => {
                                  if (el) {
                                    tableRenameBtnRefs.current.set(
                                      board.id,
                                      el,
                                    );
                                  }
                                }}
                                onClick={() => {
                                  setRenameBoardDraft(board.name);
                                  setRenamingBoardId(board.id);
                                }}
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
                                onClick={() => openMove(board)}
                              >
                                <FolderIcon size={16} />
                              </button>
                              {onExportBoard && (
                                <>
                                  <button
                                    type="button"
                                    className="firo-board-card__action"
                                    aria-label={`Export ${board.name} as .firo`}
                                    title="Export as .firo"
                                    onClick={() =>
                                      onExportBoard(board.id, "firo")
                                    }
                                  >
                                    <DownloadIcon size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="firo-board-card__action"
                                    aria-label={`Export ${board.name} as PDF`}
                                    title="Export as PDF"
                                    onClick={() =>
                                      onExportBoard(board.id, "pdf")
                                    }
                                  >
                                    <FilePdfIcon size={16} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="firo-board-card__action firo-board-table__more"
                                aria-label={`More actions for ${board.name}`}
                                title="More actions"
                                aria-haspopup="dialog"
                                onClick={() => openMore(board)}
                              >
                                <MoreVerticalIcon size={16} />
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
                    onDelete={requestDelete}
                    onToggleStar={onToggleStarBoard}
                    onDuplicate={onDuplicateBoard}
                    onMoveToFolder={onMoveBoardToFolder}
                    onOpenMoveDialog={(b) => openMove(b)}
                    onExportBoard={onExportBoard}
                  />
                ))}
              </div>
            )
          ) : (
            <p className="firo-board-home__empty">{emptyText()}</p>
          )}
        </section>

        {needle &&
          currentSection !== "activity" &&
          currentSection !== "trash" &&
          (contentSearching ||
            (contentMatches && contentMatches.length > 0)) && (
            <section
              className="firo-board-home__section"
              aria-label="Inside boards"
            >
              <h2 className="firo-board-home__section-title">
                Inside boards
                {contentMatches && contentMatches.length > 0
                  ? ` (${contentMatches.length})`
                  : ""}
              </h2>
              {contentMatches && contentMatches.length > 0 ? (
                <ul className="firo-content-matches">
                  {contentMatches.map((match) => (
                    <li key={match.boardId}>
                      <button
                        type="button"
                        className="firo-content-match"
                        onClick={() => onOpenBoard?.(match.boardId)}
                        aria-label={`Open ${match.boardName}, ${
                          match.matchCount === 1
                            ? "1 match"
                            : `${match.matchCount} matches`
                        } inside`}
                      >
                        <span className="firo-content-match__name">
                          {match.boardName}
                        </span>
                        <span className="firo-content-match__snippet">
                          {match.snippet}
                        </span>
                        <span className="firo-content-match__meta">
                          {contentMatchTypeLabel(match.matchType)}
                          {match.matchCount > 1
                            ? ` · ${match.matchCount} matches`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="firo-board-home__content-status" role="status">
                  Searching board contents...
                </p>
              )}
            </section>
          )}

        {currentSection === "all" && trashed.length > 0 && (
          <section className="firo-board-home__section" aria-label="Trash">
            <div className="firo-board-home__section-heading">
              <h2 className="firo-board-home__section-title">Trash</h2>
              {emptyTrashButton}
            </div>
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
                  onDelete={requestDelete}
                  onToggleStar={onToggleStarBoard}
                  onDuplicate={onDuplicateBoard}
                  onMoveToFolder={onMoveBoardToFolder}
                  onOpenMoveDialog={(b) => openMove(b)}
                  onExportBoard={onExportBoard}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {moreBoard && (
        <div className="firo-board-modal-overlay" onClick={closeMore}>
          <div
            className="firo-board-modal"
            role="dialog"
            aria-label={`Actions for ${moreBoard.name}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapDialogKeyDown(event, closeMore)}
          >
            <div className="firo-board-modal__header">
              <h3 className="firo-board-modal__title">{moreBoard.name}</h3>
              <button
                type="button"
                className="firo-board-modal__close"
                aria-label="Close dialog"
                autoFocus
                onClick={closeMore}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="firo-board-modal__body">
              <div className="firo-board-modal__folder-list">
                <button
                  type="button"
                  className="firo-board-modal__folder-option"
                  onClick={() => {
                    setRenameBoardDraft(moreBoard.name);
                    setRenamingBoardId(moreBoard.id);
                    closeMore();
                  }}
                >
                  <PencilIcon size={16} />
                  <span>Rename</span>
                </button>
                {onDuplicateBoard && (
                  <button
                    type="button"
                    className="firo-board-modal__folder-option"
                    onClick={() => {
                      onDuplicateBoard(moreBoard.id);
                      closeMore();
                    }}
                  >
                    <DuplicateIcon size={16} />
                    <span>Duplicate</span>
                  </button>
                )}
                <button
                  type="button"
                  className="firo-board-modal__folder-option"
                  onClick={() => {
                    moveOpenerRef.current = moreOpenerRef.current;
                    setMovingBoard(moreBoard);
                    closeMore();
                  }}
                >
                  <FolderIcon size={16} />
                  <span>Move to folder</span>
                </button>
                {onExportBoard && (
                  <>
                    <button
                      type="button"
                      className="firo-board-modal__folder-option"
                      onClick={() => {
                        onExportBoard(moreBoard.id, "firo");
                        closeMore();
                      }}
                    >
                      <DownloadIcon size={16} />
                      <span>Export as .firo</span>
                    </button>
                    <button
                      type="button"
                      className="firo-board-modal__folder-option"
                      onClick={() => {
                        onExportBoard(moreBoard.id, "pdf");
                        closeMore();
                      }}
                    >
                      <FilePdfIcon size={16} />
                      <span>Export as PDF</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {movingBoard && (
        <div className="firo-board-modal-overlay" onClick={closeMove}>
          <div
            className="firo-board-modal"
            role="dialog"
            aria-label={`Move ${movingBoard.name} to folder`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapDialogKeyDown(event, closeMove)}
          >
            <div className="firo-board-modal__header">
              <h3 className="firo-board-modal__title">
                Move &ldquo;{movingBoard.name}&rdquo; to folder
              </h3>
              <button
                type="button"
                className="firo-board-modal__close"
                aria-label="Close dialog"
                autoFocus
                onClick={closeMove}
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
                    closeMove();
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
                      closeMove();
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
      {emptyingTrash && (
        <div className="firo-board-modal-overlay" onClick={closeEmptyTrash}>
          <div
            className="firo-board-modal firo-board-modal--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="firo-empty-trash-title"
            aria-describedby="firo-empty-trash-desc"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapDialogKeyDown(event, closeEmptyTrash)}
          >
            <div className="firo-board-modal__header">
              <h3
                className="firo-board-modal__title"
                id="firo-empty-trash-title"
              >
                Empty trash?
              </h3>
            </div>
            <div className="firo-board-modal__body">
              <p className="firo-board-modal__text" id="firo-empty-trash-desc">
                This permanently deletes{" "}
                {trashed.length === 1 ? "1 board" : `${trashed.length} boards`}{" "}
                and their saved versions from this browser. It can&rsquo;t be
                undone, so export anything you may need first.
              </p>
              <div className="firo-board-modal__actions">
                <button
                  type="button"
                  className="firo-board-modal__btn"
                  autoFocus
                  onClick={closeEmptyTrash}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="firo-board-modal__btn firo-board-modal__btn--danger"
                  onClick={() => {
                    setEmptyingTrash(false);
                    onEmptyTrash?.();
                    if (emptyTrashOpenerRef.current?.isConnected) {
                      emptyTrashOpenerRef.current.focus();
                    }
                  }}
                >
                  Empty trash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deletingBoard && (
        <div className="firo-board-modal-overlay" onClick={closeDeleteDialog}>
          <div
            className="firo-board-modal firo-board-modal--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="firo-delete-title"
            aria-describedby="firo-delete-desc"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => trapDialogKeyDown(event, closeDeleteDialog)}
          >
            <div className="firo-board-modal__header">
              <h3 className="firo-board-modal__title" id="firo-delete-title">
                Delete &ldquo;{deletingBoard.name}&rdquo; forever?
              </h3>
            </div>
            <div className="firo-board-modal__body">
              <p className="firo-board-modal__text" id="firo-delete-desc">
                This deletes the board and its saved versions from this browser.
                It can&rsquo;t be undone, so export it first if you may need it.
              </p>
              <div className="firo-board-modal__actions">
                <button
                  type="button"
                  className="firo-board-modal__btn"
                  autoFocus
                  onClick={closeDeleteDialog}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="firo-board-modal__btn firo-board-modal__btn--danger"
                  onClick={() => {
                    onDeleteBoard?.(deletingBoard.id);
                    setDeletingBoard(null);
                  }}
                >
                  Delete forever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
