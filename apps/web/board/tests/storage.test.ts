/*
 * jsdom has no IndexedDB. `fake-indexeddb` stands in for it — a real implementation
 * rather than a hand-written mock, because the failure this file guards against is
 * precisely a failure of the storage layer's own behaviour, and a mock that returns
 * a promise would pass while IndexedDB does something else.
 */
import "fake-indexeddb/auto";

import { clear } from "idb-keyval";

import { createFiroDoc } from "@firo/doc";

import { createStickyNote } from "@firo/board/defaults";

import {
  boardStore,
  clearSavedBoard,
  debounce,
  getBoardRevisions,
  getSaveStatus,
  getStorageEstimate,
  hasSavedBoard,
  isStoragePersisted,
  requestPersistentStorage,
  restoreBoard,
  restoreBoardRevision,
  saveBoard,
  saveBoardRevision,
  snapshotsKey,
  subscribeSaveStatus,
  type SaveResult,
} from "../storage";

/*
 * Getting a board out and back.
 *
 * ## Why this is tested rather than trusted
 *
 * The round trip is the whole product. Everything else in the document model is
 * in-memory and observable, so a bug shows up as something visibly wrong on the
 * canvas. Persistence is the one place where a bug is *silent*: a board that fails
 * to save opens as an empty canvas, which looks exactly like a board nobody has
 * drawn on. No error, no warning, and no way for the person to tell the two apart —
 * which is how it behaved before any of this existed.
 *
 * So most of what follows is about the unhappy paths, and specifically about which
 * of them are allowed to destroy data.
 *
 * ## Why IndexedDB, and how it is faked
 *
 * jsdom has no IndexedDB, so `fake-indexeddb` stands in. That is a real dependency
 * rather than a hand-written mock, because the failure this guards against is
 * precisely a failure of the storage layer's own behaviour — a mock that returns a
 * promise would pass while IndexedDB does something else.
 *
 * It is also asserted directly that `localStorage` is never touched. ADR-0005
 * rejected `localStorage` on measurement — roughly 5-10 MB and synchronous — and
 * this file was written against `localStorage` first, on the grounds that a
 * synchronous restore was easier. It was. It was also the option that had been
 * decided against, for reasons that apply to exactly the boards this product is for.
 */
const board = () => createFiroDoc();

const note = (id: string, over: Record<string, unknown> = {}) =>
  createStickyNote({ id, x: 10, y: 20, ...over });

const seed = (doc: ReturnType<typeof board>, elements = 3) => {
  for (let i = 0; i < elements; i++) {
    doc.commit([{ kind: "createElement", element: note(`n${i}`) }]);
  }
};

const ok = (result: SaveResult) => result.ok === true;

/** The raw stored string, for asserting that bytes were left alone. */
const stored = async (): Promise<unknown> => {
  const { get } = await import("idb-keyval");
  return get("autosave", boardStore);
};

beforeEach(async () => {
  /*
   * Through `clearSavedBoard` rather than clearing storage directly, because the
   * module keeps one piece of state across calls — the flag that disarms the autosave
   * after a failed restore. Clearing storage behind its back would leave that set,
   * and every later save in the run would refuse for unrelated reasons.
   */
  await clearSavedBoard();
  await clear();
});

describe("save and restore", () => {
  it("round-trips a board", async () => {
    const first = board();
    seed(first);

    expect(ok(await saveBoard(first))).toBe(true);

    const second = board();
    expect(await restoreBoard(second)).toEqual({
      status: "restored",
      elements: 3,
    });
    expect(second.read().elements).toHaveLength(3);
  });

  it("keeps a note's text, the field most easily mangled in transit", async () => {
    const first = board();
    first.commit([
      {
        kind: "createElement",
        element: note("n1", { text: "the quick brown fox" }) as never,
      },
    ]);
    await saveBoard(first);

    const second = board();
    await restoreBoard(second);

    expect(second.read().elements[0].text).toBe("the quick brown fox");
  });

  it("keeps z-order, so the board looks the way it did", async () => {
    // Order is carried explicitly rather than re-derived, because re-deriving it from
    // the elements array would be right only by coincidence -- by how this package
    // happens to read them.
    const first = board();
    seed(first, 4);
    const reverseOrder = [...first.read().elementOrder].reverse();
    first.load({
      elements: first.read().elements,
      collections: [],
      records: [],
      elementOrder: reverseOrder,
    });
    await saveBoard(first);

    const second = board();
    await restoreBoard(second);

    expect(second.read().elementOrder).toEqual(reverseOrder);
  });

  it("reports an empty board on a first run rather than a failure", async () => {
    // The ordinary case. It must not be an error, or every new board warns.
    const doc = board();
    expect(await restoreBoard(doc)).toEqual({ status: "empty" });
    expect(doc.read().elements).toHaveLength(0);
  });

  it("saves an empty board without complaint", async () => {
    // Someone who opens a board and draws nothing has still made a decision, and the
    // next visit should not resurrect whatever was there before.
    const first = board();
    seed(first);
    await saveBoard(first);

    const second = board();
    expect(ok(await saveBoard(second))).toBe(true);

    const third = board();
    await restoreBoard(third);
    expect(third.read().elements).toHaveLength(0);
  });

  it("overwrites a previous board rather than merging into it", async () => {
    const first = board();
    seed(first, 2);
    await saveBoard(first);

    const second = board();
    seed(second, 5);
    await saveBoard(second);

    const third = board();
    await restoreBoard(third);
    expect(third.read().elements).toHaveLength(5);
  });
});

