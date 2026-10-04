import { BOARD_JSON, MANIFEST_JSON, type FiroFiles } from "./firoDirectory";

/**
 * The browser half of the `.firo` directory format.
 *
 * ## Why this is separate from the format
 *
 * [`firoDirectory`](./firoDirectory.ts) is the format: a path → bytes map, in and out,
 * with no browser API anywhere in it. This is the part that needs a filesystem — a
 * directory picker, writable streams, a dropped folder — and it is the part that
 * cannot be tested in jsdom.
 *
 * That split is deliberate rather than tidy. AC-6's properties are properties of the
 * bytes, so they belong where the bytes are, and the natural response to a format
 * whose tests need an unimplemented browser API is to test less. The browser half is
 * small enough to exercise by hand once, which is the right amount of testing for
 * six functions that move bytes a directory picker gave us.
 *
 * ## What the File System Access API does and does not give us
 *
 * `showDirectoryPicker()` is Chromium and Edge. **Not Safari**, and
 * [`ADR-0005`](../../docs/adr/0005-indexeddb-via-idb-keyval.md) already rejected it
 * for the autosave for exactly that reason — for IndexedDB there is no alternative,
 * for a user-facing export there is: the single-file path still works, it just cannot
 * carry images, and the zip transport
 * ([`ADR-0018`](../../docs/adr/0018-a-firo-is-a-directory.md) outcome 7) exists for
 * the browsers where neither is available.
 *
 * The picker must also be called from a user gesture. It throws `SecurityError`
 * otherwise, and it throws `AbortError` when the user dismisses it — which is not an
 * error and must not be reported as one.
 */

/*
 * Minimal structural types, declared here rather than imported.
 *
 * `showDirectoryPicker` is not in TypeScript's DOM library yet, and the alternative —
 * `any` at four call sites — is exactly what `AGENTS.md` forbids and what makes the
 * difference between "the browser gave us a directory" and "the browser gave us
 * something with a `write` method" unaskable. These are the four members actually
 * used, and they are the four the spec guarantees.
 */
export type WritableFile = {
  write: (data: string | Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

export type WritableDirectory = {
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<WritableFile>;
  getDirectoryHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<WritableDirectory>;
  removeEntry?: (
    name: string,
    options?: { recursive?: boolean },
  ) => Promise<void>;
};

export type ReadableFile = {
  getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>;
};

export type ReadableDirectory = {
  getFileHandle: (name: string) => Promise<ReadableFile>;
  getDirectoryHandle: (name: string) => Promise<ReadableDirectory>;
  /** Present on `FileSystemDirectoryHandle`, absent on some older shapes. */
  keys?: () => AsyncIterableIterator<string>;
};

/** The window members this module adds, and the two ways they can be missing. */
type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }) => Promise<WritableDirectory>;
  };

/**
 * Whether this browser has the File System Access directory picker at all.
 *
 * Named for the API rather than for one direction, because it answers both: the
 * export needs `mode: "readwrite"` and the import needs `mode: "read"`, and they are
 * the same function. An earlier version of this was `canWriteDirectory` and the
 * import path used it, which was true and misleading.
 *
 * A named check rather than a `try`, because "cannot" is a state the product has to
 * explain to a person and the explanation should not be "an error appeared".
 */
export const canPickDirectory = (): boolean =>
  typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";

/** What a write did, or why it did not happen. */
export type WriteOutcome =
  | { ok: true; path: string }
  | {
      ok: false;
      reason: "cancelled" | "unsupported" | "failed";
      detail: string;
    };

/**
 * Write a whole directory, asking the user where it goes.
 *
 * ## The order is chosen so a cancelled picker costs nothing
 *
 * Nothing is written until `showDirectoryPicker` has resolved, so a dismissed dialog
 * leaves no half-made board directory behind. That matters more than it looks: a
 * half-written `.firo` is a broken board, not an incomplete file, and there is no
 * partial-file affordance to fall back on.
 *
 * ## `manifest.json` is written last
 *
 * It is the file that says what the other two are and what they should hash to, so
 * writing it first would leave a directory that looks complete and fails its own
 * verification. Last means a directory interrupted halfway fails as *not a
 * directory* — which is a clear message — rather than as corrupt.
 */
