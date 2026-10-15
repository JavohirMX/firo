/**
 * Converts Miro board items into valid Firo schema elements and boards.
 *
 * Handles:
 * - sticky notes (with color mapping and text cleaning)
 * - shapes (rectangles, rounded rectangles, ellipses, diamonds)
 * - standalone text
 * - frames and containment hierarchy
 * - connectors / arrows with endpoint bindings
 * - image resolution from Miro .rtb backup archives
 */
import { hashBytes } from "@firo/doc";

import { miroHtmlToPlainText } from "./htmlToText";

import type { MiroBoardMeta, MiroItem, MiroResourceMeta } from "./types";

const MIRO_COLOR_MAP: Readonly<Record<string, string>> = {
  light_yellow: "#fff9b8",
  yellow: "#fbf34c",
  orange: "#ffc470",
  light_green: "#d5f692",
  green: "#8fd14f",
  dark_green: "#0ca789",
  cyan: "#a6e3e9",
  blue: "#70b4ff",
  dark_blue: "#2d9cdb",
  violet: "#c5a3ff",
  magenta: "#ea7ae5",
  pink: "#ffb2d8",
  red: "#f2647c",
  gray: "#d0d0d0",
  light_gray: "#f0f0f0",
  black: "#333333",
  white: "#ffffff",
  transparent: "transparent",
};

/** Normalize a Miro color string (name or hex) to a CSS hex/string. */
export const normalizeMiroColor = (
  color: string | undefined,
  defaultColor = "transparent",
): string => {
  if (!color) {
    return defaultColor;
  }
  const lower = color.toLowerCase().trim();
  if (lower in MIRO_COLOR_MAP) {
    return MIRO_COLOR_MAP[lower];
  }
  if (lower.startsWith("#") || lower.startsWith("rgb")) {
    return lower;
  }
  return defaultColor;
};

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

const extractBounds = (item: MiroItem): Bounds => {
  const width = Math.max(10, item.geometry?.width ?? item.width ?? 150);
  const height = Math.max(10, item.geometry?.height ?? item.height ?? 150);
  const rawX = item.position?.x ?? item.x ?? 0;
  const rawY = item.position?.y ?? item.y ?? 0;
  const origin = item.position?.origin ?? "center";
  const angle =
    (item.geometry?.rotation ?? item.rotation ?? 0) * (Math.PI / 180);

  // In Miro, origin is center by default. In Firo, (x, y) is top-left.
  const x = origin === "top-left" ? rawX : rawX - width / 2;
  const y = origin === "top-left" ? rawY : rawY - height / 2;

  return { x, y, width, height, angle };
};

