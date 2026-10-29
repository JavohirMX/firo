/**
 * The mind-map projection (ADR-0040 section 4).
 *
 * The records are the mind map: each record is a node, and the first `relation`
 * column names its parent. There is no map element, no layout table, no second
 * copy of the tree — switching to the table view shows the same records as rows,
 * and a reparent here is a `setField` there. That is rule 4 and property 3, and
 * it is why this file is a layout and an interpreter and nothing else.
 *
 * ## What a broken file gets
 *
 * The tree is derived at read time and the data is never rewritten to make it
 * tidy:
 *
 * - a record whose parent id is gone (dangling relation) is laid out as a root,
 *   and the table view says "Missing record" — restoring the parent restores
 *   the edge;
 * - a cycle (a is b's parent, b is a's parent) is broken at the record that
 *   comes first in `order`, which reads as a root instead. The alternative —
 *   refusing to lay out — turns one hand-edited line into a blank canvas.
 *
 * Neither case rewrites the file. Read-time repair is how the table survives a
 * deleted column; this is the same rule one projection over.
 */
import type { Collection, FiroRecord } from "@firo/schema";

import { orderedRecords } from "./ordering.js";
import {
  titleColumnKeyFor,
  valueOf,
  type LayoutContext,
  type Projection,
  type ProjectionElement,
  type ProjectionIntent,
  type RecordMutation,
} from "./types.js";

export const MINDMAP_NODE_WIDTH = 220;
export const MINDMAP_NODE_HEIGHT = 80;
const SIBLING_GAP = 16;
const LEVEL_GAP = 80;

/**
 * The column the map reads, or `null` for a collection with no relation.
 *
 * The first relation column, in column order — `groupingColumnFor`'s rule, for
 * `groupingColumnFor`'s reason: a collection with two relations has no correct
 * answer, so the rule is stated rather than left as whatever the loop did.
 */
export const relationColumnFor = (
  collection: Collection,
): Collection["columns"][number] | null =>
  collection.columns.find((column) => column.type === "relation") ?? null;

/** A record's parent id under `columnKey`, or `null` for a root. */
const parentIdOf = (record: FiroRecord, columnKey: string): string | null => {
  const value = valueOf(record, columnKey);
  return value !== null && value.type === "relation" ? value.value : null;
};

/**
 * The forest the layout walks.
 *
 * Returns the roots in `order`, and each record's children in `order`. A record
 * whose parent is absent, dangling, or cycle-broken is a root. Cycles are found
 * by walking each chain once; the earliest record in `order` on the loop is the
 * break point, and only its *effective* parent changes — nothing is written.
 */
const forest = (
  records: readonly FiroRecord[],
  columnKey: string,
): {
  roots: readonly FiroRecord[];
  childrenOf: ReadonlyMap<string, readonly FiroRecord[]>;
  effectiveParentOf: ReadonlyMap<string, string | null>;
} => {
  const ordered = orderedRecords(records);
  const byId = new Map(ordered.map((record) => [record.id, record]));
  const position = new Map(ordered.map((record, index) => [record.id, index]));

  const effectiveParentOf = new Map<string, string | null>();
  for (const record of ordered) {
    const parent = parentIdOf(record, columnKey);
    effectiveParentOf.set(
      record.id,
      parent !== null && byId.has(parent) ? parent : null,
    );
  }

  // Break every loop at its earliest-in-order member.
  const broken = new Set<string>();
  for (const record of ordered) {
    const chain: string[] = [];
    let cursor: string | null = record.id;
    while (cursor !== null && !broken.has(cursor)) {
      const at = chain.indexOf(cursor);
      if (at !== -1) {
        const loop = chain.slice(at);
        loop.sort((a, b) => position.get(a)! - position.get(b)!);
        broken.add(loop[0]);
        break;
      }
      chain.push(cursor);
      cursor = effectiveParentOf.get(cursor) ?? null;
    }
  }
  for (const id of broken) {
    effectiveParentOf.set(id, null);
  }

  const childrenOf = new Map<string, FiroRecord[]>();
  const roots: FiroRecord[] = [];
  for (const record of ordered) {
    const parent = effectiveParentOf.get(record.id) ?? null;
    if (parent === null) {
      roots.push(record);
    } else {
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(record);
      childrenOf.set(parent, siblings);
    }
  }

  return { roots, childrenOf, effectiveParentOf };
};

