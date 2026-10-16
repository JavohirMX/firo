/**
 * Schema versions.
 *
 * ## Why these are two numbers and not one
 *
 * Elements and records are versioned separately because they migrate
 * independently and fail independently. A board whose records are at v2 and
 * whose elements are at v1 is a normal, loadable board — the two share a
 * document but nothing else. A single board-level version would force a
 * meaningless coupling between the two chains.
 *
 * ## The rules these numbers are subject to
 *
 * From [`../../docs/trd/02-data-model.md`](../../docs/trd/02-data-model.md):
 *
 * 1. **A version is only ever incremented, and only in a migration that is
 *    committed with a fixture.** A released version is a promise. Bumping this
 *    without a fixture in `tests/fixtures/` breaks the promise the fixture
 *    harness exists to keep, and the harness test will fail.
 * 2. **A file from a higher version fails loudly.** `migrateElement` throws
 *    `ForwardVersionError` rather than loading partially — AC-10.
 * 3. **`version` on an *element* is not this number.** An element's own
 *    `version` field is a per-element monotonic counter used for last-writer-wins
 *    merge, and is unrelated to the schema version. The two are easy to confuse
 *    and must not be unified.
 */

/**
 * Current element schema version. Bump with a migration + fixture.
 *
 * **v2 adds `hiddenUntilRevealed` and `hideInPresentation`** -- the durable half
 * of Phase 5 facilitation -- on `ElementBase`.
 *
 * **v3 adds `tags`** -- optional colourable/filterable labels on `ElementBase`
 * for Phase 8.3 element tags.
 *
 * **v4 adds `Doc Blocks`** -- structured documents on canvas via records
 * and projections for Phase 10 §10.5.
 */
export const CURRENT_ELEMENT_VERSION = 4;

/**
 * Current record/collection schema version. Bump with a migration + fixture.
 *
 * **v2 adds the comment lane** -- threaded, object-anchored comments on
 * `ElementBase`'s board, stored as their own root rather than as elements or
 * records ([`./types.ts`](./types.ts), [`./migrate.ts`](./migrate.ts)). The
 * chain is the *non-element* one: elements and records are versioned separately
 * because they migrate and fail independently, and a comment is neither, so it
 * rides with records as the durable-not-an-element family.
 *
 * Bumping this is load-bearing beyond the additive field. A board written at
 * record v2 names a lane a v1 build does not understand, and the board-level
 * `ForwardVersionError` makes that build *refuse* the file rather than load it
 * and drop the comments on the next save. [`tests/fixtures/v2/board.json`](../../tests/fixtures/v2/board.json)
 * pins the promise that the merged v2 board loads, and the record-chain fixture
 * in [`./fixtures.ts`](./fixtures.ts) pins the comment case specifically.
 */
export const CURRENT_RECORD_VERSION = 2;
/**
 * A file whose stored version is above the current one.
 *
 * Thrown, never caught-and-degraded. A partially-loaded board is worse than a
 * board that refuses to open, because the user cannot tell which parts are
 * missing.
 */
export class ForwardVersionError extends Error {
  constructor(
    readonly kind: "element" | "record",
    readonly storedVersion: number,
    readonly currentVersion: number,
    /** Present when the failure is scoped to one object. */
    readonly objectId?: string,
  ) {
    super(
      kind === "element"
        ? `Element ${
            objectId ?? "(unknown)"
          } was written by a newer version of Firo ` +
            `(schema v${storedVersion}; this build understands up to v${currentVersion}). ` +
            `Update Firo to open this board. Nothing was written.`
        : `Record was written by a newer version of Firo ` +
            `(schema v${storedVersion}; this build understands up to v${currentVersion}). ` +
            `Update Firo to open this board. Nothing was written.`,
    );
    this.name = "ForwardVersionError";
  }
}
