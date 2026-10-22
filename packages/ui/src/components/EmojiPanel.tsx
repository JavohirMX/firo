import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  EMOJI_CATEGORIES,
  type EmojiEntry,
} from "../emoji/emojiData.generated";
import { CloseIcon } from "../icons";

import "./EmojiPanel.scss";

export interface EmojiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the picked character; the host inserts the text element. */
  onPick: (emoji: string) => void;
}

const COLUMNS = 8;

const CATEGORY_GLYPHS: Record<string, string> = {
  "smileys-emotion": "😀",
  "people-body": "👋",
  "animals-nature": "🐻",
  "food-drink": "🍔",
  "travel-places": "🚗",
  activities: "⚽",
  objects: "💡",
  symbols: "❤",
  flags: "🏁",
};

const matches = (entry: EmojiEntry, terms: string[]) => {
  const hay = `${entry[1]} ${entry[2]}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
};

/**
 * The emoji flyout (ADR-0036 §1): a non-modal left panel with a search field,
 * a category strip and a grid. A pick calls `onPick`; the panel stays open.
 * Escape closes it; an outside pointerdown does not.
 */
export const EmojiPanel: React.FC<EmojiPanelProps> = ({
  isOpen,
  onClose,
  onPick,
}) => {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(EMOJI_CATEGORIES[0].id);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const panel = document.querySelector(".firo-emoji-panel");
      if (
        panel &&
        (panel.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  const entries = useMemo<readonly EmojiEntry[]>(() => {
    if (searching) {
      return EMOJI_CATEGORIES.flatMap((c) =>
        c.emoji.filter((e) => matches(e, terms)),
      );
    }
    return (
      EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0]
    ).emoji;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, categoryId]);

  if (!isOpen) {
    return null;
  }

  const focusCell = (index: number) => {
    const next = Math.max(0, Math.min(entries.length - 1, index));
    setActiveIndex(next);
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
        ?.focus();
    });
  };

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    if (event.key in step) {
      event.preventDefault();
      focusCell(activeIndex + step[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusCell(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusCell(entries.length - 1);
    }
  };

  const onTabsKeyDown = (event: React.KeyboardEvent) => {
    const i = EMOJI_CATEGORIES.findIndex((c) => c.id === categoryId);
    let next = i;
    if (event.key === "ArrowRight") {
      next = (i + 1) % EMOJI_CATEGORIES.length;
    } else if (event.key === "ArrowLeft") {
      next = (i - 1 + EMOJI_CATEGORIES.length) % EMOJI_CATEGORIES.length;
    } else {
      return;
    }
    event.preventDefault();
    setCategoryId(EMOJI_CATEGORIES[next].id);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `.firo-emoji-panel__tab[data-category="${EMOJI_CATEGORIES[next].id}"]`,
        )
        ?.focus(),
    );
  };

  return (
    <div
      className="firo-emoji-panel"
      role="complementary"
      aria-label="Emoji"
      data-testid="emoji-panel"
    >
      <div className="firo-emoji-panel__header">
        <h2 className="firo-emoji-panel__title">Emoji</h2>
        <button
          type="button"
          className="firo-emoji-panel__close"
          aria-label="Close emoji panel"
          onClick={onClose}
        >
          <CloseIcon size={16} aria-hidden />
        </button>
      </div>
      <input
        ref={searchRef}
        type="search"
        className="firo-emoji-panel__search"
        placeholder="Search emoji"
        aria-label="Search emoji"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && entries.length > 0) {
            event.preventDefault();
            focusCell(0);
          }
        }}
      />
      <div
        className="firo-emoji-panel__tabs"
        role="tablist"
        aria-label="Emoji categories"
        onKeyDown={onTabsKeyDown}
      >
        {EMOJI_CATEGORIES.map((c) => {
          const selected = !searching && c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              data-category={c.id}
              className={`firo-emoji-panel__tab${
                selected ? " firo-emoji-panel__tab--active" : ""
              }`}
              aria-selected={selected}
              aria-label={c.name}
              title={c.name}
              tabIndex={c.id === categoryId ? 0 : -1}
              onClick={() => {
                setQuery("");
                setCategoryId(c.id);
              }}
            >
              <span aria-hidden>{CATEGORY_GLYPHS[c.id] ?? "•"}</span>
            </button>
          );
        })}
      </div>
      {entries.length === 0 ? (
        <p className="firo-emoji-panel__empty" role="status">
          No emoji match &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <div
          ref={gridRef}
          className="firo-emoji-panel__grid"
          role="grid"
          aria-label={searching ? "Search results" : "Emoji"}
          onKeyDown={onGridKeyDown}
        >
          {entries.map((entry, index) => (
            <button
              key={entry[0]}
              type="button"
              role="gridcell"
              className="firo-emoji-panel__cell"
              data-index={index}
              title={entry[1]}
              aria-label={entry[1]}
              tabIndex={index === activeIndex ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              onClick={() => onPick(entry[0])}
            >
              {entry[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
