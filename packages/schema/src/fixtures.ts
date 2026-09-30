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
];

export const fixtures = (): readonly Fixture[] => FIXTURES;

/** Load a fixture, returning the loaded board and the repair log. */
export const loadFixture = (fixture: Fixture): LoadedBoard =>
  loadBoard(fixture.board);

/**
 * JSON with every object's keys in sorted order.
 *
 * ## Why not `JSON.stringify` and compare
 *
 * Because that compares *bytes*, and byte equality here is a property of the
 * loader's key insertion order rather than of the data. A validator that spreads
 * `{ ...base }` and overlays normalised fields emits keys in whatever order that
 * produces, so a stringify comparison fails on a board that round-tripped
 * perfectly -- and would pass on a board that lost a field, as long as both
 * sides happened to order the rest the same way.
 *
 * The claim under test is "no data loss", and key order is not data. Sorting
 * keys compares exactly that, and it keeps the test from being a standing
 * invitation to reorder the loader's object literals.
 */
const canonicalJson = (value: unknown): string => {
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
 * Load a fixture and serialise it again.
 *
 * `stable` is a *structural* comparison. See `canonicalJson` for why.
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
    stable: canonicalJson(reserialised) === canonicalJson(fixture.board),
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
