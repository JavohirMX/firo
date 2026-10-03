/**
 * The element type registry.
 *
 * Each element type declares its own props, its own migrations, and its own
 * validation. The registry is what lets `@firo/doc`, the file format and the
 * migrations all be written once, generically, instead of per type — which is
 * the entire point of having a registry rather than a `switch` on `type`.
 *
 * ## Adding a type
 *
 * 1. Write its props module and export an `ElementSpec`.
 * 2. Register it in `registry.ts`.
 * 3. Add it to `ELEMENT_TYPES` in `types.ts`.
 * 4. Commit a fixture for the version the type first appears in.
 *
 * A type that is not registered cannot be loaded: `migrateElement` throws
 * `UnknownElementTypeError` rather than dropping the element. Silently skipping
 * unknown types is how boards lose data on downgrade.
 */
import { ELEMENT_TYPES } from "./types.js";

import { ForwardVersionError } from "./version.js";

import type { ElementType, FiroElement } from "./types.js";
import type { RepairLog } from "./validate.js";

/** One step in an element's migration chain. */
export type ElementMigration = {
  /** The version this step upgrades *from*. */
  from: number;
  to: number;
  /**
   * Upgrade a raw record from `from` to `to`.
   *
   * Contract, in order of how often it is violated:
   *
   * 1. **Never drop an unrecognised field.** Start from
   *    `preserveUnknownFields(raw, KNOWN_FIELDS)` and spread it, or start from
   *    `{ ...raw }` and never `delete` a key you did not migrate. Forward
   *    compatibility dies here.
   * 2. **Never mutate in place.** Return a new object. Yjs requires it, and an
   *    in-place mutation is invisible to the undo manager — undo that silently
   *    does not work is worse than no undo.
   * 3. **Delete a legacy field only after migrating its data**, and name it
   *    explicitly so a reviewer can see what was dropped and why.
   */
  migrate: (
    raw: Record<string, unknown>,
    log: RepairLog,
  ) => Record<string, unknown>;
};

export type ElementSpec<T extends FiroElement = FiroElement> = {
  type: T["type"];

  /**
   * Every field this type knows about, including inherited ones.
   *
   * Used by `preserveUnknownFields` to decide what to carry through. Getting
   * this wrong is a data-loss bug in both directions: a missing name means a
   * known field is treated as unknown and carried twice; an extra name means a
   * field a migration depends on is dropped.
   */
  knownFields: readonly string[];

  /** The version this type was introduced at. Older files cannot contain it. */
  introducedAt: number;

  /** Migrations, ascending by `from`. May be empty for a v1 type. */
  migrations: readonly ElementMigration[];

  /**
   * Coerce a raw record into a well-formed element of this type.
   *
   * Runs *after* the migration chain, so it only has to know about the current
   * version — it is not a second place to encode version history.
   */
  validate: (raw: Record<string, unknown>, log: RepairLog) => T;
};

