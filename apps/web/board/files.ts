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
 * ## One *document* format, two containers
 *
 * The autosave and the file use the same `serializeBoard` and the same `loadBoard` on
 * the same JSON, and the same canonical writer. So the document half of a `.firo` is
 * exactly what the autosave holds, byte for byte, and the autosave continuously
 * exercises the document format.
 *
 * There are nonetheless **two containers**, and this file used to claim otherwise.
 * [ADR-0018](../../docs/adr/0018-a-firo-is-a-directory.md) makes a `.firo` a
 * *directory* so it can carry images; the autosave stays the single canonical JSON
 * record it has always been, because a CRDT autosave plus a separate asset store is
 * what IndexedDB already holds and a directory has no meaning for it. The claim that
 * was false is now restated rather than removed, because the property underneath it —
 * one document format, exercised continuously by the autosave — is the reason it was
 * worth making in the first place.
 *
 * ## The single-file path stays, and it stays narrow
 *
 * A format-v1 `.firo` is one JSON document and loads for ever, so the read path keeps
 * accepting it. The *write* path prefers the directory, and `exportBoard` below now
 * refuses only what a single JSON file genuinely cannot carry — which is still every
 * image, but as a statement about that format rather than about the product.
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

import type { FiroElement } from "@firo/schema";

import {
  buildFiroDirectory,
  importFiroDirectory,
  type AssetReader,
  type AssetWriter,
  type DirectoryExport,
  type DirectoryImport,
  type FiroFiles,
} from "./firoDirectory";
import {
  readFiroDirectory,
  type ReadableDirectory,
  type WriteOutcome,
} from "./firoDownload";
import { isZip, unzipFiles, zipFiles } from "./zip";
import {
  convertMiroItemsToFiro,
  type MiroBoardMeta,
  type MiroItem,
  type MiroResourceMeta,
  type MiroRtbArchive,
} from "./miro";
import { isExcalidrawJson, convertExcalidrawToFiro } from "./excalidraw";
import { csvToStickyNotes, parseCsv } from "./csv";

/** What a single-file JSON export produced. */
export type ExportResult =
  | { ok: true; filename: string; bytes: string }
  | {
      ok: false;
      reason:
        | "failed"
        | "assets-not-carried"
        | "assets-missing-bytes"
        | "assets-missing-reference"
        | "assets-pending";
      detail: string;
    };

/** What a packaged ZIP export produced. */
export type PackagedExportResult =
  | { ok: true; filename: string; bytes: Uint8Array; isZip: true }
  | {
      ok: false;
      reason:
        | "failed"
        | "assets-not-carried"
        | "assets-missing-bytes"
        | "assets-missing-reference"
        | "assets-pending";
      detail: string;
    };

