/** AI 推荐的纯逻辑：浏览数据聚合（脱敏）、提示词构造、响应解析。 */

export interface SiteStat {
  domain: string;
  visits: number;
  lastVisit: string;
  titles: string[];
}

export interface BrowsingContext {
  now: { iso: string; weekday: string; partOfDay: string };
  topSites: SiteStat[];
  bookmarks: Array<{ title: string; domain: string }>;
  shortcuts: string[];
}

export interface Recommendation {
  title: string;
  url: string;
  reason: string;
}

export const MAX_TOP_SITES = 24;
export const MAX_BOOKMARKS = 30;
export const MAX_SHORTCUTS = 20;
export const MAX_TITLES_PER_SITE = 3;
export const MAX_TITLE_LENGTH = 60;
export const MAX_RECOMMENDATIONS = 8;
export const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
export const HISTORY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 去掉查询串与锚点：只保留 origin + path，避免把搜索词/令牌发给模型 */
export function sanitizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

export function domainOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function truncate(text: string, max = MAX_TITLE_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function formatWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()] ?? "";
}

export function partOfDay(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "凌晨";
  if (hour < 9) return "早上";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 23) return "晚上";
  return "深夜";
}

export interface HistoryEntryLike {
  url?: string;
  title?: string;
  visitCount?: number;
  lastVisitTime?: number;
}

export function buildBrowsingContext(input: {
  history: HistoryEntryLike[];
  bookmarks: Array<{ title: string; url?: string }>;
  shortcuts: Array<{ title: string; url: string }>;
  now: Date;
}): BrowsingContext {
  const sites = new Map<string, SiteStat & { titleSet: Set<string> }>();

  for (const entry of input.history) {
    if (!entry.url) continue;
    const domain = domainOf(entry.url);
    if (!domain) continue;
    const existing = sites.get(domain) ?? {
      domain,
      visits: 0,
      lastVisit: "",
      titles: [],
      titleSet: new Set<string>(),
    };
    existing.visits += Math.max(1, entry.visitCount ?? 1);
    if (entry.lastVisitTime) {
      const iso = new Date(entry.lastVisitTime).toISOString().slice(0, 10);
      if (iso > existing.lastVisit) existing.lastVisit = iso;
    }
    if (entry.title && existing.titleSet.size < MAX_TITLES_PER_SITE) {
      const title = truncate(entry.title);
      if (title && !existing.titleSet.has(title)) {
        existing.titleSet.add(title);
        existing.titles.push(title);
      }
    }
    sites.set(domain, existing);
  }

  const topSites = [...sites.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, MAX_TOP_SITES)
    .map(({ domain, visits, lastVisit, titles }) => ({ domain, visits, lastVisit, titles }));

  const seenBookmarks = new Set<string>();
  const bookmarks: Array<{ title: string; domain: string }> = [];
  for (const item of input.bookmarks) {
    if (!item.url) continue;
    const clean = sanitizeUrl(item.url);
    const domain = domainOf(item.url);
    if (!clean || !domain || seenBookmarks.has(clean)) continue;
    seenBookmarks.add(clean);
    bookmarks.push({ title: truncate(item.title || domain, 40), domain });
    if (bookmarks.length >= MAX_BOOKMARKS) break;
  }

  const shortcuts = input.shortcuts
    .map((item) => truncate(item.title || domainOf(item.url) || "", 24))
    .filter((title) => title.length > 0)
    .slice(0, MAX_SHORTCUTS);

  return {
    now: {
      iso: input.now.toISOString(),
      weekday: formatWeekday(input.now),
      partOfDay: partOfDay(input.now),
    },
    topSites,
    bookmarks,
    shortcuts,
  };
}

export const SYSTEM_PROMPT = [
  "你是浏览器新标签页的推荐助手，要求快速输出、不要展开思考过程。",
  "根据用户近期的浏览统计、书签与快捷方式，直接给出他此刻最可能想打开的链接。",
  "规则：",
  "1. 只推荐给定数据里出现过的站点，或由这些站点衍生出的常用页面，不要编造无关站点；",
  "2. 结合当前时间（工作日/周末、时段）调整偏好；",
  "3. 理由不超过 12 个字，不要解释、不要客套；",
  '4. 只输出 JSON，格式为 {"recommendations":[{"title":"标题","url":"https://…","reason":"理由"}]}，不要输出任何其他文字。',
].join("\n");

export function buildUserPrompt(context: BrowsingContext, count: number): string {
  return [
    `请推荐 ${count} 个链接，直接给 JSON。`,
    "以下是用户的本地统计数据（已脱敏，不含查询串）：",
    JSON.stringify(context),
  ].join("\n");
}

// 接口地址/请求组装（chatCompletionsUrl、低思考字段、超时）统一在 @/newtab/core/ai/client.ts，
// 全应用共享一份配置；本文件只保留"推荐"业务自己的纯逻辑。

/** 从模型回复里解析推荐（容忍代码围栏与多余文字） */
export function parseRecommendations(content: string): Recommendation[] {
  const text = content.trim();
  if (!text) return [];

  const withoutFence = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidates: string[] = [withoutFence];
  const arrayStart = withoutFence.indexOf("[");
  const arrayEnd = withoutFence.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(withoutFence.slice(arrayStart, arrayEnd + 1));
  }
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(withoutFence.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : ((parsed as { recommendations?: unknown }).recommendations as unknown);
      if (!Array.isArray(list)) continue;

      const items: Recommendation[] = [];
      for (const raw of list) {
        const item = raw as { title?: unknown; url?: unknown; reason?: unknown };
        const url = typeof item.url === "string" ? sanitizeUrl(item.url) : null;
        if (!url) continue;
        const title =
          typeof item.title === "string" && item.title.trim()
            ? truncate(item.title, 40)
            : (domainOf(url) ?? url);
        const reason = typeof item.reason === "string" ? truncate(item.reason, 30) : "";
        items.push({ title, url, reason });
        if (items.length >= MAX_RECOMMENDATIONS) break;
      }
      if (items.length > 0) return items;
    } catch {
      // 试下一个候选片段
    }
  }
  return [];
}

export function isCacheFresh(at: number, now: number, ttl = CACHE_TTL_MS): boolean {
  return now - at >= 0 && now - at < ttl;
}

export function formatRelative(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
