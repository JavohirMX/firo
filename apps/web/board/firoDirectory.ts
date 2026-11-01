import { IMAGE_MIME_TYPES } from "@firo/common";
import { hashBytes } from "@firo/doc";
import {
  canonicalFile,
  compactBoard,
  loadBoard,
  serializeBoard,
} from "@firo/schema";

import type { FiroDoc } from "@firo/doc";

/**
 * The `.firo` directory format, as pure data.
 *
 * ## What this module is, and what it deliberately is not
 *
 * [`ADR-0018`](../../docs/adr/0018-a-firo-is-a-directory.md) decides that a `.firo` is
 * a *directory* — `manifest.json`, `board.json`, and content-addressed `assets/` — so
 * a board can carry its images and still produce a diff a person can read.
 *
 * Writing that directory needs a browser filesystem API. Reading AC-6's properties
 * out of it needs none: determinism, content addressing, deduplication, checksums and
 * round-trip identity are all properties of the *bytes*, and every one of them has to
 * be provable in CI rather than by hand in a browser.
 *
 * So the shape lives here and the IO does not. `buildFiroDirectory` returns the
 * complete directory as a path → bytes map and `parseFiroDirectory` takes one back.
 * Neither touches `showDirectoryPicker`, a `FileSystemWritableFileStream`, or
 * IndexedDB. The asset store is reached through an injected `readAsset`, so a test
 * hands it a map.
 *
 * The alternative — testing the format through a browser directory handle — would
 * mean the format's correctness depended on jsdom implementing an API it does not,
 * and the natural response to that would be to test less. The properties AC-6 names
 * are not integration properties. They are the format.
 *
 * ## Two containers, one document format
 *
 * The autosave is still a single canonical JSON record in IndexedDB, because a CRDT
 * autosave plus a separate asset store is exactly what IndexedDB already holds and a
 * directory has no meaning for it. So the claim in `files.ts` that there is "one
 * format, two directions, no second store" is false as written, and
 * [`ADR-0018`](../../docs/adr/0018-a-firo-is-a-directory.md) outcome 9 restates it:
 * one *document* format, two *containers*.
 *
 * The property that actually matters survives intact — **the autosave and
 * `board.json` are byte-identical** — so the autosave still exercises the document
 * format continuously, which is the reason the claim was worth making in the first
 * place. It is `board.json` below, via the same `serializeBoardFile` the autosave
 * path uses, and `fileFormat.test.ts` is unchanged.
 *
 * ## Determinism
 *
 * `buildFiroDirectory` is a pure function of `(board, asset bytes)`. Two exports of
 * an unchanged board produce the same bytes for every path, which is what makes
 * AC-6's "`git diff` shows the change" mean anything — a format that reorders itself
 * between saves dirties the tree on every export and the criterion becomes
 * untestable.
 */

/** The container version. Distinct from the element and record schema versions. */
export const FIRO_FORMAT_VERSION = 2;

/** The marker in `manifest.json` that says "this is a Firo board directory". */
export const FIRO_FORMAT = "firo";

/** The two files whose names are load-bearing. */
export const BOARD_JSON = "board.json";
export const MANIFEST_JSON = "manifest.json";

/** Where assets live, relative to the directory root. */
export const ASSETS_DIR = "assets";

/**
 * One asset, as the manifest describes it.
 *
 * Keyed in the manifest by `fileId` — the element-facing id — and carrying the hash
 * and the path separately, because deduplication happens on the hash and works even
 * when two `fileId`s name the same bytes. Keying on the hash instead would make the
 * manifest smaller, but it would also mean the element's own id is not in the file,
 * and the id is what the importer has to put back on the element.
 */
export type ManifestAsset = Readonly<{
  /** Size on disk, so a truncated copy is detectable without hashing. */
  bytes: number;
  mimeType: string;
  /** `assets/<sha256>.<ext>`, relative to the directory root. */
  path: string;
  sha256: string;
}>;

