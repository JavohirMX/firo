/**
 * Batch export of board frames into a single downloadable ZIP archive.
 */
import { canvasToBlob } from "@firo/editor/data/blob";
import { exportToCanvas, exportToSvg } from "@firo/editor/scene/export";
import { isFrameLikeElement } from "@firo/element";
import { getNonDeletedElements } from "@firo/element";

import type {
  NonDeletedExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@firo/element/types";
import type { AppState, BinaryFiles } from "@firo/editor/types";

import { zipFiles } from "./zip";

export interface BatchFrameExportOptions {
  elements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  format: "png" | "svg";
  scale?: number;
  exportBackground?: boolean;
}

const sanitizeFilename = (name: string): string => {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Frame";
};

export const exportAllFramesAsZip = async ({
  elements,
  appState,
  files,
  format,
  scale = 2,
  exportBackground = true,
}: BatchFrameExportOptions): Promise<Blob> => {
  const nonDeleted = getNonDeletedElements(elements);
  const frames = nonDeleted.filter(
    isFrameLikeElement,
  ) as ExcalidrawFrameLikeElement[];

  if (frames.length === 0) {
    throw new Error("No frames found on the board to export.");
  }

  // Sort frames spatially (top-to-bottom, left-to-right)
  const sortedFrames = [...frames].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 20) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  const zipFileMap = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();

  for (let i = 0; i < sortedFrames.length; i++) {
    const frame = sortedFrames[i];
    const frameName = sanitizeFilename(frame.name || `Frame_${i + 1}`);
    const paddedIndex = String(i + 1).padStart(2, "0");

    if (format === "png") {
      const canvas = exportToCanvas(
        nonDeleted,
        {
          ...appState,
          exportScale: scale,
          exportBackground,
        },
        files,
        {
          exportingFrame: frame as any,
          exportBackground,
          viewBackgroundColor: appState.viewBackgroundColor,
        },
      );

      const blob = await canvasToBlob(canvas);
      const arrayBuffer = await blob.arrayBuffer();
      const filename = `${paddedIndex}_${frameName}.png`;
      zipFileMap.set(filename, new Uint8Array(arrayBuffer));
    } else {
      const svg = await exportToSvg(
        nonDeleted,
        {
          exportBackground,
          exportWithDarkMode: appState.exportWithDarkMode,
          viewBackgroundColor: appState.viewBackgroundColor,
          exportPadding: 10,
          exportScale: scale,
          exportEmbedScene: false,
        },
        files,
        { exportingFrame: frame as any },
      );

      const svgString = svg.outerHTML;
      const filename = `${paddedIndex}_${frameName}.svg`;
      zipFileMap.set(filename, encoder.encode(svgString));
    }
  }

  const zipBytes = zipFiles(zipFileMap);
  const buffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: "application/zip" });
};

export const exportFramesToZip = exportAllFramesAsZip;
