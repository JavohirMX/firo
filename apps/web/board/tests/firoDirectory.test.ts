import * as Y from "yjs";

import { FiroDoc, hashBytes } from "@firo/doc";
import {
  compactBoard,
  CURRENT_ELEMENT_VERSION,
  CURRENT_RECORD_VERSION,
  loadBoard,
  serializeBoard,
  serializeBoardFile,
} from "@firo/schema";

import type { FiroElement } from "@firo/schema";

import {
  ASSETS_DIR,
  BOARD_JSON,
  buildFiroDirectory,
  detectContainer,
  FIRO_FORMAT_VERSION,
  importFiroDirectory,
  isLegacyBoardFile,
  MANIFEST_JSON,
  parseFiroDirectory,
  type AssetReader,
  type FiroFiles,
} from "../firoDirectory";

/*
 * The `.firo` directory format.
 *
 * ## What is being tested
 *
 * AC-6, which is a v1 gate and which names 50 images:
 *
 * > They export a `.firo` archive. They `cat` it and read the board document as
 * > text. They commit it to git, change two things, and `git diff` shows the
 * > change. They delete the app's storage entirely, re-import the file, and every
 * > element, record, tag, and vote is present.
 *
 * Every one of those sentences is a property of the *bytes*, not of a browser's
 * filesystem. So this file never touches `showDirectoryPicker`, and neither does the
 * code under test — `buildFiroDirectory` returns a path → bytes map and
 * `parseFiroDirectory` takes one back. The IO is the part that can be exercised by
 * hand once; determinism, content addressing and checksums are the parts that have to
 * be provable every time somebody changes the format.
 *
 * ## The load-bearing bet
 *
 * `board.json` must be **byte-for-byte the file that ships today** — same
 * `compactBoard(serializeBoard(board))`, same canonical writer, same function. That
 * is what makes this a container change rather than a format change, and the first
 * test asserts it directly against `serializeBoardFile` rather than against a
 * snapshot. If it ever needs a snapshot, the container has leaked into the document
 * and ADR-0018 has been broken.
 */

const encoder = new TextEncoder();

const bytesOf = (text: string) => encoder.encode(text);

/** SHA-256 as the manifest records it: lowercase hex. */
const sha256 = async (bytes: Uint8Array): Promise<string> =>
  hashBytes(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );

/** A document element the schema's loader accepts. */
const element = (
  id: string,
  type: string,
  extra: Record<string, unknown> = {},
): FiroElement =>
  ({
    id,
    type,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    angle: 0,
    name: id,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 7,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
    ...extra,
  } as unknown as FiroElement);

/** An image element pointing at `fileId`. */
const image = (id: string, fileId: string | null) =>
  element(id, "image", {
    fileId,
    status: fileId ? "saved" : "pending",
    scale: [1, 1],
    crop: null,
  });

/**
 * A store that answers from a map.
 *
 * Injected rather than reached through IndexedDB, which is the whole reason the
 * format's IO and the format's shape are separate modules.
 */
const storeOf = (assets: Record<string, Uint8Array>): AssetReader => {
  const byHash: Record<string, Uint8Array> = {};
  for (const [hash, bytes] of Object.entries(assets)) {
    byHash[hash] = bytes;
  }
  return async (hash: string) => byHash[hash] ?? null;
};

/**
 * A document built the way every real board is built: through the loader.
 *
 * Not a stylistic choice. An element committed straight into a `FiroDoc` has not been
 * through `loadBoard`, so it lacks fields the loader's validation *adds* -- `deletedAt`
 * among them -- and `serializeBoard` writes whatever is on the element. So a
 * hand-built board and the same board after one round trip produce different
 * `board.json` bytes, and a test written against hand-built fixtures asserts a
 * round-trip identity the product does not have.
 *
 * The existing round-trip claim in `packages/schema/tests/fileFormat.test.ts` holds
 * because it stays inside the document layer: `loadBoard` then `serializeBoard` on
 * the loaded value, never through `FiroDoc`. This fixture goes through `FiroDoc` as
 * well, so it asserts the same claim one level up -- which is the one AC-6 makes.
 */
