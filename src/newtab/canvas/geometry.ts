/** 画布几何：归一化坐标 ↔ 视口像素、溢出钳制。全部纯函数。 */
import type { WidgetInstance } from "@/shared/types";

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 归一化坐标 → 视口像素 */
export function toViewportPoint(nx: number, ny: number, viewport: Size): Point {
  return { x: nx * viewport.w, y: ny * viewport.h };
}

/** 视口像素 → 归一化坐标（夹在 0~1） */
export function toNormalized(px: number, py: number, viewport: Size): Point {
  const x = viewport.w > 0 ? px / viewport.w : 0;
  const y = viewport.h > 0 ? py / viewport.h : 0;
  return { x: clamp01(x), y: clamp01(y) };
}

export interface ClampedPos extends Point {
  clampedX: boolean;
  clampedY: boolean;
}

/**
 * 溢出钳制：尽量把元件完整留在视口内；视口装不下时贴左上允许向右下溢出。
 * 只影响渲染，不回写存储——窗口恢复后元件自动回到原位置。
 */
export function clampToViewport(
  px: number,
  py: number,
  size: Size,
  viewport: Size,
  margin = 0,
): ClampedPos {
  const maxX = Math.max(margin, viewport.w - size.w - margin);
  const maxY = Math.max(margin, viewport.h - size.h - margin);
  const x = Math.min(Math.max(px, margin), maxX);
  const y = Math.min(Math.max(py, margin), maxY);
  return { x, y, clampedX: x !== px, clampedY: y !== py };
}

/** 元件实例 → 渲染矩形（已做溢出钳制） */
export function instanceRect(item: WidgetInstance, viewport: Size, margin = 0): Rect {
  const p = toViewportPoint(item.x, item.y, viewport);
  const c = clampToViewport(p.x, p.y, { w: item.w, h: item.h }, viewport, margin);
  return { x: c.x, y: c.y, w: item.w, h: item.h };
}

/** 两个矩形是否相交（螺旋落点探测用） */
export function rectsIntersect(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}
