/**
 * RFC 4180 compliant CSV parser and serializer for Firo sticky notes and database records.
 */
import { DEFAULT_FONT_FAMILY } from "@firo/common";

import type { FiroElement, StickyNoteElement } from "@firo/schema";

/**
 * Escapes a cell according to RFC 4180 rules:
 * - If value contains comma, double quote, or newline, enclose in double quotes.
 * - Double quotes inside are escaped by doubling them ("").
 */
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Serializes rows of cells into an RFC 4180 compliant CSV string.
 */
export const serializeCsv = (rows: readonly (readonly unknown[])[]): string => {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
};

/**
 * Parses an RFC 4180 CSV string into headers and rows of strings.
 * Accurately handles multiline quoted strings and escaped double quotes.
 */
export const parseCsv = (
  csvText: string,
): { headers: string[]; rows: string[][] } => {
  const clean = csvText.trim();
  if (!clean) {
    return { headers: [], rows: [] };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    } else if (char === ",") {
      currentRow.push(currentCell.trim());
      currentCell = "";
      i++;
      continue;
    } else if (char === "\r") {
      if (nextChar === "\n") {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = "";
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      i++;
      continue;
    } else if (char === "\n") {
      currentRow.push(currentCell.trim());
      currentCell = "";
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      i++;
      continue;
    } else {
      currentCell += char;
      i++;
      continue;
    }
  }

  // Push final cell and row
  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
};

/**
 * Export sticky notes and text elements on the canvas to CSV format.
 */