export class UnknownElementTypeError extends Error {
  constructor(readonly elementType: string, readonly objectId?: string) {
    super(
      `Unknown element type "${elementType}"${
        objectId ? ` on element ${objectId}` : ""
      }. ` +
        `This board was written by a newer version of Firo, or the type has been ` +
        `removed. Nothing was written.`,
    );
    this.name = "UnknownElementTypeError";
  }
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

const specs = new Map<string, ElementSpec<never>>();

/**
 * Register a type. Called at module load by each type's module.
 *
 * Throws on a duplicate rather than overwriting: two modules claiming `"shape"`
 * is a build error, and silently letting the second win would make the registry
 * depend on import order.
 */
export const registerElementType = <T extends FiroElement>(
  spec: ElementSpec<T>,
): void => {
  if (specs.has(spec.type)) {
    throw new Error(
      `Element type "${spec.type}" is already registered. Two modules claiming ` +
        `the same type means the registry depends on import order.`,
    );
  }
  if (!(ELEMENT_TYPES as readonly string[]).includes(spec.type)) {
    throw new Error(
      `Element type "${spec.type}" is not listed in ELEMENT_TYPES (types.ts). ` +
        `Add it there, or the union and the registry will disagree.`,
    );
  }
  specs.set(spec.type, spec as ElementSpec<never>);
};

export const getElementSpec = (type: string): ElementSpec | undefined =>
  specs.get(type) as ElementSpec | undefined;

export const requireElementSpec = (type: string): ElementSpec => {
  const spec = getElementSpec(type);
  if (!spec) {
    throw new UnknownElementTypeError(type);
  }
  return spec;
};

export const registeredElementTypes = (): readonly ElementType[] =>
  [...specs.keys()] as ElementType[];

/**
 * Every field a type knows about, base plus type-specific.
 *
 * Per-type rather than global on purpose: a field is only "unknown" relative to
 * the type that holds it, and a global union would preserve a `stickynote`-only
 * field onto a `text` element.
 *
 * This is the list a type's `validate` passes to `preserveUnknownFields` -- the
 * one place where a known field is recognised, and therefore re-derived from the
 * raw record rather than carried through from it.
 */
export const knownFieldsFor = (type: string): readonly string[] =>
  getElementSpec(type)?.knownFields ?? [];

/* -------------------------------------------------------------------------- */
/* Migration chain                                                            */
/* -------------------------------------------------------------------------- */

/** Fields every element has, regardless of type. */
const BASE_FIELDS = [
  "id",
  "type",
  "version",
  "versionNonce",
  "index",
  "created",
  "updated",
  "deletedAt",
  "groupIds",
  "frameId",
  "containerId",
  "bindings",
  "text",
  "recordId",
  /*
   * The durable facilitation flags, element schema v2.
   *
   * Listed here rather than in each type's own `knownFields` because they are on
   * the base -- ten modules would each carry the same two names, and the note
   * above on `knownFields` is a warning about exactly that: a name missing means a
   * known field is treated as unknown and carried, a name extra means a field is
   * recognised and never re-derived. `tests/facilitation.test.ts` asserts both
   * names are known for every registered type, and that neither is *also* claimed
   * by a type-specific list.
   *
   * Read and written in one place, `./facilitation.ts`.
   */
  "hiddenUntilRevealed",
  "hideInPresentation",
  "link",
  "locked",
  "customData",
  "isDeleted",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roundness",
  "roughness",
  "opacity",
] as const;

/** The known fields for a type, including the base. */
export const allKnownFields = (type: string): readonly string[] => [
  ...BASE_FIELDS,
  ...knownFieldsFor(type),
];

/**
 * Run an element's migration chain up to `targetVersion`.
 *
 * Throws `ForwardVersionError` if the stored version is newer. It does *not*
 * guess, skip, or partially apply.
 *
 * ## This returns the migrated record *whole*, and that is load-bearing
 *
 * It does not strip, filter, or normalise anything on the way out. Two reasons,
 * and the second is the one that bites:
 *
 * 1. Each `migrate` is documented to preserve fields it does not recognise.
 *    Doing that filtering again here would be a second, divergent copy of the
 *    same rule -- and a bug in it would silently delete a known field before
 *    `validate` could read it, which presents as "every element loads with
 *    default values" rather than as a data-loss bug.
 * 2. `validate` re-derives every known field from this record. If the known
 *    fields were already removed, `validate` would find nothing and fall back to
 *    defaults for the whole element.
 *
 * So the pipeline is: `{...raw}` -> migrations (each preserving unknowns) ->
 * `validate` (which preserves unknowns and re-derives knowns). Exactly one
 * place strips, and it is the one whose output is the element.
 */
export const runElementMigrations = (
  spec: ElementSpec,
  raw: Record<string, unknown>,
  fromVersion: number,
  targetVersion: number,
  log: RepairLog,
): Record<string, unknown> => {
  if (fromVersion > targetVersion) {
    throw new ForwardVersionError(
      "element",
      fromVersion,
      targetVersion,
      typeof raw.id === "string" ? raw.id : undefined,
    );
  }

  if (fromVersion < spec.introducedAt) {
    // The type did not exist yet. Any record claiming to be it is corrupt, and
    // coercing it would invent an element out of nothing.
    throw new UnknownElementTypeError(spec.type, String(raw.id ?? ""));
  }

  // Start from the original, so a field this version does not know survives.
  let current: Record<string, unknown> = { ...raw };
  let version = fromVersion;

  const ordered = [...spec.migrations].sort((a, b) => a.from - b.from);
  for (const migration of ordered) {
    if (migration.from < version) {
      continue; // already applied
    }
    if (migration.to > targetVersion) {
      break; // beyond what this build understands
    }
    current = migration.migrate(current, log);
    version = migration.to;
  }

  /*
   * Note what is *not* here: no filtering, no normalisation, no stripping. The
   * record is handed on exactly as the chain left it. See the doc comment.
   */
  return current;
};
