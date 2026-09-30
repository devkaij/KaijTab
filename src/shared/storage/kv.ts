/** 极简 KV 抽象：生产走 chrome.storage，纯网页模式走 localStorage，测试走内存实现。 */

export interface KVStore {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** 是否运行在扩展环境（有 chrome.storage）——纯网页/PWA 模式下为 false */
export function isExtensionContext(): boolean {
  const api = (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome;
  return Boolean(api?.storage?.local);
}

/** 扩展能力探测（bookmarks / history / permissions / action …） */
export function hasExtensionApi(api: "bookmarks" | "history" | "permissions" | "tabs"): boolean {
  const chromeApi = (globalThis as { chrome?: Record<string, unknown> }).chrome;
  return Boolean(chromeApi?.[api]);
}

export function chromeLocal(): KVStore {
  return {
    get: (keys) => chrome.storage.local.get(keys ?? null),
    set: (items) => chrome.storage.local.set(items),
    remove: (keys) => chrome.storage.local.remove(keys),
  };
}

export function chromeSync(): KVStore {
  return {
    get: (keys) => chrome.storage.sync.get(keys ?? null),
    set: (items) => chrome.storage.sync.set(items),
    remove: (keys) => chrome.storage.sync.remove(keys),
  };
}

const WEB_PREFIX = "kaijtab:";

/** 纯网页模式：用 localStorage 模拟 chrome.storage 语义（够用：状态 JSON 很小，壁纸在 OPFS） */
export function localStorageStore(): KVStore {
  return {
    async get(keys) {
      if (keys == null) {
        const out: Record<string, unknown> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i);
          if (!rawKey?.startsWith(WEB_PREFIX)) continue;
          try {
            out[rawKey.slice(WEB_PREFIX.length)] = JSON.parse(localStorage.getItem(rawKey) ?? "null");
          } catch {
            // 忽略坏数据
          }
        }
        return out;
      }
      const list = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of list) {
        const raw = localStorage.getItem(WEB_PREFIX + key);
        if (raw == null) continue;
        try {
          out[key] = JSON.parse(raw);
        } catch {
          // 忽略坏数据
        }
      }
      return out;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        localStorage.setItem(WEB_PREFIX + key, JSON.stringify(value));
      }
    },
    async remove(keys) {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const key of list) localStorage.removeItem(WEB_PREFIX + key);
    },
  };
}

/** 默认本地存储：自动适配扩展 / 网页 */
export function defaultLocalStore(): KVStore {
  return isExtensionContext() ? chromeLocal() : localStorageStore();
}

/** 同步存储：网页模式没有同步通道，退化为内存（写入即丢弃） */
export function defaultSyncStore(): KVStore {
  return isExtensionContext() ? chromeSync() : memoryStore();
}

export function memoryStore(initial: Record<string, unknown> = {}): KVStore & {
  dump(): Record<string, unknown>;
} {
  let data: Record<string, unknown> = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...data };
      const list = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (k in data) out[k] = data[k];
      }
      return out;
    },
    async set(items) {
      data = { ...data, ...items };
    },
    async remove(keys) {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const k of list) delete data[k];
    },
    dump() {
      return { ...data };
    },
  };
}
