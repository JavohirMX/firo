import { createFiroDoc } from "@firo/doc";
import { compactBoard, serializeBoard, serializeBoardFile } from "@firo/schema";
import { vi } from "vitest";

import { createStickyNote } from "@firo/board/defaults";

import { importBoardFile } from "../files";
import { zipFiles } from "../zip";

/*
 * Faithful in-memory idb-keyval: the import module chain opens stores at
 * module scope, and the shallow `{}` stubs used elsewhere let those calls
 * reject unhandled (no indexedDB in node), which fails the whole file before
 * any test runs. This one behaves like the real thing over a Map, keyed per
 * named store, so module-level readers resolve and tests stay hermetic.
 */
vi.mock("idb-keyval", () => {
  const maps = new Map<string, Map<unknown, unknown>>();
  const mapFor = (store?: { __name?: string }) => {
    const name = store?.__name ?? "default";
    if (!maps.has(name)) {
      maps.set(name, new Map());
    }
    return maps.get(name)!;
  };
  return {
    createStore: (dbName: string, storeName: string) => ({
      __name: `${dbName}/${storeName}`,
    }),
    get: (key: unknown, store?: { __name?: string }) =>
      Promise.resolve(mapFor(store).get(key)),
    getMany: (keys: unknown[], store?: { __name?: string }) =>
      Promise.resolve(keys.map((k) => mapFor(store).get(k))),
    set: (key: unknown, value: unknown, store?: { __name?: string }) => {
      mapFor(store).set(key, value);
      return Promise.resolve();
    },
    setMany: (entries: [unknown, unknown][], store?: { __name?: string }) => {
      for (const [k, v] of entries) {
        mapFor(store).set(k, v);
      }
      return Promise.resolve();
    },
    update: (
      key: unknown,
      updater: (old: unknown) => unknown,
      store?: { __name?: string },
    ) => {
      const m = mapFor(store);
      m.set(key, updater(m.get(key)));
      return Promise.resolve();
    },
    del: (key: unknown, store?: { __name?: string }) => {
      mapFor(store).delete(key);
      return Promise.resolve();
    },
    delMany: (keys: unknown[], store?: { __name?: string }) => {
      for (const k of keys) {
        mapFor(store).delete(k);
      }
      return Promise.resolve();
    },
    clear: (store?: { __name?: string }) => {
      mapFor(store).clear();
      return Promise.resolve();
    },
    keys: (store?: { __name?: string }) =>
      Promise.resolve([...mapFor(store).keys()]),
    values: (store?: { __name?: string }) =>
      Promise.resolve([...mapFor(store).values()]),
    entries: (store?: { __name?: string }) =>
      Promise.resolve([...mapFor(store).entries()]),
  };
});

/*
 * "Replace board content" must leave the imported file alone in the board
 * for every import format, not only for Miro items JSON.
 *
 * Sibling regression to miroImportNonEmpty.test.ts: these paths each ended
 * in a bare `doc.load()` (create-only) or a plain insert-commit, so on a
 * non-empty board a replace either silently merged the file into the
 * existing content or, for packaged .firo archives, failed outright. The
 * assertions are on live elements because read() includes tombstones.
 *
 * Every fixture here is synthetic and neutral.
 */

const encoder = new TextEncoder();
const bytesOf = (text: string) => encoder.encode(text);

const nonEmptyDoc = () => {
  const doc = createFiroDoc();
  doc.commit([
    {
      kind: "createElement",
      element: createStickyNote({
        id: "pre_existing",
        x: 0,
        y: 0,
        text: "keep me",
      }) as never,
    },
  ]);
  return doc;
};

const liveIds = (doc: ReturnType<typeof createFiroDoc>) =>
  doc
    .read()
    .elements.filter((el) => !el.isDeleted)
    .map((el) => String(el.id));

const miroItems = [
  {
    id: "mi_a",
    type: "sticky_note",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    origin: "center",
    relativeTo: "canvas_center",
    data: { content: "Alpha", shape: "square" },
    style: { fillColor: "light_pink" },
  },
  {
    id: "mi_b",
    type: "sticky_note",
    x: 500,
    y: 100,
    width: 200,
    height: 200,
    origin: "center",
    relativeTo: "canvas_center",
    data: { content: "Beta", shape: "square" },
    style: { fillColor: "light_yellow" },
  },
];

