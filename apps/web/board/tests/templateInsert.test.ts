/*
 * Fragment insertion.
 *
 * ## What is actually at stake
 *
 * The promise a template makes is "insert this again, anywhere, as many
 * times as you like". That breaks in exactly one way: identity. If a stored
 * id leaks into a scene, the second insert of the same template collides
 * with the first, and the symptoms arrive later as corrupted selections,
 * broken bindings and a sync lane that disagrees with itself. The tests
 * below spend their effort there: two inserts of one payload must be fully
 * disjoint, and every reference the copy carries must point inside itself.
 */

import type { ExcalidrawElement } from "@firo/element/types";

import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@firo/editor/types";

import { insertTemplateFragment } from "../templateInsert";

import type { CapturedFragment } from "../templateFragment";

const el = (
  partial: Partial<ExcalidrawElement> & { id: string },
): ExcalidrawElement =>
  ({
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
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
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...partial,
  } as ExcalidrawElement);

interface Recorded {
  addedFiles: BinaryFileData[];
  scenes: ExcalidrawElement[][];
  selections: Record<string, true>[];
}

const mockApi = (
  scene: readonly ExcalidrawElement[] = [],
): { api: ExcalidrawImperativeAPI; recorded: Recorded } => {
  const recorded: Recorded = { addedFiles: [], scenes: [], selections: [] };
  const api = {
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 800,
      zoom: { value: 1 },
    }),
    getSceneElements: () => scene,
    addFiles: (files: BinaryFileData[]) => {
      recorded.addedFiles.push(...files);
    },
    updateScene: (opts: {
      elements: ExcalidrawElement[];
      appState?: { selectedElementIds: Record<string, true> };
    }) => {
      recorded.scenes.push(opts.elements);
      if (opts.appState?.selectedElementIds) {
        recorded.selections.push(opts.appState.selectedElementIds);
      }
    },
  } as unknown as ExcalidrawImperativeAPI;
  return { api, recorded };
};

describe("insertTemplateFragment", () => {
  it("inserts with fresh ids, centred on the viewport", () => {
    const fragment: CapturedFragment = {
      elements: [el({ id: "stored-1", x: 0, y: 0, width: 100, height: 100 })],
      files: {},
    };
    const { api, recorded } = mockApi();
    expect(insertTemplateFragment(api, fragment)).toEqual({ ok: true });

    const inserted = recorded.scenes[0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].id).not.toBe("stored-1");
    // Fragment centre (50, 50) lands on the viewport centre (500, 400).
    expect(inserted[0].x).toBe(450);
    expect(inserted[0].y).toBe(350);
  });

  it("produces disjoint identities on a second insert of the same payload", () => {
    const fragment: CapturedFragment = {
      elements: [
        el({ id: "box", boundElements: [{ id: "label", type: "text" }] }),
        el({ id: "label", type: "text", containerId: "box", text: "hi" }),
      ],
      files: {},
    };
    const { api, recorded } = mockApi();

    expect(insertTemplateFragment(api, fragment)).toEqual({ ok: true });
    const first = recorded.scenes[0];
    // The second insert sees the first already in the scene.
    (api.getSceneElements as unknown as () => ExcalidrawElement[]) = () =>
      first;
    expect(insertTemplateFragment(api, fragment)).toEqual({ ok: true });

    const second = recorded.scenes[1];
    expect(second).toHaveLength(4);
    const firstIds = new Set(first.map((element) => element.id));
    const newOnes = second.filter((element) => !firstIds.has(element.id));
    expect(newOnes).toHaveLength(2);
    // None of the new ids reuse a stored id or a first-insert id.
    for (const element of newOnes) {
      expect(["box", "label"]).not.toContain(element.id);
    }
    // The container/text relationship was remapped inside the copy.
    const newBox = newOnes.find((element) => element.type === "rectangle")!;
    const newLabel = newOnes.find((element) => element.type === "text")!;
    expect(newLabel.containerId).toBe(newBox.id);
    expect(
      (newBox.boundElements ?? []).some(
        (bound) => bound.id === newLabel.id && bound.type === "text",
      ),
    ).toBe(true);
  });

  it("adds files before the scene update so the first paint has images", () => {
    const fragment: CapturedFragment = {
      elements: [el({ id: "pic", type: "image", fileId: "file-1" as never })],
      files: {
        "file-1": {
          dataURL: "data:image/png;base64,AAAA",
          mimeType: "image/png",
          created: 1,
        },
      },
    };
    const order: string[] = [];
    const { api, recorded } = mockApi();
    (api.addFiles as unknown as (files: BinaryFileData[]) => void) = (
      files,
    ) => {
      order.push("files");
      recorded.addedFiles.push(...files);
    };
    (api.updateScene as unknown as (opts: never) => void) = (opts: {
      elements: ExcalidrawElement[];
    }) => {
      order.push("scene");
      recorded.scenes.push(opts.elements);
    };
    expect(insertTemplateFragment(api, fragment)).toEqual({ ok: true });
    expect(order).toEqual(["files", "scene"]);
    expect(recorded.addedFiles[0].id).toBe("file-1");
  });

  it("selects the inserted top-level elements", () => {
    const fragment: CapturedFragment = {
      elements: [
        el({ id: "frame", type: "frame" }),
        el({ id: "child", frameId: "frame" }),
      ],
      files: {},
    };
    const { api, recorded } = mockApi();
    expect(insertTemplateFragment(api, fragment)).toEqual({ ok: true });
    const inserted = recorded.scenes[0];
    const frameId = inserted.find((e) => e.type === "frame")!.id;
    expect(recorded.selections[0]).toEqual({ [frameId]: true });
  });

  it("refuses an empty fragment", () => {
    const { api } = mockApi();
    expect(insertTemplateFragment(api, { elements: [], files: {} })).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});
