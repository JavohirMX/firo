import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@firo/editor";
import { toEditorScene } from "@firo/board";
import { CloseIcon, TemplateIcon } from "@firo/ui";

import type { FiroElement } from "@firo/schema";

import type { BinaryFiles, ExcalidrawImperativeAPI } from "@firo/editor/types";

import type { ExcalidrawElement } from "@firo/element/types";

import { BOARD_TEMPLATES } from "../board/templates";
import { insertTemplateFragment } from "../board/templateInsert";
import {
  deleteTemplate,
  listTemplates,
  loadTemplatePayload,
  updateTemplateMeta,
} from "../board/templateStore";
import {
  parseTemplateTags,
  validateTemplateDescription,
  validateTemplateName,
} from "../board/templateFields";

import "./TemplateModal.scss";

import type { CapturedFragment } from "../board/templateFragment";
import type { BoardTemplate } from "../board/templates";
import type {
  TemplateListEntry,
  TemplateMetaRecord,
} from "../board/templateStore";

export interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

/**
 * The template gallery (parity matrix rows 55 and 56, [`ADR-0038`]).
 *
 * One surface, two sources: **My templates** (fragments saved on this
 * device, newest first) and **Built-in** (the curated starters). Search and
 * a single tag chip filter both. Cards show the real renderer's preview —
 * stored at save time for authored templates, rendered on first open for
 * built-ins and cached for the session — because a card that cannot show
 * what will be inserted is a label, not a gallery.
 *
 * Both sources insert through the one path in `templateInsert.ts`: restore,
 * fresh identity, files first, viewport-centre placement, one undo step.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */

/** Session cache for built-in thumbnails: build() + render once per open is
 *  enough; the module map survives closes within the session. */
const builtinThumbnails = new Map<string, string>();

