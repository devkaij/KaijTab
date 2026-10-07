import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps, ModuleRuntime } from "@/newtab/module-host/types";
import { IconProbe } from "@/shared/ui/IconProbe";
import { AiConfigForm } from "@/newtab/core/ai/AiConfigForm";
import { isThinkingFallback, readAiConfig } from "@/newtab/core/ai/config";
import { state } from "@/newtab/store";
import {
  buildBrowsingContext,
  buildUserPrompt,
  formatRelative,
  HISTORY_LOOKBACK_MS,
  parseRecommendations,
  SYSTEM_PROMPT,
  type BrowsingContext,
  type Recommendation,
} from "./logic";
import "./ai-recommend.css";

interface Cache {
  at: number;
  items: Recommendation[];
}

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  out: chrome.bookmarks.BookmarkTreeNode[] = [],
  depth = 0,
): chrome.bookmarks.BookmarkTreeNode[] {
  for (const node of nodes) {
    if (node.url) out.push(node);
    else if (node.children && depth < 5) flattenBookmarks(node.children, out, depth + 1);
    if (out.length >= 300) break;
  }
  return out;
}

/** 本地聚合：浏览统计（脱敏）+ 书签 + 快捷方式 */
async function gatherContext(runtime: ModuleRuntime): Promise<BrowsingContext> {
  const now = new Date();

  let history: chrome.history.HistoryItem[] = [];
  try {
    history = await chrome.history.search({
      text: "",
      startTime: now.getTime() - HISTORY_LOOKBACK_MS,
      maxResults: 800,
    });
  } catch {
    history = [];
  }

  let bookmarks: chrome.bookmarks.BookmarkTreeNode[] = [];
  try {
    bookmarks = flattenBookmarks(await chrome.bookmarks.getTree());
  } catch {
    bookmarks = [];
  }

  return buildBrowsingContext({
    history: history.map((item) => ({
      url: item.url,
      title: item.title,
      visitCount: item.visitCount,
      lastVisitTime: item.lastVisitTime,
    })),
    bookmarks: bookmarks.map((node) => ({ title: node.title, url: node.url })),
    shortcuts: runtime.app.shortcuts(),
    now,
  });
}

export default function AiRecommend({ props, runtime }: ModuleProps) {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const [items, setItems] = useState<Recommendation[]>(
    () => runtime.data.get<Cache>("cache")?.items ?? [],
  );
  const [cachedAt, setCachedAt] = useState<number>(
    () => runtime.data.get<Cache>("cache")?.at ?? 0,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [configVersion, setConfigVersion] = useState(0);
  const [editingSettings, setEditingSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const count =
    typeof props.count === "number" && props.count > 0 ? Math.min(8, props.count) : 5;
  const config = readAiConfig(state.value);
  const configured = runtimeRef.current.ai.configured();
  void configVersion;

  const refresh = useCallback(
    async (force: boolean) => {
      void force; // 现在每次打开新标签页都重新生成，force 仅用于语义表达
      if (!runtimeRef.current.ai.configured()) return;

      // 中止上一次未完成的请求（避免切换/关闭后还有悬挂请求）
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setError(null);
      try {
        const context = await gatherContext(runtimeRef.current);
        const content = await runtimeRef.current.ai.chat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(context, count) },
          ],
          { maxTokens: 600, temperature: 0.5, signal: controller.signal },
        );

        const parsed = parseRecommendations(content);
        if (parsed.length === 0) throw new Error("模型没有返回可用的推荐，换个模型或稍后重试");

        // 元件可能已经被删掉：此时不写缓存，避免留下垃圾数据
        if (!runtimeRef.current.app.alive()) return;

        const next: Cache = { at: Date.now(), items: parsed };
        runtimeRef.current.data.set("cache", next);
        setItems(parsed);
        setCachedAt(next.at);
        setStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = String((err as Error).message ?? err);
        setError(message);
        setStatus("error");
      }
    },
    [count],
  );

  // 每次打开新标签页都重新生成（缓存只作为失败时的兜底展示）
  useEffect(() => {
    if (configured) void refresh(true);
    return () => abortRef.current?.abort();
  }, [configured, refresh]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(ticker);
  }, []);

  const showPreview = async () => {
    try {
      const context = await gatherContext(runtimeRef.current);
      setPreview(JSON.stringify(context, null, 2));
    } catch (err) {
      setPreview(`生成预览失败：${String((err as Error).message ?? err)}`);
    }
  };

  if (!configured || editingSettings) {
    return (
      <div class="kt-ai" data-testid="ai-recommend-setup">
        <div class="kt-ai-head">
          <span class="kt-ai-title">AI 推荐 · 接入你的接口</span>
        </div>
        <AiConfigForm
          onSaved={() => {
            setEditingSettings(false);
            setConfigVersion((v) => v + 1);
            void refresh(true);
          }}
          hint="每次打开新标签页都会重新生成；发送前已在本地聚合脱敏（只保留域名统计与少量标题，查询串全部剥离），默认请求低思考档位以加快输出（接口不支持时自动降级）。配置为全应用共享（热榜翻译也用这一份）。"
        >
          <button class="kt-ai-btn" onClick={() => void showPreview()} data-testid="ai-preview">
            预览将发送的数据
          </button>
          {configured ? (
            <button class="kt-ai-btn" onClick={() => setEditingSettings(false)}>
              取消
            </button>
          ) : null}
        </AiConfigForm>
        {preview ? (
          <pre class="kt-ai-preview" data-testid="ai-preview-json">
            {preview}
          </pre>
        ) : null}
      </div>
    );
  }

  return (
    <div class="kt-ai" data-testid="ai-recommend">
      <div class="kt-ai-head">
        <span class="kt-ai-title">AI 推荐</span>
        <span class="kt-ai-meta">
          {status === "loading"
            ? "正在生成…"
            : cachedAt
              ? `${formatRelative(cachedAt, now)} · ${config.model}`
              : config.model}
          {isThinkingFallback(state.value) ? " · 已降级" : ""}
        </span>
        <button
          class="kt-ai-icon-btn"
          title="刷新推荐"
          onClick={() => void refresh(true)}
          data-testid="ai-refresh"
        >
          ⟳
        </button>
        <button
          class="kt-ai-icon-btn"
          title="接口设置"
          onClick={() => setEditingSettings(true)}
          data-testid="ai-settings"
        >
          ⚙
        </button>
      </div>

      <div class="kt-ai-list">
        {status === "loading" && items.length === 0
          ? Array.from({ length: 3 }, (_, i) => <div class="kt-ai-skeleton" key={i} />)
          : null}

        {items.map((item) => (
          <a
            class="kt-ai-row"
            key={`${item.url}-${item.title}`}
            href={item.url}
            title={item.reason || item.url}
            data-testid="ai-item"
          >
            <span class="kt-ai-icon">
              <IconProbe url={item.url} letter={item.title} letterClassName="kt-ai-letter" />
            </span>
            <span class="kt-ai-info">
              <span class="kt-ai-item-title">{item.title}</span>
              {item.reason ? <span class="kt-ai-reason">{item.reason}</span> : null}
            </span>
          </a>
        ))}

        {status !== "loading" && items.length === 0 && !error ? (
          <p class="kt-ai-note">还没有推荐，点右上角 ⟳ 生成一条。</p>
        ) : null}
      </div>

      {error ? (
        <div class="kt-ai-error" data-testid="ai-error">
          <span>{error}</span>
          <button class="kt-ai-btn" onClick={() => void refresh(true)}>
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