/** What an import did. Nothing is applied to the document unless this says `ok`. */
export type ImportResult =
  | {
      ok: true;
      elements: number;
      format?: "firo-v1" | "firo-v2" | "miro" | "excalidraw" | "csv";
      assets?: Map<
        string,
        { hash: string; bytes: Uint8Array; mimeType: string }
      >;
    }
  | {
      ok: false;
      reason:
        | "unreadable"
        | "newer-version"
        | "empty"
        | "not-empty"
        | "miro-rtb-canvas-encrypted"
        | "failed";
      detail: string;
      rtbArchive?: MiroRtbArchive;
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
          } The autosave is unaffected — the images are in the board. Use the ` +
          `folder export, which carries them.`,
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
  result: Extract<ExportResult | PackagedExportResult, { ok: true }>,
): void => {
  // A Blob rather than a data URL: a large board as a data URL is held as one string
  // in memory and then decoded, and boards get large.
  const isZipFile = "isZip" in result && Boolean(result.isZip);
  const mimeType = isZipFile ? "application/zip" : MIME_TYPE;
  const blob =
    typeof result.bytes === "string"
      ? new Blob([result.bytes], { type: mimeType })
      : new Blob([result.bytes.buffer as ArrayBuffer], { type: mimeType });
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
 * A file picker that returns binary Uint8Array bytes and filename.
 */
export const pickBinaryFile = (
  accept: string,
): Promise<{ bytes: Uint8Array; name: string } | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then(
        (buf) => resolve({ bytes: new Uint8Array(buf), name: file.name }),
        () => resolve(null),
      );
    });

    document.body.appendChild(input);
    input.click();
  });

/**
 * Export a board as a single packaged `.firo` ZIP archive.
 *
 * Implements ADR-0018 §7: packs `manifest.json`, `board.json`, and all content-addressed
 * `assets/` into a single, downloadable, diffable archive. Carries all images without loss
 * across all browsers without requiring `showDirectoryPicker`.
 */
export const exportPackagedBoard = async (
  doc: FiroDoc,
  deps: {
    now?: Date;
    readAsset: AssetReader;
  },
): Promise<PackagedExportResult> => {
  const built = await buildFiroDirectory(doc, {
    now: deps.now,
    readAsset: deps.readAsset,
  });

  if (!built.ok) {
    return built;
  }

  const zipBytes = zipFiles(built.files);
  return {
    ok: true,
    filename: exportFilename(deps.now),
    bytes: zipBytes,
    isZip: true,
  };
};

/* -------------------------------------------------------------------------- */
/* The directory format                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Export a board as a `.firo` **directory**.
 *
 * The real export. Everything it does to the bytes lives in
 * [`firoDirectory`](./firoDirectory.ts) and is tested there; this wires the two halves
 * together and hands the result to the browser.
 *
 * Refuses on a board it cannot carry whole, and says why — see `buildFiroDirectory`
 * for the three refusals and why deleting them wholesale would restore the
 * silent-loss failure this feature exists to prevent.
 */
export const exportBoardDirectory = async (
  doc: FiroDoc,
  deps: {
    now?: Date;
    readAsset: AssetReader;
    write: (files: FiroFiles) => Promise<WriteOutcome>;
  },
): Promise<DirectoryExport | WriteOutcome> => {
  const built = await buildFiroDirectory(doc, {
    now: deps.now,
    readAsset: deps.readAsset,
  });

  if (!built.ok) {
    return built;
  }

  return deps.write(built.files);
};

/**
 * Import a `.firo` directory into an empty board.
 *
 * Reading, verifying and applying all happen in [`firoDirectory`](./firoDirectory.ts);
 * this supplies the browser's directory handle and the asset store.
 */
export const importBoardDirectory = async (
  doc: FiroDoc,
  deps: {
    pick: () => Promise<ReadableDirectory | null>;
    putAsset: AssetWriter;
  },
): Promise<
  DirectoryImport | { ok: false; reason: "cancelled"; detail: string }
> => {
  const root = await deps.pick();
  if (!root) {
    // Declined, or a browser with no directory picker. Not a failure to report — the
    // single-file import is still there for both cases.
    return { ok: false, reason: "cancelled", detail: "no directory chosen" };
  }

  return importFiroDirectory(doc, await readFiroDirectory(root), {
    putAsset: deps.putAsset,
  });
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

/**
 * Safely inserts elements into an existing board document, remapping IDs
 * and bindings to prevent CRDT collisions while preserving relative topology.
 */
export const insertElementsIntoDoc = (
  doc: FiroDoc,
  incoming: readonly FiroElement[],
  offset?: { x: number; y: number },
): void => {
  const timestamp = Date.now();
  const idMap = new Map<string, string>();
  for (const el of incoming) {
    const newId = `${el.id}_${timestamp}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;
    idMap.set(el.id, newId);
  }

  // Group ids get the same per-batch remap as element ids: without it, a
  // second insert of the same source joins the first copy's groups, and an
  // import joins groups that already exist on the board.
  const groupIdMap = new Map<string, string>();
  for (const el of incoming) {
    for (const groupId of el.groupIds ?? []) {
      if (!groupIdMap.has(groupId)) {
        groupIdMap.set(
          groupId,
          `${groupId}_${timestamp}_${Math.random()
            .toString(36)
            .substring(2, 6)}`,
        );
      }
    }
  }

  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;

  const remapped: FiroElement[] = incoming.map((el) => {
    const newId = idMap.get(el.id) || el.id;
    const remappedFrameId = el.frameId
      ? idMap.get(el.frameId) || el.frameId
      : null;
    const remappedContainerId = el.containerId
      ? idMap.get(el.containerId) || el.containerId
      : null;
    const remappedBindings = el.bindings
      ? el.bindings.map((b) => ({
          ...b,
          elementId: (idMap.get(b.elementId) || b.elementId) as any,
        }))
      : [];

    let startBinding = (el as any).startBinding;
    if (startBinding?.elementId && idMap.has(startBinding.elementId)) {
      startBinding = {
        ...startBinding,
        elementId: idMap.get(startBinding.elementId),
      };
    }
    let endBinding = (el as any).endBinding;
    if (endBinding?.elementId && idMap.has(endBinding.elementId)) {
      endBinding = {
        ...endBinding,
        elementId: idMap.get(endBinding.elementId),
      };
    }

    return {
      ...el,
      id: newId as any,
      x: el.x + dx,
      y: el.y + dy,
      frameId: remappedFrameId,
      containerId: remappedContainerId,
      groupIds: (el.groupIds ?? []).map(
        (groupId) => groupIdMap.get(groupId) || groupId,
      ),
      bindings: remappedBindings,
      ...(startBinding !== undefined ? { startBinding } : {}),
      ...(endBinding !== undefined ? { endBinding } : {}),
      isDeleted: false,
    } as FiroElement;
  });

  const mutations = remapped.map((element) => ({
    kind: "createElement" as const,
    element,
  }));
  doc.commit(mutations as any);
};