const boardOf = (elements: FiroElement[]): FiroDoc => {
  const doc = new FiroDoc(new Y.Doc());
  doc.load(
    loadBoard({
      elementSchemaVersion: CURRENT_ELEMENT_VERSION,
      recordSchemaVersion: CURRENT_RECORD_VERSION,
      elementOrder: elements.map((e) => e.id),
      elements: elements as unknown[],
      collections: [],
      records: [],
      meta: {},
    }),
  );
  return doc;
};

/** A board with one PNG, and the bytes behind it. */
const boardWithOneImage = async () => {
  const doc = boardOf([element("n1", "rectangle"), image("img-1", "file-1")]);

  const png = bytesOf("\u0089PNG-not-really-but-deterministic");
  const hash = await sha256(png);

  doc.commit([
    {
      kind: "setAsset",
      id: "file-1",
      reference: { hash, mimeType: "image/png", bytes: png.byteLength },
    },
  ] as never);

  return { doc, png, hash, readAsset: storeOf({ [hash]: png }) };
};

/** Two images carrying the same picture, under different `fileId`s. */
const boardWithDuplicateImages = async () => {
  const doc = boardOf([
    image("img-1", "file-1"),
    image("img-2", "file-2"),
    image("img-3", "file-2"),
  ]);

  const png = bytesOf("same-bytes-two-ids");
  const hash = await sha256(png);

  doc.commit([
    {
      kind: "setAsset",
      id: "file-1",
      reference: { hash, mimeType: "image/png", bytes: png.byteLength },
    },
    {
      kind: "setAsset",
      id: "file-2",
      reference: { hash, mimeType: "image/png", bytes: png.byteLength },
    },
  ] as never);

  return { doc, png, hash, readAsset: storeOf({ [hash]: png }) };
};

/**
 * Narrow a result to its success branch, failing loudly with the reason if not.
 *
 * A *function declaration* rather than an arrow const: the const form infers its
 * type parameter from the constraint instead of from the argument, so every call site
 * got back `{ ok: true }` and `built.files` did not exist on it. Written as an arrow
 * this helper silently threw away the shape it was meant to preserve.
 */
const expectOk = <T extends { ok: true } | { ok: false }>(
  result: T,
): Extract<T, { ok: true }> => {
  if (!result.ok) {
    throw new Error(
      `expected success, got ${JSON.stringify(
        result as unknown as { reason?: string; detail?: string },
      )}`,
    );
  }
  return result as Extract<T, { ok: true }>;
};

/** Read one file out of a directory as text. */
const text = (files: FiroFiles, path: string): string =>
  new TextDecoder().decode(files.get(path)!);

describe("board.json is the file that ships today", () => {
  it("is byte-for-byte what the single-file export produced", async () => {
    const { doc, readAsset } = await boardWithOneImage();

    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    // The load-bearing bet of ADR-0018, asserted against the *function* rather than
    // a snapshot: the same canonical writer, the same compaction, the same bytes.
    const legacy = serializeBoardFile(compactBoard(serializeBoard(doc.read())));

    expect(text(built.files, BOARD_JSON)).toBe(legacy);
  });

  it("ends with a newline, so it behaves in a terminal and a diff", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    expect(text(built.files, BOARD_JSON).endsWith("\n")).toBe(true);
  });

  it("loads through the same loader the autosave uses", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const loaded = loadBoard(JSON.parse(text(built.files, BOARD_JSON)));

    expect(loaded.elements.map((e) => e.id).sort()).toEqual(["img-1", "n1"]);
  });
});

