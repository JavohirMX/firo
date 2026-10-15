/**
 * The fixture harness.
 *
 * ## Why this exists and why it is in `src/` rather than in a test
 *
 * A migration harness that only exists in a test file is a harness nobody runs
 * when they bump a version, which is exactly when it is needed. This one is
 * part of the package, so:
 *
 * - `yarn test` runs it, and it fails the build when a committed fixture stops
 *   loading.
 * - Anything that writes a `.firo` file can ask "does this board still load?"
 *   without depending on a test runner.
 *
 * ## The contract
 *
 * **Every released schema version has a committed fixture under
 * `tests/fixtures/<version>/board.json`, and the harness loads every one of
 * them.** That is what makes the format a promise rather than a hope
 * ([`../../docs/trd/02-data-model.md`](../../docs/trd/02-data-model.md)).
 *
 * The practical consequence: **bumping `CURRENT_ELEMENT_VERSION` without adding
 * a fixture is a build failure.** That is the point. Retrofitting a migration
 * harness is how formats become unreadable, so the guard is mechanical.
 */
import { CURRENT_ELEMENT_VERSION, CURRENT_RECORD_VERSION } from "./version.js";
import { loadBoard, serializeBoard } from "./migrate.js";
import { plainObject } from "./validate.js";

import type { LoadedBoard, SerializedBoard } from "./migrate.js";

/** One committed fixture: a version number and the board it was written by. */
export type Fixture = {
  /** The schema version that wrote this file. */
  version: number;
  /** Which of the two chains this pins: elements, records, or both. */
  chain: "element" | "record" | "both";
  description: string;
  /** The raw JSON, exactly as committed. */
  board: SerializedBoard | Record<string, unknown>;
};

/**
 * The committed fixtures, oldest first.
 *
 * **Add an entry here in the same commit that bumps a version constant.** The
 * `fixturesAreComplete` check below turns forgetting into a failure.
 *
 * The registry is keyed by version so a version can carry more than one fixture
 * when a single version has distinct cases worth pinning — a v1 file with no
 * records, a v1 file whose records reference a deleted column, and so on. Each
 * is a separate promise.
 */
