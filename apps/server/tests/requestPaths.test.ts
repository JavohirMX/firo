import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FiroServer } from "../src/app.js";

describe("Malformed request paths", () => {
  let server: FiroServer;
  let directory: string;
  let port: number;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "firo-paths-"));
    fs.writeFileSync(path.join(directory, "index.html"), "Firo");
    server = new FiroServer({
      port: 0,
      host: "127.0.0.1",
      dataDir: directory,
      dbPath: ":memory:",
      webDir: directory,
    });
    port = (await server.start()).port;
  });

  afterEach(async () => {
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function request(requestPath: string, host = "localhost"): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port,
          path: requestPath,
          headers: { Host: host },
          timeout: 2000,
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Request timed out")));
    });
  }

  it.each(["/%", "/%FF", "/api/boards/%/shares", "/api/shares/%", "/%00"])(
    "rejects malformed path %s and keeps serving",
    async (requestPath) => {
      expect(await request(requestPath)).toBe(400);
      expect(await request("/healthz")).toBe(200);
    },
  );

  it("does not use the untrusted Host header as a URL parser base", async () => {
    expect(await request("/healthz", "[invalid")).toBe(200);
  });
});
