import { webcrypto } from "node:crypto";

import { expect, it, vi } from "vitest";

import { MIRO_COMPANION_EXPORT_SCRIPT } from "../miro/companionExport";

it("exports media byte hashes with item IDs while preserving non-media items", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const image = {
    id: "copied-image",
    type: "image",
    url: "",
    getFile: async () => ({ arrayBuffer: async () => bytes.buffer }),
  };
  const missing = {
    id: "unreadable",
    type: "image",
    getFile: async () => {
      throw new Error("unavailable");
    },
  };
  const text = { id: "text", type: "text", content: "Unchanged" };
  const copy = vi.fn();
  const warn = vi.fn();
  const run = new (Object.getPrototypeOf(async () => {}).constructor)(
    "miro",
    "crypto",
    "copy",
    "console",
    MIRO_COMPANION_EXPORT_SCRIPT,
  );
  await run(
    { board: { get: async () => [image, missing, text] } },
    webcrypto,
    copy,
    { warn },
  );
  const output = JSON.parse(copy.mock.calls[0][0]);
  expect(output[0]).toMatchObject({
    id: "copied-image",
    mediaSha256:
      "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
  });
  expect(output[1].mediaSha256).toBeUndefined();
  expect(output[2]).toEqual(text);
  expect(warn).toHaveBeenCalledOnce();
});
