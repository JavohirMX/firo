/**
 * Companion export for encrypted RTB backups. The SDK serializes media with
 * empty URLs on copied boards. Include the original file's byte identity so
 * the importer can match its archive resource without guessing from position,
 * title, or archive order. Downloads are sequential to avoid a request burst.
 */
export const MIRO_COMPANION_EXPORT_SCRIPT = `const items = await miro.board.get();
const exported = [];
for (const item of items) {
  const record = { ...item };
  if ((item.type === "image" || item.type === "document") && typeof item.getFile === "function") {
    try {
      const bytes = await (await item.getFile()).arrayBuffer();
      record.mediaSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      console.warn("Media could not be read; it will stay pending:", item.id, error);
    }
  }
  exported.push(record);
}
copy(JSON.stringify(exported));`;
