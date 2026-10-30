import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  injectAssetsIntoEditor,
  sniffMimeType,
  uint8ArrayToDataUrl,
} from "../assets";

/*
 * The asset helpers: how imported image bytes get their real type and reach
 * the editor's runtime cache.
 *
 * 1. **The sniffed type is the file's, not the extension's.** An import
 *    pipeline that trusted names would happily serve a JPEG as image/png;
 *    the magic bytes are the only honest source.
 * 2. **The DataURL conversion is total.** Every asset that goes in must come
 *    out as a `data:<mime>;base64` URL or the image silently never renders.
 * 3. **Injection is a no-op for an empty set**, so a text-only board import
 *    never disturbs the editor's file cache.
 */

const bytes = (...values: number[]) => new Uint8Array(values);

describe("sniffMimeType", () => {
  it("knows the image formats by their magic bytes", () => {
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))).toBe(
      "image/png",
    );
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMimeType(bytes(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
  });

  it("reads WEBP out of the RIFF container, not the first bytes", () => {
    // "RIFF" + size + "WEBP": the format tag sits at bytes 8-11.
    expect(
      sniffMimeType(
        bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  it("knows svg by its opening angle bracket and pdf by %PDF", () => {
    expect(sniffMimeType(bytes(0x3c, 0x73, 0x76, 0x67))).toBe("image/svg+xml");
    expect(sniffMimeType(bytes(0x3c, 0x3f, 0x78, 0x6d))).toBe("image/svg+xml");
    expect(sniffMimeType(bytes(0x25, 0x50, 0x44, 0x46))).toBe(
      "application/pdf",
    );
  });

  it("falls back to image/png for unknown or truncated data", () => {
    expect(sniffMimeType(bytes(0x00, 0x01, 0x02, 0x03))).toBe("image/png");
    expect(sniffMimeType(bytes(0x89, 0x50))).toBe("image/png");
    expect(sniffMimeType(new Uint8Array(0))).toBe("image/png");
  });
});

describe("uint8ArrayToDataUrl", () => {
  it("encodes the bytes with the given MIME type", async () => {
    const url = await uint8ArrayToDataUrl(
      bytes(0x89, 0x50, 0x4e, 0x47),
      "image/png",
    );
    expect(url).toBe("data:image/png;base64,iVBORw==");
  });

  it("carries only the view's bytes, not its whole buffer", async () => {
    const backing = bytes(0x00, 0x89, 0x50, 0x4e, 0x47, 0x00);
    const view = new Uint8Array(backing.buffer, 1, 4);
    const url = await uint8ArrayToDataUrl(view, "image/png");
    expect(url).toBe("data:image/png;base64,iVBORw==");
  });
});

describe("injectAssetsIntoEditor", () => {
  const fakeApi = () => {
    const added: Array<Array<Record<string, unknown>>> = [];
    return {
      api: {
        addFiles: (files: Array<Record<string, unknown>>) => {
          added.push(files);
        },
      } as unknown as ExcalidrawImperativeAPI,
      added,
    };
  };

  it("does nothing for a board with no assets", async () => {
    const { api, added } = fakeApi();
    await injectAssetsIntoEditor(api, new Map());
    expect(added).toEqual([]);
  });

  it("adds every asset to the editor cache under its hash", async () => {
    const { api, added } = fakeApi();
    await injectAssetsIntoEditor(
      api,
      new Map([
        [
          "hash-a",
          {
            hash: "hash-a",
            bytes: bytes(0x89, 0x50, 0x4e, 0x47),
            mimeType: "image/png",
          },
        ],
        [
          "hash-b",
          {
            hash: "hash-b",
            bytes: bytes(0xff, 0xd8, 0xff),
            mimeType: "image/jpeg",
          },
        ],
      ]),
    );
    expect(added).toHaveLength(1);
    const files = added[0];
    expect(files.map((file) => file.id)).toEqual(["hash-a", "hash-b"]);
    expect(files[0].mimeType).toBe("image/png");
    expect(files[0].dataURL).toBe("data:image/png;base64,iVBORw==");
    expect(files[1].dataURL).toBe("data:image/jpeg;base64,/9j/");
  });
});
