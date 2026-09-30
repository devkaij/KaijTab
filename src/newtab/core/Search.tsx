import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { commit, state } from "@/newtab/store";
import type { SearchEngine } from "@/shared/types";

const ENGINES: Record<SearchEngine, { name: string; url: (q: string) => string }> = {
  bing: { name: "Bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  baidu: { name: "百度", url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  google: { name: "Google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
};

export const ENGINE_LIST: SearchEngine[] = ["bing", "baidu", "google"];

const menuOpen = signal(false);

function looksLikeUrl(value: string): boolean {
  return /^[^\s]+\.[^\s]{2,}/.test(value) && !value.includes(" ");
}

function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function Search({ instanceId }: { instanceId: string; props: Record<string, unknown> }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = state.value.settings.searchEngine;
  const engineInfo = ENGINES[engine];
  const open = menuOpen.value;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    if (looksLikeUrl(text)) {
      window.location.href = normalizeUrl(text);
    } else {
      window.location.href = engineInfo.url(text);
    }
  };

  return (
    <div class="kt-search" data-testid={`search-${instanceId}`}>
      <div class="kt-search-engine-wrap">
        <button
          class="kt-search-engine kt-interactive"
          onClick={() => (menuOpen.value = !open)}
          title="切换搜索引擎"
          data-testid="engine-switch"
        >
          {engineInfo.name}
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path fill="currentColor" d="M7 10l5 5 5-5z" />
          </svg>
        </button>
        {open ? (
          <>
            <div class="kt-search-engine-backdrop" onPointerDown={() => (menuOpen.value = false)} />
            <div class="kt-search-engine-menu" data-testid="engine-menu">
              {ENGINE_LIST.map((key) => (
                <button
                  key={key}
                  class={`kt-menu-item ${key === engine ? "kt-menu-item-active" : ""}`}
                  onClick={() => {
                    commit((s) => ({ ...s, settings: { ...s.settings, searchEngine: key } }));
                    menuOpen.value = false;
                  }}
                >
                  {ENGINES[key].name}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <input
        ref={inputRef}
        class="kt-search-input"
        type="text"
        placeholder="搜索或输入网址"
        value={value}
        spellcheck={false}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          e.stopPropagation();
        }}
        data-testid="search-input"
      />

      <button class="kt-search-go kt-interactive" onClick={submit} title="搜索" data-testid="search-go">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 18a8 8 0 1 1 4.9-1.7l4.4 4.4-1.4 1.4-4.4-4.4A7.96 7.96 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
          />
        </svg>
      </button>
    </div>
  );
}