export const writeFiroDirectory = async (
  files: FiroFiles,
  options: { suggestedName: string },
): Promise<WriteOutcome> => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (typeof picker !== "function") {
    return {
      ok: false,
      reason: "unsupported",
      detail:
        "This browser cannot write a folder. Use the single-file export, which " +
        "carries the board but not its images.",
    };
  }

  let root: WritableDirectory;
  try {
    root = await picker.call(window, { mode: "readwrite", id: "firo-export" });
  } catch (error) {
    // `AbortError` is the user closing the dialog. Not a failure, and reporting it as
    // one is how a product ends up apologising for something the user chose.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, reason: "cancelled", detail: "cancelled" };
    }
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const assets = files.get("assets");
    const assetDir =
      assets && [...files.keys()].some((p) => p.startsWith("assets/"))
        ? await root.getDirectoryHandle("assets", { create: true })
        : null;

    for (const [path, bytes] of files) {
      if (path === MANIFEST_JSON) {
        continue; // last, on purpose
      }

      if (path.startsWith("assets/")) {
        const name = path.slice("assets/".length);
        const handle = await assetDir!.getFileHandle(name, { create: true });
        const writable = await (
          handle as unknown as {
            createWritable: () => Promise<WritableFile>;
          }
        ).createWritable();
        await writable.write(bytes);
        await writable.close();
        continue;
      }

      const handle = await root.getFileHandle(path, { create: true });
      const writable = await (
        handle as unknown as { createWritable: () => Promise<WritableFile> }
      ).createWritable();
      await writable.write(bytes);
      await writable.close();
    }

    const manifest = files.get(MANIFEST_JSON);
    if (manifest) {
      const handle = await root.getFileHandle(MANIFEST_JSON, { create: true });
      const writable = await (
        handle as unknown as { createWritable: () => Promise<WritableFile> }
      ).createWritable();
      await writable.write(manifest);
      await writable.close();
    }

    return { ok: true, path: options.suggestedName };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Ask the user for a `.firo` directory to read. `null` when they decline. */
export const pickFiroDirectory =
  async (): Promise<ReadableDirectory | null> => {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (options?: {
          mode?: "read";
          id?: string;
        }) => Promise<ReadableDirectory>;
      }
    ).showDirectoryPicker;

    if (typeof picker !== "function") {
      return null;
    }

    try {
      return await picker.call(window, { mode: "read", id: "firo-import" });
    } catch {
      // Declined, or unavailable. Both mean "no directory", and neither is an error
      // the caller can do anything about.
      return null;
    }
  };

/**
 * Read a whole directory into a path → bytes map.
 *
 * Walks `keys()` rather than assuming a fixed list, so a directory carrying something
 * extra — a `.DS_Store`, a `README` somebody added, a `.gitignore` keeping git out of
 * the way — is read rather than refused. The format's own checks then decide whether
 * what was found is a board.
 *
 * Bounded at `MAX_FILES` because a directory handle can point at a home directory by
 * accident, and reading that into memory is how a tab dies.
 */
const MAX_FILES = 512;

export const readFiroDirectory = async (
  root: ReadableDirectory,
): Promise<FiroFiles> => {
  const files = new Map<string, Uint8Array>();

  const walk = async (
    dir: ReadableDirectory,
    prefix: string,
  ): Promise<void> => {
    if (files.size >= MAX_FILES) {
      return;
    }

    const names: string[] = [];
    if (typeof dir.keys === "function") {
      for await (const name of dir.keys()) {
        names.push(name);
        if (files.size >= MAX_FILES) {
          break;
        }
      }
    } else {
      /*
       * No `keys()`. Rather than fail, try the two files the format requires and let
       * `parseFiroDirectory` produce the real diagnostic — which names what is
       * missing, where "this handle cannot be enumerated" names nothing.
       */
      names.push(BOARD_JSON, MANIFEST_JSON);
    }

    for (const name of names.sort()) {
      if (files.size >= MAX_FILES) {
        return;
      }
      const path = prefix ? `${prefix}/${name}` : name;
      try {
        const file = await dir.getFileHandle(name);
        const blob = await file.getFile();
        files.set(path, new Uint8Array(await blob.arrayBuffer()));
      } catch {
        // A directory entry rather than a file. Skipping is right: the format's own
        // checks decide whether what is present is a board.
      }
    }
  };

  await walk(root, "");
  return files;
};
