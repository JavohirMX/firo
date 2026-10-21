/**
 * Bulk sticky-note creation: many lines of text in, a grid of notes out.
 *
 * ## Why this is pure functions and one writer
 *
 * The dialog (components/BulkStickyDialog) owns keystrokes; this module owns
 * the answers: which lines count, where the notes land. Keeping the two apart
 * is what lets the layout be tested without rendering a pixel — and a
 * facilitator pasting forty ideas at the start of a workshop is exactly the
 * moment a layout bug is most visible.
 *
 * ## Why a grid and not a stack or a column
 *
 * Miro's bulk mode drops a column (parity matrix row 20); a column of forty
 * notes runs off the screen before it ends. A near-square grid keeps the whole
 * batch inside one viewport at workshop zooms, which is the difference between
 * "the notes appeared" and "the notes appeared and everyone can see them".
 * The grid is centred on the current view, not on the origin: the origin of a
 * board that has been in use for an hour is not where anyone is looking.
 */

import { stickyNoteSizeForKey } from "@firo/editor";
import { CaptureUpdateAction, newStickyNoteElement } from "@firo/element";

import type { ExcalidrawStickyNoteElement } from "@firo/element/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { stringToProseMirror } from "./excalidraw";

/** The most notes one paste makes. Past this, the list was almost
 *  certainly not meant for the board, and the dialog says so instead of
 *  freezing the tab creating a thousand of them. */
export const BULK_STICKY_LIMIT = 100;

/** Gap between notes in the grid, matching the rail's rapid-creation gap. */
export const BULK_STICKY_GAP = 24;

export type BulkStickyParse = Readonly<{
  /** The lines that become notes, in order. */
  lines: readonly string[];
  /** How many non-empty lines were dropped because the limit was hit. */
  overflow: number;
}>;

/**
 * One note per line. Blank lines are skipped, not preserved: nobody means
 * "an empty idea", and keeping them would invent notes the room then has to
 * delete. Lines over the limit are counted and dropped, never silently kept.
 */
export const parseBulkStickyLines = (
  text: string,
  limit: number = BULK_STICKY_LIMIT,
): BulkStickyParse => {
  const all = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return {
    lines: all.slice(0, limit),
    overflow: Math.max(0, all.length - limit),
  };
};

export type BulkStickyPlacement = Readonly<{ x: number; y: number }>;

/**
 * Positions for `count` notes of `size` px, centred on `center`.
 *
 * Columns are `ceil(sqrt(count))` — the squarest grid that holds them, so a
 * batch of 10 lands 4 wide and 3 tall rather than 10 in a row off the edge.
 * The grid is centred as a whole: the first cell is not at the centre, the
 * middle of the block is, which is what "appeared where I was looking" means.
 */
export const layoutBulkStickyGrid = (
  count: number,
  size: number,
  center: { x: number; y: number },
  gap: number = BULK_STICKY_GAP,
): BulkStickyPlacement[] => {
  if (count <= 0 || size <= 0) {
    return [];
  }
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const totalWidth = columns * size + (columns - 1) * gap;
  const totalHeight = rows * size + (rows - 1) * gap;
  const originX = center.x - totalWidth / 2;
  const originY = center.y - totalHeight / 2;
  const placements: BulkStickyPlacement[] = [];
  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    placements.push({
      x: originX + column * (size + gap),
      y: originY + row * (size + gap),
    });
  }
  return placements;
};

/** The scene point at the middle of what the user is currently looking at. */
export const viewportCenter = (
  api: ExcalidrawImperativeAPI,
): { x: number; y: number } => {
  const state = api.getAppState();
  const zoom = state.zoom.value;
  return {
    x: (-state.scrollX + state.width / 2) / zoom,
    y: (-state.scrollY + state.height / 2) / zoom,
  };
};

/**
 * Create the notes for `lines` and select them.
 *
 * Colour and size follow the sticky tool's current defaults, so a facilitator
 * who set "large, blue" for the exercise gets forty large blue notes — the
 * same answer the single-note path would give them forty times in a row.
 *
 * One `updateScene` with `IMMEDIATELY`: the batch is one undo step, because
 * nobody wants to press undo forty times to take back one paste.
 */
export const createBulkStickyNotes = (
  api: ExcalidrawImperativeAPI,
  lines: readonly string[],
): ExcalidrawStickyNoteElement[] => {
  if (lines.length === 0) {
    return [];
  }
  const state = api.getAppState();
  const size = stickyNoteSizeForKey(state.currentItemStickynoteSize);
  const center = viewportCenter(api);
  const placements = layoutBulkStickyGrid(lines.length, size, center);

  const notes = lines.map((text, index) => {
    const note = newStickyNoteElement({
      type: "stickynote",
      x: placements[index].x,
      y: placements[index].y,
      width: size,
      height: size,
      baseHeight: size,
      strokeColor: state.currentItemStickynoteStrokeColor,
      backgroundColor: state.currentItemStickynoteBackgroundColor,
      fillStyle: state.currentItemFillStyle,
      strokeWidth: 1,
      strokeStyle: state.currentItemStrokeStyle,
      roughness: state.currentItemRoughness,
      opacity: state.currentItemOpacity,
      roundness: null,
      locked: false,
      frameId: null,
    }) as ExcalidrawStickyNoteElement;
    /*
     * Text lives on the note itself — the merged-sticky shape the import path
     * (board/excalidraw.ts) and the AI path (board/ai.ts) both write — with
     * the rich-text mirror the renderer reads. No bound text element: binding
     * one would make the note's own text and the bound copy two truths.
     */
    const mutable = note as unknown as {
      text: string;
      richText: unknown;
      fontSize: number;
      textAlign: "center";
      verticalAlign: "middle";
    };
    mutable.text = text;
    mutable.richText = stringToProseMirror(text);
    // Same label defaults the import path gives a sticky, so a bulk note and
    // a pasted note render identically.
    mutable.fontSize = 20;
    mutable.textAlign = "center";
    mutable.verticalAlign = "middle";
    return note;
  });

  api.updateScene({
    elements: [...api.getSceneElements(), ...notes],
    appState: {
      selectedElementIds: Object.fromEntries(notes.map((n) => [n.id, true])),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return notes;
};
