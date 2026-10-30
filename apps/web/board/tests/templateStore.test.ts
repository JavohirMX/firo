/*
 * The saved-template store.
 *
 * ## What is actually at stake
 *
 * A template is two records that must never disagree in a way the gallery
 * cannot survive: metadata without a payload must render as unreadable and
 * deletable, a payload without metadata must be invisible and eventually
 * reclaimed, and a metadata edit must never silently drop the content, the
 * thumbnail, or a field a future version added. Losing any of those is how
 * "my templates" becomes an empty gallery with the bytes still on disk.
 *
 * ## Why IndexedDB is faked
 *
 * Same as `storage.test.ts` and `library.test.ts`: jsdom has none, and the
 * behaviour under test is the store's own key discipline, which a
 * hand-written mock would not reproduce.
 */
import "fake-indexeddb/auto";

import { del, get, keys, set } from "idb-keyval";

import {
  deleteTemplate,
  isReadableMeta,
  listTemplates,
  loadTemplatePayload,
  saveTemplate,
  templateStore,
  updateTemplateMeta,
  TEMPLATE_RECORD_VERSION,
} from "../templateStore";

const payloadFor = (id: string) => ({
  version: TEMPLATE_RECORD_VERSION,
  elements: [{ id: `${id}-el`, type: "rectangle" }],
  files: {},
});

const saveOne = (name: string, tags: string[] = []) =>
  saveTemplate({
    name,
    description: `${name} description`,
    tags,
    elements: [{ id: "el-1", type: "rectangle" }],
    files: {},
  });

beforeEach(async () => {
  const allKeys = await keys(templateStore);
  await Promise.all(allKeys.map((key) => del(key, templateStore)));
});

describe("saveTemplate", () => {
  it("writes both records and returns the metadata", async () => {
    const meta = await saveOne("Retro");
    expect(meta.id).toBeTruthy();
    expect(meta.version).toBe(TEMPLATE_RECORD_VERSION);
    expect(await get(`meta:${meta.id}`, templateStore)).toEqual(meta);
    expect(await get(`payload:${meta.id}`, templateStore)).toEqual({
      version: TEMPLATE_RECORD_VERSION,
      elements: [{ id: "el-1", type: "rectangle" }],
      files: {},
    });
  });

  it("mints a fresh id per save, even for identical input", async () => {
    const first = await saveOne("Retro");
    const second = await saveOne("Retro");
    expect(first.id).not.toBe(second.id);
  });

  it("reclaims orphan payloads left by an interrupted delete", async () => {
    await set("payload:orphaned", payloadFor("orphaned"), templateStore);
    await saveOne("Retro");
    expect(await get("payload:orphaned", templateStore)).toBeUndefined();
  });
});

describe("listTemplates", () => {
  it("lists newest first by updatedAt", async () => {
    const older = await saveOne("Older");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await saveOne("Newer");
    const entries = await listTemplates();
    const names = entries.map((entry) => (entry.ok ? entry.meta.name : ""));
    expect(names).toEqual(["Newer", "Older"]);
    expect(entries[0].ok && entries[0].meta.id).toBe(newer.id);
    expect(entries[1].ok && entries[1].meta.id).toBe(older.id);
  });

  it("ignores orphan payloads entirely", async () => {
    await set("payload:orphaned", payloadFor("orphaned"), templateStore);
    const entries = await listTemplates();
    expect(entries).toEqual([]);
  });

  it("reports metadata without a payload as missing-payload", async () => {
    const meta = await saveOne("Retro");
    await del(`payload:${meta.id}`, templateStore);
    const entries = await listTemplates();
    expect(entries).toEqual([
      { ok: false, id: meta.id, reason: "missing-payload" },
    ]);
  });

  it("reports an unreadable metadata record without reading the payload", async () => {
    const meta = await saveOne("Retro");
    await set(`meta:${meta.id}`, { nope: true }, templateStore);
    const entries = await listTemplates();
    expect(entries).toEqual([{ ok: false, id: meta.id, reason: "unreadable" }]);
  });

  it("does not surface non-string or foreign keys", async () => {
    await saveOne("Retro");
    const entries = await listTemplates();
    expect(entries).toHaveLength(1);
    expect(entries[0].ok).toBe(true);
  });
});

