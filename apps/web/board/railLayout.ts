import type { RailToolType } from "@firo/ui";

import { STORAGE_KEYS } from "../app_constants";

/**
 * The rail's arrangement, and where it is kept.
 *
 * ## Why the arrangement is data, and not a rendering concern
 *
 * Miro's rail is rearranged by the user: drag a tool to move it, right-click to
 * unpin it. Firo's rail was a frozen array, which cannot express either. The
 * arrangement therefore has to exist somewhere outside the component, and this
 * module is that place: a `RailLayout`, three pure operations over it, and a
 * reader and writer. Nothing here knows what a rail looks like.
 *
 * ## Why this is not in the document
 *
 * The arrangement is personal. Two people opening the same board should each
 * see their own rail, and an arrangement change is not an edit anyone wants in
 * the undo history or in the board file. So it is a *preference*, stored on the
 * machine, never in `@firo/doc` — the same reasoning that puts the theme in
 * `STORAGE_KEYS.LOCAL_STORAGE_THEME` and not in a board.
 *
 * v1 is single-player, so "per user" and "per browser" are the same thing
 * ([ADR-0029](../../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md)).
 *
 * ## Why `localStorage` here and IndexedDB for boards
 *
 * [`ADR-0005`](../../../docs/adr/0005-indexeddb-via-idb-keyval.md) rejected
 * `localStorage` for the *board* — 5–10 MB and synchronous, which a workshop
 * with hundreds of images exhausts. None of that applies to eleven tool ids.
 * The synchronous read is in fact what the rail wants: it renders once, already
 * arranged, with no flash of the default order. The theme made the same call.
 *
 * ## Why `unpinned` is stored rather than derived
 *
 * The visible order could be stored on its own and everything missing read as
 * "unpinned". Then a tool added by a later version would be invisible in every
 * existing browser, because "missing" and "new" would look identical. Storing
 * the hidden ids explicitly makes "new" mean visible, which is the only safe
 * direction for a new tool to fail in — and `normaliseRailLayout` relies on it.
 */

/**
 * The tools a user arrangement can hold, in their default order.
 *
 * `selection` and `hand` are deliberately absent: they are one pinned entry
 * (Miro's cursor,
 * [ADR-0029](../../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md)), and a pinned entry
 * is not part of an arrangement — it is not draggable and it cannot be unpinned.
 */
export const RAIL_TOOL_DEFAULTS: readonly RailToolType[] = [
  "templates",
  "text",
  "stickynote",
  "shapes",
  "connectors",
  "pen",
  "frame",
  "comment",
];

/**
 * Tools that can never be unpinned or reordered.
 *
 * Both halves of the merged Select/Hand control, because one entry represents
 * both — so neither may be removed, and either can be the active tool.
 */
export const RAIL_PINNED_TOOLS: readonly RailToolType[] = ["selection", "hand"];

/**
 * Maps older flat tool ids to their Miro tool group.
 */
export const LEGACY_TOOL_MAP: Record<string, RailToolType> = {
  rectangle: "shapes",
  diamond: "shapes",
  ellipse: "shapes",
  arrow: "connectors",
  line: "connectors",
  freedraw: "pen",
  eraser: "pen",
  laser: "pen",
};

export interface RailLayout {
  /** Visible, ordered. Excludes the pinned pointer entry. */
  order: RailToolType[];
  /** Explicitly hidden by the user. */
  unpinned: RailToolType[];
}

/** The arrangement a browser that has never touched the rail gets. */
export const defaultRailLayout = (): RailLayout => ({
  order: [...RAIL_TOOL_DEFAULTS],
  unpinned: [],
});

const mapArrangementTool = (id: unknown): RailToolType | null => {
  if (typeof id !== "string") {
    return null;
  }
  if (id in LEGACY_TOOL_MAP) {
    return LEGACY_TOOL_MAP[id];
  }
  if ((RAIL_TOOL_DEFAULTS as readonly string[]).includes(id)) {
    return id as RailToolType;
  }
  return null;
};

/**
 * Coerce anything — a parsed payload, a drag result, a hand-edited localStorage
 * value — into a valid arrangement.
 *
 * Unknown ids, duplicates and pinned ids are dropped. Any arrangement tool that
 * is neither visible nor explicitly unpinned is appended to the visible end:
 * that is a tool this version knows and the stored layout has never heard of,
 * and showing it is the only safe reading. The alternative — hiding it — means
 * a new tool silently never appears for anyone who has ever reordered a rail.
 */
export const normaliseRailLayout = (value: unknown): RailLayout => {
  const record = (value ?? {}) as { order?: unknown; unpinned?: unknown };

  const unpinned: RailToolType[] = [];
  for (const rawId of Array.isArray(record.unpinned) ? record.unpinned : []) {
    const id = mapArrangementTool(rawId);
    if (id && !unpinned.includes(id)) {
      unpinned.push(id);
    }
  }

  const order: RailToolType[] = [];
  for (const rawId of Array.isArray(record.order) ? record.order : []) {
    const id = mapArrangementTool(rawId);
    if (id && !order.includes(id) && !unpinned.includes(id)) {
      order.push(id);
    }
  }

  for (const id of RAIL_TOOL_DEFAULTS) {
    if (!order.includes(id) && !unpinned.includes(id)) {
      order.push(id);
    }
  }

  return { order, unpinned };
};

/**
 * Read the stored arrangement.
 *
 * Never throws and never returns anything but a valid arrangement: storage can
 * be unavailable (private mode, a blocked origin) and the payload can be
 * anything at all, and a rail that fails to render because a preference is
 * unreadable is a worse outcome than a rail in its default order.
 */
export const readRailLayout = (): RailLayout => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT);
  } catch {
    return defaultRailLayout();
  }

  if (raw === null) {
    return defaultRailLayout();
  }

  try {
    return normaliseRailLayout(JSON.parse(raw));
  } catch {
    return defaultRailLayout();
  }
};

/**
 * Persist the arrangement. A preference that cannot be written is a nuisance,
 * not an error worth surfacing: the rail in front of the user is already
 * correct, and it lasts the session.
 */
export const writeRailLayout = (layout: RailLayout): void => {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT,
      JSON.stringify(layout),
    );
  } catch {
    // Deliberately silent; see above.
  }
};

/**
 * Apply a reorder.
 *
 * `order` arrives from the rail as the *whole* visible row, pinned entry
 * included, because that is what the rail reorders; normalisation drops what an
 * arrangement must not hold.
 */
export const reorderRailTools = (
  layout: RailLayout,
  order: readonly RailToolType[],
): RailLayout => normaliseRailLayout({ order, unpinned: layout.unpinned });

/** Hide a tool. The pointer entry is pinned, and is returned untouched. */
export const unpinRailTool = (
  layout: RailLayout,
  tool: RailToolType,
): RailLayout => {
  if (RAIL_PINNED_TOOLS.includes(tool)) {
    return layout;
  }
  return normaliseRailLayout({
    order: layout.order.filter((id) => id !== tool),
    unpinned: [...layout.unpinned, tool],
  });
};

/** Show a tool again. It returns at the end of the row, which is the least
 * surprising place for something the user has just asked back. */
export const restoreRailTool = (
  layout: RailLayout,
  tool: RailToolType,
): RailLayout =>
  normaliseRailLayout({
    order: [...layout.order, tool],
    unpinned: layout.unpinned.filter((id) => id !== tool),
  });
