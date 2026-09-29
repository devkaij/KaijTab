/** 网站导航图标摆放的纯逻辑：位置样式换算、新图标落点。 */
import type { Shortcut } from "@/shared/types";

export interface Pos {
  x: number;
  y: number;
}

/** 新图标默认往下错开一行（比例值，随元件高度缩放） */
export const DEFAULT_TILE_STEP_Y = 0.24;

/** 归一化位置 → 绝对定位样式（百分比，元件缩放时按比例跟随） */
export function styleFromPos(pos: Pos | undefined): { left: string; top: string } | undefined {
  if (!pos) return undefined;
  return { left: `${pos.x * 100}%`, top: `${pos.y * 100}%` };
}

/** 是否处于自由摆放模式：任意一个图标有位置即是 */
export function isFreeMode(items: Array<Pick<Shortcut, "pos">>): boolean {
  return items.some((item) => item.pos != null);
}

/**
 * 新增图标时的落点：
 * - 没进入自由模式 → 返回 undefined（继续走自动网格）
 * - 已进入自由模式 → 放在现有图标的下方一行处，避免与网格流混排
 */
export function nextFreePos(items: Array<Pick<Shortcut, "pos">>): Pos | undefined {
  const positioned = items.filter((item): item is { pos: Pos } => item.pos != null);
  if (positioned.length === 0) return undefined;
  const maxY = Math.max(...positioned.map((item) => item.pos.y));
  return { x: 0, y: Math.min(0.95, maxY + DEFAULT_TILE_STEP_Y) };
}