const renderFragmentThumbnail = async (
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles = {},
): Promise<string | undefined> => {
  try {
    const { exportToCanvas } = await import("@firo/editor");
    const bounds = elements.reduce(
      (acc, element) => ({
        minX: Math.min(acc.minX, element.x),
        minY: Math.min(acc.minY, element.y),
        maxX: Math.max(acc.maxX, element.x + element.width),
        maxY: Math.max(acc.maxY, element.y + element.height),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const longEdge = Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
    );
    const canvas = await exportToCanvas({
      // Fragments hold only non-deleted elements by construction.
      elements: elements as never,
      appState: {
        ...api.getAppState(),
        exportBackground: true,
        exportScale: longEdge > 0 ? Math.min(1, 320 / longEdge) : 1,
        exportEmbedScene: false,
      },
      files,
    });
    return canvas?.toDataURL("image/png");
  } catch {
    return undefined;
  }
};

export const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  excalidrawAPI,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const searchRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<TemplateListEntry[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateMetaRecord | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [builtinPreviews, setBuiltinPreviews] = useState<
    Record<string, string>
  >({});

  const refresh = async () => {
    setEntries(await listTemplates());
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSearch("");
    setActiveTag(null);
    setOpenMenuId(null);
    setConfirmDeleteId(null);
    setEditing(null);
    setInsertError(null);
    void refresh();
    // Search is focused when the gallery opens (ADR-0038 §2).
    setTimeout(() => searchRef.current?.focus(), 0);

    // Render built-in previews on first open; failures leave the accent.
    if (excalidrawAPI) {
      void (async () => {
        for (const tmpl of BOARD_TEMPLATES) {
          if (builtinThumbnails.has(tmpl.id)) {
            continue;
          }
          const elements = toEditorScene(
            tmpl.build() as unknown as readonly FiroElement[],
          );
          const thumb = await renderFragmentThumbnail(excalidrawAPI, elements);
          if (thumb) {
            builtinThumbnails.set(tmpl.id, thumb);
            setBuiltinPreviews((prev) => ({ ...prev, [tmpl.id]: thumb }));
          }
        }
      })();
    }
    // One load per open; the api identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // An open card menu is the innermost rung (ADR-0033); it closes first.
      if (openMenuId) {
        setOpenMenuId(null);
        setConfirmDeleteId(null);
        return;
      }
      if (editing) {
        setEditing(null);
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, openMenuId, editing]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of entries) {
      if (entry.ok) {
        entry.meta.tags.forEach((tag) => tags.add(tag));
      }
    }
    for (const tmpl of BOARD_TEMPLATES) {
      tmpl.tags.forEach((tag) => tags.add(tag));
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const matches = (name: string, description: string, tags: string[]) => {
    if (activeTag && !tags.includes(activeTag)) {
      return false;
    }
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      return true;
    }
    return [name, description, ...tags].some((field) =>
      field.toLocaleLowerCase().includes(query),
    );
  };

  const visibleSaved = entries.filter(
    (entry) =>
      !entry.ok ||
      matches(entry.meta.name, entry.meta.description, entry.meta.tags),
  );
  const visibleBuiltins = BOARD_TEMPLATES.filter((tmpl) =>
    matches(tmpl.name, tmpl.description, tmpl.tags),
  );
  const anyVisible = visibleSaved.length > 0 || visibleBuiltins.length > 0;

  const handleInsert = async (fragment: CapturedFragment) => {
    if (!excalidrawAPI) {
      return;
    }
    const result = insertTemplateFragment(excalidrawAPI, fragment);
    if (result.ok) {
      onClose();
    } else {
      // The gallery stays open and nothing is inserted (ADR-0038 §5).
      setInsertError("That template could not be inserted: it is empty.");
    }
  };

  const handleUseSaved = async (id: string) => {
    setInsertError(null);
    const payload = await loadTemplatePayload(id);
    if (!payload) {
      setInsertError(
        "That template's content is missing or unreadable, so it cannot be inserted.",
      );
      return;
    }
    await handleInsert({
      elements: payload.elements as readonly ExcalidrawElement[],
      files: payload.files,
    });
  };

  const handleUseBuiltin = async (tmpl: BoardTemplate) => {
    setInsertError(null);
    const elements = toEditorScene(
      tmpl.build() as unknown as readonly FiroElement[],
    );
    if (elements.length === 0) {
      return;
    }
    await handleInsert({ elements, files: {} });
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setOpenMenuId(null);
    setConfirmDeleteId(null);
    await refresh();
  };

  if (!isOpen) {
    return null;
  }

  const renderCardMenu = (meta: TemplateMetaRecord) => (
    <div
      className="firo-template-card__menu"
      role="menu"
      aria-label={`${meta.name} actions`}
      data-testid={`template-menu-${meta.id}`}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setOpenMenuId(null);
          setEditing(meta);
        }}
        data-testid={`template-edit-${meta.id}`}
      >
        Edit details…
      </button>
      {confirmDeleteId === meta.id ? (
        <button
          type="button"
          role="menuitem"
          className="firo-template-card__menu-danger"
          onClick={() => void handleDelete(meta.id)}
          data-testid={`template-confirm-delete-${meta.id}`}
        >
          Confirm delete
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="firo-template-card__menu-danger"
          onClick={() => setConfirmDeleteId(meta.id)}
          data-testid={`template-delete-${meta.id}`}
        >
          Delete…
        </button>
      )}
    </div>
  );

  return (
    <div
      className="firo-template-modal__overlay"
      onClick={onClose}
      data-testid="template-modal-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="template-modal"
      >
        <div className="firo-template-modal__header">
          <div className="firo-template-modal__title-group">
            <span className="firo-template-modal__icon">
              <TemplateIcon size={20} />
            </span>
            <h2
              id="template-modal-title"
              className="firo-template-modal__title"
            >
              Templates
            </h2>
          </div>
          <input
            ref={searchRef}
            type="search"
            className="firo-template-modal__search"
            placeholder="Search templates"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search templates"
            data-testid="template-search"
          />
          <button
            type="button"
            className="firo-template-modal__close-btn"
            onClick={onClose}
            aria-label="Close"
            data-testid="template-modal-close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div
          className="firo-template-modal__chips"
          role="group"
          aria-label="Filter by tag"
        >
          <button
            type="button"
            className="firo-template-modal__chip"
            aria-pressed={activeTag === null}
            onClick={() => setActiveTag(null)}
            data-testid="template-chip-all"
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="firo-template-modal__chip"
              aria-pressed={activeTag === tag}
              onClick={() =>
                setActiveTag((current) => (current === tag ? null : tag))
              }
              data-testid={`template-chip-${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>

        {insertError && (
          <p className="firo-template-modal__error" role="alert">
            {insertError}
          </p>
        )}

        <div className="firo-template-modal__scroll">
          {visibleSaved.length > 0 && (
            <section
              className="firo-template-modal__section"
              aria-label="My templates"
            >
              <h3 className="firo-template-modal__section-title">
                My templates{" "}
                <span className="firo-template-modal__section-note">
                  Saved on this device
                </span>
              </h3>
              <div className="firo-template-modal__grid">
                {visibleSaved.map((entry) =>
                  entry.ok ? (
                    <div
                      key={entry.meta.id}
                      className="firo-template-card"
                      data-testid={`template-card-${entry.meta.id}`}
                    >
                      <div className="firo-template-card__preview">
                        {entry.meta.thumbnail ? (
                          <img src={entry.meta.thumbnail} alt="" />
                        ) : (
                          <div className="firo-template-card__preview-blank" />
                        )}
                        <button
                          type="button"
                          className="firo-template-card__menu-trigger"
                          aria-label={`${entry.meta.name} actions`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === entry.meta.id}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            setOpenMenuId((current) =>
                              current === entry.meta.id ? null : entry.meta.id,
                            );
                          }}
                          data-testid={`template-menu-trigger-${entry.meta.id}`}
                        >
                          ⋯
                        </button>
                        {openMenuId === entry.meta.id &&
                          renderCardMenu(entry.meta)}
                      </div>
                      <div className="firo-template-card__body">
                        <h3 className="firo-template-card__name">
                          {entry.meta.name}
                        </h3>
                        {entry.meta.description && (
                          <p className="firo-template-card__desc">
                            {entry.meta.description}
                          </p>
                        )}
                        <div className="firo-template-card__tags">
                          {entry.meta.tags.map((tag) => (
                            <span key={tag} className="firo-template-card__tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="firo-template-card__footer">
                        <button
                          type="button"
                          className="firo-template-card__btn"
                          onClick={() => void handleUseSaved(entry.meta.id)}
                          data-testid={`template-use-${entry.meta.id}`}
                        >
                          Use template
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className="firo-template-card firo-template-card--unreadable"
                      data-testid={`template-card-unreadable-${entry.id}`}
                    >
                      <div className="firo-template-card__body">
                        <h3 className="firo-template-card__name">
                          Unreadable template
                        </h3>
                        <p className="firo-template-card__desc">
                          This saved template cannot be read and cannot be
                          inserted.
                        </p>
                      </div>
                      <div className="firo-template-card__footer">
                        {confirmDeleteId === entry.id ? (
                          <button
                            type="button"
                            className="firo-template-card__btn"
                            onClick={() => void handleDelete(entry.id)}
                            data-testid={`template-confirm-delete-${entry.id}`}
                          >
                            Confirm delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="firo-template-card__btn"
                            onClick={() => setConfirmDeleteId(entry.id)}
                            data-testid={`template-delete-${entry.id}`}
                          >
                            Delete…
                          </button>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {entries.length === 0 && !search.trim() && !activeTag && (
            <section
              className="firo-template-modal__section"
              aria-label="My templates"
            >
              <h3 className="firo-template-modal__section-title">
                My templates{" "}
                <span className="firo-template-modal__section-note">
                  Saved on this device
                </span>
              </h3>
              <p
                className="firo-template-modal__hint"
                data-testid="template-save-hint"
              >
                Select objects on a board, then choose Save as template.
              </p>
            </section>
          )}

          {visibleBuiltins.length > 0 && (
            <section
              className="firo-template-modal__section"
              aria-label="Built-in"
            >
              <h3 className="firo-template-modal__section-title">Built-in</h3>
              <div className="firo-template-modal__grid">
                {visibleBuiltins.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="firo-template-card"
                    data-testid={`template-card-${tmpl.id}`}
                  >
                    <div className="firo-template-card__preview">
                      {builtinPreviews[tmpl.id] ? (
                        <img src={builtinPreviews[tmpl.id]} alt="" />
                      ) : (
                        <div
                          className="firo-template-card__accent"
                          style={{ backgroundColor: tmpl.color }}
                        />
                      )}
                    </div>
                    <div className="firo-template-card__body">
                      <h3 className="firo-template-card__name">{tmpl.name}</h3>
                      <p className="firo-template-card__desc">
                        {tmpl.description}
                      </p>
                      <div className="firo-template-card__tags">
                        {tmpl.tags.map((tag) => (
                          <span key={tag} className="firo-template-card__tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="firo-template-card__footer">
                      <button
                        type="button"
                        className="firo-template-card__btn"
                        onClick={() => void handleUseBuiltin(tmpl)}
                        data-testid={`template-use-${tmpl.id}`}
                      >
                        Use template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!anyVisible && entries.length > 0 && (
            <div
              className="firo-template-modal__no-results"
              data-testid="template-no-results"
            >
              <p>No templates match.</p>
              <button
                type="button"
                className="firo-template-card__btn"
                onClick={() => {
                  setSearch("");
                  setActiveTag(null);
                }}
                data-testid="template-clear-filters"
              >
                Clear search and filters
              </button>
            </div>
          )}
        </div>

        {editing && (
          <EditTemplateDetails
            meta={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await refresh();
            }}
          />
        )}
      </div>
    </div>
  );
};

/** Edit-details dialog: the same name, description and tag fields with the
 *  same validation as save (ADR-0038 §7); content is never touched here. */
const EditTemplateDetails: React.FC<{
  meta: TemplateMetaRecord;
  onClose: () => void;
  onSaved: () => void;
}> = ({ meta, onClose, onSaved }) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const [name, setName] = useState(meta.name);
  const [description, setDescription] = useState(meta.description);
  const [tagsRaw, setTagsRaw] = useState(meta.tags.join(", "));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [onClose]);

  const validName = validateTemplateName(name);
  const validDescription = validateTemplateDescription(description);
  const parsedTags = parseTemplateTags(tagsRaw);
  const canSave =
    validName !== null && validDescription !== null && parsedTags.ok;

  const handleSave = async () => {
    if (!canSave || validName === null || !parsedTags.ok) {
      return;
    }
    const updated = await updateTemplateMeta(meta.id, {
      name: validName,
      description: validDescription ?? "",
      tags: parsedTags.tags,
    });
    if (!updated) {
      setError("This template can no longer be read; it cannot be edited.");
      return;
    }
    onSaved();
  };

  return (
    <div
      className="firo-template-edit__overlay"
      onClick={onClose}
      data-testid="template-edit-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-template-edit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-edit-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="template-edit-dialog"
      >
        <h3 id="template-edit-title" className="firo-template-edit__title">
          Edit template details
        </h3>
        <label className="firo-template-edit__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="template-edit-name"
          />
        </label>
        <label className="firo-template-edit__field">
          <span>Description</span>
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            data-testid="template-edit-description"
          />
        </label>
        <label className="firo-template-edit__field">
          <span>Tags (comma-separated)</span>
          <input
            type="text"
            value={tagsRaw}
            onChange={(event) => setTagsRaw(event.target.value)}
            data-testid="template-edit-tags"
          />
        </label>
        {error && (
          <p className="firo-template-modal__error" role="alert">
            {error}
          </p>
        )}
        <div className="firo-template-edit__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="firo-template-card__btn"
            disabled={!canSave}
            onClick={() => void handleSave()}
            data-testid="template-edit-save"
          >
            Save details
          </button>
        </div>
      </div>
    </div>
  );
};
