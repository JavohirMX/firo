/**
 * Putting `.firo` export and import into the editor's own menu.
 *
 * ## Why actions and not buttons in the app shell
 *
 * `excalidrawAPI.registerAction` is the supported way for a host to add to the canvas
 * menu, and it is the right one here for three reasons that are all about consistency
 * rather than effort:
 *
 * - It puts them where "Export image" already is, so the thing that saves your work and
 *   the thing that draws it are in the same menu.
 * - They get the command palette, keyboard navigation and focus handling for free, and
 *   AC-8 makes full keyboard operation a hard requirement.
 * - The app shell currently renders no chrome of its own — `renderTopRightUI` returns
 *   `null` — so buttons there would be the first new UI surface in the product, added
 *   for two actions, with no design behind it.
 *
 * ## What the actions do *not* do
 *
 * Neither commits anything to the document. Export reads; import replaces the board
 * only after `parseBoard` has accepted the file, and only when the board is empty. An
 * action that both mutated the document and reported failure would leave undo
 * explaining something the person did not do.
 */

import { getAssetBytes, putAsset } from "@firo/doc";

import type { FiroDoc } from "@firo/doc";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { ActionResult } from "@firo/editor/actions/types";

import {
  downloadBoard,
  exportBoard,
  exportBoardDirectory,
  exportFilename,
  exportPackagedBoard,
  importBoardFile,
  pickBinaryFile,
  type ExportResult,
  type PackagedExportResult,
} from "./files";
import { canPickDirectory, writeFiroDirectory } from "./firoDownload";
import { generateMiroCreationScript, type MiroRtbArchive } from "./miro";

let pendingMiroRtb: MiroRtbArchive | null = null;

/**
 * Report a problem to the person, not just the console.
 *
 * A failed export, a refused import or a keyboard shortcut with nothing to act on
 * that only writes to the console is the same silent failure this whole area is
 * prone to: the action appears to have done nothing. `setToast` is on the imperative
 * API for exactly this.
 *
 * Exported because [`facilitatorActions.ts`](./facilitatorActions.ts) needs the same
 * refusal, and two toasts written two ways means a facilitator sees one of them
 * render differently for no reason they can perceive.
 */
export const complain = (
  api: ExcalidrawImperativeAPI,
  message: string,
): void => {
  api.setToast?.({ message, closable: true, duration: 6000 });
  console.warn(`[firo] ${message}`);
};

/**
 * Register the file actions with the editor.
 *
 * Call once the editor exists. Returns nothing: the actions live in the editor's
 * action manager from here on, and there is no supported way to remove one, which is
 * why this is called a single time rather than on every attach.
 */
