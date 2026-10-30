/**
 * Local AI engine helper functions and operations adapter for Firo board.
 *
 * Implements §10.1 Local AI UI and Operations.
 * Zero telemetry, zero cloud calls (NFR-3).
 * Every mutation commits atomically to `FiroDoc` and is 100% undoable.
 */
import { createStore, get, set } from "idb-keyval";
import { generateKeyBetween } from "@firo/fractional-indexing";
import {
  asFractionalIndex,
  type Collection,
  type Column,
  type ColumnType,
  type FieldValue,
  type FiroElement,
  type FiroRecord,
  type StickyNoteElement,
} from "@firo/schema";

import {
  applyClustering,
  applyDiagram,
  applyRecords,
  clusterStickyNotes,
  createElementBase,
  createLlmClient,
  executeAiOperation,
  summarizeBoard,
  textToDiagram,
  textToProseMirrorDoc,
  textToRecords,
  type BoardSummaryResult,
  type ClusterOptions,
  type ClusterResult,
  type DiagramResult,
  type LlmClient,
  type LlmProviderType,
} from "@firo/ai";

import type { Radians } from "@firo/math";
import type { CommitResult, FiroDoc, Mutation } from "@firo/doc";

export type AIProvider = LlmProviderType;

export interface AIConfig {
  provider: AIProvider;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "ollama",
  endpoint: "http://localhost:11434",
  model: "llama3:8b",
  apiKey: "",
};

export const aiSettingsStore = createStore("firo", "ai-settings");
export const AI_CONFIG_STORAGE_KEY = "firo:ai:config";

/**
 * Retrieves the persisted AI configuration from IndexedDB / localStorage,
 * or returns the default Ollama configuration.
 */
export async function getAIConfig(): Promise<AIConfig> {
  try {
    const stored = await get<AIConfig>(AI_CONFIG_STORAGE_KEY, aiSettingsStore);
    if (stored) {
      return {
        provider: stored.provider ?? DEFAULT_AI_CONFIG.provider,
        endpoint: stored.endpoint ?? DEFAULT_AI_CONFIG.endpoint,
        model: stored.model ?? DEFAULT_AI_CONFIG.model,
        apiKey: stored.apiKey ?? "",
      };
    }
  } catch {
    // Fall back to localStorage if available
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          provider: parsed.provider ?? DEFAULT_AI_CONFIG.provider,
          endpoint: parsed.endpoint ?? DEFAULT_AI_CONFIG.endpoint,
          model: parsed.model ?? DEFAULT_AI_CONFIG.model,
          apiKey: parsed.apiKey ?? "",
        };
      }
    } catch {
      // Ignore
    }
  }

  return { ...DEFAULT_AI_CONFIG };
}

/**
 * Updates and persists the AI configuration to storage.
 */
export async function setAIConfig(
  config: Partial<AIConfig>,
): Promise<AIConfig> {
  const current = await getAIConfig();
  const updated: AIConfig = {
    provider: config.provider ?? current.provider,
    endpoint: config.endpoint ?? current.endpoint,
    model: config.model ?? current.model,
    apiKey: config.apiKey ?? current.apiKey,
  };

  try {
    await set(AI_CONFIG_STORAGE_KEY, updated, aiSettingsStore);
  } catch {
    // Ignore IDB errors in restricted environments
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        AI_CONFIG_STORAGE_KEY,
        JSON.stringify(updated),
      );
    } catch {
      // Ignore
    }
  }

  return updated;
}

/**
 * Creates an LlmClient instance from given or persisted configuration.
 */
export function createConfiguredAIClient(
  config?: Partial<AIConfig>,
  fetchFn?: typeof fetch,
): LlmClient {
  return createLlmClient({
    provider: config?.provider ?? DEFAULT_AI_CONFIG.provider,
    baseUrl: config?.endpoint ?? DEFAULT_AI_CONFIG.endpoint,
    model: config?.model ?? DEFAULT_AI_CONFIG.model,
    apiKey: config?.apiKey,
    fetchFn,
  });
}

/**
 * Clusters sticky notes by topic or sentiment and arranges them into neat columns
 * as an undoable operation.
 */
export async function executeClusterStickies(
  doc: FiroDoc,
  stickies: readonly FiroElement[],
  options?: ClusterOptions & { client?: LlmClient },
): Promise<{ result: ClusterResult; commit: CommitResult }> {
  const client =
    options?.client ?? createConfiguredAIClient(await getAIConfig());

  const result = await clusterStickyNotes(stickies, client, options);
  const commit = applyClustering(doc, result);
  return { result, commit };
}