const FIXTURES: readonly Fixture[] = [
  {
    version: 1,
    chain: "both",
    description:
      "The v1 baseline: two sticky notes, a collection with three columns, " +
      "and two records. One record's value references a column that no longer " +
      "exists, which pins the retain-on-delete behaviour.",
    board: {
      elementSchemaVersion: 1,
      recordSchemaVersion: 1,
      elementOrder: ["el-note-1", "el-note-2"],
      meta: {
        id: "board-fixture-v1",
        name: "Workshop board",
      },
      collections: [
        {
          id: "col-tasks",
          boardId: "board-fixture-v1",
          name: "Tasks",
          order: "a0",
          version: 1,
          columns: [
            {
              id: "c-title",
              key: "title",
              name: "Title",
              type: "text",
            },
            {
              id: "c-done",
              key: "done",
              name: "Done",
              type: "boolean",
            },
            {
              id: "c-owner",
              key: "owner",
              name: "Owner",
              type: "person",
            },
          ],
        },
      ],
      elements: [
        {
          id: "el-note-1",
          type: "stickynote",
          text: "Frame the problem",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 40,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#fff9b1",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 3,
          versionNonce: 112233,
          index: "a0",
          created: 1750000000000,
          updated: 1750000005000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          link: null,
          locked: false,
          isDeleted: false,
        },
        {
          id: "el-note-2",
          type: "stickynote",
          text: "Vote on options",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 320,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#c0f2c2",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 445566,
          index: "a1",
          created: 1750000001000,
          updated: 1750000001000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [
            {
              elementId: "el-note-1",
              focus: 0,
              gap: 1,
            },
          ],
          link: null,
          locked: false,
          isDeleted: false,
        },
      ],
      records: [
        {
          id: "rec-1",
          collectionId: "col-tasks",
          values: {
            title: {
              type: "text",
              value: "Interview five teams",
            },
            done: {
              type: "boolean",
              value: false,
            },
            owner: {
              type: "person",
              value: "ada",
            },
          },
          created: 1750000000000,
          updated: 1750000000000,
          order: "a0",
          archived: false,
        },
        {
          id: "rec-2",
          collectionId: "col-tasks",
          values: {
            title: {
              type: "text",
              value: "Draft the RFC",
            },
            done: {
              type: "boolean",
              value: true,
            },
            owner: {
              type: "person",
              value: null,
            },
            priority: {
              type: "singleSelect",
              value: "high",
            },
          },
          created: 1750000002000,
          updated: 1750000003000,
          order: "a1",
          archived: false,
        },
      ],
    },
  },
  {
    version: 2,
    chain: "element",
    description:
      "The v2 baseline: three sticky notes carrying the durable facilitation " +
      "flags added in v2. The first has both set, the second has neither -- which " +
      "is also exactly what a v1 element looks like inside a v2 board, so the " +
      "chain has to leave it untouched. The third carries an explicit `false` and " +
      "a field this build does not know, pinning both that `false` is not the same " +
      "event as absence and that a v2 file round-trips a v3 field intact.",
    board: {
      elementSchemaVersion: 2,
      recordSchemaVersion: 2,
      elementOrder: ["el-note-hidden", "el-note-plain", "el-note-future"],
      meta: {
        id: "board-fixture-v2",
        name: "Workshop board",
      },
      collections: [],
      elements: [
        {
          id: "el-note-hidden",
          type: "stickynote",
          text: "Write one idea",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 40,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#fff9b1",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 2,
          versionNonce: 112233,
          index: "a0",
          created: 1750000000000,
          updated: 1750000005000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          hiddenUntilRevealed: true,
          hideInPresentation: true,
          link: null,
          locked: false,
          isDeleted: false,
        },
        {
          id: "el-note-plain",
          type: "stickynote",
          text: "Frame the problem",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 320,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#c0f2c2",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 445566,
          index: "a1",
          created: 1750000001000,
          updated: 1750000001000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          link: null,
          locked: false,
          isDeleted: false,
        },
        {
          id: "el-note-future",
          type: "stickynote",
          text: "Carried from a newer Firo",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 600,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#fff9b1",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 778899,
          index: "a2",
          created: 1750000002000,
          updated: 1750000002000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          hiddenUntilRevealed: false,
          link: null,
          locked: false,
          isDeleted: false,
          someFutureField: { keptBy: "migration rule 1" },
        },
      ],
      records: [],
    },
  },
  {
    version: 2,
    chain: "record",
    description:
      "The record-v2 case: the comment lane. Two threads anchored to one element " +
      "id -- one open with a reply, one resolved -- pinning threading, resolve, the " +
      "element-relative anchor, and that a thread whose element is gone still " +
      "loads. It deliberately carries no elements: a comment surviving its anchor " +
      "is the property, and a fixture with an element present could not show it.",
    board: {
      elementSchemaVersion: 2,
      recordSchemaVersion: 2,
      elementOrder: [],
      meta: {
        id: "board-fixture-v2-comments",
        name: "Reviewed board",
      },
      collections: [],
      elements: [],
      records: [],
      comments: [
        {
          id: "ct-1",
          elementId: "el-note-gone",
          anchor: { x: 210, y: 12 },
          comments: [
            {
              id: "cm-1",
              body: "Can we split this into two?",
              author: "ada",
              createdAt: 1750000100000,
            },
            {
              id: "cm-2",
              body: "Yes — a cause and an effect card.",
              author: "grace",
              createdAt: 1750000200000,
            },
          ],
          resolved: false,
          author: "ada",
          createdAt: 1750000100000,
          updatedAt: 1750000200000,
        },
        {
          id: "ct-2",
          elementId: "el-note-gone",
          anchor: { x: 4, y: 4 },
          comments: [
            {
              id: "cm-3",
              body: "Agreed, done.",
              author: "grace",
              createdAt: 1750000300000,
            },
          ],
          resolved: true,
          author: "grace",
          createdAt: 1750000300000,
          updatedAt: 1750000400000,
        },
      ],
    },
  },
  {
    version: 3,
    chain: "element",
    description:
      "The v3 baseline: elements carrying optional element tags (Phase 8.3). " +
      "The first note has multiple tags, the second is untagged, and the third " +
      "is a rectangle with a tag.",
    board: {
      elementSchemaVersion: 3,
      recordSchemaVersion: 2,
      elementOrder: ["el-note-tagged", "el-note-plain", "el-shape-tagged"],
      meta: {
        id: "board-fixture-v3",
        name: "Workshop board with tags",
      },
      collections: [],
      elements: [
        {
          id: "el-note-tagged",
          type: "stickynote",
          text: "Brainstorming with tags",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 40,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#fff9b1",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 112233,
          index: "a0",
          created: 1750000000000,
          updated: 1750000005000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          link: null,
          locked: false,
          isDeleted: false,
          tags: ["planning", "urgent"],
        },
        {
          id: "el-note-plain",
          type: "stickynote",
          text: "Untagged note",
          fontSize: 20,
          fontFamily: 6,
          textAlign: "left",
          verticalAlign: "top",
          isContainer: false,
          x: 320,
          y: 60,
          width: 200,
          height: 200,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "#c0f2c2",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 445566,
          index: "a1",
          created: 1750000001000,
          updated: 1750000001000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          link: null,
          locked: false,
          isDeleted: false,
        },
        {
          id: "el-shape-tagged",
          type: "rectangle",
          x: 600,
          y: 60,
          width: 200,
          height: 100,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: null,
          roughness: 1,
          opacity: 100,
          version: 1,
          versionNonce: 778899,
          index: "a2",
          created: 1750000002000,
          updated: 1750000002000,
          groupIds: [],
          frameId: null,
          containerId: null,
          bindings: [],
          link: null,
          locked: false,
          isDeleted: false,
          deletedAt: null,
          tags: ["decision"],
        },
      ],
      records: [],
    },
  },
];

