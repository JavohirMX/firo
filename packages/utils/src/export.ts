import { MIME_TYPES } from "@firo/common";
import { getDefaultAppState } from "@firo/editor/appState";
import {
  copyBlobToClipboardAsPng,
  copyTextToSystemClipboard,
  copyToClipboard,
} from "@firo/editor/clipboard";
import { encodePngMetadata } from "@firo/editor/data/image";
import { getNonDeletedElements } from "@firo/element";
import { serializeAsJSON } from "@firo/editor/data/json";
import { restoreAppState, restoreElements } from "@firo/editor/data/restore";
import {
  exportToCanvas as _exportToCanvas,
  exportToSvg as _exportToSvg,
} from "@firo/editor/scene/export";

import type {
  ExcalidrawFrameLikeElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@firo/element/types";
import type { AppState, BinaryFiles } from "@firo/editor/types";

import { generatePdfFromCanvases, type PdfPage } from "./pdf";

export { MIME_TYPES };
export * from "./pdf";

type ExportOpts = {
  /** restored before exporting */
  elements: readonly NonDeletedExcalidrawElement[];
  appState?: Partial<Omit<AppState, "offsetTop" | "offsetLeft">>;
  files: BinaryFiles | null;
  maxWidthOrHeight?: number;
  exportingFrame?: NonDeleted<ExcalidrawFrameLikeElement> | null;
  getDimensions?: (
    width: number,
    height: number,
  ) => { width: number; height: number; scale?: number };
};

export const exportToCanvas = ({
  elements,
  appState,
  files,
  maxWidthOrHeight,
  getDimensions,
  exportPadding,
  exportingFrame,
}: ExportOpts & {
  exportPadding?: number;
}) => {
  const restoredElements = getNonDeletedElements(
    restoreElements(elements, null, {
      deleteInvisibleElements: true,
    }),
  );
  const restoredAppState = restoreAppState(appState, null);

  const { exportBackground, viewBackgroundColor } = restoredAppState;
  return _exportToCanvas(
    restoredElements,
    { ...restoredAppState, offsetTop: 0, offsetLeft: 0, width: 0, height: 0 },
    files || {},
    { exportBackground, exportPadding, viewBackgroundColor, exportingFrame },
    (width: number, height: number) => {
      const canvas = document.createElement("canvas");

      if (maxWidthOrHeight) {
        if (typeof getDimensions === "function") {
          console.warn(
            "`getDimensions()` is ignored when `maxWidthOrHeight` is supplied.",
          );
        }

        const max = Math.max(width, height);

        // if content is less then maxWidthOrHeight, fallback on supplied scale
        const scale =
          maxWidthOrHeight < max
            ? maxWidthOrHeight / max
            : appState?.exportScale ?? 1;

        canvas.width = width * scale;
        canvas.height = height * scale;

        return {
          canvas,
          scale,
        };
      }

      const ret = getDimensions?.(width, height) || { width, height };

      canvas.width = ret.width;
      canvas.height = ret.height;

      return {
        canvas,
        scale: ret.scale ?? 1,
      };
    },
  );
};

export const exportToBlob = async (
  opts: ExportOpts & {
    mimeType?: string;
    quality?: number;
    exportPadding?: number;
  },
): Promise<Blob> => {
  let { mimeType = MIME_TYPES.png, quality } = opts;

  if (mimeType === MIME_TYPES.png && typeof quality === "number") {
    console.warn(`"quality" will be ignored for "${MIME_TYPES.png}" mimeType`);
  }

  // typo in MIME type (should be "jpeg")
  if (mimeType === "image/jpg") {
    mimeType = MIME_TYPES.jpg;
  }

  if (mimeType === MIME_TYPES.jpg && !opts.appState?.exportBackground) {
    console.warn(
      `Defaulting "exportBackground" to "true" for "${MIME_TYPES.jpg}" mimeType`,
    );
    opts = {
      ...opts,
      appState: { ...opts.appState, exportBackground: true },
    };
  }

  const canvas = await exportToCanvas(opts);

  quality = quality ? quality : /image\/jpe?g/.test(mimeType) ? 0.92 : 0.8;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          return reject(new Error("couldn't export to blob"));
        }
        if (
          blob &&
          mimeType === MIME_TYPES.png &&
          opts.appState?.exportEmbedScene
        ) {
          blob = await encodePngMetadata({
            blob,
            metadata: serializeAsJSON(
              // NOTE as long as we're using the Scene hack, we need to ensure
              // we pass the original, uncloned elements when serializing
              // so that we keep ids stable (restoring keeps the ids)
              restoreElements(opts.elements, null),
              opts.appState,
              opts.files || {},
              "local",
            ),
          });
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
};

export const exportToSvg = async ({
  elements,
  appState = getDefaultAppState(),
  files = {},
  exportPadding,
  renderEmbeddables,
  exportingFrame,
  skipInliningFonts,
  reuseImages,
}: Omit<ExportOpts, "getDimensions"> & {
  exportPadding?: number;
  renderEmbeddables?: boolean;
  skipInliningFonts?: true;
  reuseImages?: boolean;
}): Promise<SVGSVGElement> => {
  const restoredElements = getNonDeletedElements(
    restoreElements(elements, null, {
      deleteInvisibleElements: true,
    }),
  );
  const restoredAppState = restoreAppState(appState, null);

  const exportAppState = {
    ...restoredAppState,
    exportPadding,
  };

  return _exportToSvg(restoredElements, exportAppState, files, {
    exportingFrame,
    renderEmbeddables,
    skipInliningFonts,
    reuseImages,
  });
};

export const exportToClipboard = async (
  opts: ExportOpts & {
    mimeType?: string;
    quality?: number;
    type: "png" | "svg" | "json";
  },
) => {
  if (opts.type === "svg") {
    const svg = await exportToSvg(opts);
    await copyTextToSystemClipboard(svg.outerHTML);
  } else if (opts.type === "png") {
    await copyBlobToClipboardAsPng(exportToBlob(opts));
  } else if (opts.type === "json") {
    await copyToClipboard(
      getNonDeletedElements(restoreElements(opts.elements, null)),
      opts.files,
    );
  } else {
    throw new Error("Invalid export type");
  }
};

export const exportToPdf = async (
  opts: ExportOpts & {
    exportPadding?: number;
    exportMode?: "multi-page-frames" | "single-page";
    frames?: readonly NonDeleted<ExcalidrawFrameLikeElement>[];
  },
): Promise<Blob> => {
  const exportMode = opts.exportMode ?? "single-page";
  const frames = opts.frames ?? [];

  if (exportMode === "multi-page-frames" && frames.length > 0) {
    const pages: PdfPage[] = [];
    for (const frame of frames) {
      const canvas = await exportToCanvas({
        ...opts,
        exportingFrame: frame,
      });
      pages.push({
        canvas,
        title: frame.name ?? undefined,
        width: frame.width,
        height: frame.height,
      });
    }
    const pdfBytes = generatePdfFromCanvases(pages, {
      title: opts.appState?.name ?? "Board Presentation",
      creator: "Firo",
    });
    return new Blob([pdfBytes.buffer as ArrayBuffer], {
      type: "application/pdf",
    });
  }

  // Single page mode (entire canvas or selection or single frame)
  const canvas = await exportToCanvas(opts);
  const pdfBytes = generatePdfFromCanvases(
    [
      {
        canvas,
        title: opts.appState?.name ?? "Board",
      },
    ],
    {
      title: opts.appState?.name ?? "Board",
      creator: "Firo",
    },
  );
  return new Blob([pdfBytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
};
