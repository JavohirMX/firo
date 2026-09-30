import tEXt from "png-chunk-text";
import encodePng from "png-chunks-encode";
import decodePng from "png-chunks-extract";

import { IMPORT_DATA_TYPES, MIME_TYPES } from "@firo/common";

import { blobToArrayBuffer } from "./blob";
import { encode, decode } from "./encode";

// -----------------------------------------------------------------------------
// PNG
// -----------------------------------------------------------------------------

export const getTEXtChunk = async (
  blob: Blob,
): Promise<{ keyword: string; text: string } | null> => {
  const chunks = decodePng(new Uint8Array(await blobToArrayBuffer(blob)));
  const metadataChunk = chunks.find((chunk) => chunk.name === "tEXt");
  if (metadataChunk) {
    return tEXt.decode(metadataChunk.data);
  }
  return null;
};

export const encodePngMetadata = async ({
  blob,
  metadata,
}: {
  blob: Blob;
  metadata: string;
}) => {
  const chunks = decodePng(new Uint8Array(await blobToArrayBuffer(blob)));

  const metadataChunk = tEXt.encode(
    MIME_TYPES.firo,
    JSON.stringify(
      encode({
        text: metadata,
        compress: true,
      }),
    ),
  );
  // insert metadata before last chunk (iEND)
  chunks.splice(-1, 0, metadataChunk);

  return new Blob([encodePng(chunks)], { type: MIME_TYPES.png });
};

export const decodePngMetadata = async (blob: Blob) => {
  const metadata = await getTEXtChunk(blob);
  // Firo writes `application/vnd.firo+json` as the PNG tEXt keyword; PNGs
  // exported by upstream Excalidraw carry the legacy keyword and must still
  // open.
  if (
    metadata &&
    [MIME_TYPES.firo, MIME_TYPES.legacyExcalidraw].includes(
      metadata.keyword as typeof MIME_TYPES.firo,
    )
  ) {
    try {
      const encodedData = JSON.parse(metadata.text);
      if (!("encoded" in encodedData)) {
        // legacy, un-encoded scene JSON
        if (
          "type" in encodedData &&
          (IMPORT_DATA_TYPES as readonly unknown[]).includes(encodedData.type)
        ) {
          return metadata.text;
        }
        throw new Error("FAILED");
      }
      return decode(encodedData);
    } catch (error: any) {
      console.error(error);
      throw new Error("FAILED");
    }
  }
  throw new Error("INVALID");
};
