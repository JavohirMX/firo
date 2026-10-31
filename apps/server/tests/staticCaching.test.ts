import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStaticHandler } from "../src/http/static.js";

describe("Static cache headers", () => {
  let root: string;
  let web: string;
  let server: http.Server;
  let url: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "firo-cache-"));
    web = path.join(root, "web");
    fs.mkdirSync(path.join(web, "assets"), { recursive: true });
    fs.mkdirSync(path.join(web, "fonts", "PlusJakartaSans"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(web, "index.html"), "Firo");
    // vite always emits hashed names under /assets/
    fs.writeFileSync(path.join(web, "assets", "index-Dq2x9Klm.js"), "js");
    fs.writeFileSync(path.join(web, "assets", "index-Dq2x9Klm.js.map"), "map");
    // regression: an un-hashed name must not become immutable just because
    // it sits under /assets/ (e.g. if the woff2 rule ever points there)
    fs.writeFileSync(
      path.join(web, "assets", "PlusJakartaSans-latin.woff2"),
      "font",
    );
    // public/ files are copied verbatim: dashes, but no content hash
    fs.writeFileSync(path.join(web, "favicon-32x32.png"), "png");
    fs.writeFileSync(path.join(web, "service-worker.js"), "sw");
    // some fonts are emitted with their original, un-hashed names
    fs.writeFileSync(
      path.join(web, "fonts", "PlusJakartaSans", "PlusJakartaSans-latin.woff2"),
      "font",
    );
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

  it("marks hashed /assets/ files immutable", async () => {
    const res = await fetch(`${url}/assets/index-Dq2x9Klm.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it.each([
    "/favicon-32x32.png",
    "/service-worker.js",
    "/fonts/PlusJakartaSans/PlusJakartaSans-latin.woff2",
  ])(
    "does not mark un-hashed file %s immutable despite its dash",
    async (target) => {
      const res = await fetch(`${url}${target}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).not.toContain("immutable");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    },
  );

  it("does not mark an un-hashed file under /assets/ immutable", async () => {
    const res = await fetch(`${url}/assets/PlusJakartaSans-latin.woff2`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("marks hashed sourcemaps under /assets/ immutable", async () => {
    const res = await fetch(`${url}/assets/index-Dq2x9Klm.js.map`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("serves html with no-cache", async () => {
    const res = await fetch(`${url}/index.html`);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
