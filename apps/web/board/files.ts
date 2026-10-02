/**
 * Getting a board out of the browser as a file, and back in.
 *
 * ## What this is for
 *
 * Autosave keeps a board in one browser profile on one machine, which is not the same
 * as a board being a file. Phase 7's exit criterion is AC-6: export a `.firo` archive,
 * read it as text, `git diff` it, delete the app's storage, re-import, and everything
 * is still there. A board someone cannot get out of a browser is a board they have not
 * really made.
 *
 * ## One format, two directions, no second store
 *
 * The autosave and the file use the same `serializeBoard` and the same `loadBoard` on
 * the same JSON, and the same canonical writer. So a `.firo` file is exactly what the
 * autosave holds, and the autosave continuously exercises the file path. Two formats
 * would drift, and the one nobody tests would be the one someone needs.
 *
 * ## Import refuses rather than merging
 *
 * Importing into a board that already has content is refused, and this is a decision
 * rather than a missing feature.
 *
 * The document is a CRDT: a delete writes a tombstone, and an id cannot be reused
 * afterwards because the tombstone is still there. So importing a file that reuses
 * ids — which is the *normal* case for importing a board into a browser that already
 * has one, since the autosave means there always is one — means resolving conflicts
 * between a tombstoned node and a new element with the same id. There is no
 * "replace this element" mutation to reach for.
 *
 * Rewriting the incoming ids is possible, and was written, and is not what shipped.
 * It silently renames elements, so a note's label and its connector bindings have to be
 * rewritten in the same pass or the board draws with detached arrows; and it produces
 * ids that are not the document's own, which is the kind of thing that is invisible
 * now and obvious later.
 *
 * So import requires an empty board, and the flow is: export what you have, clear the
 * board, import the file. Both halves of that are already needed — "new board" and
 * "export" are not new work — and neither of them can lose anything. The alternative
 * is a merge strategy, which is a real piece of design and belongs in an ADR rather
 * than in a Friday.
 */
import {
  compactBoard,
  loadBoard,
  serializeBoard,
  serializeBoardFile,
} from "@firo/schema";

import type { FiroDoc } from "@firo/doc";

/** What an export produced. */
export type ExportResult =
  | { ok: true; filename: string; bytes: string }
  | {
      ok: false;
      reason: "failed" | "assets-not-carried";
      detail: string;
    };

/** What an import did. Nothing is applied to the document unless this says `ok`. */
export type ImportResult =
  | { ok: true; elements: number }
  | {
      ok: false;
      reason: "unreadable" | "newer-version" | "empty" | "not-empty";
      detail: string;
    };

/**
 * The file extension, and why it is not `.json`.
 *
 * A `.firo` file *is* JSON, and being readable as text is the point. The extension
 * marks which schema and which shape it is, so a person can tell a board from a config
 * file that also happens to be JSON, and a later format can be `.firo` with a
 * different internal encoding without the extension having lied in the meantime.
 */
const EXTENSION = "firo";

const MIME_TYPE = "application/json";

/**
 * A filename safe on every platform, timestamped.
 *
 * "board.firo" alone means every export is the same filename and the second one is
 * `board (1).firo`. The stamp is local and sortable, which is what someone exporting
 * several versions of a board wants.
 *
 * No colons or other path characters: a download name is shown in a bar and typed into
 * shells, and a colon behaves differently on different platforms.
 */
export const exportFilename = (now: Date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");

  return `board-${stamp}.${EXTENSION}`;
};

/**
 * Elements the file format cannot carry without its bytes alongside it.
 *
 * An image element holds a content-addressed *reference* into the asset store, and
 * the store is a separate IndexedDB database from the document — deliberately, since
 * bytes inside a CRDT update are broadcast on every sync. A `.firo` file is a single
 * JSON document, so it can carry the reference and not the picture.
 *
 * Which means an export of a board with an image on it produces a file that imports
 * cleanly and draws a broken picture, with nothing in either file saying so. That is
 * the silent-loss failure this whole module exists to avoid, in a new direction: the
 * element survives and its content does not.
 *
 * So the export refuses instead. A visible "this board cannot be exported yet" is a
 * limitation somebody can report; a file that looks complete and is not is a trap
 * laid for whoever opens the file in six months.
 *
 * **This is a temporary position and it is a decision, not an omission.** Phase 7
 * §7.3 specifies the format that fixes it — a manifest, a `board.json`, and a
 * content-addressed `assets/` directory — and that is a different file layout from the
 * single canonical JSON this module round-trips byte-identically. Choosing between
 * them is real design and belongs in an ADR. Until then the refusal is what makes the
 * gap visible.
 */
const uncarriedAssetTypes = (
  elements: readonly { type: string; isDeleted?: boolean }[],
): { images: number; pending: number } => {
  let images = 0;
  let pending = 0;
  for (const element of elements) {
    if (element.type !== "image") {
      continue;
    }
    /*
     * Tombstones skipped, and not as an optimisation. `doc.read()` returns deleted
     * elements — the document is a CRDT and a tombstone is how an undone deletion is
     * restored — and `compactBoard` drops them on the way into a file. So a deleted
     * image is genuinely not in the exported file, and counting it would make a board
     * permanently unexportable the moment somebody deleted a picture from it. The
     * opposite of a fix.
     */
    if (element.isDeleted === true) {
      continue;
    }
    images += 1;
    if ((element as { fileId?: string | null }).fileId == null) {
      pending += 1;
    }
  }
  return { images, pending };
};

