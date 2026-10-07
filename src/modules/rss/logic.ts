/** RSS / Atom 订阅纯逻辑：订阅地址解析、XML 提取、条目归一化。 */
import { cleanText, decodeEntities, extractTag, rawBlock } from "@/shared/utils/feeds";

export { cleanText, decodeEntities, extractTag, rawBlock };

export interface FeedItem {
  title: string;
  url: string;
  /** 发布时间（毫秒时间戳），取不到则为 0 */
  time: number;
  source: string;
  summary?: string;
}

export const MAX_FEEDS = 5;
export const MAX_ITEMS_PER_FEED = 20;

/** 逗号/换行/空格分隔 → 去重、补全协议、限量 */
export function parseFeedList(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const urls = text
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => (/^https?:\/\//i.test(item) ? item : `https://${item}`))
    .filter((item) => {
      try {
        const url = new URL(item);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        // 主机名做基本校验：只允许字母数字与 .-，且要么是 localhost 要么带点
        const host = url.hostname;
        if (!/^[a-z0-9.-]+$/i.test(host)) return false;
        return host === "localhost" || host.includes(".");
      } catch {
        return false;
      }
    });
  return [...new Set(urls)].slice(0, MAX_FEEDS);
}

/** Atom 的 link 是自闭合标签，取 rel="alternate" 或第一个 href */
export function extractAtomLink(entry: string): string | null {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)];
  let fallback: string | null = null;
  for (const link of links) {
    const attrs = link[1] ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (!rel || rel === "alternate") return decodeEntities(href.trim());
    fallback = fallback ?? decodeEntities(href.trim());
  }
  return fallback;
}

function toTime(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

/**
 * 解析 RSS 2.0 / Atom。
 * 用容错提取而不是严格 XML 解析：订阅源格式五花八门，能取到标题+链接+时间就够用。
 */
export function parseFeed(xml: string, fallbackTitle = "订阅源"): ParsedFeed {
  const channel = rawBlock(xml, "channel");
  const channelTitle =
    (channel != null ? extractTag(channel, "title") : null) ?? extractTag(xml, "title") ?? fallbackTitle;

  const items: FeedItem[] = [];
  const isAtom = /<entry[\s>]/i.test(xml);
  const blockPattern = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(blockPattern)) {
    const block = match[1] ?? "";
    const title = extractTag(block, "title") ?? "(无标题)";
    const url = isAtom ? extractAtomLink(block) : extractTag(block, "link");
    if (!url) continue;
    const time = isAtom
      ? toTime(extractTag(block, "updated") ?? extractTag(block, "published"))
      : toTime(extractTag(block, "pubDate") ?? extractTag(block, "dc:date"));
    const summaryRaw = isAtom
      ? (extractTag(block, "summary") ?? extractTag(block, "content"))
      : (extractTag(block, "description") ?? extractTag(block, "content:encoded"));
    const summary = summaryRaw ? summaryRaw.slice(0, 140) : undefined;
    items.push({
      title,
      url,
      time,
      source: channelTitle,
      ...(summary ? { summary } : {}),
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }

  return { title: channelTitle, items };
}

/** 合并多个订阅源的条目：按时间倒序，无时间的排后面 */
export function mergeItems(items: FeedItem[], limit: number): FeedItem[] {
  return [...items]
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, limit);
}

export function formatWhen(time: number, now: number): string {
  if (!time) return "";
  const diff = now - time;
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(time).toLocaleDateString("zh-CN");
}
