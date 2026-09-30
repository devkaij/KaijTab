import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import { ensureHostPermissions, hasHostPermission } from "@/shared/utils/permissions";
import { formatWhen, mergeItems, parseFeed, parseFeedList, type FeedItem } from "./logic";
import "./rss.css";

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

interface Cache {
  at: number;
  items: FeedItem[];
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const parsed = parseFeed(xml, new URL(url).hostname);
    return parsed.items;
  } finally {
    clearTimeout(timer);
  }
}

export default function Rss({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const feeds = parseFeedList(props.feeds);
  const limit = typeof props.limit === "number" && props.limit > 0 ? Math.min(30, props.limit) : 12;

  const cached = runtime.data.get<Cache>("cache");
  const [items, setItems] = useState<FeedItem[]>(cached?.items ?? []);
  const [cachedAt, setCachedAt] = useState(cached?.at ?? 0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    async (force: boolean) => {
      if (feeds.length === 0) return;

      const missing: string[] = [];
      for (const feed of feeds) {
        if (!(await hasHostPermission(feed))) missing.push(feed);
      }
      if (missing.length > 0) {
        setNeedAuth(true);
        // 有缓存条目时不当成错误：列表照常显示，只是提示需要授权
        const cachedItems = runtimeRef.current.data.get<Cache>("cache")?.items ?? [];
        setError(cachedItems.length > 0 ? null : `有 ${missing.length} 个订阅地址还没授权访问`);
        setStatus("error");
        return;
      }
      setNeedAuth(false);

      const cache = runtimeRef.current.data.get<Cache>("cache");
      if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
        setItems(cache.items);
        setCachedAt(cache.at);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setError(null);
      const collected: FeedItem[] = [];
      const failures: string[] = [];
      for (const feed of feeds) {
        try {
          collected.push(...(await fetchFeed(feed)));
        } catch (err) {
          failures.push(`${new URL(feed).hostname}：${String((err as Error).message ?? err)}`);
        }
      }

      if (collected.length === 0) {
        setError(failures[0] ?? "没有拉到任何条目");
        setStatus("error");
        return;
      }

      const merged = mergeItems(collected, 60);
      const next: Cache = { at: Date.now(), items: merged };
      runtimeRef.current.data.set("cache", next);
      setItems(merged);
      setCachedAt(next.at);
      setStatus("idle");
      if (failures.length > 0) setError(failures.join("；"));
    },
    [feeds.join(",")],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const off = runtimeRef.current.visibility.onChange((visible) => {
      if (visible) void load(false);
    });
    const ticker = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      off();
      clearInterval(ticker);
    };
  }, [load]);

  const authorize = async () => {
    const result = await ensureHostPermissions(feeds);
    if (result.denied.length > 0) {
      setError(`未授权：${result.denied.join("、")}`);
      return;
    }
    await load(true);
  };

  if (feeds.length === 0) {
    return (
      <div class="kt-rss kt-rss-empty" data-testid="rss">
        <p class="kt-rss-hint">
          还没有订阅源。右键元件 → 设置 → 填「订阅地址」（可填多个，逗号分隔），
          保存后回到这里点「授权并加载」。
        </p>
      </div>
    );
  }

  return (
    <div class="kt-rss" data-testid="rss">
      <div class="kt-rss-head">
        <span class="kt-rss-title">{feeds.length} 个订阅源</span>
        <span class="kt-rss-meta">
          {status === "loading" ? "加载中…" : cachedAt ? formatWhen(cachedAt, now) : ""}
        </span>
        {needAuth ? (
          <button class="kt-rss-btn" onClick={() => void authorize()} data-testid="rss-authorize">
            授权并加载
          </button>
        ) : (
          <button
            class="kt-rss-refresh"
            title="刷新"
            onClick={() => void load(true)}
            data-testid="rss-refresh"
          >
            ⟳
          </button>
        )}
      </div>

      <div class="kt-rss-list">
        {items.slice(0, limit).map((item, index) => (
          <a
            class="kt-rss-row"
            key={`${item.url}-${index}`}
            href={item.url}
            title={item.summary || item.title}
            data-testid="rss-item"
          >
            <span class="kt-rss-item-title">{item.title}</span>
            <span class="kt-rss-item-meta">
              {item.source}
              {item.time ? ` · ${formatWhen(item.time, now)}` : ""}
            </span>
          </a>
        ))}
        {items.length === 0 && status === "loading"
          ? Array.from({ length: 4 }, (_, i) => <div class="kt-rss-skeleton" key={i} />)
          : null}
      </div>

      {error ? (
        <div class="kt-rss-error" data-testid="rss-error">
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
