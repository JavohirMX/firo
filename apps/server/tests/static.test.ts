import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStaticHandler } from "../src/http/static.js";

describe("static handler", () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let unhandled: unknown[];
  const onRejection = (e: unknown) => unhandled.push(e);

  beforeEach(async () => {
    unhandled = [];
    process.on("unhandledRejection", onRejection);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "firo-web-"));
    fs.writeFileSync(path.join(dir, "index.html"), "<html>app</html>");
    const handler = createStaticHandler(dir);
    // Mirrors app.ts: an async request listener with no catch of its own.
    server = http.createServer(async (req, res) => {
      const handled = await handler(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end("nope");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    process.off("unhandledRejection", onRejection);
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const rawGet = (p: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: (server.address() as { port: number }).port, path: p, method: "GET" },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode || 0, body }));
        },
      );
      req.setTimeout(1500, () => {
        req.destroy();
        resolve({ status: 0, body: "" });
      });
      req.on("error", reject);
      req.end();
    });

  it("serves index.html at the root", async () => {
    const r = await rawGet("/");
    expect(r.status).toBe(200);
    expect(r.body).toContain("app");
  });

  it("rejects path traversal", async () => {
    const r = await rawGet("/..%2f..%2fetc/passwd");
    expect([400, 403, 404]).toContain(r.status);
  });

  it("answers 400 to a malformed percent-escape instead of an unhandled rejection", async () => {
    const r = await rawGet("/%E0%A4%A");
    await new Promise((r2) => setTimeout(r2, 50));
    expect(unhandled).toEqual([]);
    expect(r.status).toBe(400);
  });
});
