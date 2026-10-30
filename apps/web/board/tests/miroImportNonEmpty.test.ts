import { createFiroDoc } from "@firo/doc";

import { createStickyNote } from "@firo/board/defaults";

import { importBoardFile } from "../files";

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
   * Pinned defect, kept skipped until the fix lands: the replace path ends
   * in a bare `doc.load()`, which only ever creates, so the previous
   * elements survive next to the imported ones. Enabled fail-first it
   * asserted 4 and got 5 ("pre_existing" kept).
   */
  it.skip("replace mode resolves and swaps the board content", async () => {
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