describe("a board that cannot be read", () => {
  /** Put a string in the store that `loadBoard` will refuse. */
  const poison = async (payload: string) => {
    const { set } = await import("idb-keyval");
    await set("autosave", payload, boardStore);
  };

  it("reports the failure instead of throwing", async () => {
    // A restore is awaited while the canvas is being created, so anything it throws
    // becomes an exception before anything is on screen.
    await poison("{ this is not json");
    const doc = board();

    const result = await restoreBoard(doc);

    expect(result.status).toBe("failed");
    expect(doc.read().elements).toHaveLength(0);
  });

  it("names what was wrong", async () => {
    await poison("{ this is not json");
    const result = await restoreBoard(board());

    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.detail : "").not.toBe("");
  });

  it("refuses a board from a newer Firo, and says which version", async () => {
    // `loadBoard` rejects a forward version rather than guessing. For a file someone
    // hands you that is right; for autosave it means the board was written by a newer
    // build and the person is about to open an empty canvas.
    await poison(
      JSON.stringify({
        elementSchemaVersion: 9999,
        recordSchemaVersion: 9999,
        elements: [],
        collections: [],
        records: [],
      }),
    );

    const result = await restoreBoard(board());

    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.detail : "").toMatch(/9999/);
  });

  it("leaves the unreadable copy in place rather than overwriting it", async () => {
    // The important one. A failed restore followed by a save of the empty document
    // replaces the person's board with a blank one, and the original is gone with no
    // trace. The stored bytes are the only copy that exists.
    const payload = JSON.stringify({
      elementSchemaVersion: 9999,
      recordSchemaVersion: 9999,
      elements: [],
      collections: [],
      records: [],
    });
    await poison(payload);

    const doc = board();
    await restoreBoard(doc);
    const result = await saveBoard(doc);

    expect(result.ok).toBe(false);
    expect(await stored()).toBe(payload);
  });

  it("keeps refusing to save after a failed restore, however many times", async () => {
    // Once disarmed it stays disarmed. A save that worked on the second attempt would
    // mean the guard depended on timing, which is the same class of bug as the one it
    // guards against.
    await poison("not json");
    const doc = board();
    await restoreBoard(doc);

    expect(ok(await saveBoard(doc))).toBe(false);
    doc.commit([{ kind: "createElement", element: note("n1") }]);
    expect(ok(await saveBoard(doc))).toBe(false);
    expect(await stored()).toBe("not json");
  });

  it("re-arms after the board is explicitly cleared", async () => {
    // The only way out has to be something a person decides, not something that
    // happens because they drew a shape after the failure.
    await poison("not json");
    const doc = board();
    await restoreBoard(doc);
    expect(ok(await saveBoard(doc))).toBe(false);

    await clearSavedBoard();
    seed(doc, 1);
    expect(ok(await saveBoard(doc))).toBe(true);

    const next = board();
    await restoreBoard(next);
    expect(next.read().elements).toHaveLength(1);
  });

  it("re-arms when there is nothing stored to protect", async () => {
    // A failed restore followed by an emptied store leaves nothing to destroy, so the
    // autosave should not stay disarmed and leave a board permanently unsaveable.
    await poison("not json");
    const doc = board();
    await restoreBoard(doc);
    await clearSavedBoard();

    seed(doc, 2);

    expect(ok(await saveBoard(doc))).toBe(true);
  });

  it("still finds an unreadable board, so it can be recovered", async () => {
    // `hasSavedBoard` reads storage rather than the document, so a board that cannot
    // be parsed is still discoverable. Otherwise the only symptom of a corrupted
    // autosave is a missing one.
    await poison("not json at all");
    expect(await hasSavedBoard()).toBe(true);

    await clearSavedBoard();
    expect(await hasSavedBoard()).toBe(false);
  });
});

