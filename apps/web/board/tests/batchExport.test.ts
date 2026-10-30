import type { NonDeletedExcalidrawElement } from "@firo/element/types";
import type { AppState, BinaryFiles } from "@firo/editor/types";

import { exportAllFramesAsZip } from "../batchExport";
import { unzipFiles } from "../zip";

/*
 * The batch "export every frame as a zip" seam.
 *
 * The renderer calls (`exportToCanvas` / `exportToSvg` / `canvasToBlob`) are
 * mocked: their job is pixels, and pixels are covered by the editor's own
 * export tests. What is *not* covered anywhere else is the orchestration this
 * module owns and gets wrong on its own:
 *
 * 1. **Which frames export.** Only non-deleted frame-like elements; a deleted
 *    frame or a rectangle must not produce an entry.
 * 2. **The order.** Filenames carry a spatial reading order (top-to-bottom
 *    with a 20px row tolerance, then left-to-right) as a zero-padded index,
 *    so the zip unpacks in the order a person reads the board, not the order
 *    the frames happen to sit in the element array.
 * 3. **The names.** Illegal filename characters are replaced, an empty result
 *    falls back to "Frame", and an unnamed frame falls back to Frame_N.
 * 4. **The archive itself.** The result is a real zip that round-trips
 *    through `unzipFiles`, with the format's extension on every entry.
 */

const exportToCanvasMock = vi.fn();
const exportToSvgMock = vi.fn();
const canvasToBlobMock = vi.fn();

vi.mock("@firo/editor/scene/export", () => ({
  exportToCanvas: (...args: unknown[]) => exportToCanvasMock(...args),
  exportToSvg: (...args: unknown[]) => exportToSvgMock(...args),
}));

vi.mock("@firo/editor/data/blob", () => ({
  canvasToBlob: (...args: unknown[]) => canvasToBlobMock(...args),
}));

/** A frame at a known position, named after its id unless overridden. */
const frame = (
  id: string,
  x = 0,
  y = 0,
  name: string | null = id,
): NonDeletedExcalidrawElement =>
  ({
    id,
    type: "frame",
    x,
    y,
    width: 400,
    height: 300,
    angle: 0,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    link: null,
    locked: false,
    created: 1000,
    updated: 1000,
    name,
  } as unknown as NonDeletedExcalidrawElement);

const rectangle = (id: string): NonDeletedExcalidrawElement =>
  ({ ...frame(id), type: "rectangle" } as NonDeletedExcalidrawElement);

const appState = {
  viewBackgroundColor: "#ffffff",
  exportWithDarkMode: false,
} as unknown as AppState;

const noFiles = {} as BinaryFiles;

/** jsdom's Blob has no arrayBuffer(); FileReader is the supported read. */
const blobToBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });

/** Run the png path and unzip the result into a name → text map. */
const exportPngEntries = async (
  elements: NonDeletedExcalidrawElement[],
): Promise<Map<string, string>> => {
  const blob = await exportAllFramesAsZip({
    elements,
    appState,
    files: noFiles,
    format: "png",
  });
  expect(blob.type).toBe("application/zip");
  const bytes = await blobToBytes(blob);
  const entries = unzipFiles(bytes);
  const texts = new Map<string, string>();
  for (const [name, content] of entries) {
    texts.set(name, new TextDecoder().decode(content));
  }
  return texts;
};

beforeEach(() => {
  vi.clearAllMocks();
  // The canvas stands in for the frame it rendered; the blob body is the
  // frame id, so each zip entry can be traced back to its source frame.
  exportToCanvasMock.mockImplementation(
    (_elements: unknown, _appState: unknown, _files: unknown, opts: unknown) =>
      (opts as { exportingFrame: { id: string } }).exportingFrame.id,
  );
  // jsdom's Blob has no arrayBuffer(); the seam only needs that one method.
  canvasToBlobMock.mockImplementation(async (frameId: string) => ({
    arrayBuffer: async () => new TextEncoder().encode(frameId).buffer,
  }));
  exportToSvgMock.mockImplementation(
    async (
      _elements: unknown,
      _opts: unknown,
      _files: unknown,
      opts: unknown,
    ) => ({
      outerHTML: `<svg data-frame="${
        (opts as { exportingFrame: { id: string } }).exportingFrame.id
      }"/>`,
    }),
  );
});

