/**
 * Converts Miro board items into valid Firo schema elements and boards.
 *
 * Handles:
 * - Frame hierarchy and frame-relative coordinate translation
 * - Sticky notes (square and rectangle, dynamic font scaling, contrast text color)
 * - Shapes (rectangles, rounded rectangles, ellipses, diamonds) with bound text
 * - Standalone text with auto-fitting width and alignment
 * - Frames and containment hierarchy
 * - Connectors and lines with real endpoint positions, item bindings, and arrowheads
 * - Multi-strategy image resolution from Miro .rtb backup archives
 * - Layer ordering (frames in background, shapes, images, stickies, text, connectors on top)
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

/** Return white text for dark backgrounds, dark text for light backgrounds. */
export const getContrastingTextColor = (bgColor: string): string => {
  if (!bgColor || bgColor === "transparent") {
    return "#1e1e1e";
  }
  const hex = bgColor.replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 130 ? "#ffffff" : "#1e1e1e";
  }
  return "#1e1e1e";
};

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

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
  const assetsToPut = new Map<string, ConvertedAsset>();

  // Map Miro item ID to Firo element ID
  const idMap = new Map<string, string>();
  for (const item of items) {
    if (item.id) {
      idMap.set(String(item.id), String(item.id));
    }
  }

  // --------------------------------------------------------------------------
  // Pass 1: Index frames and calculate their absolute top-left coordinates
  // --------------------------------------------------------------------------
  interface FrameInfo {
    id: string;
    x: number; // top-left
    y: number; // top-left
    width: number;
    height: number;
  }
  const framesById = new Map<string, FrameInfo>();

  for (const item of items) {
    if (item.type === "frame") {
      const width = Math.max(10, item.geometry?.width ?? item.width ?? 800);
      const height = Math.max(10, item.geometry?.height ?? item.height ?? 600);
      const rawX = item.position?.x ?? item.x ?? 0;
      const rawY = item.position?.y ?? item.y ?? 0;
      const origin = item.position?.origin ?? "center";

      // If origin is center, top-left is rawX - width / 2
      const x = origin === "top-left" ? rawX : rawX - width / 2;
      const y = origin === "top-left" ? rawY : rawY - height / 2;

      framesById.set(String(item.id), {
        id: String(item.id),
        x,
        y,
        width,
        height,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Pass 2: Calculate absolute canvas bounds for each item
  // In Miro, child items inside a frame have coordinates relative to frame top-left!
  // --------------------------------------------------------------------------
  const itemBoundsMap = new Map<string, Bounds>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = String(item.id || `miro_${i}`);

    let width = Math.max(10, item.geometry?.width ?? item.width ?? 150);
    let height = Math.max(10, item.geometry?.height ?? item.height ?? 150);

    // Sticky note default dimensions in Miro if width/height not explicit
    if (item.type === "sticky_note" && !item.geometry?.width && !item.width) {
      const isRect =
        item.shape === "rectangle" || item.data?.shape === "rectangle";
      width = isRect ? 240 : 200;
      height = isRect ? 160 : 200;
    }

    const rawX = item.position?.x ?? item.x ?? 0;
    const rawY = item.position?.y ?? item.y ?? 0;
    const origin = item.position?.origin ?? "center";
    const angle =
      (item.geometry?.rotation ?? item.rotation ?? 0) * (Math.PI / 180);

    const parentId = item.parentId ? String(item.parentId) : null;
    const parentFrame = parentId ? framesById.get(parentId) : undefined;
    const isRelativeToFrame =
      Boolean(parentFrame) &&
      (item.position?.relativeTo === "parent_top_left" ||
        item.relativeTo === "parent_top_left" ||
        item.parentId != null);

    let x: number;
    let y: number;

    if (parentFrame && isRelativeToFrame) {
      // In Miro Web SDK, child (x, y) is measured from the parent frame's top-left
      // and represents the child's center point.
      const childCenterX = parentFrame.x + rawX;
      const childCenterY = parentFrame.y + rawY;
      x =
        origin === "top-left" ? parentFrame.x + rawX : childCenterX - width / 2;
      y =
        origin === "top-left"
          ? parentFrame.y + rawY
          : childCenterY - height / 2;
    } else {
      x = origin === "top-left" ? rawX : rawX - width / 2;
      y = origin === "top-left" ? rawY : rawY - height / 2;
    }

    itemBoundsMap.set(id, { x, y, width, height, angle });
  }

  // --------------------------------------------------------------------------
  // Pass 3: Pre-index media files from Miro .rtb backup
  // --------------------------------------------------------------------------
  const mediaByResourceId = new Map<
    string,
    { bytes: Uint8Array; ext: string }
  >();
  const mediaByFilename = new Map<string, { bytes: Uint8Array; ext: string }>();

  if (options.mediaFiles) {
    for (const [filename, bytes] of options.mediaFiles) {
      const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
      const match = filename.match(/^(\d+)(?:\.([^.]+))?$/);
      if (match) {
        mediaByResourceId.set(match[1], {
          bytes,
          ext: match[2]?.toLowerCase() ?? ext,
        });
      }
      mediaByFilename.set(filename.toLowerCase(), { bytes, ext });
    }
  }

  // Also map resource names from resources.json
  const resourceIdByName = new Map<string, string>();
  if (options.resources) {
    for (const res of options.resources) {
      if (res.name && res.id) {
        resourceIdByName.set(String(res.name).toLowerCase(), String(res.id));
      }
    }
  }

  // --------------------------------------------------------------------------
  // Pass 4: Convert Miro items to Firo elements
  // --------------------------------------------------------------------------
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = String(item.id || `miro_${i}`);
    const bounds = itemBoundsMap.get(id) ?? {
      x: 0,
      y: 0,
      width: 150,
      height: 150,
      angle: 0,
    };
    const parentId = item.parentId ? String(item.parentId) : null;
    const isInsideFrame = parentId && framesById.has(parentId);

    const baseFields = {
      id,
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: isInsideFrame ? parentId : null,
      containerId: isInsideFrame ? parentId : null,
      boundElements: [],
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
          strokeColor: "#b8b8b8",
          strokeWidth: 1,
        });
        break;
      }

      case "sticky_note": {
        const text = miroHtmlToPlainText(item.data?.content ?? item.content);
        const bg = normalizeMiroColor(item.style?.fillColor, "#fff9b8");
        const textColor = getContrastingTextColor(bg);

        // Adjust font size based on text density
        const fontSize =
          text.length > 250
            ? 12
            : text.length > 150
            ? 14
            : text.length > 60
            ? 16
            : 20;

        elements.push({
          ...baseFields,
          ...bounds,
          type: "stickynote",
          text,
          fontSize,
          fontFamily: 1,
          textAlign: item.style?.textAlign ?? "left",
          verticalAlign: item.style?.textAlignVertical ?? "top",
          backgroundColor: bg,
          strokeColor: textColor,
          isContainer: false,
        });
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
        } else if (
          shapeType === "round_rectangle" ||
          shapeType === "rounded_rectangle"
        ) {
          firoType = "rectangle";
          roundness = { type: 3 }; // PROPORTIONAL_RADIUS
        }

        const bg = normalizeMiroColor(item.style?.fillColor, "transparent");
        const stroke = normalizeMiroColor(item.style?.borderColor, "#1e1e1e");
        const contentText = miroHtmlToPlainText(
          item.data?.content ?? item.content,
        );

        const boundElements: { id: string; type: "text" }[] = [];
        const textId = `${id}_text`;

        if (contentText) {
          boundElements.push({ id: textId, type: "text" });
        }

        elements.push({
          ...baseFields,
          ...bounds,
          type: firoType,
          backgroundColor: bg,
          strokeColor: stroke,
          roundness,
          boundElements,
        });

        if (contentText) {
          const textColor = getContrastingTextColor(bg);
          const fontSize =
            Number(item.style?.fontSize) ||
            (contentText.length > 120 ? 13 : contentText.length > 50 ? 15 : 18);

          elements.push({
            ...baseFields,
            id: textId,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            angle: bounds.angle,
            type: "text",
            text: contentText,
            fontSize,
            fontFamily: 1,
            textAlign: item.style?.textAlign ?? "center",
            verticalAlign: item.style?.textAlignVertical ?? "middle",
            strokeColor: textColor,
            backgroundColor: "transparent",
            containerId: id,
          });
        }
        break;
      }

      case "text": {
        const text = miroHtmlToPlainText(item.data?.content ?? item.content);
        const color = normalizeMiroColor(item.style?.color, "#1e1e1e");
        const fontSize = Number(item.style?.fontSize) || 20;

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
        break;
      }

      case "connector":
      case "line": {
        let startX = bounds.x;
        let startY = bounds.y;
        let endX = bounds.x + bounds.width;
        let endY = bounds.y + bounds.height;

        const startItemId = item.start?.item ?? item.startItem?.id;
        const endItemId = item.end?.item ?? item.endItem?.id;

        if (item.start?.position) {
          startX = item.start.position.x;
          startY = item.start.position.y;
        } else if (startItemId && itemBoundsMap.has(String(startItemId))) {
          const sb = itemBoundsMap.get(String(startItemId))!;
          startX = sb.x + sb.width / 2;
          startY = sb.y + sb.height / 2;
        }

        if (item.end?.position) {
          endX = item.end.position.x;
          endY = item.end.position.y;
        } else if (endItemId && itemBoundsMap.has(String(endItemId))) {
          const eb = itemBoundsMap.get(String(endItemId))!;
          endX = eb.x + eb.width / 2;
          endY = eb.y + eb.height / 2;
        }

        const dx = endX - startX;
        const dy = endY - startY;

        const startCap = item.style?.startCap ?? item.style?.startStrokeCap;
        const endCap =
          item.style?.endCap ?? item.style?.endStrokeCap ?? "arrow";

        const startArrowhead = startCap && startCap !== "none" ? "arrow" : null;
        const endArrowhead = endCap && endCap !== "none" ? "arrow" : null;

        const stroke = normalizeMiroColor(
          item.style?.strokeColor ?? item.style?.color,
          "#1e1e1e",
        );
        const strokeWidth = Number(item.style?.strokeWidth) || 2;
        const strokeStyle =
          item.style?.strokeStyle === "dashed"
            ? "dashed"
            : item.style?.strokeStyle === "dotted"
            ? "dotted"
            : "solid";

        elements.push({
          ...baseFields,
          id,
          type: "arrow",
          x: startX,
          y: startY,
          width: Math.max(1, Math.abs(dx)),
          height: Math.max(1, Math.abs(dy)),
          points: [
            [0, 0],
            [dx, dy],
          ],
          strokeColor: stroke,
          strokeWidth,
          strokeStyle,
          backgroundColor: "transparent",
          startArrowhead,
          endArrowhead,
          startBinding: startItemId
            ? { elementId: String(startItemId), focus: 0, gap: 1 }
            : null,
          endBinding: endItemId
            ? { elementId: String(endItemId), focus: 0, gap: 1 }
            : null,
          bindings: [
            ...(startItemId
              ? [{ elementId: String(startItemId), focus: 0, gap: 1 }]
              : []),
            ...(endItemId
              ? [{ elementId: String(endItemId), focus: 0, gap: 1 }]
              : []),
          ],
        });
        break;
      }

      case "image":
      case "document": {
        let fileId: string | null = null;
        let status: "pending" | "saved" = "pending";

        let matchedMedia: { bytes: Uint8Array; ext: string } | undefined;

        // 1. Check explicit resourceId
        const explicitResId = String(
          item.resourceId ?? item.data?.resourceId ?? "",
        );
        if (explicitResId && mediaByResourceId.has(explicitResId)) {
          matchedMedia = mediaByResourceId.get(explicitResId);
        }

        // 2. Check URL for /resources/<id> or /<19-digit-id>
        const url = String(item.url ?? item.data?.url ?? "");
        if (!matchedMedia && url) {
          const resMatch =
            url.match(/\/resources\/(\d+)/) || url.match(/\/(\d{15,22})/);
          if (resMatch && mediaByResourceId.has(resMatch[1])) {
            matchedMedia = mediaByResourceId.get(resMatch[1]);
          }
        }

        // 3. Check item title against resource names
        const title = String(item.title ?? item.data?.title ?? "")
          .toLowerCase()
          .trim();
        if (!matchedMedia && title) {
          if (resourceIdByName.has(title)) {
            const resId = resourceIdByName.get(title)!;
            matchedMedia = mediaByResourceId.get(resId);
          } else if (mediaByFilename.has(title)) {
            matchedMedia = mediaByFilename.get(title);
          }
        }

        // 4. Check item.id as resourceId
        if (
          !matchedMedia &&
          item.id &&
          mediaByResourceId.has(String(item.id))
        ) {
          matchedMedia = mediaByResourceId.get(String(item.id));
        }

        if (matchedMedia) {
          const buffer = matchedMedia.bytes.buffer.slice(
            matchedMedia.bytes.byteOffset,
            matchedMedia.bytes.byteOffset + matchedMedia.bytes.byteLength,
          ) as ArrayBuffer;
          const hash = await hashBytes(buffer);
          const mimeType =
            matchedMedia.ext === "jpg" || matchedMedia.ext === "jpeg"
              ? "image/jpeg"
              : matchedMedia.ext === "svg"
              ? "image/svg+xml"
              : matchedMedia.ext === "heic"
              ? "image/heic"
              : matchedMedia.ext === "pdf"
              ? "application/pdf"
              : "image/png";

          assetsToPut.set(hash, {
            hash,
            bytes: matchedMedia.bytes,
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
        break;
      }

      case "card":
      case "app_card": {
        const title = item.data?.title ?? item.title ?? "";
        const rawDesc =
          item.data?.description ??
          (typeof item.description === "string" ? item.description : undefined);
        const desc = miroHtmlToPlainText(rawDesc);
        const cardText = desc ? `${title}\n\n${desc}` : title;
        elements.push({
          ...baseFields,
          ...bounds,
          type: "stickynote",
          text: cardText,
          fontSize: 15,
          fontFamily: 1,
          textAlign: "left",
          verticalAlign: "top",
          backgroundColor: "#ffffff",
          strokeColor: "#2d9cdb",
          isContainer: false,
        });
        break;
      }

      default:
        warnings.push(`Unsupported Miro item type "${item.type}" (id: ${id})`);
    }
  }

  // --------------------------------------------------------------------------
  // Pass 5: Z-Order sorting
  // Frames must be in the background (rank 0) so they don't obscure content.
  // All other elements retain their natural relative order from the Miro export.
  // --------------------------------------------------------------------------
  elements.sort((a, b) => {
    const aFrame = a.type === "frame" ? 0 : 1;
    const bFrame = b.type === "frame" ? 0 : 1;
    return aFrame - bFrame;
  });
  const elementOrder = elements.map((e) => String(e.id));

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