export const exportStickyNotesToCsv = (
  docOrElements:
    | { read: () => { elements: readonly FiroElement[] } }
    | readonly FiroElement[],
): string => {
  const elements =
    "read" in docOrElements && typeof docOrElements.read === "function"
      ? docOrElements.read().elements
      : (docOrElements as readonly FiroElement[]);

  const stickyNotes = elements.filter(
    (e) =>
      !e.isDeleted &&
      (e.type === "stickynote" ||
        (e.type === "text" && (e as any).containerId == null)),
  );

  const headers = [
    "ID",
    "Type",
    "Content",
    "BackgroundColor",
    "TextColor",
    "Tags",
    "FrameId",
    "X",
    "Y",
    "Width",
    "Height",
  ];

  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const el of stickyNotes) {
    const textContent = (el as any).text ?? "";
    const tags = Array.isArray((el as any).tags)
      ? (el as any).tags.join("; ")
      : "";
    const row = [
      el.id,
      el.type,
      textContent,
      el.backgroundColor ?? "",
      el.strokeColor ?? "",
      tags,
      el.frameId ?? "",
      Math.round(el.x),
      Math.round(el.y),
      Math.round(el.width),
      Math.round(el.height),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
};

/**
 * Export database records and collections to CSV format.
 */
export const exportRecordsToCsv = (
  docOrBoard:
    | { read: () => { records: readonly any[]; collections: readonly any[] } }
    | { records: readonly any[]; collections: readonly any[] },
): string => {
  const data: { records?: readonly any[]; collections?: readonly any[] } =
    "read" in docOrBoard && typeof (docOrBoard as any).read === "function"
      ? (docOrBoard as any).read()
      : (docOrBoard as any);
  const records = data.records || [];

  if (records.length === 0) {
    return "ID,CollectionId\r\n";
  }

  // Collect all unique property keys
  const keys = new Set<string>();
  for (const r of records) {
    if (r.values && typeof r.values === "object") {
      for (const k of Object.keys(r.values)) {
        keys.add(k);
      }
    }
  }

  const sortedKeys = Array.from(keys);
  const headers = ["ID", "CollectionId", ...sortedKeys];
  const rows: (string | number)[][] = [headers];

  for (const r of records) {
    const row: (string | number)[] = [
      String(r.id || ""),
      String(r.collectionId || ""),
    ];
    for (const k of sortedKeys) {
      const val = r.values?.[k];
      const cellVal =
        val && typeof val === "object" && "value" in val ? val.value : val;
      row.push(cellVal != null ? String(cellVal) : "");
    }
    rows.push(row);
  }

  return serializeCsv(rows);
};

export interface CsvToStickyNotesOptions {
  originX?: number;
  originY?: number;
  startX?: number;
  startY?: number;
  columns?: number;
  columnGap?: number;
  rowGap?: number;
  cardWidth?: number;
  cardHeight?: number;
  defaultColor?: string;
  color?: string;
}

/**
 * Converts CSV rows into an organized grid of Firo Sticky Note elements.
 */
export const csvToStickyNotes = (
  csvText: string,
  opts?: CsvToStickyNotesOptions,
): StickyNoteElement[] => {
  const { headers, rows } = parseCsv(csvText);
  if (rows.length === 0 && headers.length === 0) {
    return [];
  }

  // If there are no data rows but 1 header row, treat headers as items
  const items = rows.length > 0 ? rows : [headers];

  // Detect which column has the note text
  let contentColIndex = 0;
  let colorColIndex = -1;
  let tagColIndex = -1;

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c].toLowerCase();
    if (
      h.includes("content") ||
      h.includes("text") ||
      h.includes("note") ||
      h.includes("title") ||
      h.includes("description") ||
      h.includes("idea")
    ) {
      contentColIndex = c;
      break;
    }
  }

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c].toLowerCase();
    if (h.includes("color") || h.includes("background")) {
      colorColIndex = c;
    } else if (h.includes("tag")) {
      tagColIndex = c;
    }
  }

  const originX = opts?.startX ?? opts?.originX ?? 0;
  const originY = opts?.startY ?? opts?.originY ?? 0;
  const numColumns = Math.max(1, opts?.columns ?? 5);
  const colGap = opts?.columnGap ?? 20;
  const rowGap = opts?.rowGap ?? 20;
  const width = opts?.cardWidth ?? 200;
  const height = opts?.cardHeight ?? 150;
  const defaultBg = opts?.color ?? opts?.defaultColor ?? "#fff9b8";

  const elements: StickyNoteElement[] = [];
  const timestamp = Date.now();

  const palette = [
    "#fff9b8",
    "#d5f692",
    "#a6e3e9",
    "#ffb2d8",
    "#ffc470",
    "#c5a3ff",
  ];

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const text = row[contentColIndex] ?? row[0] ?? "";
    if (!text.trim()) {
      continue;
    }

    const colIndex = i % numColumns;
    const rowIndex = Math.floor(i / numColumns);
    const x = originX + colIndex * (width + colGap);
    const y = originY + rowIndex * (height + rowGap);

    const color =
      opts?.color ??
      (colorColIndex >= 0 && row[colorColIndex]
        ? row[colorColIndex]
        : palette[i % palette.length] || defaultBg);

    const tags =
      tagColIndex >= 0 && row[tagColIndex]
        ? row[tagColIndex]
            .split(/[;,]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const noteId = `note_csv_${timestamp}_${i}`;

    const fontSize: 16 | 20 | 28 | 36 =
      text.length > 200
        ? 16
        : text.length > 80
        ? 20
        : text.length > 25
        ? 28
        : 36;

    elements.push({
      id: noteId as any,
      type: "stickynote",
      x,
      y,
      width,
      height,
      angle: 0 as any,
      strokeColor: "#1e1e1e",
      backgroundColor: color,
      color,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roundness: null,
      roughness: 0,
      opacity: 100,
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      index: null,
      created: timestamp,
      updated: timestamp,
      groupIds: [],
      frameId: null,
      containerId: null,
      bindings: [],
      link: null,
      locked: false,
      isDeleted: false,
      isContainer: false,
      text,
      fontSize,
      fontFamily: DEFAULT_FONT_FAMILY,
      textAlign: "center",
      verticalAlign: "middle",
      tags: tags.length > 0 ? tags : undefined,
    } as StickyNoteElement);
  }

  return elements;
};
