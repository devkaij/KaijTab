/**
 * 网页壁纸的虚拟文件服务（Service Worker）。
 * 把 /whost/<壁纸id>/<文件路径> 映射到 OPFS 里的 web/<壁纸id>/<文件路径>，
 * 于是网页壁纸工程内部的相对路径（script / css / 纹理 / fetch）都能正常解析。
 *
 * 注：本文件运行在 Service Worker 环境，这里用最小化的本地类型声明，
 * 避免 DOM 与 WebWorker 两套 lib 在同一 tsconfig 下冲突。
 */
const SCOPE_PREFIX = "/whost/";
const WEB_ROOT = "web";

const scope = globalThis as unknown as {
  addEventListener(type: string, handler: (event: unknown) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
};

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  wasm: "application/wasm",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

scope.addEventListener("install", () => {
  void scope.skipWaiting();
});

scope.addEventListener("activate", (event) => {
  (event as ExtendableEventLike).waitUntil(scope.clients.claim());
});

scope.addEventListener("fetch", (event) => {
  const fetchEvent = event as FetchEventLike;
  const url = new URL(fetchEvent.request.url);
  if (url.origin !== scope.location.origin || !url.pathname.startsWith(SCOPE_PREFIX)) return;
  const relative = decodeURIComponent(url.pathname.slice(SCOPE_PREFIX.length));
  fetchEvent.respondWith(serve(relative));
});

async function serve(relative: string): Promise<Response> {
  const segments = relative.split("/").filter(Boolean);
  if (segments.length === 0) return notFound();

  const id = segments[0]!;
  let filePath = segments.slice(1).join("/");
  if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";

  const parts = filePath.split("/").filter(Boolean);
  if (parts.length === 0) return notFound();

  try {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle(WEB_ROOT);
    dir = await dir.getDirectoryHandle(id);
    for (const segment of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment);
    }
    const handle = await dir.getFileHandle(parts[parts.length - 1]!);
    const file = await handle.getFile();
    const extension = (parts[parts.length - 1]!.split(".").pop() ?? "").toLowerCase();
    return new Response(file, {
      headers: {
        "content-type": MIME[extension] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return notFound();
  }
}

function notFound(): Response {
  return new Response("404 - wallpaper asset not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
