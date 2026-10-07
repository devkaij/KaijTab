/** runtime 注入：模块与宿主之间唯一的接口面。 */
import { signal } from "@preact/signals";
import { commit, state } from "@/newtab/store";
import { chat } from "@/newtab/core/ai/client";
import { isAiConfigured } from "@/newtab/core/ai/config";
import type { ModuleRuntime } from "./types";

const pageVisible = signal(typeof document === "undefined" ? true : !document.hidden);

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    pageVisible.value = !document.hidden;
  });
}

export function createRuntime(moduleId: string, instanceId: string): ModuleRuntime {
  const namespace = `${moduleId}:${instanceId}`;

  return {
    data: {
      get<T>(key: string): T | null {
        const data = state.value.moduleData[namespace] as Record<string, unknown> | undefined;
        return (data?.[key] as T | undefined) ?? null;
      },
      set(key: string, value: unknown): void {
        commit(
          (s) => {
            const current = (s.moduleData[namespace] as Record<string, unknown> | undefined) ?? {};
            return { ...s, moduleData: { ...s.moduleData, [namespace]: { ...current, [key]: value } } };
          },
          { skipHistory: true, skipSync: true, flush: true },
        );
      },
      remove(key: string): void {
        commit(
          (s) => {
            const current = (s.moduleData[namespace] as Record<string, unknown> | undefined) ?? {};
            const next = { ...current };
            delete next[key];
            return { ...s, moduleData: { ...s.moduleData, [namespace]: next } };
          },
          { skipHistory: true, skipSync: true, flush: true },
        );
      },
    },

    visibility: {
      visible: () => pageVisible.value,
      onChange(callback) {
        const listener = () => callback(pageVisible.value);
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    },

    theme: {
      getVar: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
      rootClass: "kt-module",
    },

    app: {
      shortcuts: () =>
        state.value.shortcuts.items.map((item) => ({ title: item.title, url: item.url })),
      alive: () => state.value.layout.items.some((item) => item.id === instanceId),
    },

    ai: {
      configured: () => isAiConfigured(state.value),
      chat: (messages, options) => chat(messages, options),
    },

    settings: {
      get: <T extends Record<string, unknown>>() =>
        (state.value.modules.settings[moduleId] as T | undefined) ?? ({} as T),
      set(patch) {
        commit((s) => ({
          ...s,
          modules: {
            ...s.modules,
            settings: {
              ...s.modules.settings,
              [moduleId]: { ...(s.modules.settings[moduleId] as object | undefined), ...patch },
            },
          },
        }));
      },
    },

    secrets: {
      get: <T>(key: string) =>
        (state.value.localSecrets[`${moduleId}:${key}`] as T | undefined) ?? null,
      set(key: string, value: unknown): void {
        commit(
          (s) => ({
            ...s,
            localSecrets: { ...s.localSecrets, [`${moduleId}:${key}`]: value },
          }),
          { skipHistory: true, skipSync: true, flush: true },
        );
      },
      remove(key: string): void {
        commit(
          (s) => {
            const next = { ...s.localSecrets };
            delete next[`${moduleId}:${key}`];
            return { ...s, localSecrets: next };
          },
          { skipHistory: true, skipSync: true, flush: true },
        );
      },
    },
  };
}
