import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ModuleProps, ModuleRuntime } from "@/newtab/module-host/types";
import { IconProbe } from "@/shared/ui/IconProbe";
import {
  buildBrowsingContext,
  buildChatPayload,
  chatCompletionsUrl,
  formatRelative,
  HISTORY_LOOKBACK_MS,
  isCacheFresh,
  normalizeBaseUrl,
  parseRecommendations,
  permissionOrigin,
  type BrowsingContext,
  type Recommendation,
} from "./logic";
import "./ai-recommend.css";

interface Cache {
  at: number;
  items: Recommendation[];
}

interface FullConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45_000;

function readConfig(runtime: ModuleRuntime): FullConfig {
  const settings = runtime.settings.get<{ baseUrl?: string; model?: string }>();
  return {
    baseUrl: settings.baseUrl ?? DEFAULT_BASE,
    model: settings.model ?? DEFAULT_MODEL,
    apiKey: runtime.secrets.get<string>("apiKey") ?? "",
  };
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

  const [config, setConfig] = useState<FullConfig>(() => readConfig(runtime));
  const [draft, setDraft] = useState<FullConfig>(() => readConfig(runtime));
  const [editing, setEditing] = useState(() => !readConfig(runtime).apiKey);
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

  const count =
    typeof props.count === "number" && props.count > 0 ? Math.min(8, props.count) : 5;
  const configured = Boolean(config.apiKey && config.baseUrl && config.model);

  const refresh = useCallback(
    async (force: boolean) => {
      const current = readConfig(runtimeRef.current);
      if (!current.apiKey) return;

      const cache = runtimeRef.current.data.get<Cache>("cache");
      if (!force && cache && isCacheFresh(cache.at, Date.now())) {
        setItems(cache.items);
        setCachedAt(cache.at);
        return;
      }

      setStatus("loading");
      setError(null);
      try {
        const context = await gatherContext(runtimeRef.current);
        const response = await fetch(chatCompletionsUrl(current.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${current.apiKey}`,
          },
          body: JSON.stringify(buildChatPayload(context, count, current.model)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          const hint = response.status === 401 || response.status === 403 ? "（API Key 或权限可能不对）" : "";
          throw new Error(`接口返回 HTTP ${response.status}${hint}`);
        }
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        const parsed = parseRecommendations(content);
        if (parsed.length === 0) throw new Error("模型没有返回可用的推荐，换个模型或稍后重试");

        const next: Cache = { at: Date.now(), items: parsed };
        runtimeRef.current.data.set("cache", next);
        setItems(parsed);
        setCachedAt(next.at);
        setStatus("idle");
      } catch (err) {
        const message = String((err as Error).message ?? err);
        setError(message.includes("abort") ? "请求超时" : message);
        setStatus("error");
      }
    },
    [count],
  );

  // 打开新标签页时按需刷新（4 小时缓存）
  useEffect(() => {
    if (configured) void refresh(false);
  }, [configured, refresh]);

  useEffect(() => {
    const off = runtimeRef.current.visibility.onChange((visible) => {
      if (visible) void refresh(false);
    });
    const ticker = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      off();
      clearInterval(ticker);
    };
  }, [refresh]);

  const saveConfig = async () => {
    const baseUrl = normalizeBaseUrl(draft.baseUrl);
    const model = draft.model.trim();
    const apiKey = draft.apiKey.trim();
    if (!baseUrl || !model || !apiKey) {
      setError("接口地址、模型名、API Key 三项都要填");
      return;
    }
    const origin = permissionOrigin(baseUrl);
    if (!origin) {
      setError("接口地址不合法（示例：https://api.openai.com/v1）");
      return;
    }
    try {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        setError(`没有获得 ${origin} 的访问权限，无法调用你的接口`);
        return;
      }
    } catch (err) {
      setError(`申请权限失败：${String((err as Error).message ?? err)}`);
      return;
    }

    runtimeRef.current.settings.set({ baseUrl, model });
    runtimeRef.current.secrets.set("apiKey", apiKey);
    setConfig({ baseUrl, model, apiKey });
    setEditing(false);
    setError(null);
    void refresh(true);
  };

  const showPreview = async () => {
    try {
      const context = await gatherContext(runtimeRef.current);
      setPreview(JSON.stringify(context, null, 2));
    } catch (err) {
      setPreview(`生成预览失败：${String((err as Error).message ?? err)}`);
    }
  };

  if (editing || !configured) {
    return (
      <div class="kt-ai" data-testid="ai-recommend-setup">
        <div class="kt-ai-head">
          <span class="kt-ai-title">AI 推荐 · 接入你的接口</span>
        </div>
        <label class="kt-ai-field">
          <span>接口地址（OpenAI 兼容）</span>
          <input
            type="text"
            value={draft.baseUrl}
            placeholder={DEFAULT_BASE}
            spellcheck={false}
            data-testid="ai-base-url"
            onInput={(e) =>
              setDraft({ ...draft, baseUrl: (e.target as HTMLInputElement).value })
            }
          />
        </label>
        <label class="kt-ai-field">
          <span>模型名</span>
          <input
            type="text"
            value={draft.model}
            placeholder={DEFAULT_MODEL}
            spellcheck={false}
            data-testid="ai-model"
            onInput={(e) => setDraft({ ...draft, model: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="kt-ai-field">
          <span>API Key（只存在本地，不参与账号同步）</span>
          <input
            type="password"
            value={draft.apiKey}
            placeholder="sk-…"
            spellcheck={false}
            data-testid="ai-api-key"
            onInput={(e) => setDraft({ ...draft, apiKey: (e.target as HTMLInputElement).value })}
          />
        </label>
        <div class="kt-ai-actions">
          <button class="kt-ai-btn kt-ai-btn-primary" onClick={() => void saveConfig()} data-testid="ai-save">
            保存并授权
          </button>
          <button class="kt-ai-btn" onClick={() => void showPreview()} data-testid="ai-preview">
            预览将发送的数据
          </button>
          {configured ? (
            <button class="kt-ai-btn" onClick={() => setEditing(false)}>
              取消
            </button>
          ) : null}
        </div>
        <p class="kt-ai-note">
          数据只发往你填写的接口；发送前已在本地聚合脱敏（只保留域名统计与少量标题，
          查询串全部剥离）。保存时浏览器会弹出一次该域名的访问授权。
        </p>
        {preview ? (
          <pre class="kt-ai-preview" data-testid="ai-preview-json">
            {preview}
          </pre>
        ) : null}
        {error ? <p class="kt-ai-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div class="kt-ai" data-testid="ai-recommend">
      <div class="kt-ai-head">
        <span class="kt-ai-title">AI 推荐</span>
        <span class="kt-ai-meta">
          {status === "loading"
            ? "正在思考…"
            : cachedAt
              ? `${formatRelative(cachedAt, now)} · ${config.model}`
              : config.model}
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
          onClick={() => {
            setDraft(readConfig(runtimeRef.current));
            setEditing(true);
          }}
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