describe("determinism", () => {
  it("produces identical bytes for every path on a re-export", async () => {
    // AC-6's "`git diff` shows the change" is meaningless unless an unchanged board
    // produces no change at all.
    const { doc, readAsset } = await boardWithOneImage();

    const first = expectOk(
      await buildFiroDirectory(doc, { now: new Date(1000), readAsset }),
    );
    const second = expectOk(
      await buildFiroDirectory(doc, { now: new Date(999_999), readAsset }),
    );

    expect([...second.files.keys()].sort()).toEqual(
      [...first.files.keys()].sort(),
    );
    for (const [path, bytes] of first.files) {
      // `expect(value, message)` is Jest's two-argument form; vitest takes one
      // argument, so the path rides along *inside* the compared value. Without it a
      // failure names no file, and in a directory the path is the whole diagnosis.
      expect({ path, bytes: [...bytes] }).toEqual({
        path,
        bytes: [...second.files.get(path)!],
      });
    }
  });

  it("stamps the board's creation time, not the export time", async () => {
    // The one field that would quietly break the criterion above: stamp `now` and
    // every re-export dirties the manifest, so `git diff` always shows a change and
    // the criterion can no longer fail.
    const { doc, readAsset } = await boardWithOneImage();
    doc.commit([
      { kind: "setMeta", entries: { created: 1_700_000_000_000, id: "b1" } },
    ] as never);

    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    expect(built.manifest.board.created).toBe(1_700_000_000_000);
  });

  it("records the writing version, which is expected to change on upgrade", async () => {
    const { doc, readAsset } = await boardWithOneImage();

    const one = expectOk(
      await buildFiroDirectory(doc, {
        now: new Date(0),
        readAsset,
        generator: "firo/0.1.0",
      }),
    );
    const two = expectOk(
      await buildFiroDirectory(doc, {
        now: new Date(0),
        readAsset,
        generator: "firo/0.2.0",
      }),
    );

    // Which is a one-line diff. That is what the field is for.
    expect(one.manifest.board.generator).toBe("firo/0.1.0");
    expect(two.manifest.board.generator).toBe("firo/0.2.0");
    expect(text(two.files, BOARD_JSON)).toBe(text(one.files, BOARD_JSON));
  });
});

