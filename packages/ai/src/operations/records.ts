/**
 * Text-to-records operation.
 *
 * Converts unstructured text (meeting notes, task lists, specifications) into
 * structured rows conforming to a collection's property schema.
 */
import { generateKeyBetween } from "@firo/fractional-indexing";

import { asFractionalIndex } from "@firo/schema";

import type { Column, FieldValue, FiroRecord } from "@firo/schema";

import type { Mutation } from "@firo/doc";

import { textToProseMirrorDoc } from "./utils.js";

import type {
  LlmClient,
  TextToRecordsOptions,
  TextToRecordsResult,
} from "../types.js";

type RawRecordRow = Record<string, unknown>;

type RawRecordsResponse = {
  records?: RawRecordRow[];
};

function formatColumnTypeGuide(col: Column): string {
  let guide = `${col.key} (${col.name}): type ${col.type}`;
  if (col.type === "singleSelect" || col.type === "multiSelect") {
    if (col.options && col.options.length > 0) {
      const opts = col.options.map((o) => `"${o.name}"`).join(", ");
      guide += ` [Allowed options: ${opts}]`;
    }
  }
  return guide;
}

function coerceFieldValue(col: Column, rawVal: unknown): FieldValue {
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
        // Attempt case-insensitive match
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
  }
}

/**
 * Parses unstructured text and creates structured FiroRecord entries matching
 * the target collection's schema.
 */
export async function textToRecords(
  options: TextToRecordsOptions,
  client: LlmClient,
): Promise<TextToRecordsResult> {
  const { collection, text } = options;

  if (!text.trim()) {
    return {
      collectionId: collection.id,
      records: [],
      mutations: [],
    };
  }

  const columnsGuide = collection.columns
    .map((c) => `- ${formatColumnTypeGuide(c)}`)
    .join("\n");

  const prompt = `You are an AI assistant parsing unstructured text into a structured database collection.

Collection: "${collection.name}"
Columns:
${columnsGuide}

Source Text:
"""
${text}
"""

Extract all entities, tasks, or items described in the source text into rows.
Each row must be an object where keys strictly match the Column keys listed above.

Respond with a JSON object conforming to:
{
  "records": [
    {
      "<columnKey>": "<extractedValue>"
    }
  ]
}
Return JSON only.`;

  const raw = await client.completeJson<RawRecordsResponse>(prompt);
  const rawRows = raw.records ?? [];

  const now = Date.now();
  let prevOrder: string | null = null;
  const records: FiroRecord[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const values: Record<string, FieldValue> = {};

    for (const col of collection.columns) {
      const rawVal = row[col.key];
      values[col.key] = coerceFieldValue(col, rawVal);
    }

    const order = asFractionalIndex(generateKeyBetween(prevOrder, null));
    prevOrder = order;

    const recordId = `rec-${collection.id}-${now}-${i + 1}`;
    records.push({
      id: recordId,
      collectionId: collection.id,
      values,
      created: now,
      updated: now,
      order,
      archived: false,
    });
  }

  const mutations: Mutation[] =
    records.length > 0
      ? [
          {
            kind: "createRecords",
            records,
          },
        ]
      : [];

  return {
    collectionId: collection.id,
    records,
    mutations,
  };
}
