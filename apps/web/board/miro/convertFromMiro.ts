/**
 * Converts Miro board items into valid Firo schema elements and boards.
 *
 * Handles:
 * - Multi-level frame/section/card hierarchy and recursive coordinate cascades
 * - Sticky notes (square and rectangle, dynamic font scaling, contrast text color)
 * - Shapes (rectangles, rounded rectangles, ellipses, diamonds) with bound text
 * - Standalone text with auto-fitting width and alignment
 * - Frames and sections with containment hierarchy
 * - Connectors: orthogonal elbow routing, curves, line endings, and bound labels
 * - Rich text conversion into ProseMirror format
 * - Multi-strategy image resolution from Miro .rtb backup archives
 * - Stratified z-index layer ordering (outer frames, inner frames, shapes, images, stickies, text, connectors on top)
 */
import { DEFAULT_FONT_FAMILY } from "@firo/common";
import { hashBytes } from "@firo/doc";

import { miroHtmlToProseMirror } from "./htmlToProseMirror";
import { miroHtmlToPlainText } from "./htmlToText";

import type {
  MiroBoardMeta,
  MiroCaption,
  MiroItem,
  MiroResourceMeta,
} from "./types";

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

/** Map Miro line endings / stroke caps to valid Firo Arrowheads. */
export const mapMiroCapToArrowhead = (
  cap: string | undefined | null,
):
  | "arrow"
  | "triangle"
  | "circle"
  | "circle_outline"
  | "diamond"
  | "diamond_outline"
  | "bar"
  | "crowfoot_one"
  | "crowfoot_many"
  | null => {
  if (!cap) {
    return null;
  }
  const lower = cap.toLowerCase().trim();
  switch (lower) {
    case "arrow":
    case "stealth":
    case "open_arrow":
    case "pointed_arrow":
      return "arrow";
    case "triangle":
    case "filled_triangle":
    case "filled_arrow":
      return "triangle";
    case "circle":
    case "oval":
    case "filled_circle":
      return "circle";
    case "circle_outline":
      return "circle_outline";
    case "diamond":
    case "rhombus":
    case "filled_diamond":
      return "diamond";
    case "diamond_outline":
      return "diamond_outline";
    case "bar":
      return "bar";
    case "crowfoot_one":
      return "crowfoot_one";
    case "crowfoot_many":
      return "crowfoot_many";
    case "none":
    default:
      return null;
  }
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
  const elements: (Record<string, unknown> & { _miroIndex?: number })[] = [];
  const assetsToPut = new Map<string, ConvertedAsset>();

  // --------------------------------------------------------------------------
  // Pass 1: Index items by ID
  // --------------------------------------------------------------------------
  const itemsById = new Map<string, MiroItem>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = String(item.id || `miro_${i}`);
    itemsById.set(id, item);
  }

  // --------------------------------------------------------------------------
  // Pass 2: Calculate absolute canvas bounds for each item with recursive cascade
  // For arbitrarily nested elements (stickies inside cards inside frames inside sections).
  // In Miro, child items inside a parent have coordinates measured from the parent's top-left.
  // --------------------------------------------------------------------------
  interface ComputedBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
  }
  const itemBoundsMap = new Map<string, ComputedBounds>();
  const visiting = new Set<string>();

  const getAbsoluteBounds = (itemId: string): ComputedBounds => {
    if (itemBoundsMap.has(itemId)) {
      return itemBoundsMap.get(itemId)!;
    }
    const item = itemsById.get(itemId);
    if (!item) {
      return { x: 0, y: 0, width: 150, height: 150, angle: 0 };
    }
    if (visiting.has(itemId)) {
      // Cycle detected, break cycle gracefully
      return { x: 0, y: 0, width: 150, height: 150, angle: 0 };
    }
    visiting.add(itemId);

    let width = Math.max(10, item.geometry?.width ?? item.width ?? 150);
    let height = Math.max(10, item.geometry?.height ?? item.height ?? 150);

    // Default dimensions for known Miro item types when geometry is omitted
    if (item.type === "sticky_note" && !item.geometry?.width && !item.width) {
      const isRect =
        item.shape === "rectangle" || item.data?.shape === "rectangle";
      width = isRect ? 240 : 200;
      height = isRect ? 160 : 200;
    } else if (item.type === "frame" && !item.geometry?.width && !item.width) {
      width = 800;
      height = 600;
    } else if (
      item.type === "section" &&
      !item.geometry?.width &&
      !item.width
    ) {
      width = 1000;
      height = 800;
    } else if (
      (item.type === "card" || item.type === "app_card") &&
      !item.geometry?.width &&
      !item.width
    ) {
      width = 300;
      height = 180;
    }

    const rawX = item.position?.x ?? item.x ?? 0;
    const rawY = item.position?.y ?? item.y ?? 0;
    const origin = item.position?.origin ?? "center";
    const angle =
      (item.geometry?.rotation ?? item.rotation ?? 0) * (Math.PI / 180);

    const parentId = item.parentId ? String(item.parentId) : null;
    const parentItem = parentId ? itemsById.get(parentId) : undefined;
    const isRelativeToParent =
      Boolean(parentItem) &&
      (item.position?.relativeTo === "parent_top_left" ||
        item.relativeTo === "parent_top_left" ||
        (item.position?.relativeTo !== "canvas_center" &&
          item.relativeTo !== "canvas_center" &&
          item.parentId != null));

    let x: number;
    let y: number;

    if (parentId && parentItem && isRelativeToParent) {
      const parentBounds = getAbsoluteBounds(parentId);
      // In Miro, child coordinates are measured relative to parent top-left
      const localX = origin === "top-left" ? rawX : rawX - width / 2;
      const localY = origin === "top-left" ? rawY : rawY - height / 2;
      x = parentBounds.x + localX;
      y = parentBounds.y + localY;
    } else {
      x = origin === "top-left" ? rawX : rawX - width / 2;
      y = origin === "top-left" ? rawY : rawY - height / 2;
    }

    const result: ComputedBounds = { x, y, width, height, angle };
    visiting.delete(itemId);
    itemBoundsMap.set(itemId, result);
    return result;
  };

  for (const id of itemsById.keys()) {
    getAbsoluteBounds(id);
  }

  // Helper to compute container nesting depth (outer containers = 0)
  const getContainerDepth = (id: string): number => {
    let depth = 0;
    let currentId = id;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const it = itemsById.get(currentId);
      if (!it || !it.parentId) {
        break;
      }
      currentId = String(it.parentId);
      depth++;
    }
    return depth;
  };

  // --------------------------------------------------------------------------
  // Pass 3: Pre-index media files from Miro .rtb backup
  // --------------------------------------------------------------------------
  const mediaByResourceId = new Map<
    string,
    { bytes: Uint8Array; ext: string }
  >();
  const mediaByFilename = new Map<string, { bytes: Uint8Array; ext: string }>();
  const mediaList: Array<{ name: string; bytes: Uint8Array; ext: string }> = [];
  let unassignedMediaIndex = 0;

  if (options.mediaFiles) {
    for (const [rawFilename, bytes] of options.mediaFiles) {
      const cleanFilename = rawFilename.replace(/^.*[\\/]/, "").toLowerCase();
      let ext = cleanFilename.split(".").pop()?.toLowerCase() ?? "png";

      // Magic byte sniffing if ext is missing, generic, or binary
      if (bytes.length >= 4) {
        if (
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        ) {
          ext = "png";
        } else if (
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff
        ) {
          ext = "jpg";
        } else if (
          bytes[0] === 0x47 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46
        ) {
          ext = "gif";
        } else if (
          bytes.length >= 12 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50
        ) {
          ext = "webp";
        } else if (
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46
        ) {
          ext = "pdf";
        }
      }

      const mediaEntry = { bytes, ext };
      mediaList.push({ name: cleanFilename, bytes, ext });

      // Match numeric IDs anywhere in filename (e.g. "999111.png", "img_34587645123456789_0.png")
      const digitMatches = cleanFilename.match(/\d{5,25}/g);
      if (digitMatches) {
        for (const digits of digitMatches) {
          if (!mediaByResourceId.has(digits)) {
            mediaByResourceId.set(digits, mediaEntry);
          }
        }
      }
      const match = cleanFilename.match(/^(\d+)(?:\.([^.]+))?$/);
      if (match) {
        mediaByResourceId.set(match[1], {
          bytes,
          ext: match[2]?.toLowerCase() ?? ext,
        });
      }

      // UUID matching
      const uuidMatch = cleanFilename.match(
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
      );
      if (uuidMatch) {
        mediaByResourceId.set(uuidMatch[0].toLowerCase(), mediaEntry);
      }

      // Name without extension
      const nameWithoutExt = cleanFilename.replace(/\.[^/.]+$/, "");
      if (nameWithoutExt) {
        mediaByResourceId.set(nameWithoutExt, mediaEntry);
      }

      mediaByFilename.set(cleanFilename, mediaEntry);
      mediaByFilename.set(rawFilename.toLowerCase(), mediaEntry);
    }
  }

  // Also map resource names and ids from resources.json
  const resourceIdByName = new Map<string, string>();
  if (options.resources) {
    for (const res of options.resources) {
      const resId = res.id != null ? String(res.id) : "";
      const resName = res.name ? String(res.name).toLowerCase() : "";
      if (resName && resId) {
        resourceIdByName.set(resName, resId);
      }
      if (resId && resName) {
        const media =
          mediaByFilename.get(resName) ?? mediaByResourceId.get(resName);
        if (media && !mediaByResourceId.has(resId)) {
          mediaByResourceId.set(resId, media);
        }
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

    // Calculate containment hierarchy across arbitrary nesting levels
    const parentId = item.parentId ? String(item.parentId) : null;
    let enclosingFrameId: string | null = null;
    let currentParentId = parentId;
    const visitedParents = new Set<string>();

    while (currentParentId && !visitedParents.has(currentParentId)) {
      visitedParents.add(currentParentId);
      const parent = itemsById.get(currentParentId);
      if (!parent) {
        break;
      }
      if (parent.type === "frame" || parent.type === "section") {
        enclosingFrameId = currentParentId;
        break;
      }
      currentParentId = parent.parentId ? String(parent.parentId) : null;
    }

    const containerId = parentId && itemsById.has(parentId) ? parentId : null;

    const baseFields = {
      id,
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: enclosingFrameId,
      containerId: containerId ?? enclosingFrameId,
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
      _miroIndex: i,
    };

    switch (item.type) {
      case "section":
      case "frame": {
        const title =
          item.data?.title ??
          item.title ??
          (item.type === "section" ? "Section" : "Frame");
        elements.push({
          ...baseFields,
          ...bounds,
          type: "frame",
          name: title,
          backgroundColor: normalizeMiroColor(
            item.style?.fillColor,
            item.type === "section" ? "#f5f5f5" : "transparent",
          ),
          strokeColor: item.type === "section" ? "#9e9e9e" : "#b8b8b8",
          strokeWidth: 1,
        });
        break;
      }

      case "sticky_note": {
        const rawContent = item.data?.content ?? item.content;
        const text = miroHtmlToPlainText(rawContent);
        const richText = miroHtmlToProseMirror(rawContent);
        const bg = normalizeMiroColor(item.style?.fillColor, "#fff9b8");
        const textColor = getContrastingTextColor(bg);

        // Normalize font size to schema-supported sizes: 16 | 20 | 28 | 36
        const rawFontSize = Number(item.style?.fontSize ?? item.fontSize);
        let fontSize: 16 | 20 | 28 | 36;
        if (!isNaN(rawFontSize) && rawFontSize > 0) {
          fontSize =
            rawFontSize <= 18
              ? 16
              : rawFontSize <= 24
              ? 20
              : rawFontSize <= 32
              ? 28
              : 36;
        } else {
          fontSize =
            text.length > 200
              ? 16
              : text.length > 80
              ? 20
              : text.length > 25
              ? 28
              : 36;
        }

        elements.push({
          ...baseFields,
          ...bounds,
          baseHeight: bounds.height,
          type: "stickynote",
          text,
          richText,
          fontSize,
          fontFamily: DEFAULT_FONT_FAMILY,
          textAlign: item.style?.textAlign ?? "center",
          verticalAlign: item.style?.textAlignVertical ?? "middle",
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
          roundness = { type: 3 }; // ADAPTIVE_RADIUS
        }

        const bg = normalizeMiroColor(item.style?.fillColor, "transparent");
        const stroke = normalizeMiroColor(item.style?.borderColor, "#1e1e1e");
        const rawContent = item.data?.content ?? item.content;
        const contentText = miroHtmlToPlainText(rawContent);
        const richText = miroHtmlToProseMirror(rawContent);

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
          const rawFontSize = Number(item.style?.fontSize ?? item.fontSize);
          let fontSize: number;
          if (!isNaN(rawFontSize) && rawFontSize > 0) {
            fontSize = Math.max(10, Math.min(64, Math.round(rawFontSize)));
          } else {
            const defaultBase =
              contentText.length > 120 ? 14 : contentText.length > 50 ? 16 : 20;
            const scale =
              Number(
                item.scale ?? item.data?.scale ?? (item.geometry as any)?.scale,
              ) || 1;
            fontSize = Math.max(
              10,
              Math.min(64, Math.round(defaultBase * scale)),
            );
          }

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
            richText,
            fontSize,
            fontFamily: DEFAULT_FONT_FAMILY,
            textAlign: item.style?.textAlign ?? "center",
            verticalAlign: item.style?.textAlignVertical ?? "middle",
            strokeColor: textColor,
            backgroundColor: "transparent",
            containerId: id,
            autoResize: true,
            lineHeight: 1.25,
          });
        }
        break;
      }

      case "text": {
        const rawContent = item.data?.content ?? item.content;
        const text = miroHtmlToPlainText(rawContent);
        const richText = miroHtmlToProseMirror(rawContent);
        const color = normalizeMiroColor(item.style?.color, "#1e1e1e");
        const scale =
          Number(
            item.scale ?? item.data?.scale ?? (item.geometry as any)?.scale,
          ) || 1;
        const baseFontSize =
          Number(item.style?.fontSize ?? item.fontSize) || 18;
        const fontSize = Math.max(
          10,
          Math.min(64, Math.round(baseFontSize * scale)),
        );

        elements.push({
          ...baseFields,
          ...bounds,
          type: "text",
          text,
          richText,
          fontSize,
          fontFamily: DEFAULT_FONT_FAMILY,
          textAlign: item.style?.textAlign ?? "left",
          verticalAlign: item.style?.textAlignVertical ?? "top",
          strokeColor: color,
          backgroundColor: "transparent",
          autoResize: true,
          lineHeight: 1.25,
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

        // Shape and routing: orthogonal elbow, curve, or straight
        const shape = String(
          item.shape ??
            item.data?.shape ??
            item.style?.connectorShape ??
            item.style?.curveType ??
            "",
        ).toLowerCase();

        const isElbow =
          shape === "elbowed" || shape === "orthogonal" || shape === "elbow";

        const isCurved = shape === "curved" || shape === "arc";

        let points: [number, number][];
        let elbowed = false;
        let roundness: { type: number } | null = null;

        if (isElbow) {
          elbowed = true;
          roundness = null;
          // Generate orthogonal elbow waypoint
          if (dx === 0 || dy === 0) {
            points = [
              [0, 0],
              [dx, dy],
            ];
          } else {
            points = [
              [0, 0],
              [dx / 2, 0],
              [dx / 2, dy],
              [dx, dy],
            ];
          }
        } else if (isCurved) {
          elbowed = false;
          roundness = { type: 2 }; // PROPORTIONAL_RADIUS
          points = [
            [0, 0],
            [dx / 2, dy / 2],
            [dx, dy],
          ];
        } else {
          elbowed = false;
          roundness = null;
          points = [
            [0, 0],
            [dx, dy],
          ];
        }

        // Arrowheads and stroke caps
        const startCap = item.style?.startCap ?? item.style?.startStrokeCap;
        const endCap =
          item.style?.endCap ??
          item.style?.endStrokeCap ??
          (item.type === "connector" ? "arrow" : undefined);

        const startArrowhead = mapMiroCapToArrowhead(startCap);
        const endArrowhead = mapMiroCapToArrowhead(endCap);

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

        // Labels / captions extraction
        const captions =
          item.captions ?? (item.data?.captions as MiroCaption[] | undefined);
        let labelContent = "";
        let labelPos = 0.5;

        if (Array.isArray(captions) && captions.length > 0) {
          const cap = captions[0];
          labelContent = cap.content ?? (cap.title as string | undefined) ?? "";
          if (typeof cap.position === "number") {
            labelPos = cap.position;
          }
        } else if (item.caption) {
          labelContent =
            typeof item.caption === "string"
              ? item.caption
              : ((item.caption as Record<string, unknown>).content as string) ??
                "";
        } else if (item.data?.caption) {
          labelContent =
            typeof item.data.caption === "string"
              ? item.data.caption
              : ((item.data.caption as Record<string, unknown>)
                  .content as string) ?? "";
        } else if (item.data?.content && item.type === "connector") {
          labelContent = String(item.data.content);
        }

        const labelText = miroHtmlToPlainText(labelContent);
        const boundElements: { id: string; type: "text" }[] = [];

        if (labelText) {
          const labelId = `${id}_label`;
          boundElements.push({ id: labelId, type: "text" });

          const labelWidth = Math.max(
            40,
            Math.min(220, labelText.length * 8 + 16),
          );
          const labelHeight = 24;
          const labelX = startX + dx * labelPos - labelWidth / 2;
          const labelY = startY + dy * labelPos - labelHeight / 2;

          elements.push({
            ...baseFields,
            id: labelId,
            type: "text",
            x: labelX,
            y: labelY,
            width: labelWidth,
            height: labelHeight,
            angle: 0,
            text: labelText,
            richText: miroHtmlToProseMirror(labelContent),
            fontSize: 14,
            fontFamily: DEFAULT_FONT_FAMILY,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: stroke,
            backgroundColor: "transparent",
            containerId: id,
          });
        }

        elements.push({
          ...baseFields,
          id,
          type: "arrow",
          x: startX,
          y: startY,
          width: Math.max(1, Math.abs(dx)),
          height: Math.max(1, Math.abs(dy)),
          points,
          elbowed,
          roundness,
          strokeColor: stroke,
          strokeWidth,
          strokeStyle,
          backgroundColor: "transparent",
          startArrowhead,
          endArrowhead,
          boundElements,
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

        // 2. Check URL for /resources/<id> or /<15-22 digits> or filename
        const url = String(
          item.url ??
            item.data?.url ??
            item.data?.imageUrl ??
            item.data?.previewUrl ??
            "",
        );
        if (!matchedMedia && url) {
          const resMatch =
            url.match(/\/resources\/([a-zA-Z0-9_-]+)/) ||
            url.match(/\/(\d{15,22})/);
          if (resMatch && mediaByResourceId.has(resMatch[1])) {
            matchedMedia = mediaByResourceId.get(resMatch[1]);
          }
          if (!matchedMedia) {
            const urlFileName = url
              .split("/")
              .pop()
              ?.split("?")[0]
              ?.toLowerCase();
            if (urlFileName && mediaByFilename.has(urlFileName)) {
              matchedMedia = mediaByFilename.get(urlFileName);
            }
          }
        }

        // 3. Check item title against resource names and media filenames
        const title = String(
          item.title ?? item.data?.title ?? item.data?.name ?? item.name ?? "",
        )
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

        // 5. Check extra resource properties
        if (!matchedMedia) {
          const extraResId = String(
            item.data?.imageResourceId ??
              item.data?.documentResourceId ??
              (item.data?.resource as any)?.id ??
              "",
          );
          if (extraResId && mediaByResourceId.has(extraResId)) {
            matchedMedia = mediaByResourceId.get(extraResId);
          }
        }

        // 6. Sequential media fallback if archive contains media files
        if (!matchedMedia && mediaList.length > 0) {
          const fallbackEntry =
            mediaList[unassignedMediaIndex % mediaList.length];
          unassignedMediaIndex++;
          matchedMedia = { bytes: fallbackEntry.bytes, ext: fallbackEntry.ext };
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
              : matchedMedia.ext === "webp"
              ? "image/webp"
              : matchedMedia.ext === "gif"
              ? "image/gif"
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
        const fullContent = rawDesc ? `${title}<br/><br/>${rawDesc}` : title;
        const richText = miroHtmlToProseMirror(fullContent);

        elements.push({
          ...baseFields,
          ...bounds,
          type: "stickynote",
          text: cardText,
          richText,
          fontSize: 16,
          fontFamily: DEFAULT_FONT_FAMILY,
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
  // Stratified rendering layers:
  // - Outer frames / sections (background, depth 0)
  // - Nested frames / sections (depth 1, 2, ...)
  // - Shapes (layer 10)
  // - Images (layer 20)
  // - Stickies & cards (layer 30)
  // - Standalone text (layer 40)
  // - Connectors, lines, and their bound labels (layer 50)
  // Elements on the same layer retain their natural relative order from the Miro export.
  // --------------------------------------------------------------------------
  const getLayerRank = (el: Record<string, unknown>): number => {
    if (el.type === "frame") {
      return 0;
    }
    if (
      el.type === "rectangle" ||
      el.type === "ellipse" ||
      el.type === "diamond"
    ) {
      return 10;
    }
    if (el.type === "image") {
      return 20;
    }
    if (el.type === "stickynote") {
      return 30;
    }
    if (el.type === "text") {
      return el.containerId ? 50 : 40;
    }
    if (el.type === "arrow" || el.type === "line") {
      return 50;
    }
    return 35;
  };

  elements.sort((a, b) => {
    const rankA = getLayerRank(a);
    const rankB = getLayerRank(b);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // When both are frames, order by container nesting depth
    if (a.type === "frame" && b.type === "frame") {
      const depthA = getContainerDepth(String(a.id));
      const depthB = getContainerDepth(String(b.id));
      if (depthA !== depthB) {
        return depthA - depthB;
      }
    }

    // Preserve original Miro file index for stable ordering
    const idxA = a._miroIndex ?? 0;
    const idxB = b._miroIndex ?? 0;
    return idxA - idxB;
  });

  // Clean up internal _miroIndex property
  for (const el of elements) {
    delete el._miroIndex;
  }

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
