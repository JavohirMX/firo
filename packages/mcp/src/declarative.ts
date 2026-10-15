/**
 * Declarative board format for Firo (Phase 10.2).
 *
 * Exposes a Firo whiteboard as a structured, diffable document where
 * every element, collection, record, and comment carries a stable `id`.
 */

import { generateKeyBetween } from "@firo/fractional-indexing";
import {
  CURRENT_ELEMENT_VERSION,
  firoTextSchema,
  isProseMirrorDoc,
  migrateElement,
  proseMirrorToPlainText,
  RepairLog,
} from "@firo/schema";

import type {
  Arrowhead,
  Binding,
  Column,
  CommentEntry,
  ElementType,
  FieldValue,
  FillStyle,
  FiroDoc,
  FiroElement,
  GroupId,
  Radians,
  RoundnessType,
  StrokeStyle,
} from "./types.js";

export interface DeclarativeElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roundness?: null | { type: RoundnessType; value?: number };
  roughness?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  containerId?: string | null;
  frameId?: string | null;
  groupIds?: readonly string[];
  bindings?: readonly Binding[];
  points?: readonly (readonly [number, number])[];
  tags?: readonly string[];
  customData?: Record<string, unknown>;
  locked?: boolean;
  link?: string | null;
  isDeleted?: boolean;
  name?: string | null;
  elbowed?: boolean;
  startArrowhead?: Arrowhead | null;
  endArrowhead?: Arrowhead | null;
}

export interface DeclarativeCollection {
  id: string;
  name: string;
  columns: readonly Column[];
  order?: string;
}

export interface DeclarativeRecord {
  id: string;
  collectionId: string;
  values: Record<string, unknown>;
  order?: string;
  archived?: boolean;
}

export interface DeclarativeCommentThread {
  id: string;
  elementId: string;
  anchor?: { x: number; y: number };
  comments: readonly CommentEntry[];
  resolved: boolean;
  author: string;
  createdAt: number;
  updatedAt?: number;
}

export interface DeclarativeBoard {
  id: string;
  title: string;
  elements: DeclarativeElement[];
  collections: DeclarativeCollection[];
  records: DeclarativeRecord[];
  comments: DeclarativeCommentThread[];
  meta?: Record<string, unknown>;
}

/** Converts plain text into a valid ProseMirrorDoc JSON. */
export const plainTextToProseMirrorDoc = (text: string) => {
  const paragraphs = text.split("\n");
  const pNodes = paragraphs.map((p) =>
    firoTextSchema.node("paragraph", null, p ? [firoTextSchema.text(p)] : []),
  );
  return firoTextSchema
    .node(
      "doc",
      null,
      pNodes.length ? pNodes : [firoTextSchema.node("paragraph", null, [])],
    )
    .toJSON();
};

/** Extracts plain text from an element, whether stored as string or ProseMirrorDoc. */
export const extractElementText = (element: FiroElement): string => {
  if (element.type === "stickynote" || element.type === "text") {
    return element.text ?? "";
  }
  if (element.text && isProseMirrorDoc(element.text)) {
    try {
      return proseMirrorToPlainText(element.text);
    } catch {
      return "";
    }
  }
  return "";
};

/**
 * Serialize a live FiroDoc into declarative board representation.
 */