describe("nothing is written to localStorage", () => {
  /*
   * ADR-0005 rejected `localStorage` on measurement — roughly 5-10 MB, and
   * synchronous, so every write blocks the main thread. A two-hour workshop with a few
   * hundred images and thousands of elements does not fit, and the person it fails for
   * is the person this product is for.
   *
   * This is the assertion the plan asked for, and it is here because this file was
   * written against `localStorage` first. It was easier: a synchronous restore meant
   * the board could be in the document before the canvas asked for it. It was also
   * the option already decided against.
   */
  it("writes the board to IndexedDB, not to localStorage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const doc = board();
    seed(doc, 2);
    await saveBoard(doc);
    await restoreBoard(board());

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("still works when localStorage is entirely unavailable", async () => {
    // Which is the point of not using it: storage being blocked or full in one place
    // does not take the board down.
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: storage is blocked");
      });

    const doc = board();
    seed(doc, 2);
    expect(ok(await saveBoard(doc))).toBe(true);

    const next = board();
    expect(await restoreBoard(next)).toEqual({
      status: "restored",
      elements: 2,
    });
    spy.mockRestore();
  });
});

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once for a burst, not once per call", () => {
    // A drag commits on every pointer move. Without this the autosave would serialise
    // a whole board dozens of times a second.
    const run = vi.fn();
    const debounced = debounce(run, 400);

    for (let i = 0; i < 20; i++) {
      debounced();
    }
    vi.advanceTimersByTime(400);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs the trailing call, so the last change is never the one dropped", () => {
    // The failure that loses the thing someone just did: a leading-edge debounce
    // fires at the start of a burst and nothing after it, so the final edit is the one
    // that never reaches storage.
    const run = vi.fn();
    const debounced = debounce(run, 400);

    debounced("first");
    vi.advanceTimersByTime(400);
    debounced("second");
    debounced("third");
    vi.advanceTimersByTime(400);

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("third");
  });

  it("runs again after the wait has passed", () => {
    const run = vi.fn();
    const debounced = debounce(run, 400);

    debounced();
    vi.advanceTimersByTime(400);
    debounced();
    vi.advanceTimersByTime(400);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("passes the latest arguments, not the first", () => {
    const run = vi.fn();
    const debounced = debounce(run, 400);

    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(400);

    expect(run).toHaveBeenCalledWith(2);
  });
});

describe("save status indicator (AC-10)", () => {
  it("transitions from saving to saved when a board saves successfully", async () => {
    const statuses: string[] = [];
    const unsubscribe = subscribeSaveStatus((status) => {
      statuses.push(status);
    });

    const doc = board();
    await saveBoard(doc);

    expect(statuses).toContain("saving");
    expect(statuses).toContain("saved");
    expect(getSaveStatus()).toBe("saved");

    unsubscribe();
  });
});

describe("storage hardening & persistent storage", () => {
  const originalStorage = navigator.storage;

  afterEach(() => {
    Object.defineProperty(navigator, "storage", {
      value: originalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("returns false from requestPersistentStorage if navigator.storage is unavailable", async () => {
    Object.defineProperty(navigator, "storage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(await requestPersistentStorage()).toBe(false);
    expect(await isStoragePersisted()).toBe(false);
    expect(await getStorageEstimate()).toEqual({});
  });

  it("returns true without calling persist() if already persisted", async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: { persisted, persist },
      configurable: true,
      writable: true,
    });

    const result = await requestPersistentStorage();
    expect(result).toBe(true);
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(await isStoragePersisted()).toBe(true);
  });

  it("calls persist() and returns true if not already persisted but granted", async () => {
    const persisted = vi.fn().mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: { persisted, persist },
      configurable: true,
      writable: true,
    });

    const result = await requestPersistentStorage();
    expect(result).toBe(true);
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await isStoragePersisted()).toBe(false);
  });

  it("returns false if persist() rejects or returns false", async () => {
    const persisted = vi.fn().mockResolvedValue(false);
    const persistDenied = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, "storage", {
      value: { persisted, persist: persistDenied },
      configurable: true,
      writable: true,
    });
    expect(await requestPersistentStorage()).toBe(false);

    const persistThrows = vi
      .fn()
      .mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "storage", {
      value: { persisted, persist: persistThrows },
      configurable: true,
      writable: true,
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("returns quota, usage, and calculated percentage from getStorageEstimate", async () => {
    const estimate = vi
      .fn()
      .mockResolvedValue({ quota: 1000000, usage: 250000 });
    Object.defineProperty(navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });

    const result = await getStorageEstimate();
    expect(result).toEqual({ quota: 1000000, usage: 250000, percent: 25 });
  });

  it("restoreBoard automatically invokes requestPersistentStorage", async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: { persisted },
      configurable: true,
      writable: true,
    });

    const doc = board();
    await restoreBoard(doc);
    expect(persisted).toHaveBeenCalled();
  });
});

