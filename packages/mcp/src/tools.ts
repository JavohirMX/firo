/**
 * Standard MCP Tool Handlers for Firo (Phase 10.2).
 */

import { declarativeToSvg, serializeDocToDeclarative } from "./declarative.js";
import { applyDeclarativeBoard, applyDiff } from "./diff.js";

import type {
  DeclarativeBoard,
  DeclarativeCollection,
  DeclarativeElement,
  DeclarativeRecord,
} from "./declarative.js";
import type { BoardDiff } from "./diff.js";
import type { BoardStore } from "./store.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

export const createMcpTools = (
  store: BoardStore,
): Map<string, ToolDefinition> => {
  const tools = new Map<string, ToolDefinition>();

  // 1. board_search
  tools.set("board_search", {
    name: "board_search",
    description:
      "Search across whiteboard documents by title, tags, sticky notes, text, cards/records, or comments.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search text or keyword to look for across boards",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of tags to filter boards by",
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = String(args.query || "");
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : undefined;
      const matches = await store.searchBoards(query, tags);
      return { matches, count: matches.length };
    },
  });

  // 2. board_read
  tools.set("board_read", {
    name: "board_read",
    description:
      "Export a Firo whiteboard as a declarative structured document (JSON or SVG) with stable element IDs.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: {
          type: "string",
          description: "The unique identifier of the board to read",
        },
        format: {
          type: "string",
          enum: ["json", "svg", "summary"],
          description:
            "Output format: 'json' (full structured model, default), 'svg' (canvas SVG rendering with data-firo-id), or 'summary' (compact item counts)",
        },
      },
      required: ["boardId"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      const meta = await store.getBoardMetadata(boardId);
      const board = serializeDocToDeclarative(doc, {
        boardId,
        title: meta?.name,
      });

      const format = args.format ?? "json";
      if (format === "svg") {
        return {
          boardId,
          title: board.title,
          svg: declarativeToSvg(board),
        };
      }

      if (format === "summary") {
        return {
          boardId,
          title: board.title,
          elementCount: board.elements.length,
          stickyNotes: board.elements.filter((e) => e.type === "stickynote")
            .length,
          shapes: board.elements.filter((e) =>
            ["rectangle", "diamond", "ellipse"].includes(e.type),
          ).length,
          connectors: board.elements.filter((e) =>
            ["arrow", "line"].includes(e.type),
          ).length,
          collections: board.collections.length,
          records: board.records.length,
          commentThreads: board.comments.length,
        };
      }

      return board;
    },
  });

  // 3. board_create
  tools.set("board_create", {
    name: "board_create",
    description:
      "Create a new whiteboard document with a title and optional initial elements, collections, or records.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the new whiteboard",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional initial tags for the board",
        },
        elements: {
          type: "array",
          items: { type: "object" },
          description: "Optional list of initial declarative elements",
        },
        collections: {
          type: "array",
          items: { type: "object" },
          description: "Optional list of initial record collections",
        },
        records: {
          type: "array",
          items: { type: "object" },
          description: "Optional list of initial records",
        },
      },
      required: ["title"],
    },
    execute: async (args) => {
      const title = String(args.title);
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : undefined;
      const elements = Array.isArray(args.elements)
        ? (args.elements as DeclarativeElement[])
        : undefined;
      const collections = Array.isArray(args.collections)
        ? (args.collections as DeclarativeCollection[])
        : undefined;
      const records = Array.isArray(args.records)
        ? (args.records as DeclarativeRecord[])
        : undefined;

      const { id, doc } = await store.createBoard(title, {
        tags,
        elements,
        collections,
        records,
      });

      const decl = serializeDocToDeclarative(doc, { boardId: id, title });
      return {
        success: true,
        boardId: id,
        title,
        elementCount: decl.elements.length,
      };
    },
  });

  // 4. board_apply_diff
  tools.set("board_apply_diff", {
    name: "board_apply_diff",
    description:
      "Apply declarative changes (insertions, updates, deletions) to elements, collections, and records on a board.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: {
          type: "string",
          description: "The unique identifier of the board to update",
        },
        diff: {
          type: "object",
          description:
            "A structured diff containing elements, collections, records, and comments to insert, update, or delete",
          properties: {
            elements: {
              type: "object",
              properties: {
                insert: { type: "array", items: { type: "object" } },
                update: { type: "array", items: { type: "object" } },
                delete: { type: "array", items: { type: "string" } },
              },
            },
            collections: {
              type: "object",
              properties: {
                insert: { type: "array", items: { type: "object" } },
                update: { type: "array", items: { type: "object" } },
                delete: { type: "array", items: { type: "string" } },
              },
            },
            records: {
              type: "object",
              properties: {
                insert: { type: "array", items: { type: "object" } },
                update: { type: "array", items: { type: "object" } },
                delete: { type: "array", items: { type: "string" } },
              },
            },
            comments: {
              type: "object",
              properties: {
                createThread: { type: "array", items: { type: "object" } },
                replyThread: { type: "array", items: { type: "object" } },
                resolveThread: { type: "array", items: { type: "string" } },
                deleteThread: { type: "array", items: { type: "string" } },
              },
            },
            meta: { type: "object" },
          },
        },
        board: {
          type: "object",
          description:
            "Alternatively, provide the full target DeclarativeBoard to automatically compute and apply the minimal diff",
        },
      },
      required: ["boardId"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      let result;
      if (args.board && typeof args.board === "object") {
        result = applyDeclarativeBoard(doc, args.board as DeclarativeBoard);
      } else if (args.diff && typeof args.diff === "object") {
        result = applyDiff(doc, args.diff as BoardDiff);
      } else {
        throw new Error("Either 'diff' or 'board' must be supplied.");
      }

      return {
        success: true,
        changed: result.changed,
        applied: result.applied,
        localRevision: result.localRevision,
      };
    },
  });

  // 5. records_query
  tools.set("records_query", {
    name: "records_query",
    description: "Filter and sort records in a collection on a board.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: {
          type: "string",
          description: "ID of the board containing the collection",
        },
        collectionId: {
          type: "string",
          description: "ID of the collection to query",
        },
        filter: {
          type: "object",
          properties: {
            field: { type: "string", description: "Column key to filter on" },
            operator: {
              type: "string",
              enum: ["equals", "notEquals", "contains", "gt", "lt"],
            },
            value: { description: "Target value to compare" },
          },
          required: ["field", "operator", "value"],
        },
        sortBy: {
          type: "string",
          description: "Column key to sort records by",
        },
        sortDirection: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sorting direction (default: 'asc')",
        },
        includeArchived: {
          type: "boolean",
          description: "Whether to include archived records (default: false)",
        },
      },
      required: ["boardId", "collectionId"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const collectionId = String(args.collectionId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      const snapshot = doc.read();
      const collection = snapshot.collections.find(
        (c) => c.id === collectionId,
      );
      if (!collection) {
        throw new Error(
          `Collection "${collectionId}" not found on board "${boardId}".`,
        );
      }

      let records = snapshot.records.filter(
        (r) => r.collectionId === collectionId,
      );
      if (!args.includeArchived) {
        records = records.filter((r) => !r.archived);
      }

      // Filter
      if (args.filter && typeof args.filter === "object") {
        const { field, operator, value } = args.filter;
        records = records.filter((r) => {
          const raw = r.values[field];
          const actualVal =
            raw && typeof raw === "object" && "value" in raw
              ? (raw as any).value
              : raw;

          switch (operator) {
            case "equals":
              return actualVal === value;
            case "notEquals":
              return actualVal !== value;
            case "contains":
              return String(actualVal || "")
                .toLowerCase()
                .includes(String(value || "").toLowerCase());
            case "gt":
              return Number(actualVal) > Number(value);
            case "lt":
              return Number(actualVal) < Number(value);
            default:
              return true;
          }
        });
      }

      // Sort
      if (args.sortBy) {
        const sortField = String(args.sortBy);
        const direction = args.sortDirection === "desc" ? -1 : 1;
        records = [...records].sort((a, b) => {
          const valA = a.values[sortField];
          const valB = b.values[sortField];
          const unwrappedA =
            valA && typeof valA === "object" && "value" in valA
              ? (valA as any).value
              : valA;
          const unwrappedB =
            valB && typeof valB === "object" && "value" in valB
              ? (valB as any).value
              : valB;

          if (unwrappedA < unwrappedB) {
            return -1 * direction;
          }
          if (unwrappedA > unwrappedB) {
            return 1 * direction;
          }
          return 0;
        });
      }

      return {
        collectionId,
        collectionName: collection.name,
        records: records.map((r) => ({
          id: r.id,
          values: r.values,
          order: r.order,
          archived: r.archived,
        })),
        count: records.length,
      };
    },
  });

  // 6. records_update
  tools.set("records_update", {
    name: "records_update",
    description: "Insert, update, or remove records in a collection.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "ID of the board" },
        collectionId: { type: "string", description: "ID of the collection" },
        insert: {
          type: "array",
          items: { type: "object" },
          description: "New records to insert with values keyed by column key",
        },
        update: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              values: { type: "object" },
            },
            required: ["id", "values"],
          },
          description: "Existing records to update",
        },
        delete: {
          type: "array",
          items: { type: "string" },
          description: "Record IDs to archive",
        },
      },
      required: ["boardId", "collectionId"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const collectionId = String(args.collectionId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      const diff: BoardDiff = { records: {} };

      if (Array.isArray(args.insert) && args.insert.length > 0) {
        diff.records!.insert = args.insert.map((r, i) => ({
          id: r.id || `rec-${Math.random().toString(36).slice(2, 9)}`,
          collectionId,
          values: r.values || r,
        }));
      }

      if (Array.isArray(args.update) && args.update.length > 0) {
        diff.records!.update = args.update.map((u) => ({
          id: u.id,
          values: u.values,
        }));
      }

      if (Array.isArray(args.delete) && args.delete.length > 0) {
        diff.records!.delete = args.delete.map(String);
      }

      const result = applyDiff(doc, diff);
      return {
        success: true,
        changed: result.changed,
        applied: result.applied,
      };
    },
  });

  // 7. comment_thread_create
  tools.set("comment_thread_create", {
    name: "comment_thread_create",
    description:
      "Anchor a new comment thread to an element or coordinate on a board.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "ID of the board" },
        elementId: {
          type: "string",
          description: "ID of the element to anchor to",
        },
        body: { type: "string", description: "The comment message text" },
        author: {
          type: "string",
          description: "Author of the comment (default: 'AI Assistant')",
        },
        anchor: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description:
            "Relative anchor offset from element origin (default: {x: 0, y: 0})",
        },
      },
      required: ["boardId", "elementId", "body"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      const threadId = `thread-${Math.random().toString(36).slice(2, 9)}`;
      const result = applyDiff(doc, {
        comments: {
          createThread: [
            {
              id: threadId,
              elementId: String(args.elementId),
              body: String(args.body),
              author: args.author ? String(args.author) : "AI Assistant",
              anchor: args.anchor,
            },
          ],
        },
      });

      return {
        success: true,
        threadId,
        changed: result.changed,
      };
    },
  });

  // Alias: comment_create
  tools.set("comment_create", tools.get("comment_thread_create")!);

  // 8. comment_thread_reply
  tools.set("comment_thread_reply", {
    name: "comment_thread_reply",
    description: "Post a reply to an existing comment thread on a board.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "ID of the board" },
        threadId: {
          type: "string",
          description: "ID of the thread to reply to",
        },
        body: { type: "string", description: "The reply message text" },
        author: {
          type: "string",
          description: "Author of the reply (default: 'AI Assistant')",
        },
      },
      required: ["boardId", "threadId", "body"],
    },
    execute: async (args) => {
      const boardId = String(args.boardId);
      const doc = await store.getBoard(boardId);
      if (!doc) {
        throw new Error(`Board "${boardId}" not found.`);
      }

      const threadId = String(args.threadId);
      const result = applyDiff(doc, {
        comments: {
          replyThread: [
            {
              threadId,
              body: String(args.body),
              author: args.author ? String(args.author) : "AI Assistant",
            },
          ],
        },
      });

      return {
        success: true,
        threadId,
        changed: result.changed,
      };
    },
  });

  // Alias: comment_reply
  tools.set("comment_reply", tools.get("comment_thread_reply")!);

  return tools;
};
