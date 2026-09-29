/**
 * 吸附与参考线计算。纯函数：给定移动矩形 + 其他矩形 + 视口，返回位移修正与参考线。
 * 参考线坐标以视口像素表示，axis: "x" 表示一条竖直参考线（pos 为 x）。
 */
import type { Rect, Size } from "./geometry";

export interface GuideLine {
  axis: "x" | "y";
  pos: number;
  start: number;
  end: number;
}

export interface SnapActiveEdges {
  left?: boolean;
  centerX?: boolean;
  right?: boolean;
  top?: boolean;
  centerY?: boolean;
  bottom?: boolean;
}

export interface SnapOptions {
  threshold: number;
  viewport: Size;
  others: Rect[];
  /** 网格吸附：无对象吸附时的兜底，单位为 px */
  grid?: number | null;
  /** 参与吸附的边；缺省全部参与（移动场景）。缩放时只传被拖动的边。 */
  active?: SnapActiveEdges;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: GuideLine[];
}

interface Match {
  delta: number;
  line: number;
  /** 匹配到的其他矩形；viewport 线为 null */
  other: Rect | null;
  /** 产生匹配的移动边（用于网格兜底与调试） */
  edge: number;
}

const DEFAULT_ACTIVE: Required<SnapActiveEdges> = {
  left: true,
  centerX: true,
  right: true,
  top: true,
  centerY: true,
  bottom: true,
};

function pickBest(matches: Match[], threshold: number): Match | null {
  let best: Match | null = null;
  for (const m of matches) {
    if (Math.abs(m.delta) > threshold) continue;
    if (best == null || Math.abs(m.delta) < Math.abs(best.delta)) best = m;
  }
  return best;
}

export function computeSnap(rect: Rect, opts: SnapOptions): SnapResult {
  const { threshold, viewport, others, grid } = opts;
  const active = { ...DEFAULT_ACTIVE, ...(opts.active ?? {}) };

  const movingX: { key: keyof SnapActiveEdges; edge: number }[] = [];
  if (active.left) movingX.push({ key: "left", edge: rect.x });
  if (active.centerX) movingX.push({ key: "centerX", edge: rect.x + rect.w / 2 });
  if (active.right) movingX.push({ key: "right", edge: rect.x + rect.w });

  const movingY: { key: keyof SnapActiveEdges; edge: number }[] = [];
  if (active.top) movingY.push({ key: "top", edge: rect.y });
  if (active.centerY) movingY.push({ key: "centerY", edge: rect.y + rect.h / 2 });
  if (active.bottom) movingY.push({ key: "bottom", edge: rect.y + rect.h });

  const xMatches: Match[] = [];
  const yMatches: Match[] = [];

  const viewportX = [0, viewport.w / 2, viewport.w];
  for (const line of viewportX) {
    for (const m of movingX) {
      xMatches.push({ delta: line - m.edge, line, other: null, edge: m.edge });
    }
  }
  const viewportY = [0, viewport.h / 2, viewport.h];
  for (const line of viewportY) {
    for (const m of movingY) {
      yMatches.push({ delta: line - m.edge, line, other: null, edge: m.edge });
    }
  }

  for (const other of others) {
    const ox = [other.x, other.x + other.w / 2, other.x + other.w];
    for (const line of ox) {
      for (const m of movingX) {
        xMatches.push({ delta: line - m.edge, line, other, edge: m.edge });
      }
    }
    const oy = [other.y, other.y + other.h / 2, other.y + other.h];
    for (const line of oy) {
      for (const m of movingY) {
        yMatches.push({ delta: line - m.edge, line, other, edge: m.edge });
      }
    }
  }

  const bestX = pickBest(xMatches, threshold);
  const bestY = pickBest(yMatches, threshold);

  let dx = 0;
  let dy = 0;

  if (bestX) {
    dx = bestX.delta;
  } else if (grid && grid > 0 && movingX.length > 0) {
    const primary = (active.left
      ? rect.x
      : active.centerX
        ? rect.x + rect.w / 2
        : rect.x + rect.w) as number;
    dx = Math.round(primary / grid) * grid - primary;
  }

  if (bestY) {
    dy = bestY.delta;
  } else if (grid && grid > 0 && movingY.length > 0) {
    const primary = (active.top
      ? rect.y
      : active.centerY
        ? rect.y + rect.h / 2
        : rect.y + rect.h) as number;
    dy = Math.round(primary / grid) * grid - primary;
  }

  const guides: GuideLine[] = [];
  if (bestX) {
    guides.push(makeGuide("x", bestX.line, rect.y + dy, rect.h, bestX.other, viewport));
  }
  if (bestY) {
    guides.push(makeGuide("y", bestY.line, rect.x + dx, rect.w, bestY.other, viewport));
  }

  return { dx, dy, guides };
}

function makeGuide(
  axis: "x" | "y",
  pos: number,
  movingStart: number,
  movingLen: number,
  other: Rect | null,
  viewport: Size,
): GuideLine {
  if (axis === "x") {
    if (!other) return { axis, pos, start: 0, end: viewport.h };
    return {
      axis,
      pos,
      start: Math.min(movingStart, other.y),
      end: Math.max(movingStart + movingLen, other.y + other.h),
    };
  }
  if (!other) return { axis, pos, start: 0, end: viewport.w };
  return {
    axis,
    pos,
    start: Math.min(movingStart, other.x),
    end: Math.max(movingStart + movingLen, other.x + other.w),
  };
}