describe("rolling revision history", () => {
  it("starts with an empty revisions list", async () => {
    const revisions = await getBoardRevisions();
    expect(revisions).toEqual([]);
  });

  it("saves and retrieves revisions with metadata", async () => {
    const doc = board();
    seed(doc, 3);
    const rev = await saveBoardRevision(doc, undefined, "Initial checkpoint");
    expect(rev).not.toBeNull();
    expect(rev?.elementCount).toBe(3);
    expect(rev?.label).toBe("Initial checkpoint");
    expect(typeof rev?.id).toBe("string");
    expect(typeof rev?.timestamp).toBe("number");
    expect(typeof rev?.payload).toBe("string");

    const revisions = await getBoardRevisions();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toEqual(rev);
  });

  it("isolates revisions by boardId and uses correct snapshotsKey", async () => {
    expect(snapshotsKey("default")).toBe("autosave:snapshots");
    expect(snapshotsKey("custom-1")).toBe("autosave:custom-1:snapshots");

    const doc = board();
    seed(doc, 2);
    await saveBoardRevision(doc, "board-alpha", "Alpha Rev");
    await saveBoardRevision(doc, "board-beta", "Beta Rev");

    const alphaRevs = await getBoardRevisions("board-alpha");
    const betaRevs = await getBoardRevisions("board-beta");
    const defaultRevs = await getBoardRevisions();

    expect(alphaRevs).toHaveLength(1);
    expect(alphaRevs[0].label).toBe("Alpha Rev");
    expect(betaRevs).toHaveLength(1);
    expect(betaRevs[0].label).toBe("Beta Rev");
    expect(defaultRevs).toHaveLength(0);
  });

  it("enforces rolling snapshot limit of 10 with FIFO eviction of the 11th", async () => {
    const doc = board();

    for (let i = 0; i < 11; i++) {
      seed(doc, 1);
      const rev = await saveBoardRevision(doc, undefined, `Revision ${i}`);
      expect(rev).not.toBeNull();
    }

    const revisions = await getBoardRevisions();
    expect(revisions).toHaveLength(10);
    // FIFO eviction: the first revision (Revision 0) was evicted
    expect(revisions.find((r) => r.label === "Revision 0")).toBeUndefined();
    expect(revisions[0].label).toBe("Revision 1");
    expect(revisions[9].label).toBe("Revision 10");
  });

  it("restores a revision successfully restoring doc elements", async () => {
    const doc = board();

    // Revision 1: 2 notes
    doc.commit([
      {
        kind: "createElement",
        element: note("note-1", { text: "first note" }) as never,
      },
      {
        kind: "createElement",
        element: note("note-2", { text: "second note" }) as never,
      },
    ]);
    const rev1 = await saveBoardRevision(doc, undefined, "v1");
    expect(rev1).not.toBeNull();

    // Add 2 more notes for Revision 2: 4 notes total
    doc.commit([
      {
        kind: "createElement",
        element: note("note-3", { text: "third note" }) as never,
      },
      {
        kind: "createElement",
        element: note("note-4", { text: "fourth note" }) as never,
      },
    ]);
    const rev2 = await saveBoardRevision(doc, undefined, "v2");
    expect(rev2).not.toBeNull();
    expect(doc.read().elements).toHaveLength(4);

    // Restore revision 1 into doc
    const restoreResult = await restoreBoardRevision(doc, rev1!.id);
    expect(restoreResult).toEqual({
      status: "restored",
      elements: 2,
    });

    const elementsAfterRestore = doc.read().elements;
    expect(elementsAfterRestore).toHaveLength(2);
    expect(elementsAfterRestore.map((e) => e.id)).toEqual(["note-1", "note-2"]);
    expect(elementsAfterRestore[0].text).toBe("first note");
    expect(elementsAfterRestore[1].text).toBe("second note");
  });

  it("reports failure when attempting to restore a nonexistent revision", async () => {
    const doc = board();
    const result = await restoreBoardRevision(doc, "nonexistent-rev-id");
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.detail : "").toContain(
      "not found",
    );
  });

  it("creates a revision snapshot on initial saveBoard with elements", async () => {
    const doc = board();
    seed(doc, 3);
    await saveBoard(doc);

    const revisions = await getBoardRevisions();
    expect(revisions).toHaveLength(1);
    expect(revisions[0].elementCount).toBe(3);
  });
});
