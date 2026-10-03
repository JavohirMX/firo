/**
 * The durable half of Phase 5 facilitation.
 *
 * ## Why this is one module and not a field per element type
 *
 * Two fields across ten element types is twenty edits, and the nineteenth is the
 * one that gets missed. Both halves of the mistake are silent, and in opposite
 * directions, so the second one is found long after the first:
 *
 * - A name in `BASE_FIELDS` with no validator behind it is **recognised and
 *   dropped**. `preserveUnknownFields` stops carrying it and `validate` re-derives
 *   every known field from `raw` -- so a field it does not re-derive does not reach
 *   the element. The flag is gone, and the board that loses it is one somebody
 *   marked "hide until the reveal" for tomorrow's workshop.
 * - A name missing from `BASE_FIELDS` is **carried and never read**. The flag
 *   survives, which is why nothing looks broken, but as a preserved field rather
 *   than a typed one -- so a `false` written to it is invisible to every consumer
 *   that reads the field by name. See the note on `knownFields` in `registry.ts`;
 *   this is the same two-way trap, and it is why the names and the value-reading
 *   are written once here rather than twice per module.
 *
 * ## Both flags are optional, and absent is the same answer as `false`
 *
 * `isVisible` in `@firo/facilitation` reads `undefined` and `false` as one state,
 * and this is the module that keeps that true. A validator that wrote `false` for a
 * board written before these fields existed would put two new keys on every
 * element of every v1 board the first time it was saved -- a whole-file diff
 * caused by a version bump rather than by an edit, on a board nobody touched. That
 * is exactly the churn the canonical file writer exists to prevent, and it is a
 * test rather than a comment: the v1 fixture round-trips byte-identically, so a
 * validator that materialises the flags fails there.
 *
 * The flip side is that `false` and absent are indistinguishable after a load.
 * That is acceptable here and would not be for `deletedAt`: neither flag is a
 * marker with a timestamp, so there is no "this was explicitly cleared" state
 * that "hidden" and "never hidden" would otherwise collapse.
 */
import { boolean } from "./validate.js";

import type { ElementMigration } from "./registry.js";
import type { RepairLog } from "./validate.js";

/**
 * The two flags, ready to spread onto a validated element.
 *
 * `{}` for an absent flag rather than `false`, for the reason in the module
 * header and the same one `deletedAt` is read with in `types/stickynote.ts`:
 * absence and `false` are one answer here, and materialising it would make every
 * pre-v2 board's re-save a whole-file rewrite.
 *
 * A present-but-wrong value is a *repair* rather than an absence. `boolean`
 * coerces it and records it, because a file carrying `hideInPresentation: "yes"`
 * came from something that does not agree with the schema, and the repair log is
 * how a person finds out which file to go and look at.
 */
export const facilitationFlags = (
  raw: Record<string, unknown>,
  log: RepairLog,
): { hiddenUntilRevealed?: boolean; hideInPresentation?: boolean } => ({
  ...(raw.hiddenUntilRevealed === undefined
    ? {}
    : {
        hiddenUntilRevealed: boolean(
          raw.hiddenUntilRevealed,
          false,
          log,
          "hiddenUntilRevealed",
        ),
      }),
  ...(raw.hideInPresentation === undefined
    ? {}
    : {
        hideInPresentation: boolean(
          raw.hideInPresentation,
          false,
          log,
          "hideInPresentation",
        ),
      }),
});

/**
 * Element schema v1 -> v2: the two facilitation flags.
 *
 * ## Why this step moves no data
 *
 * Because there is none to move, and a step that invented some would be worse than
 * having none. v2 only *adds* two optional fields whose absence is the default, so
 * a v1 file cannot contain them: there is nothing to read, nothing to rewrite and
 * no legacy key to delete. The correct migration for an additive, default-absent
 * change is the one that changes nothing.
 *
 * That makes this look inert, so it is worth being explicit about why it is not
 * optional:
 *
 * - `runElementMigrations` stops at the first gap in the chain, so a type whose
 *   spec forgot this step would accept a v2 file, run no migration at all, and
 *   re-derive the element in `validate` -- presenting as a board that skipped a
 *   schema version rather than as a build error.
 *   `tests/migrations.test.ts` asserts the chain is contiguous from every type's
 *   `introducedAt` to `CURRENT_ELEMENT_VERSION`, so a missing step fails *by
 *   name* instead.
 * - It is the audited seam. The moment one of these flags stops being merely
 *   optional -- when `hiddenUntilRevealed` becomes something a private export has
 *   to *find* rather than a value it can read -- the data moves here, and
 *   `ElementMigration`'s contract in `registry.ts` is where that is decided.
 *
 * ## Why it spreads rather than returning `raw`
 *
 * Migration rule 2: return a new object, never mutate in place. Yjs requires it,
 * and an in-place mutation is invisible to the undo manager -- undo that silently
 * does not work is worse than no undo. Returning `raw` itself would satisfy the
 * letter of that rule while handing the caller and the next step in the chain the
 * same object, which is one edit away from a step that does mutate it.
 * `tests/migrations.test.ts` asserts a distinct result object for that reason.
 *
 * ## What it must not do
 *
 * Write either flag. See the module header: `false` is the default, so
 * materialising it is a diff on every board in existence rather than on the ones
 * somebody hid a note in.
 */
export const V1_TO_V2_FACILITATION_FLAGS: ElementMigration = {
  from: 1,
  to: 2,
  migrate: (raw) => ({ ...raw }),
};
