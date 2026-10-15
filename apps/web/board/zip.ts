/**
 * Lightweight, zero-dependency ZIP reader and writer using pako for deflate/inflate.
 *
 * ## Why this exists
 *
 * [ADR-0018](../../docs/adr/0018-a-firo-is-a-directory.md) §7 notes:
 * "A zip is a transport, not the format. It may be offered beside the directory
 * for browsers with no directory writer and for email. Import accepts both."
 *
 * This module provides clean, cross-platform packing and unpacking for:
 * 1. Packaged `.firo` boards (containing `manifest.json`, `board.json`, and `assets/`).
 * 2. Miro `.rtb` board backups (which are standard ZIP archives containing
 *    `board.json`, `resources.json`, and image assets).
 */
import { deflateRaw, inflateRaw } from "pako";

const LOCAL_HEADER_SIG = 0x04034b50; // PK\x03\x04
const CENTRAL_HEADER_SIG = 0x02014b50; // PK\x01\x02
const EOCD_SIG = 0x06054b50; // PK\x05\x06

// Precomputed CRC32 table for IEEE 802.3
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

/** Compute standard CRC-32 checksum. */
export const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Check if the provided buffer begins with the standard ZIP magic bytes `PK\x03\x04`.
 */
export const isZip = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) {
    return false;
  }
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
};

interface ZipEntry {
  path: string;
  data: Uint8Array;
  compressed: Uint8Array;
  crc: number;
  method: number;
  localHeaderOffset: number;
}

/**
 * Packs a map of path -> bytes into a standard ZIP archive buffer.
 *
 * File paths should be relative and use forward slashes (e.g. `assets/image.png`).
 */
export const zipFiles = (
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array => {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  // Sort paths deterministically so same files produce identical bytes
  const sortedPaths = Array.from(files.keys()).sort();

  for (const path of sortedPaths) {
    const data = files.get(path) ?? new Uint8Array(0);
    const checksum = crc32(data);

    // Compress with deflateRaw. If compressed is not smaller, store as raw.
    let compressed: Uint8Array;
    let method: number;
    try {
      const deflated = deflateRaw(data, { level: 6 });
      if (deflated.length < data.length) {
        compressed = deflated;
        method = 8; // Deflate
      } else {
        compressed = data;
        method = 0; // Store
      }
    } catch {
      compressed = data;
      method = 0;
    }

    const pathBytes = encoder.encode(path);
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, LOCAL_HEADER_SIG, true);
    view.setUint16(4, 20, true); // Version needed (2.0)
    view.setUint16(6, 0x0800, true); // Bit 11: UTF-8 filename
    view.setUint16(8, method, true); // Compression method
    view.setUint16(10, 0, true); // Mod time (00:00:00)
    view.setUint16(12, 0x21, true); // Mod date (1980-01-01) for determinism
    view.setUint32(14, checksum, true);
    view.setUint32(18, compressed.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true); // Extra field length

    localHeader.set(pathBytes, 30);

    entries.push({
      path,
      data,
      compressed,
      crc: checksum,
      method,
      localHeaderOffset: currentOffset,
    });

    chunks.push(localHeader);
    chunks.push(compressed);
    currentOffset += localHeader.length + compressed.length;
  }

  // Central directory
  const centralDirStart = currentOffset;
  for (const entry of entries) {
    const pathBytes = encoder.encode(entry.path);
    const cdHeader = new Uint8Array(46 + pathBytes.length);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, CENTRAL_HEADER_SIG, true);
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed
    view.setUint16(8, 0x0800, true); // UTF-8
    view.setUint16(10, entry.method, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0x21, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.compressed.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, pathBytes.length, true);
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // File comment length
    view.setUint16(34, 0, true); // Disk number
    view.setUint16(36, 0, true); // Internal attributes
    view.setUint32(38, 0, true); // External attributes
    view.setUint32(42, entry.localHeaderOffset, true);

    cdHeader.set(pathBytes, 46);
    chunks.push(cdHeader);
    currentOffset += cdHeader.length;
  }

  const centralDirSize = currentOffset - centralDirStart;

  // End of Central Directory (EOCD)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIG, true);
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Start disk
  eocdView.setUint16(8, entries.length, true); // Entries on disk
  eocdView.setUint16(10, entries.length, true); // Total entries
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirStart, true);
  eocdView.setUint16(20, 0, true); // Comment length
  chunks.push(eocd);

  // Combine into single Uint8Array
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
};

/**
 * Extracts all files from a ZIP archive buffer into a Map of path -> Uint8Array.
 */
export const unzipFiles = (zipBytes: Uint8Array): Map<string, Uint8Array> => {
  const result = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8");
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );

  // Locate EOCD record by scanning backwards from the end of file
  let eocdOffset = -1;
  const maxSearch = Math.min(zipBytes.length, 65535 + 22);
  for (let i = zipBytes.length - 22; i >= zipBytes.length - maxSearch; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    let offset = cdOffset;
    for (let entry = 0; entry < totalEntries && offset < eocdOffset; entry++) {
      if (view.getUint32(offset, true) !== CENTRAL_HEADER_SIG) {
        break;
      }

      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);

      const nameBytes = zipBytes.subarray(offset + 46, offset + 46 + nameLen);
      const name = decoder.decode(nameBytes);

      offset += 46 + nameLen + extraLen + commentLen;

      // Skip directory entries ending in /
      if (name.endsWith("/")) {
        continue;
      }

      // Check local header to find exact data start
      if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIG) {
        continue;
      }
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressedData = zipBytes.subarray(
        dataStart,
        dataStart + compressedSize,
      );

      if (method === 0) {
        // Stored uncompressed
        result.set(name, compressedData);
      } else if (method === 8) {
        // Deflated
        try {
          const inflated = inflateRaw(compressedData);
          result.set(name, inflated);
        } catch (err) {
          console.warn(`[zip] Failed to inflate entry "${name}":`, err);
        }
      } else {
        console.warn(
          `[zip] Unsupported compression method ${method} for "${name}"`,
        );
      }
    }

    if (result.size > 0) {
      return result;
    }
  }

  // Fallback: walk local file headers sequentially from start
  let offset = 0;
  while (offset + 30 <= zipBytes.length) {
    if (view.getUint32(offset, true) !== LOCAL_HEADER_SIG) {
      break;
    }

    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const nameBytes = zipBytes.subarray(offset + 30, offset + 30 + nameLen);
    const name = decoder.decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressedData = zipBytes.subarray(
      dataStart,
      dataStart + compressedSize,
    );

    if (!name.endsWith("/")) {
      if (method === 0) {
        result.set(name, compressedData);
      } else if (method === 8) {
        try {
          const inflated = inflateRaw(compressedData);
          result.set(name, inflated);
        } catch (err) {
          console.warn(`[zip] Failed to inflate local entry "${name}":`, err);
        }
      }
    }

    offset = dataStart + compressedSize;
  }

  return result;
};