export interface ConvertedAsset {
  hash: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface MiroConversionResult {
  board: {
    elementSchemaVersion: number;
    recordSchemaVersion: number;
    elementOrder: string[];
    elements: Record<string, unknown>[];
    collections: unknown[];
    records: unknown[];
    meta: {
      name: string;
    };
  };
  assetsToPut: Map<string, ConvertedAsset>;
  warnings: string[];
}

export interface ConvertMiroOptions {
  boardMeta?: MiroBoardMeta;
  resources?: MiroResourceMeta[];
  mediaFiles?: ReadonlyMap<string, Uint8Array>;
}

export const convertMiroItemsToFiro = async (
  items: readonly MiroItem[],
  options: ConvertMiroOptions = {},
): Promise<MiroConversionResult> => {
  const warnings: string[] = [];
  const elements: Record<string, unknown>[] = [];
  const elementOrder: string[] = [];
  const assetsToPut = new Map<string, ConvertedAsset>();

  // Map Miro item ID to Firo element ID
  const idMap = new Map<string, string>();
  for (const item of items) {
    if (item.id) {
      idMap.set(String(item.id), String(item.id));
    }
  }

  // Pre-index media files by resource ID or basename
  const mediaByResourceId = new Map<
    string,
    { bytes: Uint8Array; ext: string }
  >();
  if (options.mediaFiles) {
    for (const [filename, bytes] of options.mediaFiles) {
      // Filename in RTB is usually "<resourceId>.<ext>"
      const match = filename.match(/^(\d+)(?:\.([^.]+))?$/);
      if (match) {
        mediaByResourceId.set(match[1], {
          bytes,
          ext: match[2]?.toLowerCase() ?? "png",
        });
      }
      mediaByResourceId.set(filename, {
        bytes,
        ext: filename.split(".").pop()?.toLowerCase() ?? "png",
      });
    }
  }

  // First pass: identify frames so child elements can link containerId/frameId
  const frameIds = new Set<string>();
  for (const item of items) {
    if (item.type === "frame") {
      frameIds.add(String(item.id));
    }
  }

  // Process items in order
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = String(item.id || `miro_${i}`);
    const bounds = extractBounds(item);
    const parentId = item.parentId ? String(item.parentId) : null;
    const isInsideFrame = parentId && frameIds.has(parentId);

    const baseFields = {
      id,
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: isInsideFrame ? parentId : null,
      containerId: isInsideFrame ? parentId : null,
      bindings: [],
      opacity: item.style?.fillOpacity
        ? Number(item.style.fillOpacity) * 100
        : 100,
      roughness: 0,
      strokeWidth: item.style?.borderWidth ? Number(item.style.borderWidth) : 1,
      strokeStyle:
        item.style?.borderStyle === "dashed"
          ? "dashed"
          : item.style?.borderStyle === "dotted"
          ? "dotted"
          : "solid",
      fillStyle: "solid",
      created: Date.now(),
      updated: Date.now(),
    };

    switch (item.type) {
      case "sticky_note": {
        const text = miroHtmlToPlainText(item.data?.content ?? item.content);
        const bg = normalizeMiroColor(item.style?.fillColor, "#fff9b8");
        elements.push({
          ...baseFields,
          ...bounds,
          type: "stickynote",
          text,
          fontSize: 20,
          fontFamily: 1,
          textAlign: item.style?.textAlign ?? "left",
          verticalAlign: item.style?.textAlignVertical ?? "top",
          backgroundColor: bg,
          strokeColor: "#1e1e1e",
          isContainer: false,
        });
        elementOrder.push(id);
        break;
      }

      case "shape": {
        const shapeType = String(
          item.data?.shape ?? item.shape ?? "rectangle",
        ).toLowerCase();
        let firoType: "rectangle" | "ellipse" | "diamond" = "rectangle";
        let roundness: { type: number } | null = null;

        if (shapeType === "circle" || shapeType === "oval") {
          firoType = "ellipse";
        } else if (shapeType === "rhombus" || shapeType === "diamond") {
          firoType = "diamond";
        } else if (shapeType === "round_rectangle") {
          firoType = "rectangle";
          roundness = { type: 3 }; // PROPORTIONAL_RADIUS
        }

        const bg = normalizeMiroColor(item.style?.fillColor, "transparent");
        const stroke = normalizeMiroColor(item.style?.borderColor, "#1e1e1e");
        elements.push({
          ...baseFields,
          ...bounds,
          type: firoType,
          backgroundColor: bg,
          strokeColor: stroke,
          roundness,
        });
        elementOrder.push(id);

        // If the shape has text content, create an accompanying text element
        const contentText = miroHtmlToPlainText(
          item.data?.content ?? item.content,
        );
        if (contentText) {
          const textId = `${id}_text`;
          elements.push({
            ...baseFields,
            id: textId,
            x: bounds.x + 10,
            y: bounds.y + bounds.height / 2 - 12,
            width: Math.max(10, bounds.width - 20),
            height: 24,
            angle: bounds.angle,
            type: "text",
            text: contentText,
            fontSize: 16,
            fontFamily: 1,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            containerId: id,
          });
          elementOrder.push(textId);
        }
        break;
      }

      case "text": {
        const text = miroHtmlToPlainText(item.data?.content ?? item.content);
        const color = normalizeMiroColor(item.style?.color, "#1e1e1e");
        const fontSize = item.style?.fontSize
          ? Number(item.style.fontSize)
          : 20;

        elements.push({
          ...baseFields,
          ...bounds,
          type: "text",
          text,
          fontSize: isNaN(fontSize) ? 20 : fontSize,
          fontFamily: 1,
          textAlign: item.style?.textAlign ?? "left",
          verticalAlign: item.style?.textAlignVertical ?? "top",
          strokeColor: color,
          backgroundColor: "transparent",
        });
        elementOrder.push(id);
        break;
      }

      case "frame": {
        const title = item.data?.title ?? item.title ?? "Frame";
        elements.push({
          ...baseFields,
          ...bounds,
          type: "frame",
          name: title,
          backgroundColor: normalizeMiroColor(
            item.style?.fillColor,
            "transparent",
          ),
          strokeColor: "#999999",
        });
        elementOrder.push(id);
        break;
      }

      case "connector":
      case "line": {
        const startTarget = item.start?.item ?? item.startItem?.id;
        const endTarget = item.end?.item ?? item.endItem?.id;
        const stroke = normalizeMiroColor(item.style?.strokeColor, "#1e1e1e");

        // Compute start and end points
        const p1x = 0;
        const p1y = 0;
        const p2x = bounds.width;
        const p2y = bounds.height;

        const bindings = [];
        if (startTarget && idMap.has(String(startTarget))) {
          bindings.push({
            elementId: String(startTarget),
            focus: 0,
            gap: 1,
          });
        }
        if (endTarget && idMap.has(String(endTarget))) {
          bindings.push({
            elementId: String(endTarget),
            focus: 0,
            gap: 1,
          });
        }

        elements.push({
          ...baseFields,
          ...bounds,
          type: "arrow",
          points: [
            [p1x, p1y],
            [p2x, p2y],
          ],
          strokeColor: stroke,
          backgroundColor: "transparent",
          startArrowhead: null,
          endArrowhead: "arrow",
          bindings,
        });
        elementOrder.push(id);
        break;
      }

      case "image": {
        let fileId: string | null = null;
        let status: "pending" | "saved" = "pending";

        const resId = String(item.resourceId ?? item.data?.resourceId ?? "");
        const matched = mediaByResourceId.get(resId);

        if (matched) {
          const buffer = matched.bytes.buffer.slice(
            matched.bytes.byteOffset,
            matched.bytes.byteOffset + matched.bytes.byteLength,
          ) as ArrayBuffer;
          const hash = await hashBytes(buffer);
          const mimeType =
            matched.ext === "jpg" || matched.ext === "jpeg"
              ? "image/jpeg"
              : matched.ext === "svg"
              ? "image/svg+xml"
              : "image/png";

          assetsToPut.set(hash, {
            hash,
            bytes: matched.bytes,
            mimeType,
          });
          fileId = hash;
          status = "saved";
        }

        elements.push({
          ...baseFields,
          ...bounds,
          type: "image",
          fileId,
          status,
          scale: [1, 1],
          crop: null,
          backgroundColor: "transparent",
          strokeColor: "transparent",
        });
        elementOrder.push(id);
        break;
      }

      case "card": {
        const title = item.data?.title ?? item.title ?? "";
        const desc = miroHtmlToPlainText(item.data?.description);
        const cardText = desc ? `${title}\n\n${desc}` : title;
        elements.push({
          ...baseFields,
          ...bounds,
          type: "stickynote",
          text: cardText,
          fontSize: 16,
          fontFamily: 1,
          textAlign: "left",
          verticalAlign: "top",
          backgroundColor: "#ffffff",
          strokeColor: "#2d9cdb",
          isContainer: false,
        });
        elementOrder.push(id);
        break;
      }

      default:
        warnings.push(`Unsupported Miro item type "${item.type}" (id: ${id})`);
    }
  }

  const boardName = options.boardMeta?.name ?? "Imported Miro Board";

  return {
    board: {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder,
      elements,
      collections: [],
      records: [],
      meta: {
        name: boardName,
      },
    },
    assetsToPut,
    warnings,
  };
};
