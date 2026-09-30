/**
 * The Yjs document layout.
 *
 * One `Y.Doc` per board, with the seven roots the TRD specifies. This module owns
 * *where things live*; `doc.ts` owns *who may change them*. Splitting it that way
 * is what lets the write-path guard be a single hook rather than a review
 * convention.
 *
 * ## Why nested `Y.Map` per element
 *
 * A nested map gives per-field merge semantics for free: two clients moving the
 * same note to different places produce one changed field, not a whole-element
 * conflict. A flat map keyed by field name would need the same discipline
 * manually, and a flat map keyed by element id would merge whole elements and
 * lose one client's move.
 *
 * ## Why order is a `Y.Array`
 *
 * The one place we deliberately do *not* use a `Y.Map`. Concurrent inserts into an
 * array merge by position; concurrent inserts into a map would need a total
 * order that a map does not have. `FractionalIndex` is stored on each element as
 * a secondary, and the reconciler re-sorts when the array and the keys disagree.
 */
import * as Y from "yjs";

import type { Collection, FiroElement, FiroRecord } from "@firo/schema";

/** Root name -> what it holds. */
export const ROOTS = {
  elements: "elements",
  elementOrder: "elementOrder",
  collections: "collections",
  records: "records",
  recordOrder: "recordOrder",
  meta: "meta",
  assets: "assets",
} as const;

export type RootName = typeof ROOTS[keyof typeof ROOTS];

/** A single element, as it lives in the document. */
export type ElementNode = Y.Map<unknown>;

/**
 * The typed roots.
 *
 * `elements`, `collections` and `records` are maps of id -> nested map. The two
 * order roots are arrays of ids. `assets` is a map of id -> blob reference and is
 * kept separate from `records` on purpose: an asset is content-addressed bytes in
 * IndexedDB, and a record is data. Conflating them is how a 2 MB image ends up
 * inside a CRDT update.
 */
export type DocStructure = {
  elements: Y.Map<ElementNode>;
  elementOrder: Y.Array<string>;
  collections: Y.Map<Y.Map<unknown>>;
  records: Y.Map<Y.Map<unknown>>;
  recordOrder: Y.Array<string>;
  meta: Y.Map<unknown>;
  assets: Y.Map<Y.Map<unknown>>;
};

const rootMap = <T>(doc: Y.Doc, name: string): Y.Map<T> => doc.getMap<T>(name);

/**
 * Get the typed roots.
 *
 * `getMap`/`getArray` are idempotent and cached by Yjs, so this allocates a
 * wrapper per call but never a second underlying type. The cost is irrelevant
 * next to the fact that it makes the layout impossible to get wrong.
 */
export const structure = (doc: Y.Doc): DocStructure => ({
  elements: rootMap<ElementNode>(doc, ROOTS.elements),
  elementOrder: doc.getArray<string>(ROOTS.elementOrder),
  collections: rootMap<Y.Map<unknown>>(doc, ROOTS.collections),
  records: rootMap<Y.Map<unknown>>(doc, ROOTS.records),
  recordOrder: doc.getArray<string>(ROOTS.recordOrder),
  meta: rootMap<unknown>(doc, ROOTS.meta),
  assets: rootMap<Y.Map<unknown>>(doc, ROOTS.assets),
});

/**
 * Write a plain object into a nested `Y.Map`.
 *
 * ## Why this is not `Y.Map.set` in a loop
 *
 * Setting keys one at a time on an integrated type is fine, but it means the
 * *fields* of an element are not themselves a unit: a reader can observe an
 * element with a new `x` and an old `width`, which is a state no commit
 * described. Writing the whole object into a fresh nested map and swapping it in
 * one `set` makes each element a single atomic value, which is what
 * field-granular merge is supposed to buy.
 *
 * The trade is real and worth stating: swapping the map wholesale means a
 * concurrent edit to a *different* field of the same element is resolved as
 * whole-element last-writer-wins, not merged field-by-field. That is the right
 * default for a canvas -- a half-applied move is worse than a whole one -- and
 * the per-field case is handled by `updateElement` in `mutations.ts`, which
 * writes only the changed keys into the *existing* nested map. Which of the two
 * runs depends on how many fields the commit touches, not on the caller.
 */

