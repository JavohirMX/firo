/**
 * The board, as the app sees it.
 *
 * ## What this is
 *
 * One `FiroDoc` per browser tab, held at module scope so React's double
 * invocation in development cannot produce two documents. Two documents for one
 * board would mean every edit landing in one of them and a board that appeared
 * to lose work at random.
 *
 * ## What this replaces, and what it does not yet
 *
 * The app has always saved through Excalidraw's own `LocalData`, which is
 * IndexedDB keyed by URL. Elements now come from the document model instead, so
 * `LocalData` is being gradually emptied of them. It still runs, and still saves
 * `appState` — zoom, theme, scroll — which the document model has no opinion
 * about and never will.
 *
 * It also still saves elements, as a redundant copy. That was deliberate while the
 * document model had no persistence of its own — `LocalData` was the only thing that
 * survived a reload, and removing the copy would have meant a refresh loses the
 * board.
 *
 * That has now changed: `./storage.ts` autosaves the *document* on every change, so
 * a reload restores from it. The `LocalData` element copy is therefore redundant and
 * is the next thing to remove. It has not been removed here, because doing so is a
 * visible change to reload behaviour and belongs in its own commit where it can be
 * verified on its own — see the note on `boardElements`.
 */

import { createFiroDoc } from "@firo/doc";
import { BoardSync, toEditorScene, type EditorBridge } from "@firo/board";

import { CaptureUpdateAction } from "@firo/editor";
import { visibleElements } from "@firo/facilitation";

import type { ExcalidrawElement } from "@firo/element/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";
import type { FiroElement } from "@firo/schema";

import { debounce, restoreBoard, saveBoard } from "./storage";

import { registerFileActions } from "./fileActions";

import type { RestoreResult } from "./storage";

/**
 * The document for this tab.
 *
 * Module scope rather than React state: React mounts, unmounts and remounts
 * components in development to surface side effects, and a document built in a
 * `useState` initialiser would be built twice — the second one empty, so the
 * board would come back blank.
 */
const doc = createFiroDoc();

/**
 * The live sync, once the editor has attached.
 *
 * Module scope for the same reason as the document, and it is the single
 * instance `commitBoard` reaches. A sync per component instance would mean the
 * editor's change event fed several syncs, each of which pushed into the editor,
 * which is a feedback loop wearing a different hat.
 */
let sync: BoardSync | null = null;

/** The editor's current elements, for the dev hook's inspection. */
let activeElements: (() => readonly unknown[]) | null = null;

/** The editor's app state, for diagnosing blocked actions. */
let activeAppState: (() => unknown) | null = null;

/** The document, for the few places that read or write it directly. */
export const boardDoc = () => doc;

/**
 * Editors the file actions have been registered with.
 *
 * A `WeakSet` keyed on the editor, rather than a single boolean, and the difference
 * matters in both directions:
 *
 * - A boolean. React double-invokes effects in development, so the first mount
 *   registers with an editor that is immediately torn down, the second mount returns
 *   early, and the editor you are actually looking at has no file actions in its menu.
 *   That is what happened, and it is invisible in production — the actions simply are
 *   not there in dev, which reads as "the wiring is wrong" rather than "the guard is".
 * - Per editor. Two attaches of the *same* editor register once, so there are no
 *   duplicate menu entries. Two attaches of *different* editors each register, which
 *   is right, because each menu needs its own.
 *
 * `WeakSet` rather than a `Set` because entries should not outlive the editor they
 * name. There is no way to unregister an action — the action manager has no removal
 * API — so the only thing that can be managed here is not registering twice.
 */
const fileActionsRegistered = new WeakSet<ExcalidrawImperativeAPI>();

const registerFileActionsOnce = (api: ExcalidrawImperativeAPI): void => {
  if (fileActionsRegistered.has(api)) {
    return;
  }
  fileActionsRegistered.add(api);
  registerFileActions(api, () => doc);
};

/*
 * Restore, once, and report when it is done.
 *
 * Awaited rather than fired. `boardElements()` is read while the editor builds its
 * initial scene, so a document populated in the background would leave the canvas
 * empty and then fill in — a flash of a blank board which, on a large one, lasts
 * long enough to look like the work was lost.
 *
 * Storage is IndexedDB and therefore asynchronous, which forces the question. The
 * editor already waits on a promise for its initial scene, so the answer is to make
 * that wait include the restore. Nothing renders until the board is known.
 *
 * The promise is created here, at module scope, and awaited wherever it is needed.
 * A second call returns the same promise rather than restoring twice: two restores
 * would load the board twice and race the autosave.
 */
