import type { FileId } from "@firo/element/types";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@firo/editor/types";

/**
 * Sniff MIME type from the magic bytes of raw file data.
 */
export const sniffMimeType = (bytes: Uint8Array): string => {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return "image/gif";
    }
    if (
      bytes.length >= 12 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    if (bytes[0] === 0x3c && (bytes[1] === 0x73 || bytes[1] === 0x3f)) {
      return "image/svg+xml";
    }
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return "application/pdf";
    }
  }
  return "image/png";
};

/**
 * Convert raw binary bytes into a base64 DataURL asynchronously using FileReader.
 */
export const uint8ArrayToDataUrl = (
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([buffer], { type: mimeType });
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert bytes to DataURL"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Injects imported binary assets into Excalidraw's runtime image cache so they render immediately.
 */
export const injectAssetsIntoEditor = async (
  api: ExcalidrawImperativeAPI,
  assets: Map<string, { hash: string; bytes: Uint8Array; mimeType: string }>,
): Promise<void> => {
  if (!assets || assets.size === 0) {
    return;
  }
  const binaryFiles: BinaryFileData[] = await Promise.all(
    Array.from(assets.values()).map(async (asset) => {
      const dataURL = await uint8ArrayToDataUrl(asset.bytes, asset.mimeType);
      return {
        id: asset.hash as FileId,
        dataURL: dataURL as DataURL,
        mimeType: asset.mimeType as any,
        created: Date.now(),
        lastRetrieved: Date.now(),
      };
    }),
  );
  api.addFiles(binaryFiles);
};