/**
 * The document as `.firo` bytes.
 *
 * The canonical writer, so exporting an unchanged board twice produces identical bytes
 * and `git diff` shows nothing. `JSON.stringify` cannot do that — it emits keys in
 * insertion order, which is a property of the loader's object literals rather than of
 * the data — and a format that reorders itself between saves is not a format anyone
 * can put in git.
 */
export const exportBoard = (doc: FiroDoc, now?: Date): ExportResult => {
  try {
    const board = doc.read();

    const { images, pending } = uncarriedAssetTypes(board.elements);
    if (images > 0) {
      return {
        ok: false,
        reason: "assets-not-carried",
        detail:
          `${
            `This board has ${images} image${
              images === 1 ? "" : "s"
            }, and the ` +
            `file format carries an image's reference but not its bytes. Exporting ` +
            `now would produce a file that opens with the picture missing.`
          }${
            pending > 0
              ? ` ${pending} of them ha${
                  pending === 1 ? "s" : "ve"
                } no stored file ` +
                `at all, so they would be missing even from the board's own copy.`
              : ""
          } The autosave is unaffected — the images are in the board — and this ` +
          `is fixed by the asset-carrying format in Phase 7 §7.3.`,
      };
    }

    /*
     * Compacted, and *only* here.
     *
     * The autosave deliberately keeps tombstones: the document is a CRDT, a tombstone
     * is what stops a stale write resurrecting a deleted element, and it is what lets
     * an undone deletion be restored. A file is a snapshot, not a replica — it carries
     * no undo history for a tombstone to restore and has no concurrent writer for one
     * to protect against — so a tombstone in a file is pure growth.
     *
     * Measured: five notes with two deleted exported all five. Every edit-and-undo
     * added another, and `git diff` on a board nobody touched still churned.
     */
    return {
      ok: true,
      filename: exportFilename(now),
      bytes: serializeBoardFile(compactBoard(serializeBoard(board))),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Offer the bytes to the browser as a download. */
export const downloadBoard = (
  result: Extract<ExportResult, { ok: true }>,
): void => {
  // A Blob rather than a data URL: a large board as a data URL is held as one string
  // in memory and then decoded, and boards get large.
  const blob = new Blob([result.bytes], { type: MIME_TYPE });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  /*
   * Revoked on the next tick rather than immediately, or a slow browser can cancel the
   * download as it starts. There is no event to hang this off.
   */
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Read `.firo` text into a board, applying nothing.
 *
 * Separate from the applying step so the validation is testable, and so a failed import
 * has demonstrably changed nothing.
 */
export const parseBoard = (text: string): ImportResult => {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      reason: "unreadable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let loaded: ReturnType<typeof loadBoard>;
  try {
    /*
     * `loadBoard` throws on a forward version rather than guessing, which is right
     * here: a file from a newer Firo may use fields this one would silently drop, so
     * importing it "successfully" would quietly lose them.
     */
    loaded = loadBoard(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: /newer/i.test(detail) ? "newer-version" : "unreadable",
      detail,
    };
  }

  if (
    loaded.elements.length === 0 &&
    loaded.collections.length === 0 &&
    loaded.records.length === 0
  ) {
    // Importing nothing would clear the board, which is destructive and should be
    // deliberate. An empty *file* is nearly always a mistake — the wrong file, or a
    // truncated download.
    return {
      ok: false,
      reason: "empty",
      detail: "the file contains no elements, collections or records",
    };
  }

  return { ok: true, elements: loaded.elements.length };
};

/**
 * Load a `.firo` file into an empty document.
 *
 * Refuses a board that already has content — see the note at the top of this file for
 * why that is a decision rather than a gap. The refusal is the safe half: it is
 * possible to get someone's work out of the way and then import, and it is not
 * possible for an import to quietly merge two boards into something neither of them
 * was.
 *
 * `doc.load` rather than hand-built mutations, because there is no `setElementOrder`
 * mutation to reach for and z-order belongs to the loader. Two places deciding what
 * order a board is in is how they come to disagree.
 */
export const importBoard = (doc: FiroDoc, text: string): ImportResult => {
  const parsed = parseBoard(text);
  if (!parsed.ok) {
    return parsed;
  }

  if (doc.read().elements.length > 0) {
    return {
      ok: false,
      reason: "not-empty",
      detail:
        "this board already has content, and importing into it would mean " +
        "resolving the autosaved copy against the file. Export the current board, " +
        "start a new one, then import.",
    };
  }

  const loaded = loadBoard(JSON.parse(text));

  doc.load({
    elements: loaded.elements,
    collections: loaded.collections,
    records: loaded.records,
    elementOrder: loaded.elementOrder,
    meta: loaded.meta,
  });

  return parsed;
};
