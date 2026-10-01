import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { commit, state } from "@/newtab/store";
import type { SearchEngine } from "@/shared/types";
import { gatherSuggestions, type Suggestion } from "./suggestions";

const ENGINES: Record<SearchEngine, { name: string; url: (q: string) => string }> = {
  bing: { name: "Bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  baidu: { name: "百度", url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  google: { name: "Google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
};

export const ENGINE_LIST: SearchEngine[] = ["bing", "baidu", "google"];

type Panel = { kind: "engine" } | { kind: "suggest"; index: number } | null;

interface Anchor {
  left: number;
  top: number;
  width: number;
}

function looksLikeUrl(value: string): boolean {
  return /^[^\s]+\.[^\s]{2,}/.test(value) && !value.includes(" ");
}

function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function Search({ instanceId }: { instanceId: string; props: Record<string, unknown> }) {
  const [value, setValue] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HTMLButtonElement>(null);

  const engine = state.value.settings.searchEngine;
  const engineInfo = ENGINES[engine];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 输入防抖取建议（历史 + 书签）
  useEffect(() => {
    const text = value.trim();
    if (!text) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void gatherSuggestions(text).then((items) => {
        if (!cancelled) setSuggestions(items);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  // 窗口尺寸变化时关闭浮层（坐标会失效）
  useEffect(() => {
    if (!panel) return;
    const close = () => setPanel(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [panel]);

  const openPanel = (kind: "engine" | "suggest") => {
    const el = kind === "engine" ? engineRef.current : boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      left: rect.left,
      top: rect.bottom + 6,
      width: kind === "suggest" ? Math.max(280, rect.width) : 0,
    });
    setPanel(kind === "engine" ? { kind } : { kind: "suggest", index: -1 });
  };

  const closePanel = () => setPanel(null);

  const submit = (text = value) => {
    const query = text.trim();
    if (!query) return;
    if (looksLikeUrl(query)) {
      window.location.href = normalizeUrl(query);
    } else {
      window.location.href = engineInfo.url(query);
    }
  };

  const openSuggestion = (item: Suggestion) => {
    window.location.href = item.url;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === "Enter") {
      e.preventDefault();
      const index = panel?.kind === "suggest" ? panel.index : -1;
      if (index >= 0 && index < suggestions.length) {
        openSuggestion(suggestions[index]!);
        return;
      }
      submit();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const current = panel?.kind === "suggest" ? panel.index : -1;
      let next = current + delta;
      if (next < -1) next = suggestions.length - 1;
      if (next >= suggestions.length) next = -1;
      if (panel?.kind !== "suggest") openPanel("suggest");
      setPanel({ kind: "suggest", index: next });
      return;
    }

    if (e.key === "Escape") {
      if (panel) {
        e.preventDefault();
        closePanel();
      }
    }
  };

  return (
    <div class="kt-search" ref={boxRef} data-testid={`search-${instanceId}`}>
      <button
        ref={engineRef}
        class="kt-search-engine kt-interactive"
        onClick={() => (panel?.kind === "engine" ? closePanel() : openPanel("engine"))}
        title="切换搜索引擎"
        data-testid="engine-switch"
      >
        {engineInfo.name}
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      <input
        ref={inputRef}
        class="kt-search-input"
        type="text"
        placeholder="搜索或输入网址"
        value={value}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        enterkeyhint="search"
        data-testid="search-input"
        onFocus={() => {
          if (value.trim()) openPanel("suggest");
        }}
        onInput={(e) => {
          const next = (e.target as HTMLInputElement).value;
          setValue(next);
          if (next.trim()) openPanel("suggest");
          else closePanel();
        }}
        onKeyDown={onKeyDown}
      />

      <button
        class="kt-search-go kt-interactive"
        onClick={() => submit()}
        title="搜索"
        data-testid="search-go"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 18a8 8 0 1 1 4.9-1.7l4.4 4.4-1.4 1.4-4.4-4.4A7.96 7.96 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
          />
        </svg>
      </button>

      {/* 浮层挂在 body 上：避免被元件容器的 overflow:hidden 裁掉 */}
      {panel && anchor
        ? createPortal(
            <>
              <div
                class="kt-popover-backdrop"
                onPointerDown={() => closePanel()}
                data-testid="popover-backdrop"
              />
              <div
                class="kt-popover"
                style={{
                  left: `${anchor.left}px`,
                  top: `${anchor.top}px`,
                  ...(anchor.width ? { minWidth: `${anchor.width}px` } : {}),
                }}
                data-testid={panel.kind === "engine" ? "engine-menu" : "suggest-menu"}
              >
                {panel.kind === "engine" ? (
                  ENGINE_LIST.map((key) => (
                    <button
                      key={key}
                      class={`kt-menu-item ${key === engine ? "kt-menu-item-active" : ""}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        commit((s) => ({ ...s, settings: { ...s.settings, searchEngine: key } }));
                        closePanel();
                        inputRef.current?.focus();
                      }}
                    >
                      {ENGINES[key].name}
                    </button>
                  ))
                ) : (
                  <>
                    <button
                      class={`kt-suggest-row ${panel.index === -1 ? "kt-suggest-active" : ""}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        submit();
                      }}
                      data-testid="suggest-search"
                    >
                      <span class="kt-suggest-icon">
                        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M10 18a8 8 0 1 1 4.9-1.7l4.4 4.4-1.4 1.4-4.4-4.4A7.96 7.96 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
                          />
                        </svg>
                      </span>
                      <span class="kt-suggest-info">
                        <span class="kt-suggest-title">
                          用 {engineInfo.name} 搜索「{value.trim()}」
                        </span>
                      </span>
                    </button>

                    {suggestions.map((item, index) => (
                      <button
                        key={`${item.url}-${index}`}
                        class={`kt-suggest-row ${panel.index === index ? "kt-suggest-active" : ""}`}
                        title={item.url}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          openSuggestion(item);
                        }}
                        data-testid="suggest-item"
                      >
                        <span class="kt-suggest-icon">
                          {item.kind === "bookmark" ? "★" : "🕘"}
                        </span>
                        <span class="kt-suggest-info">
                          <span class="kt-suggest-title">{item.title}</span>
                          {item.sub ? <span class="kt-suggest-sub">{item.sub}</span> : null}
                        </span>
                      </button>
                    ))}

                    {suggestions.length === 0 ? (
                      <div class="kt-suggest-empty">没有匹配的历史或书签，回车直接搜索</div>
                    ) : null}
                  </>
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
