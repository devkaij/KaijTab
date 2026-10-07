import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { ModuleProps } from "@/newtab/module-host/types";
import { AiConfigForm } from "@/newtab/core/ai/AiConfigForm";
import {
  buildTranslateUserPrompt,
  formatRelative,
  getSource,
  HOT_CACHE_TTL_MS,
  isFresh,
  MAX_ITEMS,
  parseTranslations,
  pruneTranslations,
  TRANSLATE_MAX_BATCH,
  TRANSLATE_SYSTEM_PROMPT,
  translationKey,
  type HotItem,
} from "./logic";
import "./hot-list.css";

const REQUEST_TIMEOUT_MS = 12_000;
const TRANSLATE_MAX_TOKENS = 1200;

interface Cache {
  at: number;
  source: string;
  items: HotItem[];
}

async function fetchSourceItems(sourceId: string, signal: AbortSignal): Promise<HotItem[]> {
  const source = getSource(sourceId);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(source.buildUrl(), {
      headers: source.headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${source.label} 返回 HTTP ${response.status}`);
    const raw: unknown = source.format === "text" ? await response.text() : await response.json();
    const items = source.parse(raw);
    if (items.length === 0) throw new Error(`${source.label} 没有返回内容（接口可能变了）`);
    return items.slice(0, MAX_ITEMS);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export default function HotList({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const sourceId = typeof props.source === "string" ? props.source : "baidu";
  const limit =
    typeof props.limit === "number" && props.limit > 0 ? Math.min(MAX_ITEMS, props.limit) : 10;
  const showRank = props.showRank !== false;
  const source = getSource(sourceId);

  const initial = runtime.data.get<Cache>("cache");
  const [items, setItems] = useState<HotItem[]>(
    initial && initial.source === sourceId ? initial.items : [],
  );
  const [cachedAt, setCachedAt] = useState(initial?.source === sourceId ? initial.at : 0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  // 「译」状态：开关按实例记在模块设置里；译文缓存在本实例的模块数据里
  const [translateOn, setTranslateOn] = useState<boolean>(
    () => runtime.settings.get<{ translate?: boolean }>().translate === true,
  );
  const [translations, setTranslations] = useState<Record<string, string>>(
    () => runtime.data.get<Record<string, string>>("translations") ?? {},
  );
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);

  // 读一次即可；配置变化后由 configVersion 触发重算
  const aiConfigured = runtime.ai.configured();

  const load = useCallback(
    async (force: boolean) => {
      if (!force) {
        const cached = runtimeRef.current.data.get<Cache>("cache");
        if (cached && cached.source === sourceId && isFresh(cached.at, Date.now(), HOT_CACHE_TTL_MS)) {
          setItems(cached.items);
          setCachedAt(cached.at);
          return;
        }
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      setError(null);
      try {
        const next = await fetchSourceItems(sourceId, controller.signal);
        if (controller.signal.aborted) return;
        const cache: Cache = { at: Date.now(), source: sourceId, items: next };
        runtimeRef.current.data.set("cache", cache);
        setItems(next);
        setCachedAt(cache.at);
        setStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = String((err as Error).message ?? err);
        setError(message.includes("abort") ? "请求超时" : message);
        setStatus("error");
      }
    },
    [sourceId],
  );

  useEffect(() => {
    void load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const off = runtimeRef.current.visibility.onChange((visible) => {
      if (visible) void load(false);
    });
    const ticker = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      off();
      clearInterval(ticker);
    };
  }, [load]);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);

  /** 把还没翻过的标题送去翻译（一次一批，结果并入缓存） */
  const ensureTranslations = useCallback(async (titles: string[]) => {
    const rt = runtimeRef.current;
    if (!rt.ai.configured()) return;
    const cache = rt.data.get<Record<string, string>>("translations") ?? {};

    const missing: string[] = [];
    for (const title of titles) {
      if (!title.trim() || cache[translationKey(title)]) continue;
      if (!missing.includes(title)) missing.push(title);
    }
    const batch = missing.slice(0, TRANSLATE_MAX_BATCH);
    if (batch.length === 0) return;

    setTranslating(true);
    setTranslateError(null);
    try {
      const content = await rt.ai.chat(
        [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: buildTranslateUserPrompt(batch) },
        ],
        { maxTokens: TRANSLATE_MAX_TOKENS, temperature: 0.2 },
      );
      const parsed = parseTranslations(content, batch.length);
      const next: Record<string, string> = { ...cache };
      let filled = 0;
      batch.forEach((title, index) => {
        const text = parsed[index];
        if (text) {
          next[translationKey(title)] = text;
          filled += 1;
        }
      });
      if (filled === 0) throw new Error("模型没有返回可用译文，换个模型或稍后再试");

      const pruned = pruneTranslations(next);
      if (!rt.app.alive()) return;
      rt.data.set("translations", pruned);
      setTranslations(pruned);
    } catch (err) {
      setTranslateError(String((err as Error).message ?? err));
    } finally {
      setTranslating(false);
    }
  }, []);

  // 打开翻译（或刷新出新条目）后自动补齐当前可见条目的译文
  useEffect(() => {
    if (!translateOn || !aiConfigured || visible.length === 0) return;
    void ensureTranslations(visible.map((item) => item.title));
  }, [translateOn, aiConfigured, configVersion, visible, ensureTranslations]);

  const toggleTranslate = () => {
    const next = !translateOn;
    if (next && !runtimeRef.current.ai.configured()) {
      setConfigOpen(true);
      return;
    }
    setTranslateOn(next);
    runtimeRef.current.settings.set({ translate: next });
  };

  const closeConfig = () => {
    setConfigOpen(false);
    setTranslateOn(false);
    runtimeRef.current.settings.set({ translate: false });
  };

  return (
    <div class="kt-hot" data-testid="hot-list">
      <div class="kt-hot-head">
        <span class="kt-hot-source">{source.label}</span>
        <span class="kt-hot-meta">
          {status === "loading" ? "刷新中…" : cachedAt ? formatRelative(cachedAt, now) : ""}
          {translating ? " · 翻译中…" : ""}
        </span>
        {source.foreign ? (
          <button
            class={`kt-hot-translate ${translateOn ? "kt-hot-translate-on" : ""}`}
            title={translateOn ? "显示原文（再点一次关闭翻译）" : "翻译成中文"}
            onClick={toggleTranslate}
            data-testid="hot-translate"
          >
            译
          </button>
        ) : null}
        <button
          class="kt-hot-refresh"
          title="刷新"
          onClick={() => void load(true)}
          data-testid="hot-refresh"
        >
          ⟳
        </button>
      </div>

      <div class="kt-hot-list">
        {visible.map((item, index) => {
          const translated = translateOn ? translations[translationKey(item.title)] : undefined;
          const showTranslation = Boolean(translated && translated !== item.title);
          return (
            <a
              class="kt-hot-row"
              key={`${item.url}-${index}`}
              href={item.url}
              title={item.desc || item.title}
              data-testid="hot-item"
            >
              {showRank ? (
                <span class={`kt-hot-rank ${index < 3 ? "kt-hot-rank-top" : ""}`}>{index + 1}</span>
              ) : null}
              <span class="kt-hot-info">
                <span class="kt-hot-title">{showTranslation ? translated : item.title}</span>
                {showTranslation ? (
                  <span class="kt-hot-orig" data-testid="hot-original">
                    {item.title}
                  </span>
                ) : null}
              </span>
              {item.hot ? <span class="kt-hot-badge">{item.hot}</span> : null}
            </a>
          );
        })}
        {visible.length === 0 && status !== "loading" && !error ? (
          <p class="kt-hot-empty">暂无内容</p>
        ) : null}
        {status === "loading" && visible.length === 0
          ? Array.from({ length: 5 }, (_, i) => <div class="kt-hot-skeleton" key={i} />)
          : null}
      </div>

      {translateError ? (
        <div class="kt-hot-error" data-testid="hot-translate-error">
          <span>翻译失败：{translateError}</span>
          <button
            class="kt-hot-retry"
            onClick={() => void ensureTranslations(visible.map((item) => item.title))}
          >
            重试
          </button>
        </div>
      ) : null}

      {error ? (
        <div class="kt-hot-error" data-testid="hot-error">
          <span>{error}</span>
          <button class="kt-hot-retry" onClick={() => void load(true)}>
            重试
          </button>
        </div>
      ) : null}

      {configOpen
        ? createPortal(
            <div
              class="kt-hot-modal"
              role="dialog"
              aria-modal="true"
              data-testid="hot-translate-modal"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeConfig();
              }}
            >
              <div class="kt-hot-modal-card">
                <div class="kt-hot-modal-head">
                  <span>翻译 · 接入你的 AI 接口</span>
                  <button class="kt-hot-modal-close" title="关闭" onClick={closeConfig}>
                    ×
                  </button>
                </div>
                <AiConfigForm
                  onSaved={() => {
                    setConfigOpen(false);
                    setConfigVersion((v) => v + 1);
                    setTranslateOn(true);
                    runtimeRef.current.settings.set({ translate: true });
                  }}
                  hint="只把当前榜单的标题文本发给你填写的接口，翻完缓存在本地（同一标题不重复请求）。这份配置全应用共用：AI 推荐也用它。"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