/**
 * Replace everything in `doc` with `board`.
 *
 * `doc.load()` only ever creates - it has no delete - so on a non-empty
 * document a bare `load` merges the file into the existing board instead of
 * replacing it: a same-id file becomes an invisible no-op (its ids already
 * exist) and a different file silently doubles the board. "Replace board
 * content" promises the file ends up alone in the board, so the previous
 * elements are deleted first. Collections and records of the previous board
 * are deliberately left in place: there is no record-delete mutation yet,
 * and a kept collection is visible where a wrongly deleted one is not.
 */
const clearDocElements = (doc: FiroDoc): void => {
  const existing = doc.read().elements.map((el) => String(el.id));
  if (existing.length > 0) {
    doc.commit([{ kind: "deleteElements", ids: existing } as never]);
  }
};

const replaceDocContents = (
  doc: FiroDoc,
  board: Parameters<FiroDoc["load"]>[0],
): void => {
  clearDocElements(doc);
  doc.load(board);
};

/**
 * Universal importer for board files:
 * - `.firo` single JSON files (Format v1)
 * - `.firo` packaged ZIP archives (Format v2)
 * - Miro `.rtb` archives
 * - Miro items JSON exports
 * - `.excalidraw` scene drawings
 * - `.csv` tabular spreadsheets
 */
