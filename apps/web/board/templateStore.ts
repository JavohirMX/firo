/**
 * A person's own templates, on their machine.
 *
 * ## Why a second database
 *
 * Boards live in the `firo` database under `autosave:<id>`, scoped so that one
 * board's bytes can never overwrite another's. Templates are not boards: they
 * have no document, no Yjs history and no sync lane ([`ADR-0038`] —
 * templates are content). Putting them in the board store would make the
 * gallery enumerate *board* keys to find *template* keys, and a prefix bug
 * there lists someone's boards as templates or deletes one. A separate
 * database keeps the two namespaces physically apart, the same way the file
 * store's `files-db` is separate.
 *
 * ## Why two key prefixes in one store
 *
 * The gallery draws cards on open — name, tags, thumbnail — and must not
 * deserialize every element payload to do it. So each template is two
 * records: `meta:<id>` (everything a card needs) and `payload:<id>` (the
 * elements and embedded files, loaded only on insert). Enumeration reads
 * `meta:` keys only; a payload without metadata is an orphan and ignored,
 * and metadata whose payload is missing or unreadable renders as an
 * **Unreadable template** card that can only be deleted.
 *
 * ## Write and delete order
 *
 * The payload is written *first* and the metadata *second*: a crash between
 * them leaves an invisible orphan payload, not a listed template with no
 * content. Delete removes the metadata first for the same reason in reverse
 * — a crash leaves an orphan payload, never a card that fails on insert.
 * Orphan payloads are reclaimed the next time a save or delete succeeds.
 *
 * ## Versioning
 *
 * Both records carry `version: 1`. The wrapper is a new format; a structural
 * change bumps the version and ships a migration, with a fixture written by
 * the previous version — the same rule the board format follows. Records
 * with an unknown version read as unreadable rather than being guessed at.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */

import { createStore, del, get, keys, set } from "idb-keyval";

import { randomId } from "@firo/common";

/** The one structural version this build reads and writes. */
export const TEMPLATE_RECORD_VERSION = 1;

const META_PREFIX = "meta:";
const PAYLOAD_PREFIX = "payload:";

/**
 * `createStore` rather than the convenience exports: those target a default
 * database, and a template must never share a namespace with anything else.
 */
export const templateStore = createStore("templates-db", "templates");

/** The file binaries a fragment needs to re-render, keyed by editor file id. */
export interface TemplateFileRecord {
  dataURL: string;
  mimeType: string;
  created: number;
}