/**
 * `manifest.json`, in full.
 *
 * Four details in it are load-bearing rather than incidental, and each is a way the
 * obvious implementation fails:
 *
 * - **`board.created` is the board's creation time, never the export time.** Stamp
 *   the export instead and every re-export dirties the manifest, so AC-6's "`git
 *   diff` shows the change" becomes "`git diff` always shows a change" — a criterion
 *   that can no longer fail and therefore tests nothing.
 * - **`generator` records the writing version and *is* expected to change on
 *   upgrade.** That is a one-line diff, which is what the field is for.
 * - **`boardJson.sha256` makes a truncated or hand-edited `board.json` detectable**
 *   rather than silently partial. A half-written board document still parses as JSON
 *   often enough to matter, and the failure otherwise surfaces as "some notes are
 *   missing from the board I imported yesterday".
 * - **`format` and `formatVersion` are both present**, so dispatch is on shape rather
 *   than on a filename — see `detectContainer`.
 */
export type FiroManifest = Readonly<{
  /** `fileId` → asset. Empty for a board with no images. */
  assets: Readonly<Record<string, ManifestAsset>>;
  board: Readonly<{
    /** Epoch ms. The board's creation time; see the note above. */
    created: number;
    /** `firo/<version>`, which changes on upgrade by design. */
    generator: string;
    id: string;
  }>;
  boardJson: Readonly<{ bytes: number; sha256: string }>;
  format: typeof FIRO_FORMAT;
  formatVersion: number;
}>;

/** A directory's contents, keyed by path relative to its root, forward slashes. */
export type FiroFiles = ReadonlyMap<string, Uint8Array>;

/** What an export produced, or why it refused. */
export type DirectoryExport =
  | { ok: true; files: FiroFiles; manifest: FiroManifest }
  | {
      ok: false;
      reason:
        | "assets-missing-bytes"
        | "assets-missing-reference"
        | "assets-pending"
        | "failed";
      detail: string;
    };

/** Reads an asset's bytes by hash. `null` when the store has none. */
export type AssetReader = (hash: string) => Promise<Uint8Array | null>;

/**
 * The file extension for a mime type, or `bin` when it is not one we know.
 *
 * Derived from the `mimeType` already on the `AssetReference` rather than from
 * anything a caller supplies, because the bytes decide what the file is and a second
 * source of truth would let the two disagree — which is how a `.png` full of JPEG
 * arrives.
 *
 * `bin` rather than a guess: an unknown type still gets a file, still round-trips,
 * and still verifies against its hash. Naming it `.png` would make it lie in a
 * directory a person is reading.
 */
export const extensionFor = (mimeType: string): string => {
  for (const [extension, known] of Object.entries(IMAGE_MIME_TYPES)) {
    if (known === mimeType) {
      return extension;
    }
  }
  return "bin";
};

/** UTF-8 bytes, which is what every text file in the directory is. */
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Which `fileId`s a board's surviving images need.
 *
 * Read from the *compacted* board rather than from `doc.read()`, and the distinction
 * is not cosmetic: `read()` returns tombstoned elements, and `compactBoard` drops
 * them on the way into a file. Counting a deleted image would make a board
 * permanently unexportable the moment somebody deleted a picture from it — the
 * opposite of a fix, and a bug this module has already had once.
 */
const neededFileIds = (
  elements: readonly unknown[],
): {
  ids: string[];
  pending: number;
} => {
  const ids: string[] = [];
  let pending = 0;

  for (const element of elements) {
    const image = element as { type?: string; fileId?: string | null };
    if (image.type !== "image") {
      continue;
    }
    if (image.fileId == null) {
      pending += 1;
      continue;
    }
    ids.push(image.fileId);
  }

  return { ids, pending };
};

/**
 * Build the whole directory, in memory.
 *
 * Never touches the browser's filesystem, which is what makes AC-6's properties
 * testable at all — see the note at the top of this file.
 *
 * ## The refusal is kept and narrowed, not deleted
 *
 * The obvious move when assets start travelling is to remove `uncarriedAssetTypes`
 * wholesale, because "a board with an image" is no longer a problem. That would
 * restore the silent-loss failure this feature exists to prevent: a manifest
 * referencing bytes that are not there, and an import that draws a broken picture
 * with nothing saying why.
 *
 * So three refusals remain, each about a *real* gap rather than about images as such:
 *
 * - an image with no `fileId` at all — still being decoded, or a paste that failed;
 * - an image whose `fileId` has no entry in the document's asset map;
 * - an image whose hash the store has no bytes for.
 *
 * All three are boards that genuinely cannot be exported whole, and a visible refusal
 * is a limitation somebody can report.
 */