export const fixtures = (): readonly Fixture[] => FIXTURES;

/** Load a fixture, returning the loaded board and the repair log. */
export const loadFixture = (fixture: Fixture): LoadedBoard =>
  loadBoard(fixture.board);

/**
 * JSON with every object's keys in sorted order.
 *
 * ## Why not `JSON.stringify`
 *
 * Because `JSON.stringify` emits keys in *insertion* order, and insertion order here
 * is a property of the loader's object literals rather than of the data. A validator
 * that spreads `{ ...base }` and overlays normalised fields emits keys in whatever
 * order that produces, so a stringify comparison fails on a board that round-tripped
 * perfectly -- and passes on a board that *lost* a field, as long as both sides
 * happened to order the rest the same way.
 *
 * Key order is not data. Sorting keys compares exactly the claim that matters, and it
 * stops the file format being a standing invitation to reorder object literals.
 *
 * ## Why this is exported rather than kept here
 *
 * Because it is the `.firo` file format's writer, not a test helper. Phase 7 requires
 * an export that round-trips **byte-identically**, which cannot be done with
 * `JSON.stringify`: two boards with identical content serialise to different bytes
 * purely because of key order, so `git diff` on a board someone did not touch would
 * show a whole-file rewrite.
 *
 * One implementation, used by the export and by the round-trip tests. If the file
 * writer and the comparison disagreed, "the export round-trips" would mean nothing.
 */
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
};

/**
 * A board as the bytes of a `.firo` file.
 *
 * Pretty-printed, because the plan's exit criterion is that a board can be read as
 * text and `git diff`ed, and minified JSON defeats both. Canonical key order, which
 * is what makes a re-export of an unchanged board byte-identical — see
 * `canonicalJson`.
 *
 * Written as a recursive walk rather than by pretty-printing the compact form with a
 * regular expression. The regex version was tried first and is shorter, but it
 * indents inside strings too: a note containing `", {"` would come back with a
 * newline and two spaces in the middle of its text, and the file would no longer
 * parse as the thing it was exported from. A board is mostly strings someone typed,
 * so that is not a corner case.
 */