export const serializeDocToDeclarative = (
  doc: FiroDoc,
  options?: {
    boardId?: string;
    title?: string;
    includeDeleted?: boolean;
  },
): DeclarativeBoard => {
  const snapshot = doc.read();
  const meta = snapshot.meta ?? {};
  const boardId =
    options?.boardId ??
    (typeof meta.id === "string" ? meta.id : "board-active");
  const boardTitle =
    options?.title ??
    (typeof meta.name === "string" ? meta.name : "Untitled Board");

  const elements: DeclarativeElement[] = [];

  for (const el of snapshot.elements) {
    if (!options?.includeDeleted && el.isDeleted) {
      continue;
    }

    const decl: DeclarativeElement = {
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      angle: el.angle,
      strokeColor: el.strokeColor,
      backgroundColor: el.backgroundColor,
      fillStyle: el.fillStyle,
      strokeWidth: el.strokeWidth,
      strokeStyle: el.strokeStyle,
      roundness: el.roundness,
      roughness: el.roughness,
      opacity: el.opacity,
      containerId: el.containerId,
      frameId: el.frameId,
      groupIds: el.groupIds,
      bindings: el.bindings,
      tags: el.tags,
      customData: el.customData,
      locked: el.locked,
      link: el.link,
      isDeleted: el.isDeleted,
    };

    const text = extractElementText(el);
    if (text) {
      decl.text = text;
    }

    if ("fontSize" in el) {
      decl.fontSize = el.fontSize;
    }
    if ("fontFamily" in el) {
      decl.fontFamily = el.fontFamily;
    }
    if ("textAlign" in el) {
      decl.textAlign = el.textAlign;
    }
    if ("verticalAlign" in el) {
      decl.verticalAlign = el.verticalAlign;
    }
    if ("points" in el && el.points) {
      decl.points = el.points;
    }
    if ("name" in el) {
      decl.name = el.name;
    }
    if ("elbowed" in el) {
      decl.elbowed = el.elbowed;
    }
    if ("startArrowhead" in el) {
      decl.startArrowhead = el.startArrowhead;
    }
    if ("endArrowhead" in el) {
      decl.endArrowhead = el.endArrowhead;
    }

    elements.push(decl);
  }

  const collections: DeclarativeCollection[] = snapshot.collections.map(
    (c) => ({
      id: c.id,
      name: c.name,
      columns: c.columns,
      order: c.order,
    }),
  );

  const records: DeclarativeRecord[] = snapshot.records.map((r) => {
    const rawValues: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(r.values)) {
      if (val && typeof val === "object" && "type" in val && "value" in val) {
        if (val.type === "richText" && isProseMirrorDoc(val.value)) {
          rawValues[key] = proseMirrorToPlainText(val.value);
        } else {
          rawValues[key] = (val as FieldValue).value;
        }
      } else {
        rawValues[key] = val;
      }
    }
    return {
      id: r.id,
      collectionId: r.collectionId,
      values: rawValues,
      order: r.order,
      archived: r.archived,
    };
  });

  const comments: DeclarativeCommentThread[] = snapshot.comments.map((th) => ({
    id: th.id,
    elementId: th.elementId,
    anchor: th.anchor,
    comments: th.comments,
    resolved: th.resolved,
    author: th.author,
    createdAt: th.createdAt,
    updatedAt: th.updatedAt,
  }));

  return {
    id: boardId,
    title: boardTitle,
    elements,
    collections,
    records,
    comments,
    meta,
  };
};

/**
 * Converts a DeclarativeElement into a fully-typed and schema-validated FiroElement.
 */
export const declarativeElementToFiro = (
  decl: DeclarativeElement,
  options?: { fallbackIndex?: string },
): FiroElement => {
  const index = options?.fallbackIndex ?? generateKeyBetween(null, null);

  const base: Record<string, unknown> = {
    id: decl.id,
    type: decl.type,
    x: decl.x ?? 0,
    y: decl.y ?? 0,
    width: decl.width ?? (decl.type === "stickynote" ? 200 : 100),
    height: decl.height ?? (decl.type === "stickynote" ? 200 : 100),
    angle: (decl.angle ?? 0) as Radians,
    strokeColor: decl.strokeColor ?? "#1e1e1e",
    backgroundColor:
      decl.backgroundColor ??
      (decl.type === "stickynote" ? "#fff9b1" : "transparent"),
    fillStyle: decl.fillStyle ?? "solid",
    strokeWidth: decl.strokeWidth ?? 2,
    strokeStyle: decl.strokeStyle ?? "solid",
    roundness: decl.roundness ?? null,
    roughness: decl.roughness ?? 1,
    opacity: decl.opacity ?? 100,
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    index,
    created: Date.now(),
    updated: Date.now(),
    isDeleted: decl.isDeleted ?? false,
    groupIds: decl.groupIds ? (decl.groupIds as GroupId[]) : [],
    frameId: decl.frameId ?? null,
    containerId: decl.containerId ?? null,
    bindings: decl.bindings ?? [],
    link: decl.link ?? null,
    locked: decl.locked ?? false,
    tags: decl.tags ?? [],
  };

  if (decl.customData) {
    base.customData = decl.customData;
  }

  if (decl.type === "stickynote") {
    base.text = decl.text ?? "";
    base.fontSize = decl.fontSize ?? 20;
    base.fontFamily = decl.fontFamily ?? 1;
    base.textAlign = decl.textAlign ?? "center";
    base.verticalAlign = decl.verticalAlign ?? "middle";
    base.isContainer = false;
  } else if (decl.type === "text") {
    base.text = decl.text ?? "";
    base.fontSize = decl.fontSize ?? 20;
    base.fontFamily = decl.fontFamily ?? 1;
    base.textAlign = decl.textAlign ?? "left";
    base.verticalAlign = decl.verticalAlign ?? "top";
    base.autoResize = true;
    base.lineHeight = 1.25;
  } else if (decl.type === "arrow" || decl.type === "line") {
    base.points = decl.points ?? [
      [0, 0],
      [decl.width || 100, decl.height || 100],
    ];
    base.startArrowhead = decl.startArrowhead ?? null;
    base.endArrowhead =
      decl.endArrowhead ?? (decl.type === "arrow" ? "arrow" : null);
    base.elbowed = decl.elbowed ?? false;
  } else if (decl.type === "frame") {
    base.name = decl.name ?? null;
  } else if (decl.type === "freedraw") {
    base.points = decl.points ?? [[0, 0]];
    base.pressures = [];
    base.simulatePressure = true;
    base.strokeOptions = { variability: "variable", streamline: 0.5 };
  } else if (decl.type === "image") {
    base.fileId = null;
    base.status = "saved";
    base.scale = [1, 1];
    base.crop = null;
  }

  const log = new RepairLog();
  const { element } = migrateElement(base, log, CURRENT_ELEMENT_VERSION);
  return element;
};

