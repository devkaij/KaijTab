/**
 * 今日热榜纯逻辑：10 个平台的公开接口 + 容错解析（国内 5 个 + 国外 5 个）。
 * 全部免鉴权、免第三方聚合服务；接口地址与字段均已实测。
 * 国外源可配合「翻译成中文」：翻译走用户自己配置的 AI 接口（见 @/newtab/core/ai）。
 */
import { allBlocks, extractTag } from "@/shared/utils/feeds";

export type HotSource =
  | "baidu"
  | "toutiao"
  | "bilibili"
  | "juejin"
  | "github"
  | "hackernews"
  | "lobsters"
  | "devto"
  | "gtrends"
  | "techmeme";

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
  /** 接口返回类型：默认 json；RSS/XML 用 text（parse 收到原始字符串） */
  format?: "json" | "text";
  /** 外文源：支持一键翻译成中文 */
  foreign?: boolean;
  buildUrl(now?: Date): string;
  parse(data: unknown): HotItem[];
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

/** 外部接口的 URL 常有尾巴（HN 偶发结尾反斜杠）：统一清掉不可见/多余的字符 */
function cleanUrl(value: unknown): string {
  return str(value).replace(/[\\\s]+$/, "");
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

/** Hacker News 首页热帖（Algolia 搜索接口，一次请求拿全字段） */
export function parseHackerNews(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(record(json).hits)) {
    const item = record(raw);
    const title = str(item.title) || str(item.story_title);
    if (!title) continue;
    const id = str(item.objectID);
    const url = cleanUrl(item.url) || (id ? `https://news.ycombinator.com/item?id=${id}` : "");
    if (!url) continue;
    const points = Number(item.points);
    const hot = Number.isFinite(points) && points > 0 ? `▲ ${points}` : undefined;
    out.push(hot ? { title, url, hot } : { title, url });
  }
  return out;
}

/** Lobsters 热门（程序员社区，score 齐全） */
export function parseLobsters(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(json)) {
    const item = record(raw);
    const title = str(item.title);
    if (!title) continue;
    const id = str(item.short_id);
    const url = cleanUrl(item.url) || (id ? `https://lobste.rs/s/${id}` : "");
    if (!url) continue;
    const score = Number(item.score);
    out.push(
      Number.isFinite(score) && score > 0 ? { title, url, hot: `▲ ${score}` } : { title, url },
    );
  }
  return out;
}

/** dev.to 热门文章（每天更新的开发者社区榜单） */
export function parseDevto(json: unknown): HotItem[] {
  const out: HotItem[] = [];
  for (const raw of asArray(json)) {
    const item = record(raw);
    const title = str(item.title);
    const url = cleanUrl(item.url);
    if (!title || !url) continue;
    const reactions = Number(item.positive_reactions_count);
    out.push(
      Number.isFinite(reactions) && reactions > 0
        ? { title, url, hot: `♥ ${reactions}` }
        : { title, url },
    );
  }
  return out;
}

