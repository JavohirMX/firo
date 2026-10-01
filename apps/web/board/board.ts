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
 * It also still saves elements, as a redundant copy. That is deliberate for now:
 * the document model has no persistence until Phase 7, so `LocalData` is the only
 * thing that survives a reload, and removing the copy would mean a refresh loses
 * the board. When persistence lands the redundancy is deleted, not reconciled.
 */

import { createFiroDoc } from "@firo/doc";
import { BoardSync, toEditorScene, type EditorBridge } from "@firo/board";

import { CaptureUpdateAction } from "@firo/editor";

import type { ExcalidrawElement } from "@firo/element/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

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

/** The document, for the few places that read or write it directly. */
export const boardDoc = () => doc;

/**
 * The elements the board should open with.
 *
 * Read from the document model, so a board reopens as the document has it rather
 * than as a copy the app happened to write. Empty for a board nobody has edited
 * yet, which is the correct first run.
 */
export const boardElements = (): ExcalidrawElement[] =>
  toEditorScene(doc.read().elements) as unknown as ExcalidrawElement[];

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
export const attachBoard = (
  excalidrawAPI: ExcalidrawImperativeAPI,
): (() => void) => {
  sync?.stop();
  const bridge = bridgeFor(excalidrawAPI);
  activeElements = () => bridge.read();
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
 * A read-only window onto the document, for browser tests.
 *
 * `import.meta.env.DEV` is replaced at build time, so this whole block is dead in
 * production and nothing of it reaches the bundle. The alternative — asserting
 * that a note was saved by looking at the canvas — cannot tell a note that reached
 * the document from one that is merely drawn, and those are exactly the two things
 * the wiring is supposed to distinguish.
 */
if (import.meta.env.DEV) {
  (
    window as unknown as {
      __firoBoard: {
        read: () => unknown;
        revision: () => number;
        editorElements: () => unknown;
      };
    }
  ).__firoBoard = {
    read: () => doc.read(),
    revision: () => doc.revision,
    editorElements: () => activeElements?.() ?? null,
  };
}
