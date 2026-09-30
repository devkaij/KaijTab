import { afterEach, describe, expect, it } from "vitest";
import {
  defaultLocalStore,
  defaultSyncStore,
  hasExtensionApi,
  isExtensionContext,
  localStorageStore,
} from "@/shared/storage/kv";
import { appUrl, isExtensionRuntime } from "@/shared/utils/app-url";

const globals = globalThis as unknown as { chrome?: unknown; localStorage?: unknown };

afterEach(() => {
  delete globals.chrome;
  delete globals.localStorage;
});

function fakeLocalStorage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("运行环境探测", () => {
  it("没有 chrome.storage 时判定为纯网页模式", () => {
    expect(isExtensionContext()).toBe(false);
    expect(isExtensionRuntime()).toBe(false);
    expect(hasExtensionApi("bookmarks")).toBe(false);
  });

  it("有 chrome.storage 时判定为扩展模式", () => {
    globals.chrome = { storage: { local: {} }, bookmarks: {}, history: {} };
    expect(isExtensionContext()).toBe(true);
    expect(hasExtensionApi("bookmarks")).toBe(true);
    expect(hasExtensionApi("permissions")).toBe(false);
  });

  it("存储选择：扩展走 chrome，网页走 localStorage", () => {
    globals.localStorage = fakeLocalStorage();
    const webStore = defaultLocalStore();
    expect(webStore).toBeTruthy();

    globals.chrome = {
      storage: {
        local: {
          get: async () => ({ fromChrome: 1 }),
          set: async () => undefined,
          remove: async () => undefined,
        },
      },
    };
    expect(defaultLocalStore()).not.toBe(webStore);
  });

  it("网页模式没有同步通道：写入即丢弃（不同调用之间不共享）", async () => {
    await defaultSyncStore().set({ a: 1 });
    expect(await defaultSyncStore().get(null)).toEqual({});
  });
});

describe("localStorageStore", () => {
  it("读写删与 chrome.storage 语义一致", async () => {
    globals.localStorage = fakeLocalStorage();
    const store = localStorageStore();

    await store.set({ state: { schemaVersion: 1 }, other: 42 });
    expect(await store.get("state")).toEqual({ state: { schemaVersion: 1 } });
    expect(await store.get(["state", "missing"])).toEqual({ state: { schemaVersion: 1 } });
    expect(Object.keys(await store.get(null)).sort()).toEqual(["other", "state"]);

    await store.remove("other");
    expect(await store.get(null)).toEqual({ state: { schemaVersion: 1 } });
  });

  it("忽略坏数据且不污染其它键", async () => {
    const ls = fakeLocalStorage();
    ls.setItem("kaijtab:broken", "{ not json");
    ls.setItem("unrelated", "keep me");
    globals.localStorage = ls;

    const store = localStorageStore();
    expect(await store.get(null)).toEqual({});
    expect(await store.get("broken")).toEqual({});
  });
});

describe("appUrl", () => {
  it("扩展模式用 chrome.runtime.getURL", () => {
    globals.chrome = { runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` } };
    expect(appUrl("whost-sw.js")).toBe("chrome-extension://abc/whost-sw.js");
  });

  it("网页模式回退到相对路径解析（无 document 时用本地地址兜底）", () => {
    expect(appUrl("whost-sw.js")).toBe("http://localhost/whost-sw.js");
  });
});
