/**
 * Bidirectional conversion between native Excalidraw scene format and Firo document model.
 */
import { DEFAULT_FONT_FAMILY } from "@firo/common";
import { hashBytes } from "@firo/doc";
import { toEditorElements } from "@firo/board";

import type { FiroDoc } from "@firo/doc";
import type { FiroElement } from "@firo/schema";
import type { ProseMirrorDoc } from "@firo/schema";

export interface ExcalidrawSceneData {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: readonly any[];
  appState?: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
  };
  files?: Record<string, { id: string; dataURL: string; mimeType: string }>;
}

/**
 * Converts a plain string with newlines into a standard Firo ProseMirror document.
 */
export const stringToProseMirror = (text: string): ProseMirrorDoc => {
  if (!text) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    };
  }
  const lines = text.split(/\r?\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
};

/**
 * Extracts plain text from a ProseMirror document structure.
 */
export const proseMirrorToString = (doc: unknown): string => {
  if (!doc || typeof doc !== "object") {
    return "";
  }
  const d = doc as {
    content?: Array<{ type: string; content?: Array<{ text?: string }> }>;
  };
  if (!Array.isArray(d.content)) {
    return "";
  }
  return d.content
    .map((p) => {
      if (Array.isArray(p.content)) {
        return p.content.map((t) => t.text ?? "").join("");
      }
      return "";
    })
    .join("\n");
};

/**
 * Converts a Firo board document into an Excalidraw-compatible scene JSON object.
 */
export const convertFiroToExcalidraw = (
  docOrBoard: FiroDoc | { elements: readonly FiroElement[] },
  appState?: { viewBackgroundColor?: string },
): ExcalidrawSceneData => {
  const rawElements: readonly FiroElement[] =
    "read" in docOrBoard && typeof (docOrBoard as any).read === "function"
      ? (docOrBoard as FiroDoc).read().elements
      : (docOrBoard as { elements: readonly FiroElement[] }).elements;
  const elements = rawElements.filter((e: FiroElement) => !e.isDeleted);
  const excalidrawElements: any[] = [];

  for (const el of elements) {
    if (el.type === "stickynote") {
      const note = el as any;
      const text = note.text || "";
      const projected = toEditorElements({
        ...note,
        text,
        index: note.index || "a0",
        fontSize: note.fontSize || 20,
        fontFamily: note.fontFamily || 1,
        textAlign: note.textAlign || "center",
        verticalAlign: note.verticalAlign || "middle",
      } as any);
      const [sticky] = projected;
      if (sticky) {
        (sticky as any).text = text;
      }
      excalidrawElements.push(...projected);
      continue;
    }

    if (el.type === "text") {
      const textEl = el as any;
      const text = textEl.text || "";
      excalidrawElements.push({
        ...el,
        text,
        originalText: text,
        fontSize: textEl.fontSize || 20,
        fontFamily: textEl.fontFamily || 1,
        textAlign: textEl.textAlign || "left",
        verticalAlign: textEl.verticalAlign || "top",
        lineHeight: 1.25,
        autoResize: true,
      });
      continue;
    }

    // Shapes, frames, arrows, lines, images pass through directly
    excalidrawElements.push({
      ...el,
    });
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "https://firo.app",
    elements: excalidrawElements,
    appState: {
      viewBackgroundColor: appState?.viewBackgroundColor || "#ffffff",
      gridSize: null,
    },
  };
};

/**
 * Checks if a parsed JSON structure is an Excalidraw scene.
 */
export const isExcalidrawJson = (data: unknown): boolean => {
  if (!data || typeof data !== "object") {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== undefined) {
    return false;
  }
  if (obj.type === "excalidraw") {
    return true;
  }
  if (
    Array.isArray(obj.elements) &&
    obj.elements.length > 0 &&
    typeof obj.elements[0] === "object" &&
    obj.elements[0] !== null
  ) {
    const el = obj.elements[0] as Record<string, unknown>;
    return (
      typeof el.type === "string" &&
      ("id" in el || "strokeColor" in el || "backgroundColor" in el)
    );
  }
  return false;
};

/**
 * Converts an Excalidraw JSON scene into Firo schema elements and asset files.
 */
