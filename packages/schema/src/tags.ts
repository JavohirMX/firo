/**
 * Element tags for Phase 8.3.
 *
 * Colourable, free-form labels on elements for finding and filtering.
 * Not a category system.
 */
import { array } from "./validate.js";

import type { ElementMigration } from "./registry.js";
import type { RepairLog } from "./validate.js";

/**
 * Validate and extract optional tags from a raw element.
 *
 * Absence or empty stays absent (`{}`) so existing boards without tags
 * do not acquire an empty `tags: []` property on re-save.
 */
export const elementTags = (
  raw: Record<string, unknown>,
  log: RepairLog,
): { tags?: readonly string[] } => {
  if (raw.tags === undefined || raw.tags === null) {
    return {};
  }
  const tags = array<string>(
    raw.tags,
    (item) =>
      typeof item === "string" && item.trim().length > 0 ? item.trim() : null,
    log,
    "tags",
  );
  return tags.length > 0 ? { tags } : {};
};

/**
 * Element schema v2 -> v3: element-level tags.
 *
 * Additive and optional; absence is the default, so migration returns a new
 * object without altering data.
 */
export const V2_TO_V3_ELEMENT_TAGS: ElementMigration = {
  from: 2,
  to: 3,
  migrate: (raw) => ({ ...raw }),
};
