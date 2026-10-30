import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { FiroDoc } from "@firo/doc";

import { complain, registerFileActions } from "../fileActions";

/*
 * The file actions seam: the four menu actions Firo registers with the editor
 * (export .firo, export folder, export Miro script, import) and the toast
 * they all report through.
 *
 * The layer underneath - `files.ts` export/import, the zip packing, the Miro
 * script generator - has its own tests (files.test.ts, packagedFiro.test.ts,
 * miroConvert.test.ts). What only this module does, and what these tests
 * pin down:
 *
 * 1. **Registration.** Exactly the four documented actions, with literal
 *    labels (Firo has no locale files, so a key would render as the key) and
 *    `file` tracking category.
 * 2. **Refusals are visible.** Every path that cannot do the thing says so
 *    with a toast and returns `false` - the action system's own word for
 *    "no app state changed". A silent refusal reads as the menu being broken.
 * 3. **The packaged fallback.** A board whose images do not fit single-file
 *    JSON (`assets-not-carried`) is exported as a packaged .firo instead of
 *    failing.
 * 4. **The encrypted-Miro handoff.** A Miro backup whose canvas is KMS-
 *    encrypted stashes its extracted archive and feeds it into the *next*
 *    import attempt, then clears it.
 */

const exportBoardMock = vi.fn();
const exportPackagedBoardMock = vi.fn();
const exportBoardDirectoryMock = vi.fn();
const exportFilenameMock = vi.fn(() => "board.firo");
const downloadBoardMock = vi.fn();
const importBoardFileMock = vi.fn();
const pickBinaryFileMock = vi.fn();

vi.mock("../files", () => ({
  exportBoard: (...args: unknown[]) => exportBoardMock(...args),
  exportPackagedBoard: (...args: unknown[]) => exportPackagedBoardMock(...args),
  exportBoardDirectory: (...args: unknown[]) =>
    exportBoardDirectoryMock(...args),
  exportFilename: () => exportFilenameMock(),
  downloadBoard: (...args: unknown[]) => downloadBoardMock(...args),
  importBoardFile: (...args: unknown[]) => importBoardFileMock(...args),
  pickBinaryFile: (...args: unknown[]) => pickBinaryFileMock(...args),
}));

const canPickDirectoryMock = vi.fn();
vi.mock("../firoDownload", () => ({
  canPickDirectory: () => canPickDirectoryMock(),
  writeFiroDirectory: vi.fn(),
}));

const generateMiroCreationScriptMock = vi.fn(
  (..._args: unknown[]) => "MIRO-SCRIPT",
);
vi.mock("../miro", () => ({
  generateMiroCreationScript: (...args: unknown[]) =>
    generateMiroCreationScriptMock(...args),
}));

vi.mock("../assets", () => ({
  injectAssetsIntoEditor: vi.fn(),
}));

vi.mock("@firo/doc", () => ({
  getAssetBytes: vi.fn(async () => null),
  putAsset: vi.fn(),
}));

interface RegisteredAction {
  name: string;
  label: unknown;
  keywords: string[];
  trackEvent: { category: string };
  perform: () => unknown;
}

/** An api double that records registered actions and toasts. */
const fakeApi = () => {
  const actions = new Map<string, RegisteredAction>();
  const toasts: Array<{ message: string }> = [];
  const api = {
    registerAction: (action: RegisteredAction) => {
      actions.set(action.name, action);
    },
    setToast: (toast: { message: string }) => {
      toasts.push(toast);
    },
  } as unknown as ExcalidrawImperativeAPI;
  return { api, actions, toasts };
};

const docWith = (elements: unknown[] = []) =>
  ({
    read: () => ({ elements }),
  } as unknown as FiroDoc);

