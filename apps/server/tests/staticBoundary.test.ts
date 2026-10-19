import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStaticHandler } from "../src/http/static.js";

describe("Static file boundary", () => {
  let root: string;
  let web: string;
  let server: http.Server;
  let url: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "firo-static-"));
    web = path.join(root, "web");
    fs.mkdirSync(web);
    fs.writeFileSync(path.join(web, "index.html"), "Firo");
    fs.writeFileSync(path.join(root, "private.txt"), "private-data");
    fs.symlinkSync(
      path.join(root, "private.txt"),
      path.join(web, "outside.txt"),
    );
    fs.symlinkSync(root, path.join(web, "outside-directory"));
    fs.symlinkSync(path.join(web, "index.html"), path.join(web, "inside.html"));
    const handler = createStaticHandler(web);
    server = http.createServer((req, res) => {
      void handler(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["/outside.txt", "/outside-directory/private.txt"])(
    "does not serve a symlink outside the web directory: %s",
    async (target) => {
      const response = await fetch(`${url}${target}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("private-data");
    },
  );

  it("serves symlinks that stay within the web directory", async () => {
    const response = await fetch(`${url}/inside.html`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Firo");
  });
});