export const registerFileActions = (
  api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
): void => {
  api.registerAction({
    name: "exportFiroFile",

    /*
     * A plain string, not a translation key. Every label in the inherited menu is a
     * key resolved against Excalidraw's locale files, and a key that is not in those
     * files renders as the key itself. Firo has no locale files yet, so a literal is
     * honest about being untranslated rather than displaying `firo.exportFile`.
     */
    label: "Export board as .firo file",
    keywords: ["export", "save", "file", "firo", "download", "board"],
    trackEvent: { category: "file", action: "exportFiro" },

    /*
     * `false` rather than an empty result with a `captureUpdate`: these actions change
     * no app state at all, and `false` is the action system's own word for that. An
     * empty object with `NEVER` would also do nothing and would read as though
     * something had been applied and deliberately not recorded.
     */
    perform: async (): Promise<ActionResult> => {
      let result: ExportResult | PackagedExportResult = exportBoard(
        getDocument(),
      );

      // If the board has images, single-file JSON cannot carry them; package as .firo ZIP
      if (!result.ok && result.reason === "assets-not-carried") {
        result = await exportPackagedBoard(getDocument(), {
          readAsset: async (hash) => {
            const bytes = await getAssetBytes(hash);
            return bytes ? new Uint8Array(bytes) : null;
          },
        });
      }

      if (!result.ok) {
        complain(api, `The board could not be exported: ${result.detail}`);
        return false;
      }

      try {
        downloadBoard(result);
      } catch (error) {
        complain(
          api,
          `The board was prepared but the download did not start: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      }

      return false;
    },
  });

  api.registerAction({
    name: "exportFiroDirectory",
    label: "Export board as folder (diffable)...",
    keywords: ["export", "folder", "directory", "git", "diff", "firo"],
    trackEvent: { category: "file", action: "exportFiroDirectory" },

    perform: (): ActionResult => {
      if (!canPickDirectory()) {
        complain(
          api,
          "Your browser does not support folder export. Use 'Export board as .firo file' instead.",
        );
        return false;
      }

      void exportBoardDirectory(getDocument(), {
        readAsset: async (hash) => {
          const bytes = await getAssetBytes(hash);
          return bytes ? new Uint8Array(bytes) : null;
        },
        write: (files) =>
          writeFiroDirectory(files, { suggestedName: exportFilename() }),
      }).then(
        (written) => {
          if (written.ok || written.reason === "cancelled") {
            return;
          }
          complain(
            api,
            written.reason === "unsupported"
              ? written.detail
              : `The board could not be written to a folder: ${written.detail}`,
          );
        },
        (error: unknown) => {
          complain(
            api,
            `The export failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      );
      return false;
    },
  });

  api.registerAction({
    name: "exportMiroScript",
    label: "Export board to Miro script...",
    keywords: ["miro", "export", "script", "web sdk", "migrate"],
    trackEvent: { category: "file", action: "exportMiroScript" },

    perform: (): ActionResult => {
      const elements = getDocument().read().elements;
      if (elements.length === 0) {
        complain(api, "The board is empty; nothing to export to Miro.");
        return false;
      }

      const script = generateMiroCreationScript(elements);
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(script).then(
          () => {
            api.setToast?.({
              message:
                "Miro import script copied to clipboard! Paste it into your Miro browser console to recreate the board.",
              closable: true,
              duration: 8000,
            });
          },
          () => {
            // Fallback: download script file
            const blob = new Blob([script], { type: "text/javascript" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "import-to-miro.js";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          },
        );
      }
      return false;
    },
  });

  api.registerAction({
    name: "importFiroFile",
    label: "Import board (.firo, .rtb, .json)...",
    keywords: [
      "import",
      "open",
      "file",
      "firo",
      "load",
      "board",
      "miro",
      "rtb",
    ],
    trackEvent: { category: "file", action: "importFiro" },

    perform: async (): Promise<ActionResult> => {
      const picked = await pickBinaryFile(
        ".firo,.rtb,.json,.zip,application/json,application/zip,application/octet-stream",
      );
      if (!picked) {
        return false;
      }

      const result = await importBoardFile(getDocument(), picked.bytes, {
        putAsset: async (hash, data) => {
          await putAsset(hash, data as never, undefined);
        },
        miroRtbArchive: pendingMiroRtb ?? undefined,
      });

      if (result.ok) {
        pendingMiroRtb = null;
        api.setToast?.({
          message: `Board loaded successfully (${result.elements} elements)!`,
          closable: true,
          duration: 4000,
        });
        return false;
      }

      if (result.reason === "miro-rtb-canvas-encrypted") {
        pendingMiroRtb = result.rtbArchive ?? null;
        api.setToast?.({
          message:
            `Miro backup canvas is encrypted by Miro KMS. Extracted ${
              result.rtbArchive?.mediaFiles.size ?? 0
            } media assets! ` +
            `Now run: copy(JSON.stringify(await miro.board.get())) in your Miro console, save as items.json, and import it to finish.`,
          closable: true,
          duration: 15000,
        });
        return false;
      }

      complain(api, `That file was not imported. ${result.detail}`);
      return false;
    },
  });
};