const importBoardFileInner = async (
  doc: FiroDoc,
  data: string | Uint8Array,
  deps?: {
    putAsset?: AssetWriter;
    miroItems?: readonly MiroItem[];
    miroRtbArchive?: MiroRtbArchive;
    force?: boolean;
    insertMode?: "replace" | "insert";
    offset?: { x: number; y: number };
  },
): Promise<ImportResult> => {
  const bytes = typeof data === "string" ? null : data;

  // 1. Binary ZIP container handling
  if (bytes && isZip(bytes)) {
    const files = unzipFiles(bytes);

    // 1A. Packaged .firo archive (v2)
    if (files.has("manifest.json") && files.has("board.json")) {
      const hasContent = doc.read().elements.length > 0;
      if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
        return {
          ok: false,
          reason: "not-empty",
          detail:
            "this board already has content, and importing into it would mean " +
            "resolving the autosaved copy against the file. Export the current board, " +
            "start a new one, then import.",
        };
      }

      if (deps?.insertMode === "insert" && hasContent) {
        try {
          const boardJsonText = new TextDecoder().decode(
            files.get("board.json")!,
          );
          const parsed = JSON.parse(boardJsonText);
          const loaded = loadBoard(parsed);
          insertElementsIntoDoc(doc, loaded.elements, deps?.offset);
          return {
            ok: true,
            elements: loaded.elements.length,
            format: "firo-v2",
          };
        } catch (e: any) {
          return { ok: false, reason: "unreadable", detail: e.message };
        }
      }

      if (deps?.insertMode === "replace" && hasContent) {
        // The directory importer refuses a non-empty doc by design; the
        // dialog's replace mode is the deliberate clear it asks for.
        clearDocElements(doc);
      }
      const imported = await importFiroDirectory(doc, files, {
        putAsset: deps?.putAsset ?? (async () => {}),
      });
      if (imported.ok) {
        return { ok: true, elements: imported.elements, format: "firo-v2" };
      }
      return { ok: false, reason: "unreadable", detail: imported.detail };
    }

    // 1B. Miro .rtb archive
    if (
      files.has("resources.json") ||
      (files.has("board.json") && files.has("meta.json"))
    ) {
      let boardMeta: MiroBoardMeta | undefined;
      let resources: MiroResourceMeta[] | undefined;
      let isEncrypted = false;
      let encryptionVersion: string | undefined;

      if (files.has("meta.json")) {
        try {
          const meta = JSON.parse(
            new TextDecoder().decode(files.get("meta.json")!),
          );
          if (meta.encryptionVersion) {
            isEncrypted = true;
            encryptionVersion = String(meta.encryptionVersion);
          }
        } catch {}
      }
      if (files.has("board.json")) {
        try {
          boardMeta = JSON.parse(
            new TextDecoder().decode(files.get("board.json")!),
          );
        } catch {}
      }
      if (files.has("resources.json")) {
        try {
          const r = JSON.parse(
            new TextDecoder().decode(files.get("resources.json")!),
          );
          resources = r.resources;
        } catch {}
      }

      const mediaFiles = new Map<string, Uint8Array>();
      for (const [name, fileBytes] of files) {
        if (
          name.endsWith(".png") ||
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".svg") ||
          name.endsWith(".webp") ||
          name.endsWith(".gif") ||
          name.endsWith(".heic") ||
          name.endsWith(".pdf") ||
          !name.includes(".")
        ) {
          mediaFiles.set(name, fileBytes);
        }
      }

      // If Miro items are supplied (e.g. from companion JSON or callback)
      if (deps?.miroItems && deps.miroItems.length > 0) {
        const hasContent = doc.read().elements.length > 0;
        if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
          return {
            ok: false,
            reason: "not-empty",
            detail: "Clear or export the current board before importing.",
          };
        }
        const converted = await convertMiroItemsToFiro(deps.miroItems, {
          boardMeta,
          resources,
          mediaFiles,
        });
        if (deps?.putAsset) {
          for (const asset of converted.assetsToPut.values()) {
            await deps.putAsset(asset.hash, asset.bytes, asset.mimeType);
          }
        }
        if (deps?.insertMode === "insert" && hasContent) {
          insertElementsIntoDoc(
            doc,
            converted.board.elements as unknown as readonly FiroElement[],
            deps?.offset,
          );
          return {
            ok: true,
            elements: converted.board.elements.length,
            format: "miro",
            assets: converted.assetsToPut,
          };
        }
        const loaded = loadBoard(converted.board);
        replaceDocContents(doc, {
          elements: loaded.elements,
          collections: loaded.collections,
          records: loaded.records,
          elementOrder: loaded.elementOrder,
          meta: loaded.meta,
        });
        return {
          ok: true,
          elements: loaded.elements.length,
          format: "miro",
          assets: converted.assetsToPut,
        };
      }

      // Check canvas.json
      if (files.has("canvas.json")) {
        const canvasBytes = files.get("canvas.json")!;
        /*
         * Only the decode and parse may mark the backup encrypted: a
         * KMS-sealed canvas.json is not JSON at all, so a parse failure is
         * the signal. Everything after the parse — conversion, asset writes,
         * the document load — fails for its own reasons and must surface its
         * own error. Wrapping those in the same catch relabelled any bug in
         * them as "encrypted by Miro KMS", which sent the user to re-export
         * a board that was never the problem.
         */
        let items: unknown;
        try {
          const canvasText = new TextDecoder().decode(canvasBytes);
          const canvasJson = JSON.parse(canvasText);
          items = Array.isArray(canvasJson)
            ? canvasJson
            : canvasJson.items || canvasJson.widgets;
        } catch {
          isEncrypted = true;
        }
        if (!isEncrypted && Array.isArray(items)) {
          const hasContent = doc.read().elements.length > 0;
          if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
            return {
              ok: false,
              reason: "not-empty",
              detail: "Clear or export the current board before importing.",
            };
          }
          try {
            const converted = await convertMiroItemsToFiro(items, {
              boardMeta,
              resources,
              mediaFiles,
            });
            if (deps?.putAsset) {
              for (const asset of converted.assetsToPut.values()) {
                await deps.putAsset(asset.hash, asset.bytes, asset.mimeType);
              }
            }
            if (deps?.insertMode === "insert" && hasContent) {
              insertElementsIntoDoc(
                doc,
                converted.board.elements as unknown as readonly FiroElement[],
                deps?.offset,
              );
              return {
                ok: true,
                elements: converted.board.elements.length,
                format: "miro",
                assets: converted.assetsToPut,
              };
            }
            const loaded = loadBoard(converted.board);
            replaceDocContents(doc, {
              elements: loaded.elements,
              collections: loaded.collections,
              records: loaded.records,
              elementOrder: loaded.elementOrder,
              meta: loaded.meta,
            });
            return {
              ok: true,
              elements: loaded.elements.length,
              format: "miro",
              assets: converted.assetsToPut,
            };
          } catch (e) {
            return {
              ok: false,
              reason: "failed",
              detail: `Miro import failed: ${
                e instanceof Error
                  ? e.message || (e as { code?: string }).code || e.name
                  : String(e)
              }`,
            };
          }
        }
      }

      if (isEncrypted) {
        return {
          ok: false,
          reason: "miro-rtb-canvas-encrypted",
          detail: `Miro backup canvas.json is encrypted (version ${
            encryptionVersion ?? "1.1"
          }). Extracted ${
            mediaFiles.size
          } media assets. Run \`copy(JSON.stringify(await miro.board.get()))\` on your Miro board to provide the items.`,
          rtbArchive: {
            board: boardMeta,
            resources,
            mediaFiles,
            isEncrypted: true,
            encryptionVersion,
          },
        };
      }
    }
  }

  // 2. Text, CSV, or JSON handling
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    // Check if it is a valid CSV
    if (text.includes(",") || text.includes("\n")) {
      const csv = parseCsv(text);
      if (csv.headers.length > 0 || csv.rows.length > 0) {
        const hasContent = doc.read().elements.length > 0;
        if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
          return {
            ok: false,
            reason: "not-empty",
            detail: "Clear or export the current board before importing.",
          };
        }
        const stickyNotes = csvToStickyNotes(text, {
          originX: deps?.offset?.x ?? 0,
          originY: deps?.offset?.y ?? 0,
        });
        if (stickyNotes.length > 0) {
          if (
            deps?.insertMode === "insert" ||
            (hasContent && deps?.force && deps?.insertMode !== "replace")
          ) {
            const mutations = stickyNotes.map((el) => ({
              kind: "createElement" as const,
              element: el,
            }));
            doc.commit(mutations as any);
          } else {
            replaceDocContents(doc, {
              elements: stickyNotes as any,
              collections: [],
              records: [],
              elementOrder: stickyNotes.map((s) => s.id as any),
              meta: {
                id: "csv_import",
                name: "Imported Spreadsheet",
                created: Date.now(),
                updated: Date.now(),
              },
            });
          }
          return { ok: true, elements: stickyNotes.length, format: "csv" };
        }
      }
    }

    return {
      ok: false,
      reason: "unreadable",
      detail:
        "The file could not be parsed as JSON, CSV, or a valid ZIP archive.",
    };
  }

  // Check if it is an Excalidraw drawing
  if (isExcalidrawJson(parsedJson)) {
    const hasContent = doc.read().elements.length > 0;
    if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
      return {
        ok: false,
        reason: "not-empty",
        detail: "Clear or export the current board before importing.",
      };
    }
    const converted = await convertExcalidrawToFiro(parsedJson);
    if (deps?.putAsset) {
      for (const asset of converted.assetsToPut.values()) {
        await deps.putAsset(asset.hash, asset.bytes, asset.mimeType);
      }
    }
    if (deps?.insertMode === "insert" && hasContent) {
      insertElementsIntoDoc(doc, converted.elements, deps?.offset);
      return {
        ok: true,
        elements: converted.elements.length,
        format: "excalidraw",
        assets: converted.assetsToPut,
      };
    }
    const loaded = loadBoard({
      format: "firo",
      version: 4,
      meta: {
        id: "excalidraw_import",
        name: "Imported Drawing",
        created: Date.now(),
        updated: Date.now(),
      },
      elements: converted.elements,
      collections: [],
      records: [],
      elementOrder: converted.elements.map((e) => e.id),
    });
    replaceDocContents(doc, {
      elements: loaded.elements,
      collections: loaded.collections,
      records: loaded.records,
      elementOrder: loaded.elementOrder,
      meta: loaded.meta,
    });
    return {
      ok: true,
      elements: converted.elements.length,
      format: "excalidraw",
      assets: converted.assetsToPut,
    };
  }

  // Check if it is a Miro items export
  const miroItems = Array.isArray(parsedJson)
    ? parsedJson
    : (parsedJson as { items?: unknown[] })?.items;

  if (
    Array.isArray(miroItems) &&
    miroItems.length > 0 &&
    typeof miroItems[0] === "object" &&
    miroItems[0] !== null &&
    ("type" in miroItems[0] || "widgetType" in miroItems[0]) &&
    !("elementSchemaVersion" in (parsedJson as object))
  ) {
    const hasContent = doc.read().elements.length > 0;
    if (hasContent && !deps?.force && deps?.insertMode !== "insert") {
      return {
        ok: false,
        reason: "not-empty",
        detail: "Clear or export the current board before importing.",
      };
    }
    const converted = await convertMiroItemsToFiro(
      miroItems as MiroItem[],
      deps?.miroRtbArchive,
    );
    if (deps?.putAsset) {
      for (const asset of converted.assetsToPut.values()) {
        await deps.putAsset(asset.hash, asset.bytes, asset.mimeType);
      }
    }
    if (deps?.insertMode === "insert" && hasContent) {
      insertElementsIntoDoc(
        doc,
        converted.board.elements as unknown as readonly FiroElement[],
        deps?.offset,
      );
      return {
        ok: true,
        elements: converted.board.elements.length,
        format: "miro",
        assets: converted.assetsToPut,
      };
    }
    const loaded = loadBoard(converted.board);
    replaceDocContents(doc, {
      elements: loaded.elements,
      collections: loaded.collections,
      records: loaded.records,
      elementOrder: loaded.elementOrder,
      meta: loaded.meta,
    });
    return {
      ok: true,
      elements: loaded.elements.length,
      format: "miro",
      assets: converted.assetsToPut,
    };
  }

  // Standard Firo JSON
  if (deps?.insertMode === "insert" && doc.read().elements.length > 0) {
    const parsed = parseBoard(text);
    if (!parsed.ok) {
      return parsed;
    }
    const loaded = loadBoard(JSON.parse(text));
    insertElementsIntoDoc(doc, loaded.elements, deps?.offset);
    return { ok: true, elements: loaded.elements.length, format: "firo-v1" };
  }

  return importBoard(doc, text);
};

/**
 * Import a board file into `doc`.
 *
 * A file brings its own board id in its metadata. Loading it over the board the
 * user is looking at would swap that board's identity for the file's, so the
 * server then sees someone else's board id (a teammate's export is refused with
 * "belongs to someone else"), and importing one file twice would give two
 * boards the same id. The content comes from the file; the id stays the
 * current board's.
 */
export const importBoardFile = async (
  doc: FiroDoc,
  data: string | Uint8Array,
  deps?: Parameters<typeof importBoardFileInner>[2],
): Promise<ImportResult> => {
  const before = doc.read().meta?.id;
  const result = await importBoardFileInner(doc, data, deps);
  if (
    result.ok &&
    deps?.insertMode !== "insert" &&
    typeof before === "string" &&
    before.length > 0 &&
    doc.read().meta?.id !== before
  ) {
    doc.commit([{ kind: "setMeta", entries: { id: before } }]);
  }
  return result;
};
