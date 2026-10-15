/**
 * Board repository and content search for Firo MCP Server.
 */

import { openBoardMemory } from "@firo/doc";
import { isProseMirrorDoc, proseMirrorToPlainText } from "@firo/schema";

import { extractElementText } from "./declarative.js";
import { applyDiff } from "./diff.js";

import type {
  DeclarativeCollection,
  DeclarativeElement,
  DeclarativeRecord,
} from "./declarative.js";
import type { FiroDoc } from "./types.js";

export interface BoardMetadata {
  id: string;
  name: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BoardSearchResult {
  boardId: string;
  boardName: string;
  snippet: string;
  matchType: "title" | "stickynote" | "text" | "card" | "comment" | "tag";
}

export interface BoardStore {
  listBoards(): Promise<BoardMetadata[]>;
  getBoard(id: string): Promise<FiroDoc | undefined>;
  getBoardMetadata(id: string): Promise<BoardMetadata | undefined>;
  createBoard(
    title: string,
    options?: {
      id?: string;
      tags?: string[];
      elements?: DeclarativeElement[];
      collections?: DeclarativeCollection[];
      records?: DeclarativeRecord[];
    },
  ): Promise<{ id: string; doc: FiroDoc }>;
  searchBoards(query: string, tags?: string[]): Promise<BoardSearchResult[]>;
}

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

/**
 * In-memory BoardStore with full content search.
 */
export class MemoryBoardStore implements BoardStore {
  private boards = new Map<
    string,
    {
      doc: FiroDoc;
      metadata: BoardMetadata;
    }
  >();

  constructor(initialBoards?: { id: string; title: string; doc?: FiroDoc }[]) {
    if (initialBoards && initialBoards.length > 0) {
      for (const b of initialBoards) {
        const doc = b.doc ?? openBoardMemory();
        doc.commit([
          {
            kind: "setMeta",
            entries: {
              id: b.id,
              name: b.title,
              created: Date.now(),
              updated: Date.now(),
            },
          },
        ]);
        this.boards.set(b.id, {
          doc,
          metadata: {
            id: b.id,
            name: b.title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        });
      }
    }
  }

  async listBoards(): Promise<BoardMetadata[]> {
    return Array.from(this.boards.values())
      .map((b) => b.metadata)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getBoard(id: string): Promise<FiroDoc | undefined> {
    return this.boards.get(id)?.doc;
  }

  async getBoardMetadata(id: string): Promise<BoardMetadata | undefined> {
    return this.boards.get(id)?.metadata;
  }

  async createBoard(
    title: string,
    options?: {
      id?: string;
      tags?: string[];
      elements?: DeclarativeElement[];
      collections?: DeclarativeCollection[];
      records?: DeclarativeRecord[];
    },
  ): Promise<{ id: string; doc: FiroDoc }> {
    const id = options?.id ?? `board-${Math.random().toString(36).slice(2, 9)}`;
    const doc = openBoardMemory();

    const now = Date.now();
    doc.commit([
      {
        kind: "setMeta",
        entries: {
          id,
          name: title,
          tags: options?.tags ?? [],
          created: now,
          updated: now,
        },
      },
    ]);

    if (
      (options?.elements && options.elements.length > 0) ||
      (options?.collections && options.collections.length > 0) ||
      (options?.records && options.records.length > 0)
    ) {
      applyDiff(doc, {
        elements: options.elements ? { insert: options.elements } : undefined,
        collections: options.collections
          ? { insert: options.collections }
          : undefined,
        records: options.records ? { insert: options.records } : undefined,
      });
    }

    const metadata: BoardMetadata = {
      id,
      name: title,
      tags: options?.tags,
      createdAt: now,
      updatedAt: now,
    };

    this.boards.set(id, { doc, metadata });
    return { id, doc };
  }

  async searchBoards(
    query: string,
    tags?: string[],
  ): Promise<BoardSearchResult[]> {
    const needle = query.trim().toLowerCase();
    const tagSet =
      tags && tags.length > 0
        ? new Set(tags.map((t) => t.toLowerCase()))
        : null;
    const matches: BoardSearchResult[] = [];

    for (const { doc, metadata } of this.boards.values()) {
      // Filter by tags if specified
      if (tagSet) {
        const boardTags = (metadata.tags ?? []).map((t) => t.toLowerCase());
        const hasMatchingTag = boardTags.some((t) => tagSet.has(t));
        if (!hasMatchingTag) {
          continue;
        }
      }

      // If query is empty but tags matched, match board title
      if (!needle) {
        matches.push({
          boardId: metadata.id,
          boardName: metadata.name,
          snippet: metadata.name,
          matchType: "title",
        });
        continue;
      }

      // 1. Board Title
      if (metadata.name.toLowerCase().includes(needle)) {
        matches.push({
          boardId: metadata.id,
          boardName: metadata.name,
          snippet: makeSnippet(metadata.name, needle),
          matchType: "title",
        });
      }

      // 2. Board Tags
      if (metadata.tags) {
        for (const tag of metadata.tags) {
          if (tag.toLowerCase().includes(needle)) {
            matches.push({
              boardId: metadata.id,
              boardName: metadata.name,
              snippet: `Tag: #${tag}`,
              matchType: "tag",
            });
            break;
          }
        }
      }

      const snapshot = doc.read();

      // 3. Elements (sticky notes, text, tags)
      for (const el of snapshot.elements) {
        if (el.isDeleted) {
          continue;
        }

        const text = extractElementText(el);
        if (text && text.toLowerCase().includes(needle)) {
          matches.push({
            boardId: metadata.id,
            boardName: metadata.name,
            snippet: makeSnippet(text, needle),
            matchType: el.type === "stickynote" ? "stickynote" : "text",
          });
        }

        if (el.tags) {
          for (const t of el.tags) {
            if (t.toLowerCase().includes(needle)) {
              matches.push({
                boardId: metadata.id,
                boardName: metadata.name,
                snippet: `Element tag: #${t}`,
                matchType: "tag",
              });
              break;
            }
          }
        }
      }

      // 4. Records
      for (const rec of snapshot.records) {
        if (rec.archived) {
          continue;
        }

        for (const val of Object.values(rec.values)) {
          let strVal = "";
          if (val && typeof val === "object" && "value" in val) {
            if (val.type === "richText" && isProseMirrorDoc(val.value)) {
              strVal = proseMirrorToPlainText(val.value);
            } else {
              strVal = String((val as any).value ?? "");
            }
          } else if (val !== null && val !== undefined) {
            strVal = String(val);
          }

          if (strVal && strVal.toLowerCase().includes(needle)) {
            matches.push({
              boardId: metadata.id,
              boardName: metadata.name,
              snippet: makeSnippet(strVal, needle),
              matchType: "card",
            });
            break;
          }
        }
      }

      // 5. Comments
      for (const thread of snapshot.comments) {
        for (const comment of thread.comments) {
          if (comment.body.toLowerCase().includes(needle)) {
            matches.push({
              boardId: metadata.id,
              boardName: metadata.name,
              snippet: makeSnippet(comment.body, needle),
              matchType: "comment",
            });
            break;
          }
        }
      }
    }

    return matches;
  }
}
