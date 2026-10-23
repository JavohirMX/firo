/*
 * The wiring in `../board.ts` — the module-scope singletons that bind the
 * document to the editor.
 *
 * The document, `toEditorScene` and the presentation filter are real; the
 * storage layer, the action registrars and `BoardSync` are faked, because
 * their own behaviour is pinned in `storage.test.ts`, `fileActions.test.ts`,
 * `facilitatorActions.test.ts` and the `@firo/board` package tests. What only
 * this module owns, and what these tests pin:
 *
 * 1. **Actions register once per editor, not once per attach.** React's
 *    development double-mount attaches twice; a boolean guard would skip the
 *    editor that survives, no guard would put every action in the menu twice.
 * 2. **Re-attach replaces the sync; teardown retires it.** A leaked sync keeps
 *    pushing into an editor that has gone away; a sync left live after
 *    teardown answers `commitBoard` for nobody.
 * 3. **The bridge never records its own writes.** A document change pushed
 *    into the editor with the default capture mode would enter the editor's
 *    undo stack, and undo would walk backwards through changes the user never
 *    made.
 * 4. **Restore happens once, and a failed restore says so.** Two restores
 *    race the autosave; a silent failure looks exactly like an empty board.
 * 5. **The autosave is debounced, trailing, and loud when it fails.** The
 *    last change in a burst is the one that must not be dropped, and a board
 *    that is not saving is the one fact the console must say out loud.
 * 6. **Hiding or closing the page flushes immediately.** A pending debounce
 *    never fires on a frozen tab.
 * 7. **The initial scene is the presentation-filtered projection.** A board
 *    opened mid-presentation or in private mode must not flash the withheld
 *    notes before the sync attaches.
 * 8. **The dev probe's `live` counts ignore tombstones.** Both the editor
 *    and the document tombstone rather than drop, so a raw `.length` reports
 *    an undo as a no-op — the misdiagnosis the probe exists to end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureUpdateAction } from "@firo/element";
import { createStickyNote } from "@firo/board/defaults";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

type BoardModule = typeof import("../board");

interface FakeSync {
  doc: unknown;
  bridge: { read: () => unknown; write: (elements: unknown) => void };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  saveBoard: vi.fn(),
  restoreBoard: vi.fn(),
  debounce: vi.fn(),
  registerFileActions: vi.fn(),
  registerFacilitatorActions: vi.fn(),
  syncInstances: [] as FakeSync[],
}));

vi.mock("../storage", () => ({
  debounce: h.debounce,
  restoreBoard: h.restoreBoard,
  saveBoard: h.saveBoard,
}));

vi.mock("../fileActions", () => ({
  registerFileActions: h.registerFileActions,
}));

vi.mock("../facilitatorActions", () => ({
  registerFacilitatorActions: h.registerFacilitatorActions,
}));

vi.mock("@firo/board", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firo/board")>();
  class BoardSync {
    start = vi.fn();

    stop = vi.fn();

    push = vi.fn(() => [] as unknown[]);

    pull = vi.fn();

    constructor(
      public doc: unknown,
      public bridge: {
        read: () => unknown;
        write: (elements: unknown) => void;
      },
    ) {
      h.syncInstances.push(this as unknown as FakeSync);
    }
  }
  return { ...actual, BoardSync };
});

const importBoard = (): Promise<BoardModule> => import("../board");

const fakeEditorApi = (scene: unknown[] = []) => ({
  getSceneElementsIncludingDeleted: vi.fn(() => scene),
  updateScene: vi.fn(),
  getAppState: vi.fn(() => ({})),
});

const asApi = (
  api: ReturnType<typeof fakeEditorApi>,
): ExcalidrawImperativeAPI => api as unknown as ExcalidrawImperativeAPI;

const lastSync = (): FakeSync => {
  const sync = h.syncInstances[h.syncInstances.length - 1];
  if (!sync) {
    throw new Error("expected a BoardSync to have been constructed");
  }
  return sync;
};

const noteA = () => createStickyNote({ id: "note-a", x: 0, y: 0 });
const noteB = () =>
  createStickyNote({ id: "note-b", x: 300, y: 0, hiddenUntilRevealed: true });

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const setVisibility = (state: string): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
};

beforeEach(() => {
  vi.resetModules();
  h.saveBoard.mockReset().mockResolvedValue({ ok: true, bytes: 1 });
  h.restoreBoard.mockReset().mockResolvedValue({ status: "empty" });
  h.debounce.mockReset().mockImplementation(() => vi.fn());
  h.registerFileActions.mockClear();
  h.registerFacilitatorActions.mockClear();
  h.syncInstances.length = 0;
});

afterEach(() => {
  setVisibility("visible");
});

describe("attachBoard", () => {
  it("registers file and facilitator actions once per editor, not per attach", async () => {
    const { attachBoard } = await importBoard();
    const api = asApi(fakeEditorApi());

    attachBoard(api);
    attachBoard(api);

    expect(h.registerFileActions).toHaveBeenCalledTimes(1);
    expect(h.registerFileActions).toHaveBeenCalledWith(
      api,
      expect.any(Function),
    );
    expect(h.registerFacilitatorActions).toHaveBeenCalledTimes(1);
    expect(h.registerFacilitatorActions).toHaveBeenCalledWith(
      api,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("registers actions for each distinct editor", async () => {
    const { attachBoard } = await importBoard();
    const first = asApi(fakeEditorApi());
    const second = asApi(fakeEditorApi());

    attachBoard(first);
    attachBoard(second);

    expect(h.registerFileActions).toHaveBeenCalledTimes(2);
    expect(h.registerFileActions.mock.calls[0]?.[0]).toBe(first);
    expect(h.registerFileActions.mock.calls[1]?.[0]).toBe(second);
    expect(h.registerFacilitatorActions).toHaveBeenCalledTimes(2);
  });

  it("stops the outgoing sync before starting its replacement", async () => {
    const { attachBoard } = await importBoard();
    const api = asApi(fakeEditorApi());

    attachBoard(api);
    attachBoard(api);

    expect(h.syncInstances).toHaveLength(2);
    const [outgoing, current] = h.syncInstances;
    expect(outgoing?.stop).toHaveBeenCalledTimes(1);
    expect(current?.start).toHaveBeenCalledTimes(1);
    const stopOrder = outgoing?.stop.mock.invocationCallOrder[0];
    const startOrder = current?.start.mock.invocationCallOrder[0];
    expect(stopOrder).toBeDefined();
    expect(startOrder).toBeDefined();
    expect(Number(stopOrder)).toBeLessThan(Number(startOrder));
  });

  it("teardown stops the sync and detaches commit and refresh", async () => {
    const { attachBoard, commitBoard, refreshBoard } = await importBoard();
    const teardown = attachBoard(asApi(fakeEditorApi()));
    const sync = lastSync();

    teardown();
    refreshBoard();
    commitBoard();

    expect(sync.stop).toHaveBeenCalledTimes(1);
    expect(sync.pull).not.toHaveBeenCalled();
    expect(sync.push).not.toHaveBeenCalled();
  });

  it("commit and refresh are safe no-ops before anything attaches", async () => {
    const { commitBoard, refreshBoard } = await importBoard();

    expect(() => {
      refreshBoard();
      commitBoard();
    }).not.toThrow();
  });

  it("commits and refreshes through the live sync", async () => {
    const { attachBoard, commitBoard, refreshBoard } = await importBoard();
    attachBoard(asApi(fakeEditorApi()));
    const sync = lastSync();

    commitBoard();
    refreshBoard();

    expect(sync.push).toHaveBeenCalledTimes(1);
    expect(sync.pull).toHaveBeenCalledTimes(1);
  });

  it("hands the facilitator registrar a refresh that repaints from the document", async () => {
    const { attachBoard } = await importBoard();
    attachBoard(asApi(fakeEditorApi()));
    const sync = lastSync();

    const refresh = h.registerFacilitatorActions.mock.calls[0]?.[2] as
      | (() => void)
      | undefined;
    expect(refresh).toBeDefined();
    refresh?.();

    expect(sync.pull).toHaveBeenCalledTimes(1);
  });
});

describe("editor bridge", () => {
  it("writes into the editor without capturing an undo step", async () => {
    const { attachBoard } = await importBoard();
    const raw = fakeEditorApi();
    attachBoard(asApi(raw));
    const { bridge } = lastSync();

    bridge.write([{ id: "raw-1" }]);

    expect(raw.updateScene).toHaveBeenCalledWith({
      elements: [{ id: "raw-1" }],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  });

  it("reads the full scene, tombstones included", async () => {
    const scene = [{ id: "raw-1" }, { id: "raw-2", isDeleted: true }];
    const { attachBoard } = await importBoard();
    const raw = fakeEditorApi(scene);
    attachBoard(asApi(raw));
    const { bridge } = lastSync();

    expect(bridge.read()).toBe(scene);
  });
});

describe("boardRestored", () => {
  it("restores once and shares the result across callers", async () => {
    const restored = { status: "restored", elements: 3 } as const;
    h.restoreBoard.mockResolvedValue(restored);
    const { boardRestored } = await importBoard();

    const [first, second] = await Promise.all([
      boardRestored(),
      boardRestored(),
    ]);

    expect(h.restoreBoard).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toEqual({ status: "restored", elements: 3 });
  });

  it("warns on a failed restore and passes the failure through", async () => {
    h.restoreBoard.mockResolvedValue({
      status: "failed",
      detail: "corrupt payload",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardRestored } = await importBoard();

    const result = await boardRestored();

    expect(result).toEqual({ status: "failed", detail: "corrupt payload" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupt payload"),
    );
    warn.mockRestore();
  });

  it("does not warn when the restore succeeds or the board is empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { boardRestored } = await importBoard();

    await boardRestored();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("autosave", () => {
  it("is wired to document updates through a 400ms trailing debounce", async () => {
    const debounced = vi.fn();
    h.debounce.mockReturnValue(debounced);
    const { boardDoc } = await importBoard();

    expect(h.debounce).toHaveBeenCalledWith(expect.any(Function), 400);

    boardDoc().commit([{ kind: "createElement", element: noteA() }]);

    expect(debounced).toHaveBeenCalled();
  });

  it("saves the document when the debounced save runs", async () => {
    let run: (() => void) | undefined;
    h.debounce.mockImplementation((callback: () => void) => {
      run = callback;
      return vi.fn();
    });
    const { boardDoc } = await importBoard();
    if (!run) {
      throw new Error("expected the autosave to be debounced at import");
    }

    run();
    await tick();

    expect(h.saveBoard).toHaveBeenCalledWith(boardDoc());
  });

  it("warns when the save fails, but only when there is a detail to say", async () => {
    let run: (() => void) | undefined;
    h.debounce.mockImplementation((callback: () => void) => {
      run = callback;
      return vi.fn();
    });
    await importBoard();
    if (!run) {
      throw new Error("expected the autosave to be debounced at import");
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    h.saveBoard.mockResolvedValueOnce({ ok: false, reason: "failed" });
    run();
    await tick();
    expect(warn).not.toHaveBeenCalled();

    h.saveBoard.mockResolvedValueOnce({
      ok: false,
      reason: "failed",
      detail: "quota exceeded",
    });
    run();
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("quota exceeded"),
    );
    warn.mockRestore();
  });
});

describe("flush on hide", () => {
  it("saves on pagehide and on a hidden visibilitychange, not on visible", async () => {
    const { boardDoc } = await importBoard();
    const doc = boardDoc();
    const savesFor = () =>
      h.saveBoard.mock.calls.filter(([argument]) => argument === doc).length;

    window.dispatchEvent(new Event("pagehide"));
    expect(savesFor()).toBe(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(savesFor()).toBe(2);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(savesFor()).toBe(2);
  });
});

describe("boardElements", () => {
  it("opens with every element when nothing is hidden", async () => {
    const { boardDoc, boardElements } = await importBoard();
    boardDoc().commit([
      { kind: "createElements", elements: [noteA(), noteB()] },
    ]);

    const ids = boardElements().map((element) => element.id);
    expect(ids).toContain("note-a");
    expect(ids).toContain("note-b");
  });

  it("withholds hidden-until-revealed notes while the board is private", async () => {
    const { boardDoc, boardElements } = await importBoard();
    boardDoc().commit([
      { kind: "createElements", elements: [noteA(), noteB()] },
    ]);

    const idsFor = () => boardElements().map((element) => element.id);

    boardDoc().setEphemeral({ reveal: { mode: "private" } });
    expect(idsFor()).toContain("note-a");
    expect(idsFor().some((id) => id.startsWith("note-b"))).toBe(false);

    boardDoc().setEphemeral({ reveal: { mode: "revealed" } });
    expect(idsFor()).toContain("note-a");
    expect(idsFor()).toContain("note-b");
  });
});

describe("dev probe", () => {
  it("counts live elements, ignoring tombstones on both sides", async () => {
    const { attachBoard, boardDoc } = await importBoard();
    const probe = (
      window as unknown as {
        __firoBoard?: {
          read: () => { elements: unknown[] };
          editorElements: () => unknown;
          live: () => { document: number; editor: number };
        };
      }
    ).__firoBoard;
    expect(probe).toBeDefined();
    if (!probe) {
      return;
    }

    boardDoc().commit([
      { kind: "createElements", elements: [noteA(), noteB()] },
    ]);
    boardDoc().commit([{ kind: "deleteElements", ids: ["note-b"] }]);
    attachBoard(
      asApi(
        fakeEditorApi([{ id: "note-a" }, { id: "note-b", isDeleted: true }]),
      ),
    );

    expect(probe.read().elements).toHaveLength(2);
    expect(probe.editorElements()).toHaveLength(2);
    expect(probe.live()).toEqual({ document: 1, editor: 1 });
  });
});
