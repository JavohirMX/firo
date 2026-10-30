/**
 * The save-template dialog's field rules, kept pure so the dialog and the
 * edit-details menu share one source of truth.
 *
 * The limits are [`ADR-0038`] §4's: a required name of 1-80 characters, an
 * optional description of at most 240, and at most 8 comma-separated tags of
 * at most 24 characters each, trimmed and deduplicated case-insensitively.
 * They live here rather than in the component because a rule tested without
 * a DOM cannot drift from the rule the dialog enforces.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_DESCRIPTION_MAX = 240;
export const TEMPLATE_TAG_MAX = 24;
export const TEMPLATE_TAGS_MAX = 8;

/** Trimmed, 1-80 characters. Save stays disabled until this passes. */
export const validateTemplateName = (raw: string): string | null => {
  const name = raw.trim();
  if (name.length < 1 || name.length > TEMPLATE_NAME_MAX) {
    return null;
  }
  return name;
};

/** Optional, at most 240 characters (counted after trimming). */
export const validateTemplateDescription = (raw: string): string | null => {
  const description = raw.trim();
  if (description.length > TEMPLATE_DESCRIPTION_MAX) {
    return null;
  }
  return description;
};

export type ParseTagsResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: "too-many-tags" | "tag-too-long" };

/**
 * Parse the comma-separated tags field. Blank entries are ignored; the rest
 * are trimmed and deduplicated case-insensitively, keeping the first
 * spelling the author typed. Over the limits is a hard error, not a silent
 * truncation: dropping a tag the author typed without saying so is how a
 * template becomes unfindable.
 */
export const parseTemplateTags = (raw: string): ParseTagsResult => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const piece of raw.split(",")) {
    const tag = piece.trim();
    if (!tag) {
      continue;
    }
    if (tag.length > TEMPLATE_TAG_MAX) {
      return { ok: false, reason: "tag-too-long" };
    }
    const folded = tag.toLocaleLowerCase();
    if (seen.has(folded)) {
      continue;
    }
    seen.add(folded);
    tags.push(tag);
  }
  if (tags.length > TEMPLATE_TAGS_MAX) {
    return { ok: false, reason: "too-many-tags" };
  }
  return { ok: true, tags };
};
