/** 极简 KV 抽象：生产走 chrome.storage，测试走内存实现。 */

export interface KVStore {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
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