export const mindmapProjection: Projection = {
  id: "mindmap",
  name: "Mind map",
  /*
   * "edit" and nothing else: grouping, sorting and filtering are answers to
   * questions a tree already answers with its shape, and a "reorder" flag
   * would promise sibling-drag this projection does not read (order among
   * siblings is the record's `order`, edited in the table or by reparent).
   */
  supports: ["edit"],

  layout: (
    collection: Collection,
    records: readonly FiroRecord[],
    context: LayoutContext = {},
  ): readonly ProjectionElement[] => {
    const originX = context.originX ?? 0;
    const originY = context.originY ?? 0;
    const column = relationColumnFor(collection);
    if (column === null) {
      // No relation column: the view's empty state, not the projection's.
      return [];
    }
    const titleKey = titleColumnKeyFor(collection);
    const { roots, childrenOf } = forest(records, column.key);

    const elements: ProjectionElement[] = [];
    let cursorY = originY;

    const layOut = (record: FiroRecord, depth: number): number => {
      const children = childrenOf.get(record.id) ?? [];
      const x = originX + depth * (MINDMAP_NODE_WIDTH + LEVEL_GAP);
      let y: number;
      let top = cursorY;
      if (children.length === 0) {
        y = cursorY;
        cursorY += MINDMAP_NODE_HEIGHT;
      } else {
        const childYs: number[] = [];
        for (const [index, child] of children.entries()) {
          if (index > 0) {
            cursorY += SIBLING_GAP;
          }
          childYs.push(layOut(child, depth + 1));
        }
        // Centred on its children: the one layout rule a tidy tree has.
        y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      }

      const title = valueOf(record, titleKey);
      elements.push({
        id: `node:${record.id}`,
        recordId: record.id,
        type: "card",
        x,
        y,
        width: MINDMAP_NODE_WIDTH,
        height: MINDMAP_NODE_HEIGHT,
        text: title !== null && title.type === "text" ? title.value : "",
      });

      for (const child of children) {
        const centreTop = y + MINDMAP_NODE_HEIGHT / 2;
        const childCentre =
          (elements.find((e) => e.id === `node:${child.id}`)?.y ?? y) +
          MINDMAP_NODE_HEIGHT / 2;
        elements.push({
          id: `edge:${child.id}`,
          recordId: child.id,
          type: "edge",
          fromId: `node:${record.id}`,
          toId: `node:${child.id}`,
          x: x + MINDMAP_NODE_WIDTH,
          y: Math.min(centreTop, childCentre),
          width: LEVEL_GAP,
          height: Math.abs(childCentre - centreTop),
        });
      }
      return y;
    };

    for (const [index, root] of roots.entries()) {
      if (index > 0) {
        cursorY += SIBLING_GAP;
      }
      layOut(root, 0);
    }

    return elements;
  },

  interpret: (
    collection: Collection,
    records: readonly FiroRecord[],
    intent: ProjectionIntent,
  ): RecordMutation | null => {
    const record = records.find(
      (candidate) => candidate.id === intent.recordId,
    );
    if (!record) {
      return null;
    }

    switch (intent.kind) {
      case "edit": {
        const target = collection.columns.find(
          (candidate) => candidate.key === intent.columnKey,
        );
        if (!target || target.type !== "text") {
          // The mind map edits titles. A drop-down has no business here.
          return null;
        }
        return {
          kind: "setField",
          recordId: record.id,
          columnKey: target.key,
          value: { type: "text", value: intent.value },
        };
      }

      case "reparent": {
        const column = relationColumnFor(collection);
        if (column === null) {
          return null;
        }
        const newParentId = intent.newParentId;
        if (newParentId !== null) {
          if (newParentId === record.id) {
            // A record cannot parent itself.
            return null;
          }
          const parent = records.find(
            (candidate) => candidate.id === newParentId,
          );
          if (!parent || parent.collectionId !== record.collectionId) {
            // Out of this collection: a relation points inside its own
            // collection, or the schema bump has no meaning.
            return null;
          }
          /*
           * Reject parenting to a descendant: it would create the cycle
           * `forest` then has to break, which is a layout that lies about
           * what the user just did. Walk the new parent's ancestry with a
           * depth cap, because the file may already contain a cycle and
           * this walk must still terminate.
           */
          let cursor: string | null = newParentId;
          for (let depth = 0; cursor !== null && depth <= records.length; depth++) {
            if (cursor === record.id) {
              return null;
            }
            const current = records.find(
              (candidate) => candidate.id === cursor,
            );
            cursor = current ? parentIdOf(current, column.key) : null;
          }
        }
        return {
          kind: "setField",
          recordId: record.id,
          columnKey: column.key,
          value: { type: "relation", value: newParentId },
        };
      }

      default:
        return null;
    }
  },
};
