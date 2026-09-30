import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps } from "@/newtab/module-host/types";
import { ensureHostPermission, hasHostPermission } from "@/shared/utils/permissions";
import { formatEventWhen, parseIcs, reviveEvents, upcomingEvents, type IcsEvent } from "./logic";
import "./calendar.css";

const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

interface Cache {
  at: number;
  events: IcsEvent[];
}

async function fetchIcs(url: string): Promise<IcsEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseIcs(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (/\.(ics|ical)$/i.test(url.pathname) || /^https?:$/.test(url.protocol)) return url.toString();
    return null;
  } catch {
    return null;
  }
}

export default function Calendar({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const url = normalizeUrl(typeof props.url === "string" ? props.url : "");
  const days = typeof props.days === "number" && props.days > 0 ? Math.min(30, props.days) : 7;
  const limit = typeof props.limit === "number" && props.limit > 0 ? Math.min(20, props.limit) : 8;

  const cached = runtime.data.get<Cache>("cache");
  const [events, setEvents] = useState<IcsEvent[]>(() => reviveEvents(cached?.events));
  const [cachedAt, setCachedAt] = useState(cached?.at ?? 0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(
    async (force: boolean) => {
      if (!url) return;

      if (!(await hasHostPermission(url))) {
        setNeedAuth(true);
        setError("还没有授权访问这个日历地址");
        setStatus("error");
        return;
      }
      setNeedAuth(false);

      const cache = runtimeRef.current.data.get<Cache>("cache");
      if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
        setEvents(reviveEvents(cache.events));
        setCachedAt(cache.at);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setError(null);
      try {
        const parsed = await fetchIcs(url);
        const next: Cache = { at: Date.now(), events: parsed };
        runtimeRef.current.data.set("cache", next);
        setEvents(parsed);
        setCachedAt(next.at);
        setStatus("idle");
      } catch (err) {
        const message = String((err as Error).message ?? err);
        setError(message.includes("abort") ? "请求超时" : message);
        setStatus("error");
      }
    },
    [url],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const off = runtimeRef.current.visibility.onChange((visible) => {
      if (visible) void load(false);
    });
    const ticker = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      off();
      clearInterval(ticker);
    };
  }, [load]);

  const authorize = async () => {
    if (!url) return;
    const result = await ensureHostPermission(url);
    if (!result.ok) {
      setError(`未授权：${result.origin ?? url}`);
      return;
    }
    await load(true);
  };

  if (!url) {
    return (
      <div class="kt-cal kt-cal-empty" data-testid="calendar">
        <p class="kt-cal-hint">
          还没有日历地址。右键元件 → 设置 → 填「ICS 地址」（公开的 .ics 链接），
          保存后回到这里点「授权并加载」。
        </p>
      </div>
    );
  }

  const upcoming = upcomingEvents(events, now, days, limit);

  return (
    <div class="kt-cal" data-testid="calendar">
      <div class="kt-cal-head">
        <span class="kt-cal-title">未来 {days} 天</span>
        <span class="kt-cal-meta">
          {status === "loading" ? "加载中…" : cachedAt ? `${upcoming.length} 个事件` : ""}
        </span>
        {needAuth ? (
          <button class="kt-cal-btn" onClick={() => void authorize()} data-testid="calendar-authorize">
            授权并加载
          </button>
        ) : (
          <button
            class="kt-cal-refresh"
            title="刷新"
            onClick={() => void load(true)}
            data-testid="calendar-refresh"
          >
            ⟳
          </button>
        )}
      </div>

      <div class="kt-cal-list">
        {upcoming.map((event) => (
          <div class="kt-cal-row" key={event.uid} data-testid="calendar-item">
            <span class="kt-cal-when">{formatEventWhen(event, now)}</span>
            <span class="kt-cal-summary">{event.summary}</span>
            {event.location ? <span class="kt-cal-where">{event.location}</span> : null}
          </div>
        ))}
        {upcoming.length === 0 && status !== "loading" ? (
          <p class="kt-cal-hint">这段时间没有事件</p>
        ) : null}
        {status === "loading" && upcoming.length === 0
          ? Array.from({ length: 3 }, (_, i) => <div class="kt-cal-skeleton" key={i} />)
          : null}
      </div>

      {error ? (
        <div class="kt-cal-error" data-testid="calendar-error">
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
