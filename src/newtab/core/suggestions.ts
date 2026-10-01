/** 搜索建议：本地历史 + 书签（纯排序逻辑可单测，取数走 chrome API）。 */

export interface Suggestion {
  kind: "history" | "bookmark" | "search";
  title: string;
  url: string;
  /** 次要说明（域名/访问次数等） */
  sub?: string;
}

export interface SuggestionSource {
  title: string;
  url: string;
  visitCount?: number;
  lastVisitTime?: number;
  kind: "history" | "bookmark";
}

export const MAX_SUGGESTIONS = 8;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 前缀命中 > 子串命中，标题权重略高于 URL；再叠加访问次数与新鲜度 */
export function scoreSuggestion(item: SuggestionSource, query: string, now = Date.now()): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();

  let score = 0;
  if (title.startsWith(q)) score += 120;
  else if (title.includes(q)) score += 70;
  if (url.startsWith(q)) score += 90;
  else if (url.includes(q)) score += 50;
  if (score === 0) return 0;

  const visits = item.visitCount ?? 0;
  score += Math.min(40, Math.log10(visits + 1) * 20);

  if (item.lastVisitTime) {
    const days = (now - item.lastVisitTime) / 86_400_000;
    if (days < 1) score += 25;
    else if (days < 7) score += 15;
    else if (days < 30) score += 8;
  }
  if (item.kind === "bookmark") score += 12;
  return score;
}

/** 过滤掉 0 分项、按 URL 去重、按得分排序后截断 */
export function rankSuggestions(
  items: SuggestionSource[],
  query: string,
  limit = MAX_SUGGESTIONS,
  now = Date.now(),
): Suggestion[] {
  const scored = items
    .map((item) => ({ item, score: scoreSuggestion(item, query, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const { item } of scored) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push({
      kind: item.kind,
      title: item.title || domainOf(item.url),
      url: item.url,
      sub: item.kind === "history" && item.visitCount ? `${domainOf(item.url)} · 访问 ${item.visitCount} 次` : domainOf(item.url),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 书签树 → 扁平列表（取前 N 个，避免大书签库拖慢输入） */
export function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  out: SuggestionSource[] = [],
  depth = 0,
): SuggestionSource[] {
  for (const node of nodes) {
    if (node.url) {
      out.push({ title: node.title, url: node.url, kind: "bookmark" });
    } else if (node.children && depth < 4) {
      flattenBookmarks(node.children, out, depth + 1);
    }
    if (out.length >= 400) break;
  }
  return out;
}

let bookmarkCache: { at: number; items: SuggestionSource[] } | null = null;

async function getBookmarks(): Promise<SuggestionSource[]> {
  if (bookmarkCache && Date.now() - bookmarkCache.at < 5 * 60_000) return bookmarkCache.items;
  try {
    const tree = await chrome.bookmarks.getTree();
    const items = flattenBookmarks(tree);
    bookmarkCache = { at: Date.now(), items };
    return items;
  } catch {
    return [];
  }
}

export interface GatherOptions {
  limit?: number;
  now?: number;
}

/** 取浏览历史 + 书签，合并排序成建议列表 */
export async function gatherSuggestions(
  query: string,
  options: GatherOptions = {},
): Promise<Suggestion[]> {
  const text = query.trim();
  if (text.length < 1) return [];
  const limit = options.limit ?? MAX_SUGGESTIONS;

  const sources: SuggestionSource[] = [];

  try {
    const history = await chrome.history.search({ text, maxResults: 12, startTime: 0 });
    for (const item of history) {
      if (!item.url || !/^https?:/i.test(item.url)) continue;
      sources.push({
        title: item.title || "",
        url: item.url,
        visitCount: item.visitCount ?? 0,
        lastVisitTime: item.lastVisitTime ?? 0,
        kind: "history",
      });
    }
  } catch {
    // 没有 history 权限时静默降级为只查书签
  }

  const bookmarks = await getBookmarks();
  for (const item of bookmarks) {
    if (item.title.toLowerCase().includes(text.toLowerCase()) || item.url.toLowerCase().includes(text.toLowerCase())) {
      sources.push(item);
    }
  }

  return rankSuggestions(sources, text, limit, options.now ?? Date.now());
}
