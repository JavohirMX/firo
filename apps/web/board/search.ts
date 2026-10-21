/**
 * Cross-board content search (Task 8.2).
 *
 * Scans stored boards: reads board payloads from storage, searches element text
 * (sticky notes, text elements), records (title, values), and comment thread entries.
 * Returns matches with snippet context.
 */

import { loadBoard } from "@firo/schema";

import { listBoards } from "./library";
import { readBoardPayload } from "./storage";

export interface SearchMatch {
  boardId: string;
  boardName: string;
  snippet: string;
  matchType: "title" | "stickynote" | "card" | "text" | "comment" | "tag";
}

/** Recursively extracts plain text from a ProseMirror doc. */
const extractProseMirrorText = (node: unknown): string => {
  if (!node || typeof node !== "object") {
    return "";
  }
  const n = node as Record<string, unknown>;
  if (typeof n.text === "string") {
    return n.text;
  }
  if (Array.isArray(n.content)) {
    return n.content.map(extractProseMirrorText).filter(Boolean).join(" ");
  }
  return "";
};

/** Extracts searchable text from a record's field value. */
const extractFieldValueText = (field: unknown): string => {
  if (!field || typeof field !== "object") {
    return "";
  }
  const f = field as Record<string, unknown>;
  if (typeof f.value === "string") {
    return f.value;
  }
  if (Array.isArray(f.value)) {
    return f.value.filter((v) => typeof v === "string").join(", ");
  }
  if (f.type === "richText" && f.value) {
    return extractProseMirrorText(f.value);
  }
  return "";
};

/**
 * Creates a snippet centered around the query match.
 */
const makeSnippet = (
  fullText: string,
  needle: string,
  maxLength = 80,
): string => {
  const clean = fullText.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const index = lower.indexOf(needle.toLowerCase());
  if (index === -1) {
    return clean.length > maxLength
      ? `${clean.slice(0, maxLength).trim()}…`
      : clean;
  }
  const start = Math.max(0, index - 25);
  const end = Math.min(clean.length, index + needle.length + 35);
  let snippet = clean.slice(start, end).trim();
  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < clean.length) {
    snippet = `${snippet}…`;
  }
  return snippet;
};

export const searchBoardsContent = async (
  query: string,
): Promise<SearchMatch[]> => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const boards = await listBoards();
  // Live (non-trashed) boards
  const live = boards.filter((b) => !b.trashedAt);
  const matches: SearchMatch[] = [];

  for (const board of live) {
    // 1. Board Title match
    if (board.name.toLowerCase().includes(needle)) {
      matches.push({
        boardId: board.id,
        boardName: board.name,
        snippet: board.name,
        matchType: "title",
      });
    }

    // 1B. Board Tag match
    if (board.tags && Array.isArray(board.tags)) {
      for (const tag of board.tags) {
        if (tag.toLowerCase().includes(needle)) {
          matches.push({
            boardId: board.id,
            boardName: board.name,
            snippet: `Board tag: #${tag}`,
            matchType: "tag",
          });
          break;
        }
      }
    }

    // 2. Content matches from payload
    const rawPayload = await readBoardPayload(board.id);
    if (!rawPayload) {
      continue;
    }

    let loaded;
    try {
      loaded = loadBoard(JSON.parse(rawPayload));
    } catch {
      continue;
    }

    // Elements: sticky notes, text elements, and element tags
    for (const element of loaded.elements) {
      // Check element tags
      if (element.tags && Array.isArray(element.tags)) {
        for (const tag of element.tags) {
          if (tag.toLowerCase().includes(needle)) {
            matches.push({
              boardId: board.id,
              boardName: board.name,
              snippet: `Tag: #${tag}`,
              matchType: "tag",
            });
            break;
          }
        }
      }

      if (element.type === "stickynote") {
        const text = (element as { text?: string }).text ?? "";
        if (text && text.toLowerCase().includes(needle)) {
          matches.push({
            boardId: board.id,
            boardName: board.name,
            snippet: makeSnippet(text, needle),
            matchType: "stickynote",
          });
        }
      } else if (element.type === "text") {
        const text = (element as { text?: string }).text ?? "";
        if (text && text.toLowerCase().includes(needle)) {
          matches.push({
            boardId: board.id,
            boardName: board.name,
            snippet: makeSnippet(text, needle),
            matchType: "text",
          });
        }
      }
    }

    // Records: cards
    for (const record of loaded.records) {
      if (record.values) {
        for (const fieldValue of Object.values(record.values)) {
          const text = extractFieldValueText(fieldValue);
          if (text && text.toLowerCase().includes(needle)) {
            matches.push({
              boardId: board.id,
              boardName: board.name,
              snippet: makeSnippet(text, needle),
              matchType: "card",
            });
            // Match once per card
            break;
          }
        }
      }
    }

    // Comments
    if (loaded.comments) {
      for (const thread of loaded.comments) {
        for (const comment of thread.comments) {
          if (comment.body && comment.body.toLowerCase().includes(needle)) {
            matches.push({
              boardId: board.id,
              boardName: board.name,
              snippet: makeSnippet(comment.body, needle),
              matchType: "comment",
            });
          }
        }
      }
    }
  }

  return matches;
};

export interface GroupedContentMatch {
  boardId: string;
  boardName: string;
  snippet: string;
  matchType: SearchMatch["matchType"];
  matchCount: number;
}

/**
 * Collapse the raw match list to one row per board, for the home's "Inside
 * boards" section. The first content hit's snippet leads the row and the count
 * says whether more matched. Title and board-tag matches are dropped here, not
 * in the search itself, because the grid above already lists boards whose name
 * or tags match — repeating them as "content" would be noise, not signal.
 */
export const groupContentMatches = (
  matches: SearchMatch[],
): GroupedContentMatch[] => {
  const byBoard = new Map<string, GroupedContentMatch>();
  for (const match of matches) {
    if (match.matchType === "title" || match.matchType === "tag") {
      continue;
    }
    const existing = byBoard.get(match.boardId);
    if (existing) {
      existing.matchCount += 1;
    } else {
      byBoard.set(match.boardId, {
        boardId: match.boardId,
        boardName: match.boardName,
        snippet: match.snippet,
        matchType: match.matchType,
        matchCount: 1,
      });
    }
  }
  return [...byBoard.values()];
};