describe("replace import clears previous content for every format", () => {
  it("CSV", async () => {
    const doc = nonEmptyDoc();
    const result = await importBoardFile(
      doc,
      "task,status\nAlpha,todo\nBeta,doing",
      {
        insertMode: "replace",
        force: true,
      },
    );

    expect(result.ok).toBe(true);
    const live = liveIds(doc);
    expect(live).toHaveLength(2);
    expect(live).not.toContain("pre_existing");
  });

  it("Excalidraw drawing", async () => {
    const doc = nonEmptyDoc();
    const drawing = {
      type: "excalidraw",
      version: 2,
      source: "replace-test",
      elements: [
        {
          id: "ex_rect",
          type: "rectangle",
          x: 10,
          y: 10,
          width: 120,
          height: 80,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#a5d8ff",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: 1,
          version: 1,
          versionNonce: 7,
          isDeleted: false,
          boundElements: null,
          updated: 1,
          link: null,
          locked: false,
        },
      ],
      appState: {},
      files: {},
    };
    const result = await importBoardFile(doc, JSON.stringify(drawing), {
      insertMode: "replace",
      force: true,
    });

    expect(result.ok).toBe(true);
    const live = liveIds(doc);
    expect(live).toHaveLength(1);
    expect(live).not.toContain("pre_existing");
  });

  it("packaged .firo archive (v2)", async () => {
    const doc = nonEmptyDoc();
    const source = createFiroDoc();
    source.commit([
      {
        kind: "createElement",
        element: createStickyNote({
          id: "packaged_note",
          x: 40,
          y: 40,
          text: "from archive",
        }) as never,
      },
    ]);
    const boardJson = serializeBoardFile(
      compactBoard(serializeBoard(source.read())),
    );
    const zip = zipFiles(
      new Map([
        [
          "manifest.json",
          bytesOf(JSON.stringify({ format: "firo", formatVersion: 2 })),
        ],
        ["board.json", bytesOf(boardJson)],
      ]),
    );

    const result = await importBoardFile(doc, zip, {
      insertMode: "replace",
      force: true,
    });

    expect(result.ok).toBe(true);
    const live = liveIds(doc);
    expect(live).toEqual(["packaged_note"]);
  });

  it("Miro .rtb archive", async () => {
    const doc = nonEmptyDoc();
    const rtb = zipFiles(
      new Map([
        ["board.json", bytesOf(JSON.stringify({ name: "Neutral board" }))],
        ["resources.json", bytesOf(JSON.stringify({ resources: [] }))],
      ]),
    );

    const result = await importBoardFile(doc, rtb, {
      insertMode: "replace",
      force: true,
      miroItems,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.format).toBe("miro");
    const live = liveIds(doc);
    expect(live).toHaveLength(2);
    expect(live).not.toContain("pre_existing");
  });
});

/*
 * Asset-write coverage: an imported Miro image whose media bytes ride inside
 * the .rtb archive must be handed to the board's asset writer exactly once,
 * byte-identical, and the placed image element must reference the asset by
 * its content hash with status "saved". Regression guard for imports that
 * render frames but lose the picture bytes. Synthetic neutral fixture.
 */
describe("Miro image assets are written to asset storage on import", () => {
  it("puts matched media bytes and links the image element by content hash", async () => {
    const doc = createFiroDoc();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const rtb = zipFiles(
      new Map([
        ["board.json", bytesOf(JSON.stringify({ name: "Asset board" }))],
        ["resources.json", bytesOf(JSON.stringify({ resources: [] }))],
        ["img001.png", pngBytes],
      ]),
    );
    const imageItem = [
      {
        id: "mi_img",
        type: "image",
        x: 300,
        y: 300,
        width: 160,
        height: 120,
        origin: "center",
        relativeTo: "canvas_center",
        data: { url: "https://cdn.example.invalid/media/img001.png" },
      },
    ];
    const puts: Array<{ hash: string; bytes: Uint8Array; mimeType: string }> =
      [];
    const result = await importBoardFile(doc, rtb, {
      insertMode: "replace",
      force: true,
      miroItems: imageItem,
      putAsset: async (hash: string, bytes: Uint8Array, mimeType: string) => {
        puts.push({ hash, bytes, mimeType });
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.assets?.size).toBe(1);

    expect(puts).toHaveLength(1);
    const put = puts[0]!;
    expect(put.mimeType).toBe("image/png");
    expect(put.hash).toMatch(/^[0-9a-f]{64}$/);
    expect([...put.bytes]).toEqual([...pngBytes]);

    const images = doc
      .read()
      .elements.filter((el) => !el.isDeleted && el.type === "image");
    expect(images).toHaveLength(1);
    expect(String((images[0] as { fileId?: string }).fileId)).toBe(put.hash);
    expect((images[0] as { status?: string }).status).toBe("saved");
  });
});
