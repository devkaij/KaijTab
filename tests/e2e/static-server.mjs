#!/usr/bin/env node
/** 纯网页（PWA）模式 E2E 用的静态服务器：把 dist/ 当静态站点伺服 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.argv[2] ?? join(import.meta.dirname, "..", "..", "dist");
const PORT = Number(process.argv[3] ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
    let target = join(ROOT, relative || "main.html");

    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, "index.html");

    const body = await readFile(target);
    response.writeHead(200, {
      "content-type": MIME[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("404");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`static server: http://127.0.0.1:${PORT}`);
});
