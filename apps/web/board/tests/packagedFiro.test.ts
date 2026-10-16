import { describe, expect, it } from "vitest";

import { createFiroDoc, hashBytes } from "@firo/doc";
import { createStickyNote } from "@firo/board/defaults";

import { exportPackagedBoard, importBoardFile } from "../files";
import { isZip, unzipFiles, zipFiles } from "../zip";

describe("packaged .firo and multi-format import", () => {
  it("exports a packaged .firo ZIP carrying elements and assets", async () => {
    const doc = createFiroDoc();

    const fakeAssetBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header bytes
    const realHash = await hashBytes(
      fakeAssetBytes.buffer.slice(
        fakeAssetBytes.byteOffset,
        fakeAssetBytes.byteOffset + fakeAssetBytes.byteLength,
      ) as ArrayBuffer,
    );
    const assetStore = new Map<string, Uint8Array>([
      [realHash, fakeAssetBytes],
    ]);

    // Commit a sticky note and an image element
    doc.commit([
      {
        kind: "createElement",
        element: createStickyNote({
          id: "note_1",
          text: "Important Note",
          x: 10,
          y: 10,
        }),
      },
      {
        kind: "createElement",
        element: {
          id: "img_1",
          type: "image",
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          angle: 0,
          fileId: "file_1",
          status: "saved",
          scale: [1, 1],
          crop: null,
          strokeColor: "transparent",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roundness: null,
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          version: 1,
          versionNonce: 12345,
          index: null,
          created: 1000,
          updated: 1000,
          isDeleted: false,
        },
      },
      {
        kind: "setAsset",
        id: "file_1",
        reference: {
          hash: realHash,
          mimeType: "image/png",
          bytes: fakeAssetBytes.byteLength,
        },
      },
    ] as never);

    const result = await exportPackagedBoard(doc, {
      readAsset: async (hash) => assetStore.get(hash) ?? null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.isZip).toBe(true);
    expect(result.bytes instanceof Uint8Array).toBe(true);

    const bytes = result.bytes as Uint8Array;
    expect(isZip(bytes)).toBe(true);

    const unzipped = unzipFiles(bytes);
    expect(unzipped.has("manifest.json")).toBe(true);
    expect(unzipped.has("board.json")).toBe(true);

    // Verify assets folder contains the image
    const assetEntries = Array.from(unzipped.keys()).filter((k) =>
      k.startsWith("assets/"),
    );
    expect(assetEntries.length).toBe(1);

    // Now test re-importing this packaged ZIP into a new clean document
    const newDoc = createFiroDoc();
    const importedAssets = new Map<string, Uint8Array>();

    const importResult = await importBoardFile(newDoc, bytes, {
      putAsset: async (hash, data) => {
        importedAssets.set(hash, data as Uint8Array);
      },
    });

    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      throw new Error("Expected importResult to be ok");
    }
    expect(importResult.format).toBe("firo-v2");

    const loadedElements = newDoc.read().elements;
    expect(loadedElements.length).toBe(2);
    expect(loadedElements.some((e) => e.type === "stickynote")).toBe(true);
    expect(loadedElements.some((e) => e.type === "image")).toBe(true);
    expect(importedAssets.has(realHash)).toBe(true);
  });

  it("imports Miro items JSON directly into Firo document", async () => {
    const doc = createFiroDoc();

    const miroItems = [
      {
        id: "m_note_1",
        type: "sticky_note",
        data: { content: "<p>Miro Idea</p>" },
        position: { x: 300, y: 300, origin: "center" as const },
        geometry: { width: 120, height: 120 },
        style: { fillColor: "yellow" },
      },
      {
        id: "m_shape_1",
        type: "shape",
        data: { shape: "circle" },
        position: { x: 500, y: 300, origin: "center" as const },
        geometry: { width: 100, height: 100 },
        style: { fillColor: "cyan" },
      },
    ];

    const jsonString = JSON.stringify(miroItems);
    const importResult = await importBoardFile(doc, jsonString);

    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      throw new Error("Expected importResult to be ok");
    }
    expect(importResult.format).toBe("miro");

    const elements = doc.read().elements;
    expect(elements.length).toBe(2);
    // Stratified z-order places shapes (layer 10) below sticky notes (layer 30)
    expect(elements[0].type).toBe("ellipse");
    expect(elements[1].type).toBe("stickynote");
  });

  it("handles Miro .rtb backup by extracting assets and pairing with Miro items", async () => {
    const encoder = new TextEncoder();
    const fakeImagePng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Construct mock Miro RTB zip
    const rtbFiles = new Map<string, Uint8Array>([
      [
        "meta.json",
        encoder.encode('{"version":"1.39","encryptionVersion":"1.1"}'),
      ],
      ["board.json", encoder.encode('{"id":12345,"name":"Miro Sprint Board"}')],
      [
        "resources.json",
        encoder.encode(
          JSON.stringify({
            resources: [{ id: 999111, name: "diagram.png", extension: "png" }],
          }),
        ),
      ],
      ["999111.png", fakeImagePng],
      [
        "canvas.json",
        new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]),
      ], // encrypted binary
    ]);

    const rtbZipBytes = zipFiles(rtbFiles);

    const doc = createFiroDoc();

    // 1. Without companion items, it identifies encryption and extracts media assets
    const firstAttempt = await importBoardFile(doc, rtbZipBytes);
    expect(firstAttempt.ok).toBe(false);
    if (firstAttempt.ok) {
      throw new Error("Expected firstAttempt to fail");
    }
    expect(firstAttempt.reason).toBe("miro-rtb-canvas-encrypted");
    expect(firstAttempt.rtbArchive).toBeDefined();
    expect(firstAttempt.rtbArchive?.mediaFiles.size).toBe(1);
    expect(firstAttempt.rtbArchive?.board?.name).toBe("Miro Sprint Board");

    // 2. With companion Miro items JSON (e.g. from miro.board.get()), it imports fully with the image
    const companionItems = [
      {
        id: "sticky_m",
        type: "sticky_note",
        data: { content: "Sprint Goal" },
      },
      {
        id: "img_m",
        type: "image",
        data: { resourceId: 999111 },
        geometry: { width: 300, height: 200 },
      },
    ];

    const putAssets = new Map<string, Uint8Array>();
    const secondAttempt = await importBoardFile(doc, rtbZipBytes, {
      miroItems: companionItems,
      putAsset: async (hash, data) => {
        putAssets.set(hash, data as Uint8Array);
      },
    });

    expect(secondAttempt.ok).toBe(true);
    if (!secondAttempt.ok) {
      throw new Error("Expected secondAttempt to be ok");
    }
    expect(secondAttempt.format).toBe("miro");

    const loadedElements = doc.read().elements;
    expect(loadedElements.length).toBe(2);
    expect(loadedElements.some((e) => e.type === "stickynote")).toBe(true);
    const imgEl = loadedElements.find((e) => e.type === "image");
    expect(imgEl).toBeDefined();
    expect(imgEl?.status).toBe("saved");
    expect(putAssets.size).toBe(1);
  });
});
