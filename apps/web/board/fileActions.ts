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
  importBoard,
  importBoardDirectory,
} from "./files";
import {
  canPickDirectory,
  pickFiroDirectory,
  writeFiroDirectory,
} from "./firoDownload";

/**
 * A file picker, resolved to text.
 *
 * `File.text()` rather than `FileReader`: it is a promise, it is on every browser this
 * targets, and it does not need a load event. The alternative is an event listener
 * wrapped in a promise, which is the same amount of code and harder to read.
 */
const pickFile = (accept: string): Promise<string | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    /*
     * `cancel` is not universally supported, so this cannot be the only way out — the
     * node is removed either way, and a picker dismissed by the browser simply never
     * resolves, which is fine because nothing is waiting on the result to continue.
     */
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(resolve, () => resolve(null));
    });

    document.body.appendChild(input);
    input.click();
  });

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
    perform: (): ActionResult => {
      /*
       * The directory export, where the browser can do it.
       *
       * `showDirectoryPicker()` is Chromium and Edge. Where it exists this is the real
       * export -- it carries images, it is diffable, and it is what
       * [ADR-0018](../../docs/adr/0018-a-firo-is-a-directory.md) decided. Where it
       * does not, the single-file path below still runs and still refuses a board with
       * images rather than writing a file that lies about them.
       *
       * The check is a named capability test rather than a `try`, because "this
       * browser cannot" is a state the product has to explain and the explanation
       * should not be "an error appeared".
       */
      if (canPickDirectory()) {
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
              // Cancelled is the user closing the picker. Reporting it as a failure is
              // how a product ends up apologising for something they chose.
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
      }

      const result = exportBoard(getDocument());

      if (!result.ok) {
        /*
         * The two failures need different words. "Could not be exported" describes a
         * transient problem — a quota, a serialisation bug — and invites a retry. The
         * asset case is not transient and not an error in the board: the format does
         * not carry image bytes yet, so saying so is the whole message, and a retry
         * would only produce the same refusal.
         */
        complain(
          api,
          result.reason === "assets-not-carried"
            ? `This board cannot be exported yet. ${result.detail}`
            : `The board could not be exported: ${result.detail}`,
        );
        return false;
      }

      try {
        downloadBoard(result);
      } catch (error) {
        // `URL.createObjectURL` and the click can both fail — a browser with downloads
        // disabled, or a sandboxed frame with no object-URL support. Neither is
        // exceptional enough to be silent about.
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
    name: "importFiroFile",
    label: "Import board from .firo file",
    keywords: ["import", "open", "file", "firo", "load", "board"],
    trackEvent: { category: "file", action: "importFiro" },

    perform: async (): Promise<ActionResult> => {
      /*
       * A folder first, where the browser can open one.
       *
       * An `<input type="file">` cannot pick a directory, and a `.firo` is now one --
       * so a file input finds a format-v1 board and nothing else. Asking for a folder
       * first is what makes AC-6's "re-import the file, and every element, record,
       * tag, and vote is present" reachable in the product rather than only in the
       * format's own tests.
       *
       * `showDirectoryPicker()` is Chromium and Edge. Everywhere else, and whenever the
       * user dismisses it, this falls through to the file picker below rather than
       * reporting an error: declining is a choice, not a failure, and the single-file
       * path is still a real import.
       */
      if (canPickDirectory()) {
        const directory = await importBoardDirectory(getDocument(), {
          pick: pickFiroDirectory,
          putAsset: async (hash, bytes, mimeType) => {
            await putAsset(hash, bytes as never, undefined);
            void mimeType;
          },
        });

        if (directory.ok) {
          return false;
        }
        if (directory.reason !== "cancelled") {
          complain(api, `That folder was not imported. ${directory.detail}`);
          return false;
        }
      }

      const text = await pickFile(".firo,application/json,.json");
      if (text === null) {
        // The picker was dismissed. Not a failure and not worth a message.
        return false;
      }

      const result = importBoard(getDocument(), text);

      if (!result.ok) {
        complain(api, `That file was not imported. ${result.detail}`);
        return false;
      }

      /*
       * The document was replaced by `importBoard` directly rather than through the
       * action result. The result is `false` because the *app state* — selection,
       * zoom, open panel — genuinely has not changed and should not be rewritten; the
       * board contents changed, and undo covers that.
       */
      return false;
    },
  });
};