/**
 * Extracts text from canvas elements and creates a summary sticky note on canvas
 * as an undoable operation.
 */
export async function executeSummarize(
  doc: FiroDoc,
  elements: readonly FiroElement[],
  options?: {
    position?: { x: number; y: number };
    client?: LlmClient;
  },
): Promise<{
  result: BoardSummaryResult;
  element: StickyNoteElement;
  commit: CommitResult;
}> {
  const client =
    options?.client ?? createConfiguredAIClient(await getAIConfig());

  const summary = await summarizeBoard(elements, client);

  // Position calculation: place near the right or bottom of selected elements,
  // or use explicit position
  let x = options?.position?.x;
  let y = options?.position?.y;

  if (x === undefined || y === undefined) {
    const nonDeleted = elements.filter((e) => !e.isDeleted);
    if (nonDeleted.length > 0) {
      const maxX = Math.max(...nonDeleted.map((e) => e.x + e.width));
      const minY = Math.min(...nonDeleted.map((e) => e.y));
      x = maxX + 40;
      y = minY;
    } else {
      x = 100;
      y = 100;
    }
  }

  const summaryContent =
    summary.overview || summary.markdown || "No summary available.";
  const summaryText = summary.title
    ? `${summary.title}\n\n${summaryContent}`
    : summaryContent;

  const noteId = `ai-summary-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const now = Date.now();

  const note: StickyNoteElement = {
    ...createElementBase(noteId, "stickynote", {
      x,
      y,
      width: 250,
      height: 250,
      angle: 0 as Radians,
    }),
    type: "stickynote",
    isContainer: false,
    text: summaryText,
    backgroundColor: "#e8d5ff",
    strokeColor: "#1e1e1e",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    created: now,
    updated: now,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    index: asFractionalIndex(generateKeyBetween(null, null)),
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
  };

  const commit = executeAiOperation(doc, [
    {
      kind: "createElement",
      element: note,
    },
  ]);

  return { result: summary, element: note, commit };
}

/**
 * Creates flowchart shapes and connectors from a text prompt as an undoable operation.
 */
export async function executeGenerateDiagram(
  doc: FiroDoc,
  prompt: string,
  position?: { x: number; y: number },
  options?: {
    client?: LlmClient;
    direction?: "top-to-bottom" | "left-to-right";
  },
): Promise<{ result: DiagramResult; commit: CommitResult }> {
  const client =
    options?.client ?? createConfiguredAIClient(await getAIConfig());

  const result = await textToDiagram(prompt, client, {
    originX: position?.x ?? 100,
    originY: position?.y ?? 100,
    direction: options?.direction ?? "top-to-bottom",
  });

  const commit = applyDiagram(doc, result);
  return { result, commit };
}

function coerceColumnValue(col: Column, rawVal: unknown): FieldValue {
  if (rawVal === undefined || rawVal === null) {
    switch (col.type) {
      case "text":
        return { type: "text", value: "" };
      case "number":
        return { type: "number", value: 0 };
      case "boolean":
        return { type: "boolean", value: false };
      case "singleSelect":
        return { type: "singleSelect", value: null };
      case "multiSelect":
        return { type: "multiSelect", value: [] };
      case "date":
        return { type: "date", value: null };
      case "person":
        return { type: "person", value: null };
      case "link":
        return { type: "link", value: null };
      case "richText":
        return { type: "richText", value: textToProseMirrorDoc("") };
      // A relation has no text-derived default: unknown parent means root.
      case "relation":
        return { type: "relation", value: null };
    }
  }

  switch (col.type) {
    case "text":
      return { type: "text", value: String(rawVal) };

    case "number": {
      const num =
        typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
      return { type: "number", value: isNaN(num) ? 0 : num };
    }

    case "boolean": {
      if (typeof rawVal === "boolean") {
        return { type: "boolean", value: rawVal };
      }
      const s = String(rawVal).toLowerCase();
      return {
        type: "boolean",
        value: s === "true" || s === "yes" || s === "1",
      };
    }

    case "singleSelect": {
      const valStr = String(rawVal).trim();
      if (!valStr) {
        return { type: "singleSelect", value: null };
      }
      if (col.options && col.options.length > 0) {
        const matched = col.options.find(
          (o) => o.name.toLowerCase() === valStr.toLowerCase(),
        );
        return {
          type: "singleSelect",
          value: matched ? matched.name : valStr,
        };
      }
      return { type: "singleSelect", value: valStr };
    }

    case "multiSelect": {
      const items = Array.isArray(rawVal) ? rawVal : [rawVal];
      const selected = items.map((i) => String(i).trim()).filter(Boolean);
      return { type: "multiSelect", value: selected };
    }

    case "date": {
      const dateStr = String(rawVal).trim();
      return { type: "date", value: dateStr || null };
    }

    case "person": {
      const personStr = String(rawVal).trim();
      return { type: "person", value: personStr || null };
    }

    case "link": {
      const linkStr = String(rawVal).trim();
      return { type: "link", value: linkStr || null };
    }

    case "richText":
      return {
        type: "richText",
        value: textToProseMirrorDoc(String(rawVal)),
      };

    // A raw AI value cannot name a parent record id reliably; root it.
    case "relation":
      return { type: "relation", value: null };
  }
}

export interface GenerateTableResult {
  collection: Collection;
  records: readonly FiroRecord[];
  commit: CommitResult;
}

/**
 * Creates typed records collection from text prompt as an undoable operation.
 * If collectionId is provided, appends records to that collection;
 * otherwise defines a new collection and creates records inside it atomically.
 */
export async function executeGenerateTable(
  doc: FiroDoc,
  prompt: string,
  options?: {
    collectionId?: string;
    collectionName?: string;
    client?: LlmClient;
  },
): Promise<GenerateTableResult> {
  const client =
    options?.client ?? createConfiguredAIClient(await getAIConfig());

  const snapshot = doc.read();
  const existingCollection = options?.collectionId
    ? snapshot.collections?.find((c) => c.id === options.collectionId)
    : undefined;

  if (existingCollection) {
    const recResult = await textToRecords(
      { collection: existingCollection, text: prompt },
      client,
    );
    const commit = applyRecords(doc, recResult);
    return {
      collection: existingCollection,
      records: recResult.records,
      commit,
    };
  }

  // Generate collection schema and records from prompt
  const schemaPrompt = `You are an AI assistant generating a structured data table.
Given the description below, define a collection with appropriate columns and extract rows.

User description:
"""${prompt}"""

Respond with a JSON object in this exact schema:
{
  "name": "Collection Name",
  "columns": [
    {
      "key": "unique_column_key",
      "name": "Display Column Name",
      "type": "text" | "number" | "boolean" | "singleSelect" | "date"
    }
  ],
  "records": [
    {
      "<columnKey>": "<value>"
    }
  ]
}
Return JSON only.`;

  type RawTableGen = {
    name?: string;
    columns?: Array<{
      key: string;
      name: string;
      type: ColumnType;
      options?: Array<{ id: string; name: string }>;
    }>;
    records?: Array<Record<string, unknown>>;
  };

  const raw = await client.completeJson<RawTableGen>(schemaPrompt);
  const now = Date.now();
  const collectionId = `col-ai-${now}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const collectionName =
    options?.collectionName || raw.name || "Generated Table";

  const columns: Column[] =
    raw.columns && raw.columns.length > 0
      ? raw.columns.map((c, idx) => ({
          id: `col-${c.key || idx}`,
          key: c.key || `col_${idx}`,
          name: c.name || `Column ${idx + 1}`,
          type: c.type || "text",
          ...(c.options
            ? {
                options: c.options.map((o) => ({
                  id: o.id || o.name,
                  name: o.name,
                  color: "#5b4bff",
                })),
              }
            : {}),
        }))
      : [
          { id: "col-title", key: "title", name: "Title", type: "text" },
          { id: "col-status", key: "status", name: "Status", type: "text" },
        ];

  const collection: Collection = {
    id: collectionId,
    boardId: (snapshot as any).boardId ?? "default",
    name: collectionName,
    columns,
    order: asFractionalIndex(generateKeyBetween(null, null)),
    version: 1,
  };

  const rawRows = raw.records ?? [];
  let prevOrder: string | null = null;
  const records: FiroRecord[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const values: Record<string, FieldValue> = {};
    for (const col of columns) {
      const rawVal = row[col.key];
      values[col.key] = coerceColumnValue(col, rawVal);
    }
    const order = asFractionalIndex(generateKeyBetween(prevOrder, null));
    prevOrder = order;
    records.push({
      id: `rec-${collectionId}-${now}-${i + 1}`,
      collectionId,
      values,
      created: now,
      updated: now,
      order,
      archived: false,
    });
  }

  const mutations: Mutation[] = [
    { kind: "createCollection", collection },
    ...(records.length > 0
      ? [{ kind: "createRecords", records } as const]
      : []),
  ];

  const commit = executeAiOperation(doc, mutations);
  return { collection, records, commit };
}
