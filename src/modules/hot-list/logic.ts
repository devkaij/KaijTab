/**
 * 今日热榜纯逻辑：5 个平台的公开接口 + 容错解析。
 * 全部免鉴权、免第三方聚合服务；接口地址与字段均已实测。
 */

export type HotSource = "baidu" | "bilibili" | "toutiao" | "juejin" | "github";

export interface HotItem {
  title: string;
  url: string;
  /** 热度标签（置顶/热度值/star 数） */
  hot?: string;
  desc?: string;
}

export interface HotSourceDef {
  id: HotSource;
  label: string;
  /** 需要额外请求头时给出（GitHub 用 Accept 换稳定结构） */
  headers?: Record<string, string>;
  buildUrl(now?: Date): string;
  parse(json: unknown): HotItem[];
  note?: string;
}

export const HOT_CACHE_TTL_MS = 10 * 60 * 1000;
export const MAX_ITEMS = 20;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 热度数值 → 友好文案 */
export function formatHot(value: unknown): string | undefined {
  const num = typeof value === "number" ? value : Number(str(value));
  if (!Number.isFinite(num) || num <= 0) return undefined;
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}亿`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(1)}万`;
  return String(num);
}

/** 百度热搜：data.cards[0].content[0].content[] → { word, url, isTop } */
export function parseBaidu(json: unknown): HotItem[] {
  const cards = asArray(record(record(json).data).cards);
  const wrapper = record(asArray(record(cards[0]).content)[0]);
  const out: HotItem[] = [];
  for (const raw of asArray(wrapper.content)) {
    const item = record(raw);
    const title = str(item.word) || str(item.query);
    const url = str(item.url);
    if (!title || !url) continue;
    out.push(item.isTop === true ? { title, url, hot: "置顶" } : { title, url });
  }
  return out;
}

/** B站热搜：app 接口 data.list[]，web 接口 data.trending.list[] → { keyword, show_name } */
export function parseBilibili(json: unknown): HotItem[] {
  const data = record(record(json).data);
  const rows = asArray(data.list).length > 0 ? asArray(data.list) : asArray(record(data.trending).list);
  const out: HotItem[] = [];
  for (const raw of rows) {
    const item = record(raw);
    const title = str(item.show_name) || str(item.keyword);
    if (!title) continue;
    out.push({ title, url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}` });
  }
  return out;
}

/** 今日头条热榜：data[] → { Title, Url, HotValue } */
export function parseToutiao(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(record(json).data)) {
    const item = record(raw);
    const title = str(item.Title);
    const url = str(item.Url);
    if (!title || !url) continue;
    const hot = formatHot(item.HotValue);
    out.push(hot ? { title, url, hot } : { title, url });
  }
  return out;
}

/** 掘金热榜：data[].content → { title, content_id, brief } */
export function parseJuejin(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(record(json).data)) {
    const content = record(record(raw).content);
    const title = str(content.title);
    const id = str(content.content_id);
    if (!title || !id) continue;
    const desc = str(content.brief);
    out.push({ title, url: `https://juejin.cn/post/${id}`, ...(desc ? { desc } : {}) });
  }
  return out;
}

/** GitHub 趋势：按最近 7 天新增 star 排序的仓库 */
export function parseGithub(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(record(json).items)) {
    const item = record(raw);
    const name = str(item.full_name);
    const url = str(item.html_url);
    if (!name || !url) continue;
    const desc = str(item.description);
    const stars = formatHot(item.stargazers_count);
    out.push({
      title: name,
      url,
      hot: `★ ${stars ?? "0"}`,
      ...(desc ? { desc } : {}),
    });
  }
  return out;
}

function githubTrendingUrl(now: Date): string {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: `created:>${since}`,
    sort: "stars",
    order: "desc",
    per_page: "20",
  });
  return `https://api.github.com/search/repositories?${params.toString()}`;
}

export const HOT_SOURCES: HotSourceDef[] = [
  {
    id: "baidu",
    label: "百度热搜",
    buildUrl: () => "https://top.baidu.com/api/board?platform=wise&tab=realtime",
    parse: parseBaidu,
  },
  {
    id: "toutiao",
    label: "今日头条",
    buildUrl: () => "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    parse: parseToutiao,
  },
  {
    id: "bilibili",
    label: "B站热搜",
    buildUrl: () => "https://app.bilibili.com/x/v2/search/trending/ranking?limit=20",
    parse: parseBilibili,
  },
  {
    id: "juejin",
    label: "掘金",
    buildUrl: () =>
      "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot",
    parse: parseJuejin,
  },
  {
    id: "github",
    label: "GitHub 趋势",
    headers: { accept: "application/vnd.github+json" },
    buildUrl: (now = new Date()) => githubTrendingUrl(now),
    parse: parseGithub,
    note: "最近 7 天新增 star 最多的仓库",
  },
];

export function getSource(id: string): HotSourceDef {
  return HOT_SOURCES.find((source) => source.id === id) ?? HOT_SOURCES[0]!;
}

export function isFresh(at: number, now: number, ttl = HOT_CACHE_TTL_MS): boolean {
  return now - at >= 0 && now - at < ttl;
}

export function formatRelative(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}
