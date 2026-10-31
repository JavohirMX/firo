import fs from "node:fs";
import path from "node:path";

import { parseRequestUrl } from "./requestUrl.js";

import type http from "node:http";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function isSafePath(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function createStaticHandler(
  webDir: string,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean> {
  const resolvedWebDir = path.resolve(webDir);

  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> => {
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return false;
    }

    if (!fs.existsSync(resolvedWebDir)) {
      return false;
    }

    const parsedUrl = parseRequestUrl(req.url);
    if (!parsedUrl) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return true;
    }
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Prevent null byte attacks
    if (pathname.includes("\0")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return true;
    }

    // Never handle /api/* or /ws
    if (
      pathname.startsWith("/api/") ||
      pathname === "/api" ||
      pathname === "/ws" ||
      pathname.startsWith("/ws/")
    ) {
      return false;
    }

    // Map root to index.html
    if (pathname === "/" || pathname === "") {
      pathname = "/index.html";
    }

    const targetFilePath = path.join(resolvedWebDir, pathname);

    // Path traversal defense
    if (!isSafePath(resolvedWebDir, targetFilePath)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return true;
    }

    // Symlink defense: the resolved file must also stay inside the web root.
    if (fs.existsSync(targetFilePath)) {
      let realTarget: string;
      let realBase: string;
      try {
        realTarget = fs.realpathSync(targetFilePath);
        realBase = fs.realpathSync(resolvedWebDir);
      } catch {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return true;
      }
      if (!isSafePath(realBase, realTarget)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return true;
      }
    }

    // 1. Direct file check
    if (fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
      const stat = fs.statSync(targetFilePath);
      const mime = getMimeType(targetFilePath);
      // Only vite's /assets/ output always carries a content hash. Public
      // files (favicon-32x32.png, service-worker.js) and some fonts contain
      // dashes but no hash; treating them as immutable serves stale copies
      // for a year after an upgrade.
      const isHashedAsset = pathname.startsWith("/assets/");
      const isHtml = mime.startsWith("text/html");

      const cacheControl = isHtml
        ? "no-cache"
        : isHashedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";

      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": stat.size,
        "Cache-Control": cacheControl,
      });

      if (method === "HEAD") {
        res.end();
        return true;
      }

      const stream = fs.createReadStream(targetFilePath);
      stream.pipe(res);
      return true;
    }

    // 2. SPA fallback: Any request without file extension serves index.html
    const hasExtension = path.extname(pathname) !== "";
    if (!hasExtension) {
      const indexPath = path.join(resolvedWebDir, "index.html");
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
        const stat = fs.statSync(indexPath);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": stat.size,
          "Cache-Control": "no-cache",
        });

        if (method === "HEAD") {
          res.end();
          return true;
        }

        const stream = fs.createReadStream(indexPath);
        stream.pipe(res);
        return true;
      }
    }

    return false;
  };
}
