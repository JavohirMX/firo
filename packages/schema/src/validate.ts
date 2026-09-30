/**
 * Validation primitives.
 *
 * ## Validation here repairs; it does not reject
 *
 * These functions coerce a value to the type the schema requires and record
 * what they had to change. They do not throw. That is the opposite of a
 * validator's usual contract, and it is deliberate:
 *
 * - A board that fails to open because one of 4,000 elements has a
 *   `roughness` of `"1.5"` (a string, from a hand-edited file) is a worse
 *   product than a board that opens with that element repaired.
 * - **The exception is a forward version**, which throws. A board from a newer
 *   Firo must not be silently coerced into a shape the newer version did not
 *   mean — that is data loss disguised as robustness. See
 *   [`../../docs/prd/04-acceptance-criteria.md`](../../docs/prd/04-acceptance-criteria.md)
 *   AC-10.
 *
 * Every repair is reported so the caller can log it. Silent repair is how a
 * format rots: without a report, a schema change that silently rewrites a
 * million boards looks identical to one that does nothing.
 */

export type Repair =
  | { kind: "missing"; field: string; used: unknown }
  | { kind: "coerced"; field: string; from: unknown; to: unknown }
  | { kind: "clamped"; field: string; from: number; to: number }
  | { kind: "dropped"; field: string; reason: string }
  | { kind: "keptUnknown"; field: string };

/** Collects repairs. One per load, so a corrupt board reports once, not per field. */
export class RepairLog {
  private readonly entries: Repair[] = [];

  record(repair: Repair): void {
    this.entries.push(repair);
  }

  missing(field: string, used: unknown): void {
    this.record({ kind: "missing", field, used });
  }

  coerced(field: string, from: unknown, to: unknown): void {
    this.record({ kind: "coerced", field, from, to });
  }

  clamped(field: string, from: number, to: number): void {
    this.record({ kind: "clamped", field, from, to });
  }

  dropped(field: string, reason: string): void {
    this.record({ kind: "dropped", field, reason });
  }

  keptUnknown(field: string): void {
    this.record({ kind: "keptUnknown", field });
  }

  get all(): readonly Repair[] {
    return this.entries;
  }

