/** 网站图标候选链（纯函数，便于单测；核心快捷方式与书签模块共用）。 */
import type { Shortcut } from "@/shared/types";

/**
 * 图标候选顺序：
 * 自定义图标 → 站点 /favicon.ico → /apple-touch-icon.png → /favicon.png
 * → （已授权域名时）页面 HTML 解析出的图标 → 公开图标服务（DDG / Google）→ 首字母色块。
 *
 * 说明：刻意不使用浏览器的 _favicon 接口——站点不在浏览器缓存里时它会返回一张
 * 灰色地球默认图，且无法与真实图标区分，会把"首字母"这种更有信息量的回退顶掉。
 */
export function iconCandidates(item: Pick<Shortcut, "url" | "icon">): string[] {
  const list: string[] = [];
  const custom = item.icon?.trim();
  if (custom) list.push(custom);

  try {
    const url = new URL(item.url);
    if (url.protocol === "http:" || url.protocol === "https:") {
      list.push(`${url.origin}/favicon.ico`);
      list.push(`${url.origin}/apple-touch-icon.png`);
      list.push(`${url.origin}/favicon.png`);
    }
  } catch {
    // 非法 URL：只走自定义图标与首字母
  }

  return list;
}

/**
 * 第三方公开图标服务兜底（纯 <img> 加载，不需要任何主机权限）。
 * 代价：快捷方式的域名会暴露给对应服务（只传域名，无其他数据），
 * 排在候选链倒数第二段——站点自己的路径与页面声明都失败后才使用。
 */
export function serviceIconCandidates(rawUrl: string): string[] {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const host = url.hostname;
    if (!host) return [];
    return [
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
    ];
  } catch {
    return [];
  }
}

/** 读取标签里某个属性的值（双引号/单引号/无引号都支持）。 */
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const value = m?.[2] ?? m?.[3] ?? m?.[4];
  return value ? value : undefined;
}

/** "32x32 16x16" / "any" → 最大边长；SVG 的 sizes="any" 视为可无限缩放。 */
function maxSizeOf(sizes: string | undefined): number {
  if (!sizes || /\bany\b/i.test(sizes)) return Number.MAX_SAFE_INTEGER;
  let max = 0;
  for (const m of sizes.matchAll(/(\d+)x(\d+)/gi)) {
    max = Math.max(max, Number(m[1]), Number(m[2]));
  }
  return max;
}

/**
 * 解析页面 HTML 里的图标声明，返回绝对地址（去重）：
 * apple-touch-icon（通常最大最方）→ <link rel=icon> 按 sizes 从大到小 → og:image / twitter:image。
 * 可靠性边界：用正则提取，能覆盖真实站点的 head 标签；容错优先，坏地址直接跳过。
 */
export function parseIconLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const value = raw.trim().replace(new RegExp("\\u0026amp;", "g"), "\u0026");
    if (!value || /^javascript:/i.test(value)) return;
    let abs: string;
    try {
      abs = new URL(value, baseUrl).href;
    } catch {
      return;
    }
    if (/^(https?:|data:image\/)/i.test(abs) && !out.includes(abs)) out.push(abs);
  };

  // <link rel="…">：apple-touch-icon 直接收；普通 icon 记录 sizes 稍后排序
  const sized = new Map<string, number>();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attrOf(m[0], "rel") ?? "").toLowerCase();
    // mask-icon 是单色剪影（Safari 固定标签图标），不适合当站点图标，跳过
    if (rel === "mask-icon") continue;
    const isApple = rel === "apple-touch-icon" || rel === "apple-touch-icon-precomposed";
    if (!isApple && !/(^|\s)icon(\s|$)/.test(rel)) continue;
    const href = attrOf(m[0], "href");
    if (!href) continue;
    if (rel.startsWith("apple-touch-icon")) push(href);
    else {
      const size = maxSizeOf(attrOf(m[0], "sizes"));
      sized.set(href, Math.max(sized.get(href) ?? 0, size));
    }
  }
  for (const [href] of [...sized.entries()].sort((a, b) => b[1] - a[1])) push(href);

  // <meta>：og:image / twitter:image / twitter:image:src（多为社交大图，作最后兜底）
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attrOf(m[0], "property") ?? attrOf(m[0], "name");
    if (!key) continue;
    if (/^(og:image|twitter:image)(:secure_url|:src)?$/i.test(key)) push(attrOf(m[0], "content"));
  }
  return out;
}

/** 页面抓取超时（毫秒）：超时/失败都不阻塞候选链，只是这一段没有产出 */
export const PAGE_ICON_TIMEOUT_MS = 5000;

/** 同源只抓一次：结果（含空）按 origin 缓存，新标签页重开时自然重试 */
const pageIconCache = new Map<string, Promise<string[]>>();

/**
 * 抓站点首页 HTML 并解析图标声明。需要该域名的主机权限（由调用方先确认），
 * 失败/超时/非 HTML 响应一律返回空数组，绝不抛错。
 */
export function fetchPageIcons(rawUrl: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(rawUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return Promise.resolve([]);
  } catch {
    return Promise.resolve([]);
  }
  const key = base.origin;
  const cached = pageIconCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    try {
      const res = await fetchFn(`${key}/`, {
        credentials: "omit",
        signal: AbortSignal.timeout(PAGE_ICON_TIMEOUT_MS),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || (type !== "" && !type.includes("html"))) return [];
      const html = (await res.text()).slice(0, 500_000);
      return parseIconLinks(html, `${key}/`);
    } catch {
      return [];
    }
  })();
  pageIconCache.set(key, task);
  task.catch(() => undefined); // 防 unhandled rejection
  return task;
}

/** 单个候选的加载超时（毫秒）：超时即换下一个，避免慢站点把整格卡死 */
export const ICON_LOAD_TIMEOUT_MS = 4000;
