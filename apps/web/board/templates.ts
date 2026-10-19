/**
 * The boards a person can start from.
 *
 * ## Why they are code and not files
 *
 * A template is a *starting point*, not content a person authored. Writing them
 * as `.firo` files would mean shipping a second format for the same document, a
 * loader for it, and a migration story for it — for four boards nobody edits.
 * Built from `@firo/board`'s factory instead, a template is the same call a
 * person's first sticky note goes through, so a template can never drift from
 * what the document model will actually accept: if `createStickyNote` stops
 * producing a valid `StickyNoteElement`, the template stops compiling.
 *
 * ## What a template is not
 *
 * It is not a marketplace and not a schema. The set is curated and fixed; the
 * gallery is a row of them, not a browse. Adding one is a deliberate act with a
 * diff, which is the property a curated set is supposed to have.
 */

import { randomId } from "@firo/common";
import { createStickyNote } from "@firo/board";

import type { StickyNoteElement } from "@firo/schema";

/**
 * The note colours, borrowed from the palette the editor already seeds notes
 * with rather than invented here. A template that introduced its own palette
 * would be a second colour system to keep in step with the canvas.
 */
const RED = "#ffc9c9";
const GREEN = "#b2f2bb";
const BLUE = "#a5d8ff";
const YELLOW = "#ffec99";
const ORANGE = "#ffd8a8";
const VIOLET = "#d0bfff";

/**
 * A note at a grid position.
 *
 * The grid is 215px across (a 150px-tall note is 195px wide, plus a gap) and
 * 170px down, so the templates lay out on the same rhythm and read as one
 * family. Empty text is deliberate — the point of a template is to be filled
 * in.
 */
const note = (
  x: number,
  y: number,
  text = "",
  backgroundColor?: string,
): StickyNoteElement =>
  createStickyNote({
    id: randomId(),
    x,
    y,
    text,
    fontSize: 28,
    verticalAlign: "middle",
    textAlign: "center",
    ...(backgroundColor ? { backgroundColor } : {}),
  });

const COLUMN = 215;
const ROW = 170;

export interface BoardTemplate {
  /** Stable slug. Not the board's id — that is minted per copy. */
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** Accent for the gallery card and the new board's thumbnail placeholder. */
  color: string;
  /** The elements a board created from this template starts with. */
  build: () => StickyNoteElement[];
}

export const BOARD_TEMPLATES: readonly BoardTemplate[] = [
  {
    id: "retrospective",
    name: "Retrospective",
    description: "What went well, what did not, and what to change.",
    tags: ["Retrospective", "Team"],
    color: BLUE,
    build: () => [
      note(0, 0, "Went well", GREEN),
      note(COLUMN, 0, "To improve", RED),
      note(COLUMN * 2, 0, "Action items", BLUE),
      note(0, ROW),
      note(0, ROW * 2),
      note(COLUMN, ROW),
      note(COLUMN, ROW * 2),
      note(COLUMN * 2, ROW),
      note(COLUMN * 2, ROW * 2),
    ],
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    description: "A prompt in the middle and room around it for ideas.",
    tags: ["Workshop", "Ideas"],
    color: YELLOW,
    build: () => [
      note(0, 0),
      note(COLUMN, 0),
      note(COLUMN * 2, 0),
      note(0, ROW),
      note(COLUMN, ROW, "What are we solving?", BLUE),
      note(COLUMN * 2, ROW),
      note(0, ROW * 2),
      note(COLUMN, ROW * 2),
      note(COLUMN * 2, ROW * 2),
    ],
  },
  {
    id: "user-story-map",
    name: "User story map",
    description: "Activities across the top, the steps under each one.",
    tags: ["Product", "Planning"],
    color: GREEN,
    build: () => [
      note(0, 0, "Discover", VIOLET),
      note(COLUMN, 0, "Evaluate", VIOLET),
      note(COLUMN * 2, 0, "Decide", VIOLET),
      note(COLUMN * 3, 0, "Buy", VIOLET),
      note(0, ROW),
      note(COLUMN, ROW),
      note(COLUMN * 2, ROW),
      note(COLUMN * 3, ROW),
      note(0, ROW * 2),
      note(COLUMN, ROW * 2),
      note(COLUMN * 2, ROW * 2),
      note(COLUMN * 3, ROW * 2),
    ],
  },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "An agenda, the decisions, and the actions that follow.",
    tags: ["Meeting", "Team"],
    color: VIOLET,
    build: () => [
      note(0, 0, "Agenda", BLUE),
      note(COLUMN, 0, "Decisions", GREEN),
      note(COLUMN * 2, 0, "Actions", ORANGE),
      note(0, ROW),
      note(COLUMN, ROW),
      note(COLUMN * 2, ROW),
      note(0, ROW * 2),
      note(COLUMN, ROW * 2),
      note(COLUMN * 2, ROW * 2),
    ],
  },
];

/** Look a template up by its slug, for a `?template=` deep link. */
export const templateById = (id: string): BoardTemplate | undefined =>
  BOARD_TEMPLATES.find((template) => template.id === id);
