/**
 * 纯网页 / PWA 模式的应用 Service Worker：
 * 只做"网络优先 + 离线回退缓存"，让浏览器认为可安装，并在断网时还能打开外壳。
 * （/whost/ 下的网页壁纸请求由 whost-sw.js 自己的 scope 接管，这里直接跳过。）
 */
const SHELL_CACHE = "kaijtab-shell-v1";

const scope = globalThis as unknown as {
  addEventListener(type: string, handler: (event: unknown) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
};

interface FetchEventLike {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

scope.addEventListener("install", () => {
  void scope.skipWaiting();
});

scope.addEventListener("activate", (event) => {
  (event as ExtendableEventLike).waitUntil(scope.clients.claim());
});

scope.addEventListener("fetch", (event) => {
  const fetchEvent = event as FetchEventLike;
  const request = fetchEvent.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== scope.location.origin) return;
  if (url.pathname.startsWith("/whost/")) return; // 交给虚拟文件服务

  fetchEvent.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok && fresh.type === "basic") {
          void cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response("离线：请联网后重试", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});

export {};