describe("loadTemplatePayload", () => {
  it("returns the payload for a valid record", async () => {
    const meta = await saveOne("Retro");
    const payload = await loadTemplatePayload(meta.id);
    expect(payload?.elements).toEqual([{ id: "el-1", type: "rectangle" }]);
  });

  it("returns null for a missing payload", async () => {
    expect(await loadTemplatePayload("nope")).toBeNull();
  });

  it("returns null for the wrong version", async () => {
    const meta = await saveOne("Retro");
    await set(
      `payload:${meta.id}`,
      { ...payloadFor(meta.id), version: 99 },
      templateStore,
    );
    expect(await loadTemplatePayload(meta.id)).toBeNull();
  });

  it("returns null when elements is not an array", async () => {
    const meta = await saveOne("Retro");
    await set(
      `payload:${meta.id}`,
      { version: TEMPLATE_RECORD_VERSION, elements: "broken" },
      templateStore,
    );
    expect(await loadTemplatePayload(meta.id)).toBeNull();
  });
});

describe("updateTemplateMeta", () => {
  it("updates details, bumps updatedAt and preserves the rest", async () => {
    const meta = await saveOne("Retro", ["workshop"]);
    await set(
      `meta:${meta.id}`,
      { ...meta, futureField: "keep me" },
      templateStore,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateTemplateMeta(meta.id, {
      name: "Retro v2",
      description: "New description",
      tags: ["agile"],
    });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Retro v2");
    expect(updated?.tags).toEqual(["agile"]);
    expect(updated?.createdAt).toBe(meta.createdAt);
    expect(updated?.id).toBe(meta.id);
    expect(updated && updated.updatedAt > meta.updatedAt).toBe(true);
    // Unknown fields survive a metadata write from an older build.
    expect((updated as unknown as Record<string, unknown>).futureField).toBe(
      "keep me",
    );
    // The payload is untouched.
    expect(await loadTemplatePayload(meta.id)).not.toBeNull();
  });

  it("returns null for unreadable metadata", async () => {
    const meta = await saveOne("Retro");
    await set(`meta:${meta.id}`, "garbage", templateStore);
    expect(
      await updateTemplateMeta(meta.id, {
        name: "x",
        description: "y",
        tags: [],
      }),
    ).toBeNull();
  });
});

describe("deleteTemplate", () => {
  it("removes both records", async () => {
    const meta = await saveOne("Retro");
    await deleteTemplate(meta.id);
    expect(await get(`meta:${meta.id}`, templateStore)).toBeUndefined();
    expect(await get(`payload:${meta.id}`, templateStore)).toBeUndefined();
    expect(await listTemplates()).toEqual([]);
  });

  it("reclaims other orphans while deleting", async () => {
    const meta = await saveOne("Retro");
    await set("payload:orphaned", payloadFor("orphaned"), templateStore);
    await deleteTemplate(meta.id);
    expect(await get("payload:orphaned", templateStore)).toBeUndefined();
  });
});

describe("isReadableMeta", () => {
  it("rejects unknown versions and wrong field types", () => {
    const base = {
      version: TEMPLATE_RECORD_VERSION,
      id: "a",
      name: "n",
      description: "d",
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(isReadableMeta(base)).toBe(true);
    expect(isReadableMeta({ ...base, version: 2 })).toBe(false);
    expect(isReadableMeta({ ...base, tags: "x" })).toBe(false);
    expect(isReadableMeta({ ...base, thumbnail: 4 })).toBe(false);
    expect(isReadableMeta(null)).toBe(false);
    expect(isReadableMeta("meta")).toBe(false);
  });
});