/** 谷歌热搜（美区 RSS）：title + ht:approx_traffic 搜索量 */
export function parseGoogleTrends(xml: string): HotItem[] {
  const out: HotItem[] = [];
  for (const block of allBlocks(xml, "item")) {
    const title = extractTag(block, "title") ?? "";
    if (!title) continue;
    const traffic = extractTag(block, "ht:approx_traffic") ?? "";
    // 该 RSS 的 <link> 指向 feed 自己，没有价值；统一拼搜索趋势页
    const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=US`;
    out.push(traffic ? { title, url, hot: traffic } : { title, url });
  }
  return out;
}

/** Techmeme 头条（RSS）：科技新闻标题聚合 */
export function parseTechmeme(xml: string): HotItem[] {
  const out: HotItem[] = [];
  for (const block of allBlocks(xml, "item")) {
    const title = extractTag(block, "title") ?? "";
    if (!title) continue;
    const link = extractTag(block, "link") ?? "";
    out.push({ title, url: /^https?:\/\//.test(link) ? link : "https://www.techmeme.com/" });
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
  {
    id: "hackernews",
    label: "Hacker News",
    foreign: true,
    buildUrl: () => "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20",
    parse: parseHackerNews,
    note: "科技圈头条（英文，可翻译）",
  },
  {
    id: "lobsters",
    label: "Lobsters",
    foreign: true,
    buildUrl: () => "https://lobste.rs/hottest.json",
    parse: parseLobsters,
    note: "程序员社区热门（英文，可翻译）",
  },
  {
    id: "devto",
    label: "dev.to",
    foreign: true,
    buildUrl: () => "https://dev.to/api/articles?top=1&per_page=20",
    parse: parseDevto,
    note: "开发者热门文章（英文，可翻译）",
  },
  {
    id: "gtrends",
    label: "谷歌热搜 · 美区",
    foreign: true,
    format: "text",
    buildUrl: () => "https://trends.google.com/trending/rss?geo=US",
    parse: (data) => parseGoogleTrends(String(data)),
    note: "Google Trends 美国实时热搜（英文，可翻译）",
  },
  {
    id: "techmeme",
    label: "Techmeme",
    foreign: true,
    format: "text",
    buildUrl: () => "https://www.techmeme.com/feed.xml",
    parse: (data) => parseTechmeme(String(data)),
    note: "科技新闻头条聚合（英文，可翻译）",
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

// ---------- 国外源翻译成中文（走用户自己的 AI 接口，纯逻辑部分） ----------

/** 一次请求最多翻译多少条 */
export const TRANSLATE_MAX_BATCH = 20;
/** 译文缓存上限（按写入顺序裁剪最旧的） */
export const TRANSLATION_CACHE_LIMIT = 400;

export const TRANSLATE_SYSTEM_PROMPT = [
  "你是翻译引擎。用户会给你一个 JSON 字符串数组，里面是新闻/热搜标题。",
  "把每条标题翻译成简体中文：",
  "1. 只输出一个 JSON 字符串数组，长度与输入完全一致，不要输出解释或多余文字；",
  "2. 专有名词（公司、产品、人名、缩写如 AI/GPU/ChatGPT）有通行中文译名就用译名，没有就保留原文；",
  "3. 数字、型号、版本号原样保留；",
  "4. 译文简洁自然，符合中文新闻标题习惯，不要在结尾加句号。",
].join("\n");

/** 用 JSON 数组传标题：转义交给 JSON，模型最容易原样对齐 */
export function buildTranslateUserPrompt(titles: string[]): string {
  return JSON.stringify(titles);
}

/** 稳定短键（FNV-1a 32 位）：用标题原文做缓存键，但键本身保持短小 */
export function translationKey(title: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < title.length; i += 1) {
    hash ^= title.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function trimFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

/**
 * 解析模型返回的译文，按输入顺序对齐（长度 = count，失败位置为空串）。
 * 容忍三种形式：[...]、{"1": "...", ...}、以及带多余说明文字的回复。
 */
export function parseTranslations(content: string, count: number): string[] {
  const out = new Array<string>(count).fill("");
  const text = trimFence(content);
  if (!text) return out;

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      const parsed: unknown = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      if (Array.isArray(parsed)) {
        parsed.forEach((value, index) => {
          if (index < count && typeof value === "string") out[index] = value.trim();
        });
        return out;
      }
    } catch {
      // 落到对象分支再试一次
    }
  }

  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try {
      const parsed: unknown = JSON.parse(text.slice(objStart, objEnd + 1));
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const index = Number.parseInt(key, 10) - 1; // 模型常用 1 基编号
          if (Number.isInteger(index) && index >= 0 && index < count && typeof value === "string") {
            out[index] = value.trim();
          }
        }
      }
    } catch {
      // 解析不了就当没有译文
    }
  }

  return out;
}

/** 缓存裁剪：只保留最近写入的 limit 条，避免本地数据无限增长 */
export function pruneTranslations(
  cache: Record<string, string>,
  limit = TRANSLATION_CACHE_LIMIT,
): Record<string, string> {
  const keys = Object.keys(cache);
  if (keys.length <= limit) return cache;
  const out: Record<string, string> = {};
  for (const key of keys.slice(keys.length - limit)) {
    const value = cache[key];
    if (value != null) out[key] = value;
  }
  return out;
}