/** Everything a gallery card needs; small enough to enumerate on open. */
export interface TemplateMetaRecord {
  version: number;
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** PNG data URL, at most 320px on the long edge. Optional: a failed
   *  render never blocks a save. */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * The captured fragment. `elements` is opaque to the store: the wrapper owns
 * versioning, and element-field migrations happen on read through the
 * editor's own `restoreElements`, not here.
 */
export interface TemplatePayloadRecord {
  version: number;
  elements: readonly unknown[];
  files: Record<string, TemplateFileRecord>;
}

/** A card as the gallery consumes it: metadata, or the unreadable shape. */
export type TemplateListEntry =
  | { ok: true; meta: TemplateMetaRecord }
  | { ok: false; id: string; reason: "unreadable" | "missing-payload" };

export interface SaveTemplateInput {
  name: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  elements: readonly unknown[];
  files: Record<string, TemplateFileRecord>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A metadata record is readable when every field the card renders exists
 *  with the right type and the version is one this build understands. */
export const isReadableMeta = (value: unknown): value is TemplateMetaRecord =>
  isObject(value) &&
  value.version === TEMPLATE_RECORD_VERSION &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.description === "string" &&
  Array.isArray(value.tags) &&
  value.tags.every((tag) => typeof tag === "string") &&
  (value.thumbnail === undefined || typeof value.thumbnail === "string") &&
  typeof value.createdAt === "number" &&
  typeof value.updatedAt === "number";

/** A payload is readable when its version matches and it carries an element
 *  list. `files` may be absent (a fragment with no images stores none). */
export const isReadablePayload = (
  value: unknown,
): value is TemplatePayloadRecord =>
  isObject(value) &&
  value.version === TEMPLATE_RECORD_VERSION &&
  Array.isArray(value.elements);

/**
 * Persist a new template. The id is minted here — re-saving is always a new
 * record ([`ADR-0038`] §4: no overwrite-by-name) — and returned so the caller
 * can confirm what was written.
 */
export const saveTemplate = async (
  input: SaveTemplateInput,
): Promise<TemplateMetaRecord> => {
  const now = Date.now();
  const meta: TemplateMetaRecord = {
    version: TEMPLATE_RECORD_VERSION,
    id: randomId(),
    name: input.name,
    description: input.description,
    tags: input.tags,
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const payload: TemplatePayloadRecord = {
    version: TEMPLATE_RECORD_VERSION,
    elements: input.elements,
    files: input.files,
  };
  // Payload first, metadata second: see the file docblock.
  await set(`${PAYLOAD_PREFIX}${meta.id}`, payload, templateStore);
  await set(`${META_PREFIX}${meta.id}`, meta, templateStore);
  await reclaimOrphanPayloads();
  return meta;
};

/**
 * Every template the gallery should draw a card for, newest first. Orphan
 * payloads (no metadata) are ignored here; metadata without a readable
 * payload is reported so the gallery can render the unreadable state.
 */
export const listTemplates = async (): Promise<TemplateListEntry[]> => {
  const allKeys = await keys(templateStore);
  /*
   * Payload *keys* are consulted here, never payload values: the gallery
   * enumerates `meta:` records only, and a payload can carry megabytes of
   * image data that no card needs. A missing payload key is known for free
   * and renders the unreadable state; a present-but-corrupt payload is
   * caught by `loadTemplatePayload` at insert time, which keeps the gallery
   * open and inserts nothing (ADR-0038 §5).
   */
  const payloadIds = new Set(
    allKeys
      .filter(
        (key): key is string =>
          typeof key === "string" && key.startsWith(PAYLOAD_PREFIX),
      )
      .map((key) => key.slice(PAYLOAD_PREFIX.length)),
  );
  const entries: TemplateListEntry[] = [];
  for (const key of allKeys) {
    if (typeof key !== "string" || !key.startsWith(META_PREFIX)) {
      continue;
    }
    const id = key.slice(META_PREFIX.length);
    const meta = await get(key, templateStore);
    if (!isReadableMeta(meta)) {
      entries.push({ ok: false, id, reason: "unreadable" });
      continue;
    }
    if (!payloadIds.has(id)) {
      entries.push({ ok: false, id, reason: "missing-payload" });
      continue;
    }
    entries.push({ ok: true, meta });
  }
  entries.sort((a, b) => {
    const aTime = a.ok ? a.meta.updatedAt : 0;
    const bTime = b.ok ? b.meta.updatedAt : 0;
    return bTime - aTime;
  });
  return entries;
};

/**
 * Load a template's fragment for insertion. Returns `null` when the payload
 * is missing, unreadable or the wrong version — the caller keeps the gallery
 * open and inserts nothing ([`ADR-0038`] §5).
 */
export const loadTemplatePayload = async (
  id: string,
): Promise<TemplatePayloadRecord | null> => {
  const payload = await get(`${PAYLOAD_PREFIX}${id}`, templateStore);
  return isReadablePayload(payload) ? payload : null;
};

/**
 * Edit a template's details without touching its content: name, description
 * and tags change, `updatedAt` moves, and everything else — elements, files,
 * thumbnail, id, `createdAt` — is preserved by spreading the stored record
 * first, so fields a future version adds are not dropped by a write from
 * this one. Returns the updated record, or `null` when the stored metadata
 * is unreadable (the gallery's unreadable state has no edit action).
 */
export const updateTemplateMeta = async (
  id: string,
  patch: { name: string; description: string; tags: string[] },
): Promise<TemplateMetaRecord | null> => {
  const key = `${META_PREFIX}${id}`;
  const existing = await get(key, templateStore);
  if (!isReadableMeta(existing)) {
    return null;
  }
  const updated: TemplateMetaRecord = {
    ...existing,
    name: patch.name,
    description: patch.description,
    tags: patch.tags,
    updatedAt: Date.now(),
  };
  await set(key, updated, templateStore);
  return updated;
};

/** Remove a template: metadata first, payload second, then sweep orphans. */
export const deleteTemplate = async (id: string): Promise<void> => {
  await del(`${META_PREFIX}${id}`, templateStore);
  await del(`${PAYLOAD_PREFIX}${id}`, templateStore);
  await reclaimOrphanPayloads();
};

/**
 * A payload whose metadata is gone can never be listed or inserted, so it is
 * safe to remove. Runs after writes and deletes rather than on every read —
 * reads should not mutate.
 */
const reclaimOrphanPayloads = async (): Promise<void> => {
  const allKeys = await keys(templateStore);
  const metaIds = new Set(
    allKeys
      .filter(
        (key): key is string =>
          typeof key === "string" && key.startsWith(META_PREFIX),
      )
      .map((key) => key.slice(META_PREFIX.length)),
  );
  const orphans = allKeys.filter(
    (key): key is string =>
      typeof key === "string" &&
      key.startsWith(PAYLOAD_PREFIX) &&
      !metaIds.has(key.slice(PAYLOAD_PREFIX.length)),
  );
  await Promise.all(orphans.map((key) => del(key, templateStore)));
};
