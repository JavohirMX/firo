/*
 * The board thumbnail's capture and debounce (Miro parity row 1).
 *
 * What must hold:
 * 1. An empty or deleted-only scene captures nothing and writes nothing —
 *    the placeholder stays.
 * 2. The render fits the 320px long-edge budget.
 * 3. A capture persists onto the board's library meta and announces itself,
 *    so the board bar and the home cards can show it.
 * 4. The debounce renders the settled scene once, and an unchanged scene is
 *    never re-rendered.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderedExcalidrawElement } from "@firo/element/types";

import { createBoard, getBoardMeta } from "../library";
import {
  BOARD_THUMBNAIL_DEBOUNCE_MS,
  BOARD_THUMBNAIL_EVENT,
  captureBoardThumbnail,
  flushBoardThumbnail,
  resetBoardThumbnailForTests,
  scheduleBoardThumbnail,
} from "../thumbnail";

const element = (
  id: string,
  overrides: Record<string, unknown> = {},
): OrderedExcalidrawElement =>
  ({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 640,
    height: 320,
    isDeleted: false,
    versionNonce: 1,
    ...overrides,
  } as unknown as OrderedExcalidrawElement);

const fakeExporter = (dataUrl = "data:image/png;base64,thumb") =>
  vi.fn(
    async (_opts: Record<string, unknown>) =>
      ({ toDataURL: () => dataUrl } as unknown as HTMLCanvasElement),
  );

const appState = {} as never;
const files = {} as never;

beforeEach(() => {
  resetBoardThumbnailForTests();
});

describe("captureBoardThumbnail", () => {
  it("captures nothing for an empty or deleted-only scene", async () => {
    const exporter = fakeExporter();
    expect(
      await captureBoardThumbnail([], appState, files, exporter),
    ).toBeUndefined();
    expect(
      await captureBoardThumbnail(
        [element("a", { isDeleted: true })],
        appState,
        files,
        exporter,
      ),
    ).toBeUndefined();
    expect(exporter).not.toHaveBeenCalled();
  });

  it("fits the render to the 320px long-edge budget", async () => {
    const exporter = fakeExporter();
    await captureBoardThumbnail([element("a")], appState, files, exporter);
    const opts = exporter.mock.calls[0][0] as unknown as {
      appState: { exportScale: number; exportEmbedScene: boolean };
    };
    // 640px wide scene -> 320/640.
    expect(opts.appState.exportScale).toBe(0.5);
    expect(opts.appState.exportEmbedScene).toBe(false);
  });
});

describe("flushBoardThumbnail", () => {
  it("persists the capture onto the board meta and announces it", async () => {
    const board = await createBoard({ name: "Thumb board" });
    const seen: Array<{ boardId: string; thumbnail: string }> = [];
    window.addEventListener(BOARD_THUMBNAIL_EVENT, (event) =>
      seen.push((event as CustomEvent).detail),
    );
    scheduleBoardThumbnail(
      board.id,
      [element("a")],
      appState,
      files,
      fakeExporter(),
    );
    await flushBoardThumbnail();
    const meta = await getBoardMeta(board.id);
    expect(meta?.thumbnail).toBe("data:image/png;base64,thumb");
    expect(seen).toEqual([
      { boardId: board.id, thumbnail: "data:image/png;base64,thumb" },
    ]);
  });

  it("never re-renders an unchanged scene", async () => {
    const board = await createBoard({ name: "Still board" });
    const exporter = fakeExporter();
    scheduleBoardThumbnail(board.id, [element("a")], appState, files, exporter);
    await flushBoardThumbnail();
    scheduleBoardThumbnail(board.id, [element("a")], appState, files, exporter);
    await flushBoardThumbnail();
    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it("captures each board even when their scene fingerprints match", async () => {
    const first = await createBoard({ name: "First board" });
    const second = await createBoard({ name: "Second board" });
    const exporter = fakeExporter();
    scheduleBoardThumbnail(first.id, [element("a")], appState, files, exporter);
    await flushBoardThumbnail();
    scheduleBoardThumbnail(
      second.id,
      [element("a")],
      appState,
      files,
      exporter,
    );
    await flushBoardThumbnail();
    expect(exporter).toHaveBeenCalledTimes(2);
    expect((await getBoardMeta(second.id))?.thumbnail).toBeDefined();
  });

  it("re-renders once the scene actually changes", async () => {
    const board = await createBoard({ name: "Moving board" });
    const exporter = fakeExporter();
    scheduleBoardThumbnail(board.id, [element("a")], appState, files, exporter);
    await flushBoardThumbnail();
    scheduleBoardThumbnail(
      board.id,
      [element("a", { versionNonce: 2 })],
      appState,
      files,
      exporter,
    );
    await flushBoardThumbnail();
    expect(exporter).toHaveBeenCalledTimes(2);
  });

  it("keeps the placeholder when the render fails", async () => {
    const board = await createBoard({ name: "Fragile board" });
    const failing = vi.fn(async () => {
      throw new Error("render blew up");
    });
    scheduleBoardThumbnail(
      board.id,
      [element("a")],
      appState,
      files,
      failing as never,
    );
    await flushBoardThumbnail();
    expect((await getBoardMeta(board.id))?.thumbnail).toBeUndefined();
  });
});

describe("scheduleBoardThumbnail", () => {
  it("debounces a drawing session into one capture of the settled scene", async () => {
    vi.useFakeTimers();
    try {
      const board = await createBoard({ name: "Sketch board" });
      const exporter = fakeExporter();
      scheduleBoardThumbnail(
        board.id,
        [element("a")],
        appState,
        files,
        exporter,
      );
      scheduleBoardThumbnail(
        board.id,
        [element("a", { versionNonce: 2 })],
        appState,
        files,
        exporter,
      );
      await vi.advanceTimersByTimeAsync(BOARD_THUMBNAIL_DEBOUNCE_MS - 1);
      expect(exporter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(exporter).toHaveBeenCalledTimes(1);
      // Only the settled scene (the second schedule's elements) was rendered.
      // The persistence half of the flush is covered above on real timers;
      // fake-indexeddb's own timers are not driven from here.
      const opts = exporter.mock.calls[0][0] as unknown as {
        elements: Array<{ versionNonce?: number }>;
      };
      expect(opts.elements[0]?.versionNonce).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not let scene-untouched churn postpone the capture", async () => {
    vi.useFakeTimers();
    try {
      const board = await createBoard({ name: "Live board" });
      const exporter = fakeExporter();
      scheduleBoardThumbnail(
        board.id,
        [element("a")],
        appState,
        files,
        exporter,
      );
      // Selection / collaborator events fire with the very same scene: they
      // must not re-arm the debounce, or a connected board never captures.
      await vi.advanceTimersByTimeAsync(BOARD_THUMBNAIL_DEBOUNCE_MS - 5);
      scheduleBoardThumbnail(
        board.id,
        [element("a")],
        appState,
        files,
        exporter,
      );
      await vi.advanceTimersByTimeAsync(4);
      expect(exporter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(exporter).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