let restoreOnce: Promise<RestoreResult> | null = null;

export const boardRestored = (): Promise<RestoreResult> => {
  if (restoreOnce === null) {
    restoreOnce = restoreBoard(doc).then((result) => {
      if (result.status === "failed") {
        /*
         * Loudly, and on purpose. A board that cannot be read back leaves an empty
         * canvas that looks exactly like an empty board, and the person has no way to
         * tell those apart. The stored copy is deliberately left untouched so it can
         * still be recovered by hand — see `restoreBoard` for why a failed restore
         * must not overwrite the thing it failed to read.
         */
        console.warn(
          `[firo] the autosaved board could not be read (${result.detail}). The ` +
            `canvas will open empty. The stored board has been left in place so it ` +
            `can be recovered.`,
        );
      }
      return result;
    });
  }
  return restoreOnce;
};

/**
 * Autosave, debounced.
 *
 * The document updates on every committed change, which during a drag is several
 * times a second, and serialising a whole board — every point of every stroke — that
 * often would put string-building on the hot path of drawing. 400ms is short enough
 * that a closed tab has lost nothing a person would notice, and long enough that a
 * drag produces one write rather than dozens.
 *
 * A trailing save is always scheduled, so the last change in a burst is never the
 * one dropped. That is the failure which loses the thing someone just did.
 */
const AUTOSAVE_DELAY_MS = 400;

const autosave = debounce(() => {
  void saveBoard(doc).then((result) => {
    if (!result.ok && result.detail) {
      /*
       * Only the case worth saying out loud: the board is not being saved, and
       * someone who does not know that will lose work. A line on every keystroke
       * would be noise that trains people to ignore the console.
       */
      console.warn(
        `[firo] the board did not autosave (${result.reason}: ${result.detail}). ` +
          `Work in this tab is not being saved.`,
      );
    }
  });
}, AUTOSAVE_DELAY_MS);

doc.onUpdate(autosave);

/**
 * Write the board out now rather than in a moment.
 *
 * Called when the page is being hidden or closed, where a pending debounce would
 * never fire. `pagehide` is the reliable event — `beforeunload` is not fired on
 * mobile — and `visibilitychange` covers a tab that is switched away on a device
 * which then freezes it, which is the ordinary way the last edit gets lost.
 */
const flushBoard = (): void => {
  void saveBoard(doc);
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushBoard);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushBoard();
    }
  });
}

/**
 * The elements the board should open with.
 *
 * Read from the document model, so a board reopens as the document has it rather
 * than as a copy the app happened to write. Empty for a board nobody has edited
 * yet, which is the correct first run.
 */
export const boardElements = (): ExcalidrawElement[] =>
  toEditorScene(
    /*
     * Filtered, and this is the *second* projection path that has to know about
     * private mode — `BoardSync.pull()` is the first.
     *
     * Harmless today and still worth doing: ephemeral state defaults to
     * `revealed`, so a board opens with everything shown. But the moment a board
     * is opened while a session is private, this is what builds the initial
     * scene, and an unfiltered projection here would put every hidden note on
     * the canvas before `attachBoard` had a chance to withhold anything.
     */
    visibleElements(doc.read().elements, doc.getEphemeral().reveal) as
      | FiroElement[]
      | never[],
  ) as unknown as ExcalidrawElement[];

