import React from "react";

import {
  BoardsIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  TrashIcon,
} from "../icons";

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
  onCreateBlank?: () => void;
  onOpenBoard?: (id: string) => void;
  onRenameBoard?: (id: string, name: string) => void;
  onTrashBoard?: (id: string) => void;
  onRestoreBoard?: (id: string) => void;
  onDeleteBoard?: (id: string) => void;
  onCreateFromTemplate?: (templateId: string) => void;
}

interface BoardCardProps {
  board: BoardCardData;
  onOpen?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  onOpen,
  onRename,
  onTrash,
  onRestore,
  onDelete,
}) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(board.name);

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
            <button
              type="button"
              className="firo-board-card__action"
              aria-label={`Move ${board.name} to trash`}
              title="Move to trash"
              onClick={() => onTrash?.(board.id)}
            >
              <TrashIcon size={16} />
            </button>
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
  onCreateBlank,
  onOpenBoard,
  onRenameBoard,
  onTrashBoard,
  onRestoreBoard,
  onDeleteBoard,
  onCreateFromTemplate,
}) => {
  const [query, setQuery] = React.useState("");

  const live = boards.filter((board) => !board.trashed);
  const trashed = boards.filter((board) => board.trashed);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? live.filter(
        (board) =>
          board.name.toLowerCase().includes(needle) ||
          board.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
    : live;

  return (
    <div className="firo-board-home" role="region" aria-label="Boards">
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

      {templates.length > 0 && (
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

      <section className="firo-board-home__section" aria-label="Your boards">
        <h2 className="firo-board-home__section-title">Your boards</h2>
        {filtered.length > 0 ? (
          <div className="firo-board-grid">
            {filtered.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onOpen={onOpenBoard}
                onRename={onRenameBoard}
                onTrash={onTrashBoard}
                onRestore={onRestoreBoard}
                onDelete={onDeleteBoard}
              />
            ))}
          </div>
        ) : (
          <p className="firo-board-home__empty">
            {live.length === 0
              ? "No boards yet. Create one, or start from a template."
              : "No boards match that filter."}
          </p>
        )}
      </section>

      {trashed.length > 0 && (
        <section className="firo-board-home__section" aria-label="Trash">
          <h2 className="firo-board-home__section-title">Trash</h2>
          <div className="firo-board-grid">
            {trashed.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onOpen={onOpenBoard}
                onRename={onRenameBoard}
                onTrash={onTrashBoard}
                onRestore={onRestoreBoard}
                onDelete={onDeleteBoard}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
