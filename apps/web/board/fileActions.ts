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

import type { FiroDoc } from "@firo/doc";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { ActionResult } from "@firo/editor/actions/types";

import { exportBoard, downloadBoard, importBoard } from "./files";

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
 * A failed export or a refused import that only writes to the console is the same
 * silent failure this whole area is prone to: the click appears to have done nothing.
 * `setToast` is on the imperative API for exactly this.
 */
const complain = (api: ExcalidrawImperativeAPI, message: string): void => {
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
      const result = exportBoard(getDocument());

      if (!result.ok) {
        complain(api, `The board could not be exported: ${result.detail}`);
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
