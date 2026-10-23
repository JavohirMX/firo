import { CaptureUpdateAction } from "@firo/element";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  STICKY_STACK_COUNT,
  STICKY_STACK_STEP,
  createStickyStack,
  layoutStickyStack,
} from "../stickyStack";

/*
 * The sticky stack: a pile of blank notes to pull from.
 *
 * Two halves, tested separately:
 *
 * 1. **The geometry** (`layoutStickyStack`, pure): bottom note first, each
 *    note one step up-right of the one under it, and the pile as a whole --
 *    notes plus spread -- centred on the view, not the bottom note.
 * 2. **The placement** (`createStickyStack`, against a fake editor): the
 *    notes land in one undo step, the pile is centred on what the person is
 *    looking at, the notes follow the sticky tool's current defaults, and
 *    only the top note ends up selected -- the note you would pull first.
 */

let noteCounter = 0;
const newStickyNoteElementMock = vi.fn((opts: Record<string, unknown>) => ({
  ...opts,
  id: `note-${(noteCounter += 1)}`,
}));

vi.mock("@firo/element", async (importOriginal) => {
  const original = await importOriginal<typeof import("@firo/element")>();
  return {
    ...original,
    newStickyNoteElement: (opts: Record<string, unknown>) =>
      newStickyNoteElementMock(opts),
  };
});

vi.mock("@firo/editor", () => ({
  stickyNoteSizeForKey: (key: string) =>
    ({ small: 100, medium: 200, large: 300 }[key] ?? 100),
}));

describe("layoutStickyStack", () => {
  it("lays nothing out for no notes or no size", () => {
    expect(layoutStickyStack(0, 100, { x: 0, y: 0 })).toEqual([]);
    expect(layoutStickyStack(6, 0, { x: 0, y: 0 })).toEqual([]);
  });

  it("centres a single note on the point", () => {
    expect(layoutStickyStack(1, 100, { x: 500, y: 250 })).toEqual([
      { x: 450, y: 200 },
    ]);
  });

  it("steps each note up-right of the one under it, bottom first", () => {
    const placements = layoutStickyStack(3, 100, { x: 0, y: 0 });
    expect(placements).toHaveLength(3);
    expect(placements[1].x - placements[0].x).toBe(STICKY_STACK_STEP);
    expect(placements[1].y - placements[0].y).toBe(STICKY_STACK_STEP);
    expect(placements[2].x - placements[1].x).toBe(STICKY_STACK_STEP);
  });

  it("centres the whole pile, spread included, not the bottom note", () => {
    const size = 100;
    const center = { x: 500, y: 250 };
    const placements = layoutStickyStack(6, size, center);
    const first = placements[0];
    const last = placements[placements.length - 1];
    // The pile spans from the bottom note's top-left to the top note's
    // bottom-right; its midpoint is the centre.
    expect((first.x + last.x + size) / 2).toBe(center.x);
    expect((first.y + last.y + size) / 2).toBe(center.y);
    // Bottom note of a 6-pile: half the note plus half the 5-step spread.
    expect(first.x).toBe(center.x - (size + 5 * STICKY_STACK_STEP) / 2);
  });

  it("honours a custom step", () => {
    const placements = layoutStickyStack(2, 100, { x: 0, y: 0 }, 20);
    expect(placements[1].x - placements[0].x).toBe(20);
    expect(placements[0].x).toBe(-(100 + 20) / 2);
  });
});

describe("createStickyStack", () => {
  const fakeApi = () => {
    const scenes: Array<{
      elements: unknown[];
      appState: { selectedElementIds: Record<string, boolean> };
      captureUpdate: string;
    }> = [];
    const api = {
      getAppState: () => ({
        width: 800,
        height: 600,
        scrollX: -100,
        scrollY: -50,
        zoom: { value: 2 },
        currentItemStickynoteSize: "small",
        currentItemStickynoteStrokeColor: "#1e1e1e",
        currentItemStickynoteBackgroundColor: "#ffd43b",
        currentItemFillStyle: "solid",
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 1,
        currentItemOpacity: 100,
      }),
      getSceneElements: () => [{ id: "existing" }],
      updateScene: (scene: typeof scenes[number]) => {
        scenes.push(scene);
      },
    } as unknown as ExcalidrawImperativeAPI;
    return { api, scenes };
  };

  beforeEach(() => {
    noteCounter = 0;
    newStickyNoteElementMock.mockClear();
  });

  it("places six notes in one undo step, keeping the scene's elements", () => {
    const { api, scenes } = fakeApi();
    const notes = createStickyStack(api);
    expect(notes).toHaveLength(STICKY_STACK_COUNT);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].captureUpdate).toBe(CaptureUpdateAction.IMMEDIATELY);
    expect(scenes[0].elements).toHaveLength(1 + STICKY_STACK_COUNT);
    expect(scenes[0].elements[0]).toEqual({ id: "existing" });
  });

  it("centres the pile on the viewport middle", () => {
    const { api } = fakeApi();
    const notes = createStickyStack(api);
    // Viewport centre in scene coords: ((-scroll + dim/2) / zoom).
    const center = { x: (100 + 400) / 2, y: (50 + 300) / 2 };
    const first = notes[0];
    const last = notes[notes.length - 1];
    const size = 100;
    expect((first.x + last.x + size) / 2).toBe(center.x);
    expect((first.y + last.y + size) / 2).toBe(center.y);
  });

  it("selects only the top note, the one you would pull first", () => {
    const { api, scenes } = fakeApi();
    const notes = createStickyStack(api);
    expect(scenes[0].appState.selectedElementIds).toEqual({
      [notes[notes.length - 1].id]: true,
    });
  });

  it("follows the sticky tool's current colour and size defaults", () => {
    const { api } = fakeApi();
    createStickyStack(api);
    expect(newStickyNoteElementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 100,
        height: 100,
        strokeColor: "#1e1e1e",
        backgroundColor: "#ffd43b",
      }),
    );
  });

  it("does not touch the scene when the pile would be empty", () => {
    const { api, scenes } = fakeApi();
    expect(createStickyStack(api, 0)).toEqual([]);
    expect(scenes).toHaveLength(0);
  });
});
