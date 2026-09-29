/** 网站图标候选链（纯函数，便于单测）。 */
import type { Shortcut } from "@/shared/types";

/**
 * 图标候选顺序：
 * 自定义图标 → 站点 /favicon.ico → /apple-touch-icon.png → /favicon.png → 首字母色块。
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

/** 单个候选的加载超时（毫秒）：超时即换下一个，避免慢站点把整格卡死 */
export const ICON_LOAD_TIMEOUT_MS = 4000;
