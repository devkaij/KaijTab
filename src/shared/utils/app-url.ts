/**
 * 资源 URL 解析：扩展环境用 chrome.runtime.getURL，纯网页（PWA）模式用页面相对路径。
 * 这样同一份构建产物既能当扩展，也能直接部署成静态站点。
 */
export function appUrl(path: string): string {
  const chromeApi = (
    globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }
  ).chrome;
  if (chromeApi?.runtime?.getURL) return chromeApi.runtime.getURL(path);
  const base = typeof document === "undefined" ? "http://localhost/" : document.baseURI;
  return new URL(path.replace(/^\//, ""), base).toString();
}

export function isExtensionRuntime(): boolean {
  const api = (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome;
  return Boolean(api?.storage?.local);
}

/** 纯网页模式：注册 PWA 用的 Service Worker（扩展环境不注册，避免干扰） */
export function registerAppServiceWorker(): void {
  if (isExtensionRuntime()) return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("./app-sw.js", { scope: "./" }).catch(() => undefined);
}