/** Let the fire-and-forget promise chains inside actions settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("complain", () => {
  it("toasts the message closable for six seconds and warns the console", () => {
    const { api, toasts } = fakeApi();
    complain(api, "it broke");
    expect(toasts).toEqual([
      { message: "it broke", closable: true, duration: 6000 },
    ]);
    expect(console.warn).toHaveBeenCalledWith("[firo] it broke");
  });
});

describe("registerFileActions", () => {
  it("registers exactly the four file actions", () => {
    const { api, actions } = fakeApi();
    registerFileActions(api, () => docWith());
    expect([...actions.keys()].sort()).toEqual([
      "exportFiroDirectory",
      "exportFiroFile",
      "exportMiroScript",
      "importFiroFile",
    ]);
    for (const action of actions.values()) {
      expect(typeof action.label).toBe("string");
      expect(action.trackEvent.category).toBe("file");
    }
  });

  it("downloads the board when the plain export succeeds", async () => {
    exportBoardMock.mockReturnValue({ ok: true, filename: "b.json" });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    const result = await actions.get("exportFiroFile")!.perform();
    expect(result).toBe(false);
    expect(downloadBoardMock).toHaveBeenCalledWith({
      ok: true,
      filename: "b.json",
    });
    expect(exportPackagedBoardMock).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it("falls back to a packaged export when assets are not carried", async () => {
    exportBoardMock.mockReturnValue({
      ok: false,
      reason: "assets-not-carried",
      detail: "images",
    });
    exportPackagedBoardMock.mockResolvedValue({ ok: true, filename: "b.zip" });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    await actions.get("exportFiroFile")!.perform();
    expect(exportPackagedBoardMock).toHaveBeenCalledTimes(1);
    expect(downloadBoardMock).toHaveBeenCalledWith({
      ok: true,
      filename: "b.zip",
    });
    expect(toasts).toEqual([]);
  });

  it("complains instead of downloading when the export fails", async () => {
    exportBoardMock.mockReturnValue({
      ok: false,
      reason: "broken",
      detail: "no elements",
    });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    const result = await actions.get("exportFiroFile")!.perform();
    expect(result).toBe(false);
    expect(downloadBoardMock).not.toHaveBeenCalled();
    expect(toasts[0].message).toContain("could not be exported");
    expect(toasts[0].message).toContain("no elements");
  });

  it("complains when the prepared download does not start", async () => {
    exportBoardMock.mockReturnValue({ ok: true });
    downloadBoardMock.mockImplementation(() => {
      throw new Error("popup blocked");
    });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    await actions.get("exportFiroFile")!.perform();
    expect(toasts[0].message).toContain("download did not start");
    expect(toasts[0].message).toContain("popup blocked");
  });

  it("refuses folder export on browsers without a directory picker", async () => {
    canPickDirectoryMock.mockReturnValue(false);
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    const result = await actions.get("exportFiroDirectory")!.perform();
    expect(result).toBe(false);
    expect(toasts[0].message).toContain("does not support folder export");
    expect(exportBoardDirectoryMock).not.toHaveBeenCalled();
  });

  it("refuses the Miro script export on an empty board", () => {
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith([]));
    const result = actions.get("exportMiroScript")!.perform();
    expect(result).toBe(false);
    expect(toasts[0].message).toContain("board is empty");
    expect(generateMiroCreationScriptMock).not.toHaveBeenCalled();
  });

  it("copies the generated Miro script to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith([{ id: "e1" }]));
    actions.get("exportMiroScript")!.perform();
    await flush();
    expect(generateMiroCreationScriptMock).toHaveBeenCalledWith([{ id: "e1" }]);
    expect(writeText).toHaveBeenCalledWith("MIRO-SCRIPT");
    expect(toasts[0].message).toContain("copied to clipboard");
  });

  it("does nothing visible when the import picker is cancelled", async () => {
    pickBinaryFileMock.mockResolvedValue(null);
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    const result = await actions.get("importFiroFile")!.perform();
    expect(result).toBe(false);
    expect(importBoardFileMock).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it("complains when the import is rejected", async () => {
    pickBinaryFileMock.mockResolvedValue({ bytes: new Uint8Array([1]) });
    importBoardFileMock.mockResolvedValue({
      ok: false,
      reason: "parse",
      detail: "not a board",
    });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    await actions.get("importFiroFile")!.perform();
    expect(toasts[0].message).toContain("not imported");
    expect(toasts[0].message).toContain("not a board");
  });

  it("hands an encrypted Miro archive to the next import, then clears it", async () => {
    const archive = { mediaFiles: new Map([["m1", new Uint8Array([9])]]) };
    pickBinaryFileMock.mockResolvedValue({ bytes: new Uint8Array([1]) });
    importBoardFileMock
      .mockResolvedValueOnce({
        ok: false,
        reason: "miro-rtb-canvas-encrypted",
        rtbArchive: archive,
      })
      .mockResolvedValueOnce({ ok: true, elements: 3, assets: new Map() })
      .mockResolvedValueOnce({ ok: true, elements: 1, assets: new Map() });
    const { api, actions, toasts } = fakeApi();
    registerFileActions(api, () => docWith());
    const perform = actions.get("importFiroFile")!.perform;

    await perform();
    expect(toasts[0].message).toContain("encrypted by Miro KMS");

    await perform();
    expect(importBoardFileMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ miroRtbArchive: archive }),
    );
    expect(toasts[1].message).toContain("Board loaded successfully (3");

    // A third import no longer carries the stashed archive.
    await perform();
    expect(importBoardFileMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ miroRtbArchive: undefined }),
    );
  });
});