/** An adapter onto the editor, for `BoardSync`. */
const bridgeFor = (excalidrawAPI: ExcalidrawImperativeAPI): EditorBridge => ({
  read: () =>
    excalidrawAPI.getSceneElementsIncludingDeleted() as unknown as Record<
      string,
      unknown
    >[],
  write: (elements) => {
    excalidrawAPI.updateScene({
      elements: elements as unknown as ExcalidrawElement[],
      // Never recorded. A document change is not a user edit, and capturing it
      // would put every push into the editor's own undo stack — so undo would
      // walk backwards through changes the user never made.
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  },
});

/**
 * Attach the document to the editor and keep them in step.
 *
 * Call once the editor exists. Returns a teardown, because a leaked sync keeps a
 * document subscription alive and pushes into an editor that has gone away.
 */
/**
 * Repaint the canvas from the document.
 *
 * Public because the reveal toggle needs it: that mode is ephemeral, so flipping
 * it commits nothing and `BoardSync` never hears about it. Without this the
 * canvas would keep showing notes the facilitator just hid.
 *
 * A no-op when nothing is attached, because a facilitator control can be mounted
 * before the editor exists.
 */
export const refreshBoard = (): void => {
  sync?.pull();
};

export const attachBoard = (
  excalidrawAPI: ExcalidrawImperativeAPI,
): (() => void) => {
  /*
   * `.firo` export and import, in the editor's own menu.
   *
   * Registered here rather than in the app shell because `registerAction` is the
   * supported extension point, and because the app shell deliberately renders no chrome
   * of its own — `renderTopRightUI` returns null — so two buttons would be the first
   * new UI surface in the product, with no design behind it.
   *
   * Not called on every attach: there is no supported way to *remove* an action, so a
   * second registration would leave two identically-named entries in the menu. In
   * development React mounts twice, and this is the seam where that would show.
   */
  registerFileActionsOnce(excalidrawAPI);

  sync?.stop();
  const bridge = bridgeFor(excalidrawAPI);
  activeElements = () => bridge.read();
  activeAppState = () => excalidrawAPI.getAppState();
  sync = new BoardSync(
    doc as unknown as ConstructorParameters<typeof BoardSync>[0],
    bridge,
  );
  sync.start();

  return () => {
    sync?.stop();
    sync = null;
  };
};

/**
 * Fold the editor's current state into the document.
 *
 * Wired to the editor's change event, and safe to call on every change:
 * `BoardSync` recognises its own writes coming back and commits nothing for them.
 */
export const commitBoard = (): void => {
  sync?.push();
};

/*
 * A read-only window onto the document and the editor, for browser tests.
 *
 * `import.meta.env.DEV` is replaced at build time, so this whole block is dead in
 * production and nothing of it reaches the bundle.
 *
 * Three things, for three different reasons.
 *
 * `read` and `editorElements` distinguish a note that reached the *document* from
 * one that is merely *drawn*, which looking at a canvas cannot do and which is the
 * whole question the wiring exists to answer.
 *
 * `appState` is here because an editor action can refuse to run for reasons that
 * are invisible from outside — `executeHistoryAction` blocks undo while any
 * gesture flag is set, and a stuck flag looks exactly like "the shortcut is not
 * bound". That diagnosis took several wrong guesses before reading the flags, so
 * the next person does not repeat them.
 *
 * `live` is here because both the editor and the document *tombstone* rather than
 * drop: an undone creation keeps its element with `isDeleted: true`, so it can be
 * restored. Every element list reachable from this probe therefore has a stable
 * length across an undo, and `.length` on it reports an undo as a no-op.
 *
 * That is not hypothetical. Undo was misdiagnosed as broken for a long stretch
 * because both counters used to check it — `read` here and `h.elements` in tests —
 * include tombstones, while the delta history was recording and inverting
 * correctly the entire time. Use `live` to ask how many shapes a person can see.
 *
 * `read` and `editorElements` stay because sometimes the tombstone *is* the
 * question — whether an undo left a restorable element behind, for instance.
 * Reach for `live` first and the raw lists when the tombstone matters.
 */
if (import.meta.env.DEV) {
  const isLive = (element: unknown) =>
    (element as { isDeleted?: boolean } | null)?.isDeleted !== true;

  (
    window as unknown as {
      __firoBoard: {
        read: () => unknown;
        revision: () => number;
        editorElements: () => unknown;
        appState: () => unknown;
        live: () => { document: number; editor: number };
      };
    }
  ).__firoBoard = {
    read: () => doc.read(),
    revision: () => doc.revision,
    editorElements: () => activeElements?.() ?? null,
    appState: () => activeAppState?.() ?? null,
    live: () => ({
      document: (doc.read().elements ?? []).filter(isLive).length,
      editor: ((activeElements?.() ?? []) as unknown[]).filter(isLive).length,
    }),
  };
}
