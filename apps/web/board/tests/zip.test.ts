import { describe, expect, it } from "vitest";

import { crc32, isZip, unzipFiles, zipFiles } from "../zip";

describe("zip utilities", () => {
  it("computes standard crc32 correctly", () => {
    const text = new TextEncoder().encode("123456789");
    // Standard test vector: CRC-32 of "123456789" is 0xcbf43926
    expect(crc32(text)).toBe(0xcbf43926);
  });

  it("identifies zip magic bytes", () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(true);
    expect(isZip(new Uint8Array([0x7b, 0x22, 0x61, 0x22]))).toBe(false);
    expect(isZip(new Uint8Array([0x00]))).toBe(false);
  });

  it("round-trips files byte-identically through zipFiles and unzipFiles", () => {
    const encoder = new TextEncoder();
    const files = new Map<string, Uint8Array>([
      [
        "manifest.json",
        encoder.encode(JSON.stringify({ format: "firo", version: 2 })),
      ],
      ["board.json", encoder.encode('{"elements":[],"meta":{}}')],
      [
        "assets/sample.txt",
        encoder.encode("Hello Firo and Miro! This is sample content."),
      ],
      [
        "assets/binary.bin",
        new Uint8Array([0, 1, 2, 255, 254, 128, 64, 32, 16]),
      ],
    ]);

    const zipped = zipFiles(files);
    expect(isZip(zipped)).toBe(true);
    expect(zipped.length).toBeGreaterThan(0);

    const unzipped = unzipFiles(zipped);
    expect(unzipped.size).toBe(files.size);

    for (const [path, originalBytes] of files) {
      const extracted = unzipped.get(path);
      expect(extracted).toBeDefined();
      expect(Array.from(extracted!)).toEqual(Array.from(originalBytes));
    }
  });

  it("produces deterministic bytes for the same input files regardless of insertion order", () => {
    const encoder = new TextEncoder();
    const mapA = new Map<string, Uint8Array>([
      ["b.txt", encoder.encode("second")],
      ["a.txt", encoder.encode("first")],
    ]);
    const mapB = new Map<string, Uint8Array>([
      ["a.txt", encoder.encode("first")],
      ["b.txt", encoder.encode("second")],
    ]);

    const zipA = zipFiles(mapA);
    const zipB = zipFiles(mapB);

    expect(Array.from(zipA)).toEqual(Array.from(zipB));
  });

  it("handles empty files cleanly", () => {
    const files = new Map<string, Uint8Array>([
      ["empty.txt", new Uint8Array(0)],
    ]);

    const zipped = zipFiles(files);
    const unzipped = unzipFiles(zipped);

    expect(unzipped.has("empty.txt")).toBe(true);
    expect(unzipped.get("empty.txt")?.length).toBe(0);
  });
});