describe("assets travel beside the document", () => {
  it("writes the picture as a file", async () => {
    const { doc, hash, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const path = `${ASSETS_DIR}/${hash}.png`;
    expect([...built.files.keys()].sort()).toEqual(
      [BOARD_JSON, MANIFEST_JSON, path].sort(),
    );
  });

  it("stores one copy when two elements share a picture", async () => {
    // Content addressing, which is the reason the filename is the hash: three
    // elements, one file, and an asset that did not change does not appear in
    // `git status` at all.
    const { doc, hash, readAsset } = await boardWithDuplicateImages();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const assetPaths = [...built.files.keys()].filter((p) =>
      p.startsWith(ASSETS_DIR),
    );
    expect(assetPaths).toEqual([`${ASSETS_DIR}/${hash}.png`]);

    // And the manifest still names both `fileId`s, because the importer has to put
    // the right id back on the right element.
    expect(Object.keys(built.manifest.assets).sort()).toEqual([
      "file-1",
      "file-2",
    ]);
  });

  it("carries fifty images, which is the number AC-6 names", async () => {
    const assets: Record<string, Uint8Array> = {};
    const hashes: string[] = [];
    const elements: FiroElement[] = [];

    for (let i = 0; i < 50; i++) {
      const png = bytesOf(`picture-${i}`);
      // Hash first, then file the bytes under it. The other order keys the store on
      // `hashes[i]` while it is still `undefined`, which is how every image ended up
      // sharing one `undefined` key and the store came back empty.
      const hash = await sha256(png);
      hashes.push(hash);
      assets[hash] = png;
      elements.push(image(`img-${i}`, `file-${i}`));
    }

    const doc = boardOf(elements);
    doc.commit(
      elements.map((_, i) => ({
        kind: "setAsset",
        id: `file-${i}`,
        reference: {
          hash: hashes[i],
          mimeType: "image/png",
          bytes: assets[hashes[i]].byteLength,
        },
      })) as never,
    );

    const built = expectOk(
      await buildFiroDirectory(doc, {
        now: new Date(0),
        readAsset: storeOf(assets),
      }),
    );

    expect(Object.keys(built.manifest.assets)).toHaveLength(50);
    expect(
      [...built.files.keys()].filter((p) => p.startsWith(ASSETS_DIR)),
    ).toHaveLength(50);
  });

  it("never inlines bytes as base64", async () => {
    // The distinction between option 2 and option 3 in ADR-0018, and the reason a
    // single file was refused: base64 in JSON is unreadable, undiffable, and 33%
    // larger. Asserted on the *text* files, which are the ones a person opens.
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    for (const path of built.files.keys()) {
      if (!path.endsWith(".json")) {
        continue;
      }
      const contents = text(built.files, path);
      // The path rides inside the value: `expect(v, msg)` is Jest's two-argument
      // form and vitest's `expect` takes one.
      expect({ path, base64: contents.includes("base64") }).toEqual({
        path,
        base64: false,
      });
      expect({ path, inlined: contents.includes("data:image") }).toEqual({
        path,
        inlined: false,
      });
    }
  });

  it("derives the extension from the mime type, not from the id", async () => {
    const doc = boardOf([image("img-1", "file-1")]);
    const jpeg = bytesOf("jpeg-not-really");
    const hash = await sha256(jpeg);
    doc.commit([
      {
        kind: "setAsset",
        id: "file-1",
        reference: { hash, mimeType: "image/jpeg", bytes: jpeg.byteLength },
      },
    ] as never);

    const built = expectOk(
      await buildFiroDirectory(doc, {
        now: new Date(0),
        readAsset: storeOf({ [hash]: jpeg }),
      }),
    );

    // The bytes decide what the file is. A second source of truth would let the two
    // disagree, which is how a `.png` full of JPEG arrives.
    expect([...built.files.keys()]).toContain(`${ASSETS_DIR}/${hash}.jpg`);
  });
});

describe("the export refuses rather than losing a picture", () => {
  it("refuses an image whose bytes the store does not have", async () => {
    // The refusal is *kept and narrowed*, not deleted. Deleting it wholesale when
    // assets started travelling would restore the silent-loss failure this feature
    // exists to prevent: a manifest pointing at bytes that are not there.
    const doc = boardOf([image("img-1", "file-1")]);
    doc.commit([
      {
        kind: "setAsset",
        id: "file-1",
        reference: { hash: "abc", mimeType: "image/png", bytes: 3 },
      },
    ] as never);

    const built = await buildFiroDirectory(doc, {
      now: new Date(0),
      readAsset: async () => null,
    });

    expect(built.ok).toBe(false);
    expect((built as { reason: string }).reason).toBe("assets-missing-bytes");
  });

  it("refuses an image still being decoded", async () => {
    const doc = boardOf([image("img-1", null)]);

    const built = await buildFiroDirectory(doc, {
      now: new Date(0),
      readAsset: async () => null,
    });

    expect((built as { reason: string }).reason).toBe("assets-pending");
  });

  it("refuses an image with no record of what it points at", async () => {
    const doc = boardOf([image("img-1", "file-1")]);

    const built = await buildFiroDirectory(doc, {
      now: new Date(0),
      readAsset: async () => null,
    });

    expect((built as { reason: string }).reason).toBe(
      "assets-missing-reference",
    );
  });

  it("ignores a deleted image, which is not in the file either", async () => {
    // `read()` returns tombstoned elements and `compactBoard` drops them. Counting a
    // deleted image would make a board permanently unexportable the moment somebody
    // deleted a picture from it — the opposite of a fix.
    const { doc, hash, readAsset } = await boardWithOneImage();
    doc.commit([{ kind: "deleteElements", ids: ["img-1"] }] as never);

    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    expect(
      [...built.files.keys()].filter((p) => p.startsWith(ASSETS_DIR)),
    ).toEqual([]);
    expect(hash).toBeTruthy();
  });

  it("exports a board with no images at all", async () => {
    // The refusal must not become a blanket "any image" check again, or every board
    // with a logo on it is unexportable.
    const doc = boardOf([element("n1", "rectangle")]);

    const built = expectOk(
      await buildFiroDirectory(doc, {
        now: new Date(0),
        readAsset: storeOf({}),
      }),
    );

    expect([...built.files.keys()].sort()).toEqual([BOARD_JSON, MANIFEST_JSON]);
    expect(built.manifest.assets).toEqual({});
  });
});

describe("reading a directory back", () => {
  it("round-trips through the loader with every element present", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const parsed = expectOk(await parseFiroDirectory(built.files));

    expect(parsed.assets).toHaveLength(1);
    expect(
      loadBoard(JSON.parse(parsed.boardJson))
        .elements.map((e) => e.id)
        .sort(),
    ).toEqual(["img-1", "n1"]);
  });

  it("hands back the asset under the fileId the element uses", async () => {
    // The manifest is keyed by `fileId`, not by hash, precisely so the importer can
    // put the right id back on the right element.
    const { doc, readAsset } = await boardWithDuplicateImages();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const parsed = expectOk(await parseFiroDirectory(built.files));

    expect(parsed.assets.map((a) => a.fileId).sort()).toEqual([
      "file-1",
      "file-2",
    ]);
    // Two ids, one payload — and both get the bytes.
    for (const asset of parsed.assets) {
      expect(new TextDecoder().decode(asset.bytes)).toBe("same-bytes-two-ids");
    }
  });

  it("is byte-identical after export → import → export", async () => {
    // The property that makes the format trustworthy rather than merely plausible,
    // and the reason determinism is cheaper in a directory than in an archive.
    const { doc, readAsset } = await boardWithOneImage();
    const first = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    /*
     * Through the real importer, not `doc.load` alone.
     *
     * The first version of this test loaded the document by hand and then re-exported.
     * It failed with `assets-missing-reference`, and it was the implementation that
     * was wrong rather than the test: `doc.load` restores elements and metadata, and
     * it does not restore the document's *asset map*, because that map is a table of
     * references rather than part of the scene. So a board imported from a directory
     * came back with images that had bytes behind them and no record of it — and its
     * next export refused.
     *
     * Which is the failure mode worth caring about most in this whole feature: an
     * import that appears to work and leaves the board unable to leave again.
     */
    const reimported = new FiroDoc(new Y.Doc());
    const imported = await importFiroDirectory(reimported, first.files, {
      putAsset: async () => {},
    });

    expect(imported.ok).toBe(true);
    expect((imported as { assets: number }).assets).toBe(1);

    const second = expectOk(
      await buildFiroDirectory(reimported, { now: new Date(0), readAsset }),
    );

    for (const [path, bytes] of first.files) {
      // The path rides inside the value: `expect(v, msg)` is Jest's two-argument
      // form and vitest's `expect` takes one, and in a directory the path is the
      // whole diagnosis.
      expect({ path, bytes: [...second.files.get(path)!] }).toEqual({
        path,
        bytes: [...bytes],
      });
    }
  });

  it("detects a truncated board.json", async () => {
    // A half-written JSON document often still parses, and the symptom of importing
    // one is a board missing some of its notes — which reads as Firo losing data
    // rather than as a bad copy.
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const damaged = new Map<string, Uint8Array>(built.files);
    damaged.set(
      BOARD_JSON,
      bytesOf(text(built.files, BOARD_JSON).slice(0, 40)),
    );

    const parsed = await parseFiroDirectory(damaged);
    expect(parsed.ok).toBe(false);
    expect((parsed as { reason: string }).reason).toBe("corrupt");
  });

  it("detects a corrupted asset rather than importing a broken picture", async () => {
    const { doc, hash, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const damaged = new Map<string, Uint8Array>(built.files);
    damaged.set(`${ASSETS_DIR}/${hash}.png`, bytesOf("something else"));

    const parsed = await parseFiroDirectory(damaged);
    expect(parsed.ok).toBe(false);
    expect((parsed as { reason: string }).reason).toBe("corrupt");
  });

  it("names which file it believed when the two disagree", async () => {
    // "The file is corrupt" is not an actionable message, and the person holding a
    // broken copy needs to know which half to distrust.
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );
    const damaged = new Map<string, Uint8Array>(built.files);
    damaged.set(BOARD_JSON, bytesOf("{}"));

    const parsed = await parseFiroDirectory(damaged);
    expect((parsed as { detail: string }).detail).toContain(MANIFEST_JSON);
  });

  it("refuses a directory whose board.json is missing", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );
    const partial = new Map<string, Uint8Array>(built.files);
    partial.delete(BOARD_JSON);

    const parsed = await parseFiroDirectory(partial);
    expect((parsed as { reason: string }).reason).toBe("not-a-directory");
  });

  it("refuses a directory whose manifest is missing", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );
    const partial = new Map<string, Uint8Array>(built.files);
    partial.delete(MANIFEST_JSON);

    const parsed = await parseFiroDirectory(partial);
    expect((parsed as { reason: string }).reason).toBe("not-a-directory");
  });

  it("refuses a missing asset rather than importing a broken one", async () => {
    const { doc, hash, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );
    const partial = new Map<string, Uint8Array>(built.files);
    partial.delete(`${ASSETS_DIR}/${hash}.png`);

    const parsed = await parseFiroDirectory(partial);
    expect((parsed as { reason: string }).reason).toBe("missing-asset");
  });

  it("refuses a directory from a newer Firo, loudly", async () => {
    // AC-10: a newer file must fail loudly, because importing it "successfully"
    // would drop whatever changed — the one outcome the criterion forbids.
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    const future = new Map<string, Uint8Array>(built.files);
    const manifest = JSON.parse(text(built.files, MANIFEST_JSON));
    manifest.formatVersion = FIRO_FORMAT_VERSION + 1;
    future.set(MANIFEST_JSON, bytesOf(JSON.stringify(manifest)));

    const parsed = await parseFiroDirectory(future);
    expect((parsed as { reason: string }).reason).toBe("newer-version");
  });

  it("refuses something that is not a Firo board", async () => {
    const parsed = await parseFiroDirectory(
      new Map([
        [BOARD_JSON, bytesOf("{}")],
        [MANIFEST_JSON, bytesOf(JSON.stringify({ format: "something-else" }))],
      ]),
    );

    expect((parsed as { reason: string }).reason).toBe("unreadable");
  });
});

describe("recognising a container by shape", () => {
  it("calls a manifest-bearing set a directory", async () => {
    const { doc, readAsset } = await boardWithOneImage();
    const built = expectOk(
      await buildFiroDirectory(doc, { now: new Date(0), readAsset }),
    );

    expect(detectContainer(built.files)).toBe("directory");
  });

  it("recognises a format-v1 single JSON file, which loads for ever", async () => {
    // Dispatching on shape rather than on the `.firo` extension is what lets both
    // containers coexist — and what lets a person rename the folder to
    // `notes-2026-10-04.firo` without breaking it, which they will.
    const { doc } = await boardWithOneImage();
    const v1 = serializeBoardFile(compactBoard(serializeBoard(doc.read())));

    expect(isLegacyBoardFile(v1)).toBe(true);
    expect(isLegacyBoardFile("not json at all")).toBe(false);
    expect(isLegacyBoardFile(JSON.stringify({ hello: "world" }))).toBe(false);
  });

  it("does not mistake a directory for a single file", () => {
    expect(detectContainer(new Map())).toBe("unknown");
  });
});