const prettyJson = (value: unknown, indent: string): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  const inner = `${indent}  `;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    // One item per line even for a short array. A board's `elements` is long enough
    // that the compaction is not worth a line that re-wraps unpredictably.
    return `[\n${value
      .map((item) => `${inner}${prettyJson(item, inner)}`)
      .join(",\n")}\n${indent}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (entries.length === 0) {
    return "{}";
  }

  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${prettyJson(v, inner)}`)
    .join(",\n")}\n${indent}}`;
};

/**
 * Any value as the bytes of a canonical text file in a `.firo` directory.
 *
 * Exported so `manifest.json` is written by the *same* function as `board.json`.
 * Two writers would mean two indentation conventions in one directory, and the whole
 * point of the directory format is that a person can read it: a manifest that sorted
 * and indented differently from the board beside it would be read as two tools
 * having written it rather than as one.
 *
 * Sorted keys are what make a re-export of an unchanged board byte-identical, which
 * is what AC-6's "`git diff` shows the change" is measured against.
 */
export const canonicalFile = (value: unknown): string =>
  `${prettyJson(value, "")}\n`;

/**
 * A board as the bytes of a `.firo` file.
 *
 * Two-space indent and a trailing newline, so the file behaves in a terminal and in
 * a diff the way a text file is expected to.
 *
 * Delegates to `canonicalFile` rather than repeating its body, for the reason that
 * function is exported.
 */
export const serializeBoardFile = (board: SerializedBoard): string =>
  canonicalFile(board);

/**
 * A board's two version headers, stamped at the current version.
 *
 * ## Why the comparison normalises these and everything else does not
 *
 * `roundTripFixture` compares a fixture with its own re-serialisation, and the
 * header is part of that. For a fixture already at the current version the two
 * agree and the comparison is a byte-for-byte promise. For an *older* one they
 * cannot: `serializeBoard` stamps the current version on the way out, because
 * stamping the stored one is how a board gets silently downgraded on its second
 * save. Re-saving a v1 board as `elementSchemaVersion: 1` is the bug; the
 * upgrade to v2 is the whole point of the version bump.
 *
 * So the promise for an older fixture is the one that is actually worth making:
 * **a load followed by a save changes the version header and nothing else.** Not
 * one element's field, not one record's value, not one byte of anything else --
 * and that is a much stronger statement than "the two are equal", because it would
 * also catch a migration that quietly rewrote a field it had no business touching.
 *
 * This is the first version bump, so this is the first time the distinction
 * mattered. `migrations.test.ts` pins both halves: this for every fixture, and
 * byte-identical headers included for the one already at the current version.
 */
const atCurrentVersion = (
  board: SerializedBoard | Record<string, unknown>,
): SerializedBoard | Record<string, unknown> =>
  plainObject(board)
    ? {
        ...board,
        elementSchemaVersion: CURRENT_ELEMENT_VERSION,
        recordSchemaVersion: CURRENT_RECORD_VERSION,
      }
    : board;

/**
 * Load a fixture and serialise it again.
 *
 * `stable` is a *structural* comparison, with the version headers normalised --
 * see `canonicalJson` for why the structure, and `atCurrentVersion` for why those
 * two fields.
 */
export const roundTripFixture = (
  fixture: Fixture,
): {
  loaded: LoadedBoard;
  reserialised: SerializedBoard;
  stable: boolean;
} => {
  const loaded = loadFixture(fixture);
  const reserialised = serializeBoard(loaded);
  return {
    loaded,
    reserialised,
    stable:
      canonicalJson(reserialised) ===
      canonicalJson(atCurrentVersion(fixture.board)),
  };
};

/**
 * Assert that every current version has a fixture.
 *
 * Returns the gaps rather than throwing, so the caller decides how loudly to
 * fail. The test uses it to fail the build; a tooling command can print it.
 */
export const fixturesAreComplete = (): string[] => {
  const gaps: string[] = [];
  const elementVersions = new Set(
    FIXTURES.filter((f) => f.chain !== "record").map((f) => f.version),
  );
  const recordVersions = new Set(
    FIXTURES.filter((f) => f.chain !== "element").map((f) => f.version),
  );

  for (let v = 1; v <= CURRENT_ELEMENT_VERSION; v++) {
    if (!elementVersions.has(v)) {
      gaps.push(
        `element schema v${v} has no committed fixture under ` +
          `packages/schema/tests/fixtures/v${v}/ — commit one in the same ` +
          `change that bumps the version (see docs/plans/phase-1-document-model.md §1.2).`,
      );
    }
  }
  for (let v = 1; v <= CURRENT_RECORD_VERSION; v++) {
    if (!recordVersions.has(v)) {
      gaps.push(`record schema v${v} has no committed fixture.`);
    }
  }
  return gaps;
};