  /** Anything at all was noted, including preserved unknown fields. */
  get hasAny(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Something actually had to be changed.
   *
   * This is the one to assert on. `keptUnknown` is deliberately excluded: a file
   * carrying a field this build does not know is *correct and expected* -- it is
   * the forward-compatibility promise working. Counting it as a repair would
   * mean no fixture could ever load clean, which in turn means nobody would
   * notice when one stops doing so.
   */
  get hasRepairs(): boolean {
    return this.entries.some((entry) => entry.kind !== "keptUnknown");
  }

  /**
   * A one-line summary for a console warning.
   *
   * Grouped by kind because a single malformed field usually produces one repair
   * of each kind, and a caller wants "3 missing, 2 coerced" rather than five
   * lines.
   */
  summary(): string {
    if (!this.entries.length) {
      return "no repairs";
    }
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
      .filter(([kind]) => kind !== "keptUnknown")
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${n} ${kind}`);

    // Preserved fields are reported, but as a note rather than as damage, so a
    // clean load of a future file still reads as clean.
    const kept = counts.get("keptUnknown") ?? 0;
    if (kept) {
      parts.push(`preserved ${kept} unknown field${kept === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(", ") : "no repairs";
  }
}

/* -------------------------------------------------------------------------- */
/* Scalars                                                                    */
/* -------------------------------------------------------------------------- */

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Report an absent field as `missing` and a present-but-wrong one as `coerced`.
 *
 * ## Why the distinction is load-bearing
 *
 * These are different events with different causes and different urgency, and
 * reporting both as `coerced` makes the log lie:
 *
 * - `missing` -- the file predates the field, or never wrote it. Nothing was
 *   wrong. A perfectly valid old file produces a log full of these, and if they
 *   look like repairs then "this fixture loads clean" is untestable.
 * - `coerced` -- the file *had* a value and it was the wrong type or out of
 *   range. That is corruption, or a bug in whatever wrote the file, and it is
 *   the thing worth alerting on.
 *
 * The doc comment on `required()` already promised this distinction; these are
 * the helpers that have to deliver it, because they are what every field goes
 * through.
 */
const reportWrongValue = (
  log: RepairLog | undefined,
  field: string,
  from: unknown,
  to: unknown,
): void => {
  if (from === undefined) {
    log?.missing(field, undefined);
  } else {
    log?.coerced(field, from, to);
  }
};

/**
 * Coerce to a finite number, else the default.
 *
 * Deliberately rejects `NaN` and `Infinity` as well as non-numbers. A `NaN` in a
 * coordinate produces a silent rendering hole rather than an error, and it
 * survives JSON round-trips as `null`, so a strict check here is the only place
 * it can be caught.
 */
export const number = (
  value: unknown,
  fallback: number,
  log?: RepairLog,
  field = "value",
): number => {
  if (isFiniteNumber(value)) {
    return value;
  }
  reportWrongValue(log, field, value, fallback);
  return fallback;
};

export const integer = (
  value: unknown,
  fallback: number,
  log?: RepairLog,
  field = "value",
): number => {
  const n = number(value, fallback, log, field);
  const rounded = Math.round(n);
  if (rounded !== n) {
    log?.coerced(field, n, rounded);
  }
  return rounded;
};

/** Clamp into `[min, max]`. A coordinate outside these is a corrupt file. */
export const clamp = (
  value: number,
  min: number,
  max: number,
  log?: RepairLog,
  field = "value",
): number => {
  if (value < min) {
    log?.clamped(field, value, min);
    return min;
  }
  if (value > max) {
    log?.clamped(field, value, max);
    return max;
  }
  return value;
};

export const boolean = (
  value: unknown,
  fallback: boolean,
  log?: RepairLog,
  field = "value",
): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  reportWrongValue(log, field, value, fallback);
  return fallback;
};

export const string = (
  value: unknown,
  fallback: string,
  log?: RepairLog,
  field = "value",
): string => {
  if (typeof value === "string") {
    return value;
  }
  reportWrongValue(log, field, value, fallback);
  return fallback;
};

/** A nullable string. `null` and `undefined` are both "absent", not errors. */
export const nullableString = (
  value: unknown,
  log?: RepairLog,
  field = "value",
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  log?.coerced(field, value, null);
  return null;
};

/**
 * A nullable finite number. `null` and `undefined` are "absent", not errors.
 *
 * `created` is this shape, and getting it wrong is easy: a timestamp of `0` is
 * a valid (if useless) value and must not be turned into `null`, and a
 * `Date.now()` default would be worse than either because it would make loading
 * a file look like an edit.
 */
export const nullableNumber = (
  value: unknown,
  log?: RepairLog,
  field = "value",
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (isFiniteNumber(value)) {
    return value;
  }
  log?.coerced(field, value, null);
  return null;
};

/**
 * Coerce to one of a fixed set, else the fallback.
 *
 * Generic over `string | number` because it is used for both: `fillStyle` picks
 * a string, `strokeWidth` picks a number. The membership test is a plain
 * `includes`, which is correct for both and is why the set is compared as
 * `readonly (string | number)[]`.
 */
export const oneOf = <T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  log?: RepairLog,
  field = "value",
): T => {
  if (
    (typeof value === "string" || typeof value === "number") &&
    (allowed as readonly (string | number)[]).includes(value)
  ) {
    return value as T;
  }
  reportWrongValue(log, field, value, fallback);
  return fallback;
};

export const array = <T>(
  value: unknown,
  mapItem: (item: unknown, index: number) => T | null,
  log?: RepairLog,
  field = "value",
): T[] => {
  if (!Array.isArray(value)) {
    log?.coerced(field, value, []);
    return [];
  }
  const out: T[] = [];
  value.forEach((item, index) => {
    const mapped = mapItem(item, index);
    if (mapped !== null) {
      out.push(mapped);
    } else {
      log?.dropped(`${field}[${index}]`, "item did not validate");
    }
  });
  return out;
};

export const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Read an optional field, reporting absence.
 *
 * `missing` is only recorded when the key is entirely absent, so a caller can
 * tell "this file predates the field" from "this file set it to null" — which is
 * the difference between a default that should be applied and a value that must
 * be preserved.
 */
export const required = <T>(
  source: Record<string, unknown>,
  field: string,
  read: () => T,
  log?: RepairLog,
): T => {
  if (!(field in source)) {
    log?.missing(field, undefined);
  }
  return read();
};

/**
 * Copy through fields this schema version does not know about.
 *
 * This is migration rule 1 made mechanical, and it is the single most important
 * function in the package. A file written by a *newer* Firo must open in an
 * older one with its unknown fields intact, so that upgrading and downgrading
 * are both lossless.
 *
 * The rule for what counts as "unknown": anything not in `known`. That means a
 * *removed* field is also preserved, which is the conservative choice — a
 * migration that intentionally deletes a field must do it explicitly by name,
 * after migrating its data, which is exactly the reviewable shape we want.
 */
export const preserveUnknownFields = (
  original: Record<string, unknown>,
  known: readonly string[],
  log?: RepairLog,
): Record<string, unknown> => {
  const knownSet = new Set(known);
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original)) {
    if (!knownSet.has(key)) {
      preserved[key] = value;
      log?.keptUnknown(key);
    }
  }
  return preserved;
};
