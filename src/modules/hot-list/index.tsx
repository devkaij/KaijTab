import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import {
  formatRelative,
  getSource,
  HOT_CACHE_TTL_MS,
  isFresh,
  MAX_ITEMS,
  type HotItem,
} from "./logic";
import "./hot-list.css";

const REQUEST_TIMEOUT_MS = 12_000;

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
    const items = source.parse(await response.json());
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
  const limit = typeof props.limit === "number" && props.limit > 0 ? Math.min(MAX_ITEMS, props.limit) : 10;
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

  const load = useCallback(
    async (force: boolean) => {
      if (!force) {
        const cached = runtimeRef.current.data.get<Cache>("cache");
        if (
          cached &&
          cached.source === sourceId &&
          isFresh(cached.at, Date.now(), HOT_CACHE_TTL_MS)
        ) {
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

  const visible = items.slice(0, limit);

  return (
    <div class="kt-hot" data-testid="hot-list">
      <div class="kt-hot-head">
        <span class="kt-hot-source">{source.label}</span>
        <span class="kt-hot-meta">
          {status === "loading" ? "刷新中…" : cachedAt ? formatRelative(cachedAt, now) : ""}
        </span>
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
        {visible.map((item, index) => (
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
            <span class="kt-hot-title">{item.title}</span>
            {item.hot ? <span class="kt-hot-badge">{item.hot}</span> : null}
          </a>
        ))}
        {visible.length === 0 && status !== "loading" && !error ? (
          <p class="kt-hot-empty">暂无内容</p>
        ) : null}
        {status === "loading" && visible.length === 0
          ? Array.from({ length: 5 }, (_, i) => <div class="kt-hot-skeleton" key={i} />)
          : null}
      </div>

      {error ? (
        <div class="kt-hot-error" data-testid="hot-error">
          <span>{error}</span>
          <button class="kt-hot-retry" onClick={() => void load(true)}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
