import { createFiroDoc } from "@firo/doc";
import { vi } from "vitest";

import { createStickyNote } from "@firo/board/defaults";

import { importBoardFile } from "../files";

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
 * Importing a Miro items JSON into a board that already has content.
 *
 * The importer is a document operation, and this pins the document side of
 * it: both dialog modes must resolve and must leave the imported elements in
 * the document. Whether the visible editor scene then reflects those commits
 * is the sync layer's concern, covered in packages/board/tests/sync.test.ts
 * ("still pushes a change that came from somewhere else") - keep the two
 * questions separate, because a scene that does not update reads exactly like
 * an import that never ran, and the document is the only place that can tell
 * them apart.
 *
 * The fixture is synthetic and neutral: three stickies and one bound
 * connector, none of it from any real board.
 */

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
  {
    id: "mi_c",
    type: "sticky_note",
    x: 900,
    y: 100,
    width: 200,
    height: 200,
    origin: "center",
    relativeTo: "canvas_center",
    data: { content: "Gamma", shape: "square" },
    style: { fillColor: "light_green" },
  },
  {
    id: "mi_conn",
    type: "connector",
    origin: "center",
    relativeTo: "canvas_center",
    data: {},
    style: {},
    start: {
      item: { id: "mi_a" },
      position: { x: 1, y: 0.5 },
      snapTo: "right",
    },
    end: {
      item: { id: "mi_b" },
      position: { x: 0, y: 0.5 },
      snapTo: "left",
    },
  },
];

const miroBytes = () => new TextEncoder().encode(JSON.stringify(miroItems));

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

describe("Miro import into a non-empty board", () => {
  it("insert mode resolves and commits the converted elements", async () => {
    const doc = nonEmptyDoc();
    const result = await importBoardFile(doc, miroBytes(), {
      insertMode: "insert",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.format).toBe("miro");
    // 3 stickies + 1 connector, alongside the pre-existing note.
    expect(doc.read().elements).toHaveLength(5);
    expect(doc.read().elements.some((el) => el.id === "pre_existing")).toBe(
      true,
    );
  });

  it("insert mode remaps ids so re-importing never collides", async () => {
    const doc = nonEmptyDoc();
    const first = await importBoardFile(doc, miroBytes(), {
      insertMode: "insert",
    });
    const second = await importBoardFile(doc, miroBytes(), {
      insertMode: "insert",
    });

    expect(first.ok && second.ok).toBe(true);
    // 1 pre-existing + 2 x 4 imported, all with unique ids.
    const ids = doc.read().elements.map((el) => String(el.id));
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  /*
   * Regression for the pinned defect: the replace path used to end in a
   * bare `doc.load()`, which only ever creates, so the previous elements
   * survived next to the imported ones. Fail-first: this asserted 4 and got
   * 5 ("pre_existing" kept) before the fix.
   */
  it("replace mode resolves and swaps the board content", async () => {
    const doc = nonEmptyDoc();
    const result = await importBoardFile(doc, miroBytes(), {
      insertMode: "replace",
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // read() includes tombstones; the replaced board keeps a deleted
    // "pre_existing" record, so the assertion is on live elements.
    const live = doc.read().elements.filter((el) => !el.isDeleted);
    expect(live).toHaveLength(4);
    expect(live.some((el) => el.id === "pre_existing")).toBe(false);
  });
});