export const convertExcalidrawToFiro = async (
  rawJson: unknown,
): Promise<{
  elements: FiroElement[];
  assetsToPut: Map<
    string,
    { hash: string; bytes: Uint8Array; mimeType: string }
  >;
}> => {
  const obj = rawJson as Record<string, unknown>;
  const rawElements = (
    Array.isArray(obj.elements)
      ? obj.elements
      : Array.isArray(rawJson)
      ? rawJson
      : []
  ) as any[];
  const rawFiles =
    (obj.files as Record<
      string,
      { id: string; dataURL: string; mimeType: string }
    >) || {};

  const assetsToPut = new Map<
    string,
    { hash: string; bytes: Uint8Array; mimeType: string }
  >();
  const fileIdToHash = new Map<string, string>();

  // Process any embedded base64 files
  for (const [fileId, fileData] of Object.entries(rawFiles)) {
    if (fileData?.dataURL && fileData.dataURL.startsWith("data:")) {
      try {
        const commaIndex = fileData.dataURL.indexOf(",");
        if (commaIndex > 0) {
          const base64 = fileData.dataURL.slice(commaIndex + 1);
          const binaryStr =
            typeof window !== "undefined"
              ? window.atob(base64)
              : Buffer.from(base64, "base64").toString("binary");
          const bytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            bytes[b] = binaryStr.charCodeAt(b);
          }
          const hash = await hashBytes(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          );
          const mimeType = fileData.mimeType || "image/png";
          assetsToPut.set(hash, { hash, bytes, mimeType });
          fileIdToHash.set(fileId, hash);
        }
      } catch (err) {
        console.warn("[firo] Failed to decode excalidraw file", fileId, err);
      }
    }
  }

  // Pre-index bound text elements to container IDs
  const textByContainerId = new Map<string, any>();
  for (const el of rawElements) {
    if (el.type === "text" && el.containerId) {
      textByContainerId.set(el.containerId, el);
    }
  }

  const firoElements: FiroElement[] = [];

  for (const el of rawElements) {
    if (el.isDeleted) {
      continue;
    }

    // Skip text elements that are bound to sticky notes (they are merged into the sticky note)
    if (el.type === "text" && el.containerId) {
      const container = rawElements.find((c) => c.id === el.containerId);
      if (container && container.type === "stickynote") {
        continue;
      }
    }

    if (el.type === "stickynote") {
      const boundText = textByContainerId.get(el.id);
      const text = boundText?.text || el.text || "";
      const richText = stringToProseMirror(text);

      firoElements.push({
        id: el.id,
        type: "stickynote",
        x: el.x,
        y: el.y,
        width: el.width || 200,
        height: el.height || 200,
        angle: el.angle || 0,
        strokeColor: el.strokeColor || "#1e1e1e",
        backgroundColor: el.backgroundColor || "#fff9b8",
        fillStyle: el.fillStyle || "solid",
        strokeWidth: el.strokeWidth || 1,
        strokeStyle: el.strokeStyle || "solid",
        roundness: null,
        roughness: el.roughness ?? 0,
        opacity: el.opacity ?? 100,
        version: el.version || 1,
        versionNonce: el.versionNonce || 12345,
        index: null,
        created: Date.now(),
        updated: Date.now(),
        groupIds: el.groupIds || [],
        frameId: el.frameId || null,
        containerId: null,
        bindings: el.bindings || [],
        link: el.link || null,
        locked: el.locked || false,
        isDeleted: false,
        isContainer: false,
        text,
        richText,
        fontSize: 20,
        fontFamily: DEFAULT_FONT_FAMILY,
        textAlign: el.textAlign || "center",
        verticalAlign: el.verticalAlign || "middle",
      } as any);
      continue;
    }

    if (el.type === "text") {
      const text = el.text || "";
      const richText = stringToProseMirror(text);
      firoElements.push({
        ...el,
        text,
        richText,
        fontSize: el.fontSize || 20,
        fontFamily: DEFAULT_FONT_FAMILY,
        textAlign: el.textAlign || "left",
        verticalAlign: el.verticalAlign || "top",
      } as any);
      continue;
    }

    if (el.type === "image") {
      const mappedHash = fileIdToHash.get(el.fileId);
      firoElements.push({
        ...el,
        fileId: mappedHash || el.fileId,
        status: mappedHash ? "saved" : el.status || "saved",
      } as any);
      continue;
    }

    // Pass through standard shapes, lines, frames
    firoElements.push({
      ...el,
    } as any);
  }

  return {
    elements: firoElements,
    assetsToPut,
  };
};