/**
 * Render a declarative board into an SVG document with stable data-firo-id attributes.
 */
export const declarativeToSvg = (board: DeclarativeBoard): string => {
  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 600;

  if (board.elements.length > 0) {
    minX = Math.min(...board.elements.map((e) => e.x)) - 50;
    minY = Math.min(...board.elements.map((e) => e.y)) - 50;
    maxX = Math.max(...board.elements.map((e) => e.x + e.width)) + 50;
    maxY = Math.max(...board.elements.map((e) => e.y + e.height)) + 50;
  }

  const width = Math.max(100, maxX - minX);
  const height = Math.max(100, maxY - minY);

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const elementSvgs = board.elements.map((el) => {
    const stroke = el.strokeColor || "#1e1e1e";
    const fill = el.backgroundColor || "transparent";
    const strokeWidth = el.strokeWidth || 2;
    const strokeDash =
      el.strokeStyle === "dashed"
        ? ' stroke-dasharray="6,6"'
        : el.strokeStyle === "dotted"
        ? ' stroke-dasharray="2,2"'
        : "";

    switch (el.type) {
      case "stickynote": {
        const textEscaped = escapeXml(el.text || "");
        return `  <g data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="stickynote" transform="translate(${el.x}, ${el.y})">
    <rect width="${el.width}" height="${
          el.height
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="4" ry="4" filter="drop-shadow(2px 3px 2px rgba(0,0,0,0.15))"/>
    <text x="${el.width / 2}" y="${
          el.height / 2
        }" fill="${stroke}" font-size="${
          el.fontSize || 16
        }" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${textEscaped}</text>
  </g>`;
      }
      case "rectangle": {
        return `  <rect data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="rectangle" x="${el.x}" y="${el.y}" width="${
          el.width
        }" height="${
          el.height
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDash}/>`;
      }
      case "ellipse": {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const rx = el.width / 2;
        const ry = el.height / 2;
        return `  <ellipse data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="ellipse" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDash}/>`;
      }
      case "diamond": {
        const points = `${el.x + el.width / 2},${el.y} ${el.x + el.width},${
          el.y + el.height / 2
        } ${el.x + el.width / 2},${el.y + el.height} ${el.x},${
          el.y + el.height / 2
        }`;
        return `  <polygon data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="diamond" points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDash}/>`;
      }
      case "text": {
        const textEscaped = escapeXml(el.text || "");
        return `  <text data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="text" x="${el.x}" y="${
          el.y + (el.fontSize || 16)
        }" fill="${stroke}" font-size="${
          el.fontSize || 20
        }" font-family="sans-serif">${textEscaped}</text>`;
      }
      case "arrow":
      case "line": {
        const pts =
          el.points && el.points.length > 0
            ? el.points.map(([px, py]) => `${el.x + px},${el.y + py}`).join(" ")
            : `${el.x},${el.y} ${el.x + el.width},${el.y + el.height}`;
        const marker =
          el.type === "arrow" ? ' marker-end="url(#arrowhead)"' : "";
        return `  <polyline data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="${
          el.type
        }" points="${pts}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDash}${marker}/>`;
      }
      case "frame": {
        const nameEscaped = escapeXml(el.name || "Frame");
        return `  <g data-firo-id="${escapeXml(
          el.id,
        )}" data-firo-type="frame" transform="translate(${el.x}, ${el.y})">
    <rect width="${el.width}" height="${
          el.height
        }" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="8" y="-6" fill="${stroke}" font-size="12" font-family="sans-serif">${nameEscaped}</text>
  </g>`;
      }
      default:
        return `  <!-- element ${escapeXml(el.id)} (${el.type}) -->`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#1e1e1e" />
    </marker>
  </defs>
  <style>
    text { user-select: none; }
  </style>
${elementSvgs.join("\n")}
</svg>`;
};