/** Convert a plain object into a `Y.Map`, recursively for plain objects. */
export const toYMap = (value: Record<string, unknown>): Y.Map<unknown> => {
  const map = new Y.Map<unknown>();
  for (const [key, entry] of Object.entries(value)) {
    // Nested plain objects become nested Y.Maps so that reading them back does
    // not hand out a live plain object that a caller could mutate -- which would
    // be an invisible write, exactly what this package exists to prevent.
    map.set(key, isPlainObject(entry) ? toYMap(entry) : (entry as unknown));
  }
  return map;
};

/**
 * Whether a value is a plain object (and so a candidate for nesting).
 *
 * `null` is excluded because it is a legitimate stored value: "no link", "no
 * parent container", "created date unknown". Arrays are excluded because they
 * are stored as Yjs arrays by the mutations that create them, and a generic
 * deep-conversion here would need to know which arrays are which.
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Read a nested `Y.Map` back into a plain object.
 *
 * ## Why the `forEach` guard
 *
 * A document can hold a value this package did not write. A remote peer on an
 * older or newer build, a hand-edited IndexedDB record, or a test that pokes a
 * plain object into the map. Assuming every value is a `Y.Map` turns a
 * survivable foreign value into a `map.forEach is not a function` crash in the
 * middle of a read -- and a read is the one operation that has to work in order
 * to *see* that something is wrong.
 *
 * So a non-map value is passed through as-is and the reader carries on. It is
 * the caller's job to decide whether the resulting snapshot is well-formed;
 * `@firo/schema`'s validators are where that judgement lives.
 */
export const fromYMap = (map: Y.Map<unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (typeof map?.forEach !== "function") {
    // Not a Y.Map at all. Return it unchanged rather than throwing, so a
    // malformed document degrades into an empty result instead of an exception.
    return isPlainObject(map) ? map : {};
  }
  map.forEach((value, key) => {
    out[key] = value instanceof Y.Map ? fromYMap(value) : value;
  });
  return out;
};

/**
 * Read every element, in z-order.
 *
 * The order is the `elementOrder` array, not map iteration order. Reading in
 * map order would produce a snapshot that is *complete* and has the wrong
 * stacking, which is a far worse failure than a missing element because nothing
 * looks absent.
 *
 * Ids in `elementOrder` with no element are skipped, and elements missing from
 * `elementOrder` are appended in map order -- so a partially-built or
 * externally-written document still yields every element it has.
 */
export const readAllElements = (structure: DocStructure): FiroElement[] => {
  const byId = new Map<string, FiroElement>();
  structure.elements.forEach((node, id) => {
    byId.set(id, fromYMap(node) as unknown as FiroElement);
  });

  const out: FiroElement[] = [];
  const seen = new Set<string>();
  for (const id of structure.elementOrder.toArray()) {
    const element = byId.get(id);
    if (element && !seen.has(id)) {
      out.push(element);
      seen.add(id);
    }
  }
  for (const [id, element] of byId) {
    if (!seen.has(id)) {
      out.push(element);
    }
  }
  return out;
};

/** Read the element order, which is the z-order. */
export const readElementOrder = (structure: DocStructure): string[] =>
  structure.elementOrder.toArray();

/** Read every record. */
export const readAllRecords = (structure: DocStructure): FiroRecord[] => {
  const out: FiroRecord[] = [];
  structure.records.forEach((node) => {
    out.push(fromYMap(node) as unknown as FiroRecord);
  });
  return out;
};

export const readAllCollections = (structure: DocStructure): Collection[] => {
  const out: Collection[] = [];
  structure.collections.forEach((node) => {
    out.push(fromYMap(node) as unknown as Collection);
  });
  return out;
};