export const buildFiroDirectory = async (
  doc: FiroDoc,
  options: { now?: Date; readAsset: AssetReader; generator?: string },
): Promise<DirectoryExport> => {
  try {
    const now = options.now ?? new Date();
    const board = doc.read();

    const serialized = serializeBoard(board);
    const compacted = compactBoard(serialized);
    const { ids, pending } = neededFileIds(compacted.elements);

    if (pending > 0) {
      return {
        ok: false,
        reason: "assets-pending",
        detail:
          `${pending} image${pending === 1 ? " has" : "s have"} no stored ` +
          `file yet — usually still decoding. Wait for the board to finish ` +
          `loading its pictures and export again.`,
      };
    }

    /*
     * Keyed by hash, so two `fileId`s carrying the same picture are read once and
     * written once. That is the whole of deduplication, and it is why the manifest
     * records the hash rather than deriving the filename from the `fileId`.
     */
    const bytesByHash = new Map<string, Uint8Array>();
    const assets: Record<string, ManifestAsset> = {};
    const missingReference: string[] = [];
    const missingBytes: string[] = [];

    for (const fileId of ids) {
      const reference = board.assets[fileId];
      if (!reference) {
        if (!missingReference.includes(fileId)) {
          missingReference.push(fileId);
        }
        continue;
      }

      let bytes = bytesByHash.get(reference.hash);
      if (bytes === undefined) {
        bytes = (await options.readAsset(reference.hash)) ?? undefined;
        if (!bytes) {
          if (!missingBytes.includes(fileId)) {
            missingBytes.push(fileId);
          }
          continue;
        }
        bytesByHash.set(reference.hash, bytes);
      }

      assets[fileId] = {
        bytes: bytes.byteLength,
        mimeType: reference.mimeType,
        path: `${ASSETS_DIR}/${reference.hash}.${extensionFor(
          reference.mimeType,
        )}`,
        sha256: reference.hash,
      };
    }

    if (missingReference.length > 0) {
      return {
        ok: false,
        reason: "assets-missing-reference",
        detail:
          `${missingReference.length} image${
            missingReference.length === 1 ? "" : "s"
          } on this board ${missingReference.length === 1 ? "has" : "have"} ` +
          `no record of what file they point at, so there is nothing to carry.`,
      };
    }

    if (missingBytes.length > 0) {
      return {
        ok: false,
        reason: "assets-missing-bytes",
        detail:
          `This board refers to ${missingBytes.length} image${
            missingBytes.length === 1 ? "" : "s"
          } whose bytes are not in this browser's storage. The autosave is ` +
          `unaffected — the board is intact — but exporting now would produce a ` +
          `directory that opens with the picture missing.`,
      };
    }

    const boardJson = canonicalFile(compacted);
    const boardBytes = utf8(boardJson);
    const files: Map<string, Uint8Array> = new Map([[BOARD_JSON, boardBytes]]);

    for (const asset of Object.values(assets)) {
      const bytes = bytesByHash.get(asset.sha256);
      if (bytes && !files.has(asset.path)) {
        files.set(asset.path, bytes);
      }
    }

    const manifest: FiroManifest = {
      assets,
      board: {
        created: boardCreated(board, now),
        generator: options.generator ?? "firo/0.1.0",
        id: String(board.meta?.id ?? "board"),
      },
      boardJson: {
        bytes: boardBytes.byteLength,
        sha256: await hashBytes(
          boardBytes.buffer.slice(
            boardBytes.byteOffset,
            boardBytes.byteOffset + boardBytes.byteLength,
          ) as ArrayBuffer,
        ),
      },
      format: FIRO_FORMAT,
      formatVersion: FIRO_FORMAT_VERSION,
    };

    files.set(MANIFEST_JSON, utf8(canonicalFile(manifest)));

    return { ok: true, files, manifest };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * The board's creation time, in epoch ms.
 *
 * `meta.created` is authoritative, and it is what a loaded or saved board carries.
 *
 * The fallback is **not** `now`, and that was the second version of this function.
 * A freshly-constructed `FiroDoc` has no `meta.created` — it is written by `putBoard`
 * and by `doc.load` — so falling back to the export time made the manifest change on
 * every export of a board that had never been saved. That is precisely the case a
 * tester hits: create a board, export it, commit, export again, and `git diff` shows
 * a change to a board nobody touched. AC-6's criterion would have passed anyway,
 * because it only asks that a change *be* visible — which is the trap. A criterion
 * that cannot fail tests nothing.
 *
 * So the fallback is the **oldest element's** `created`, which the document stamps on
 * first commit and which is stable for the board's lifetime. It is a defensible
 * reading of "when this board began" and, more importantly, it is a function of the
 * board rather than of the moment of the export.
 *
 * `now` remains the last resort for a board with no elements at all, which is
 * degenerate: an empty board cannot be imported either.
 */
const boardCreated = (
  board: { meta?: unknown; elements: readonly unknown[] },
  now: Date,
): number => {
  // Read defensively rather than typed: a `.firo` file is untrusted input by the
  // time it is loaded back, and `meta` is whatever the file said it was.
  const meta = (board.meta as { created?: unknown } | undefined)?.created;
  if (typeof meta === "number" && Number.isFinite(meta)) {
    return meta;
  }

  let oldest = Number.POSITIVE_INFINITY;
  for (const element of board.elements) {
    const created = (element as { created?: unknown } | null)?.created;
    if (typeof created === "number" && Number.isFinite(created)) {
      oldest = Math.min(oldest, created);
    }
  }

  return Number.isFinite(oldest) ? oldest : now.getTime();
};

/** What an import read, before anything was written. */
export type ParsedDirectory =
  | {
      ok: true;
      /** The document half, as text, for `loadBoard`. */
      boardJson: string;
      /** Assets to write, in the order `putAsset` must precede the document. */
      assets: readonly {
        fileId: string;
        mimeType: string;
        bytes: Uint8Array;
        sha256: string;
      }[];
      manifest: FiroManifest;
    }
  | {
      ok: false;
      reason:
        | "not-a-directory"
        | "unreadable"
        | "newer-version"
        | "corrupt"
        | "missing-asset";
      detail: string;
    };

/**
 * Read a directory back, verifying it, and apply nothing.
 *
 * ## Verification before trust
 *
 * Both checksums are enforced, and neither is optional:
 *
 * - `board.json` against `boardJson.sha256`. A truncated copy of a JSON document
 *   frequently still parses, and the symptom of importing one is a board missing some
 *   of its notes — which reads as Firo losing data rather than as a bad copy.
 * - every asset against its own `sha256`. Same argument, and the asset case is worse
 *   because a partially-written PNG still displays: it is just wrong.
 *
 * ## Why the manifest is trusted over `board.json` for *shape*
 *
 * The manifest is written last and describes the other two files, so when they
 * disagree the manifest is the one that says what was intended. `detail` names which
 * file was believed, because "the file is corrupt" is not an actionable error message
 * and the person holding a broken copy needs to know which half to distrust.
 */
export const parseFiroDirectory = async (
  files: FiroFiles,
): Promise<ParsedDirectory> => {
  const manifestBytes = files.get(MANIFEST_JSON);
  const boardBytes = files.get(BOARD_JSON);

  if (!manifestBytes || !boardBytes) {
    return {
      ok: false,
      reason: "not-a-directory",
      detail:
        `A .firo directory needs ${MANIFEST_JSON} and ${BOARD_JSON}. ` +
        `This has ${
          manifestBytes ? BOARD_JSON : MANIFEST_JSON
        } but not the other.`,
    };
  }

  let manifest: FiroManifest;
  try {
    manifest = JSON.parse(
      new TextDecoder().decode(manifestBytes),
    ) as FiroManifest;
  } catch (error) {
    return {
      ok: false,
      reason: "unreadable",
      detail: `${MANIFEST_JSON} is not readable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (manifest.format !== FIRO_FORMAT) {
    return {
      ok: false,
      reason: "unreadable",
      detail: `${MANIFEST_JSON} says this is "${manifest.format}", not a Firo board.`,
    };
  }

  if (typeof manifest.formatVersion !== "number") {
    return {
      ok: false,
      reason: "unreadable",
      detail: `${MANIFEST_JSON} has no formatVersion.`,
    };
  }

  /*
   * A forward version throws rather than guessing.
   *
   * A directory from a newer Firo may put fields in `board.json` this one would
   * silently drop, so importing it "successfully" would quietly lose them — which is
   * the one outcome AC-10 names as a loud-failure requirement.
   */
  if (manifest.formatVersion > FIRO_FORMAT_VERSION) {
    return {
      ok: false,
      reason: "newer-version",
      detail:
        `This board was written in .firo format v${manifest.formatVersion}; ` +
        `this version of Firo reads up to v${FIRO_FORMAT_VERSION}. Update Firo ` +
        `and try again — importing it now would drop whatever changed.`,
    };
  }

  const boardJson = new TextDecoder().decode(boardBytes);

  const boardHash = await sha256(boardBytes);
  if (manifest.boardJson?.sha256 && boardHash !== manifest.boardJson.sha256) {
    return {
      ok: false,
      reason: "corrupt",
      detail:
        `${BOARD_JSON} does not match the checksum in ${MANIFEST_JSON} ` +
        `(expected ${manifest.boardJson.sha256.slice(
          0,
          12,
        )}…, read ${boardHash.slice(
          0,
          12,
        )}…). The copy is incomplete or was edited; the manifest was believed.`,
    };
  }

  const assets: {
    fileId: string;
    mimeType: string;
    bytes: Uint8Array;
    sha256: string;
  }[] = [];

  // Sorted, so a failure names the same missing file every time rather than whichever
  // one the object's key order happened to reach first.
  for (const fileId of Object.keys(manifest.assets ?? {}).sort()) {
    const asset = manifest.assets[fileId];
    const bytes = files.get(asset.path);

    if (!bytes) {
      return {
        ok: false,
        reason: "missing-asset",
        detail: `${asset.path} is in the manifest but not in the directory.`,
      };
    }

    const hash = await sha256(bytes);
    if (hash !== asset.sha256) {
      return {
        ok: false,
        reason: "corrupt",
        detail:
          `${asset.path} does not match its checksum ` +
          `(expected ${asset.sha256.slice(0, 12)}…, read ${hash.slice(
            0,
            12,
          )}…). ` +
          `The copy is incomplete; the manifest was believed.`,
      };
    }

    assets.push({
      fileId,
      mimeType: asset.mimeType,
      bytes,
      sha256: asset.sha256,
    });
  }

  return { ok: true, assets, boardJson, manifest };
};

/**
 * Writes the bytes into a content-addressed store.
 *
 * Injected for the same reason `readAsset` is: the format's correctness must not
 * depend on IndexedDB being present.
 */
export type AssetWriter = (
  hash: string,
  bytes: Uint8Array,
  mimeType: string,
) => Promise<void>;

/** What an import did. Nothing is applied unless this says `ok`. */
export type DirectoryImport =
  | { ok: true; elements: number; assets: number }
  | {
      ok: false;
      reason:
        | "not-empty"
        | "empty"
        | "not-a-directory"
        | "unreadable"
        | "newer-version"
        | "corrupt"
        | "missing-asset";
      detail: string;
    };

/**
 * Load a `.firo` directory into an empty document.
 *
 * ## The order is the whole point
 *
 * `putAsset` → `verify` → `setAsset` → `doc.load`. Assets first, references second,
 * document last, and that ordering is not new: [ADR-0005](../../docs/adr/0005-indexeddb-via-idb-keyval.md)
 * already decided it — "atomicity across the document and its assets must be handled
 * by writing assets first, then the document reference".
 *
 * The failure this prevents is the one AC-10 names. An image element with no bytes
 * behind it *renders* — as a broken picture — so a document committed before its
 * assets are in the store leaves a board that looks fine and is not, and the window
 * where it is in that state is exactly as long as it takes to write a few hundred
 * kilobytes.
 *
 * The window is not closed by writing assets first, on its own: a crash between the
 * `setAsset` mutations and `doc.load` leaves orphan asset references, which are
 * harmless (nothing points at them) and are collected by a later `compactBoard`.
 * The unrecoverable direction is the other one, and this order never takes it.
 *
 * ## Why `setAsset` mutations are needed at all
 *
 * `doc.load` restores elements and metadata. It does **not** restore the asset map,
 * because the asset map is a document-level table of references rather than part of
 * the scene — and a board loaded from a directory with images but no references is a
 * board whose next export refuses. Which is what the round-trip test found: it
 * re-exported after `doc.load` alone and got `assets-missing-reference`, because the
 * references had never been written.
 *
 * ## Refuses a board that already has content
 *
 * Same decision as `importBoard`, for the same reason — see the note at the top of
 * `files.ts`. There is no "replace this element" mutation to reach for in a CRDT, so
 * an import into a populated board means resolving id conflicts against tombstones.
 */
export const importFiroDirectory = async (
  doc: FiroDoc,
  files: FiroFiles,
  deps: { putAsset: AssetWriter },
): Promise<DirectoryImport> => {
  const parsed = await parseFiroDirectory(files);
  if (!parsed.ok) {
    return parsed;
  }

  // Tombstones are not content: a board whose elements were all deleted (a
  // deliberate clear before a replace import) is an empty board.
  if (doc.read().elements.some((el) => !el.isDeleted)) {
    return {
      ok: false,
      reason: "not-empty",
      detail:
        "this board already has content, and importing into it would mean " +
        "resolving the autosaved copy against the file. Export the current " +
        "board, start a new one, then import.",
    };
  }

  let loaded: ReturnType<typeof loadBoard>;
  try {
    loaded = loadBoard(JSON.parse(parsed.boardJson));
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
    // deliberate.
    return {
      ok: false,
      reason: "empty",
      detail: "the directory contains no elements, collections or records",
    };
  }

  // 1. Bytes, before anything can point at them.
  for (const asset of parsed.assets) {
    await deps.putAsset(asset.sha256, asset.bytes, asset.mimeType);
  }

  // 2. References, so `read().assets` can enumerate what the board needs again.
  if (parsed.assets.length > 0) {
    doc.commit(
      parsed.assets.map((asset) => ({
        kind: "setAsset",
        id: asset.fileId,
        reference: {
          hash: asset.sha256,
          mimeType: asset.mimeType,
          bytes: asset.bytes.byteLength,
        },
      })) as never,
    );
  }

  // 3. The document, last.
  doc.load({
    elements: loaded.elements,
    collections: loaded.collections,
    records: loaded.records,
    elementOrder: loaded.elementOrder,
    meta: loaded.meta,
  });

  return {
    ok: true,
    elements: loaded.elements.length,
    assets: parsed.assets.length,
  };
};

/** SHA-256 of a byte array, as lowercase hex. */
const sha256 = async (bytes: Uint8Array): Promise<string> =>
  hashBytes(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );

/**
 * Which container a thing is, from its shape rather than its name.
 *
 * A single JSON file carrying `elementSchemaVersion` is format v1 and loads for ever;
 * a directory is format v2. Dispatching on shape rather than on the `.firo`
 * extension is what lets both coexist — and what lets a person rename the folder to
 * `notes-2026-10-04.firo` without breaking it, which they will.
 */
export const detectContainer = (
  files: FiroFiles,
): "directory" | "single-file" | "unknown" => {
  if (files.has(MANIFEST_JSON) || files.has(BOARD_JSON)) {
    return "directory";
  }
  return "unknown";
};

/** Whether a single JSON text is a format-v1 `.firo` file. */
export const isLegacyBoardFile = (text: string): boolean => {
  try {
    const parsed = JSON.parse(text) as { elementSchemaVersion?: unknown };
    return typeof parsed?.elementSchemaVersion === "number";
  } catch {
    return false;
  }
};