describe("exportAllFramesAsZip", () => {
  it("refuses a board with no frames", async () => {
    await expect(
      exportAllFramesAsZip({
        elements: [rectangle("r1")],
        appState,
        files: noFiles,
        format: "png",
      }),
    ).rejects.toThrow("No frames");
  });

  it("refuses a board whose only frame is deleted", async () => {
    const gone = {
      ...frame("f1"),
      isDeleted: true,
    } as unknown as NonDeletedExcalidrawElement;
    await expect(
      exportAllFramesAsZip({
        elements: [gone],
        appState,
        files: noFiles,
        format: "png",
      }),
    ).rejects.toThrow("No frames");
  });

  it("exports only the live frames, not deleted frames or other elements", async () => {
    const gone = {
      ...frame("f-gone"),
      isDeleted: true,
    } as unknown as NonDeletedExcalidrawElement;
    const entries = await exportPngEntries([
      rectangle("r1"),
      gone,
      frame("f-live"),
    ]);
    expect([...entries.keys()]).toEqual(["01_f-live.png"]);
    expect(entries.get("01_f-live.png")).toBe("f-live");
  });

  it("orders entries top-to-bottom, not by element order", async () => {
    const entries = await exportPngEntries([
      frame("bottom", 0, 900),
      frame("top", 0, 0),
      frame("middle", 0, 400),
    ]);
    expect([...entries.keys()]).toEqual([
      "01_top.png",
      "02_middle.png",
      "03_bottom.png",
    ]);
  });

  it("orders frames on the same row left-to-right", async () => {
    // A 10px vertical gap is inside the 20px row tolerance.
    const entries = await exportPngEntries([
      frame("right", 800, 10),
      frame("left", 100, 0),
    ]);
    expect([...entries.keys()]).toEqual(["01_left.png", "02_right.png"]);
  });

  it("replaces characters a filename cannot carry", async () => {
    const entries = await exportPngEntries([
      frame("f1", 0, 0, 'a/b\\c:d*e?f"g<h>i|j'),
    ]);
    expect([...entries.keys()]).toEqual(["01_a_b_c_d_e_f_g_h_i_j.png"]);
  });

  it("falls back to Frame when the name sanitizes to nothing", async () => {
    const entries = await exportPngEntries([frame("f1", 0, 0, "   ")]);
    expect([...entries.keys()]).toEqual(["01_Frame.png"]);
  });

  it("names unnamed frames Frame_N in spatial order", async () => {
    const entries = await exportPngEntries([
      frame("f-b", 0, 500, null),
      frame("f-a", 0, 0, null),
    ]);
    expect([...entries.keys()]).toEqual(["01_Frame_1.png", "02_Frame_2.png"]);
  });

  it("zero-pads the index past nine frames", async () => {
    const elements = Array.from({ length: 12 }, (_, i) =>
      frame(`f${i}`, 0, i * 500),
    );
    const entries = await exportPngEntries(elements);
    const names = [...entries.keys()];
    expect(names[0]).toBe("01_f0.png");
    expect(names[8]).toBe("09_f8.png");
    expect(names[9]).toBe("10_f9.png");
    expect(names).toHaveLength(12);
  });

  it("passes the scale through as the png export scale", async () => {
    await exportPngEntries([frame("f1")]);
    expect(exportToCanvasMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exportScale: 2 }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("writes svg entries with the svg markup as their body", async () => {
    const blob = await exportAllFramesAsZip({
      elements: [frame("f1"), frame("f2", 0, 500)],
      appState,
      files: noFiles,
      format: "svg",
    });
    const entries = unzipFiles(await blobToBytes(blob));
    expect([...entries.keys()]).toEqual(["01_f1.svg", "02_f2.svg"]);
    expect(new TextDecoder().decode(entries.get("01_f1.svg"))).toBe(
      '<svg data-frame="f1"/>',
    );
    expect(exportToCanvasMock).not.toHaveBeenCalled();
  });
});
