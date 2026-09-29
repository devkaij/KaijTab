import { describe, expect, it } from "vitest";
import { computeSnap } from "@/newtab/canvas/snapping";
import type { Rect } from "@/newtab/canvas/geometry";

const viewport = { w: 1000, h: 800 };

function snap(rect: Rect, others: Rect[], extra: Partial<Parameters<typeof computeSnap>[1]> = {}) {
  return computeSnap(rect, { threshold: 6, viewport, others, ...extra });
}

describe("computeSnap", () => {
  it("吸附到其他元件的左边并给出参考线范围", () => {
    const other: Rect = { x: 200, y: 100, w: 100, h: 100 };
    const moving: Rect = { x: 204, y: 300, w: 100, h: 100 };
    const result = snap(moving, [other]);
    expect(result.dx).toBe(-4);
    expect(result.dy).toBe(0);
    expect(result.guides).toContainEqual({ axis: "x", pos: 200, start: 100, end: 400 });
  });

  it("超出阈值不吸附、无参考线", () => {
    const other: Rect = { x: 200, y: 100, w: 100, h: 100 };
    const moving: Rect = { x: 260, y: 260, w: 100, h: 100 };
    const result = snap(moving, [other]);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([]);
  });

  it("吸附视口水平中线（全高参考线）", () => {
    const moving: Rect = { x: 452, y: 300, w: 100, h: 100 };
    const result = snap(moving, []);
    expect(result.dx).toBe(-2);
    expect(result.guides).toContainEqual({ axis: "x", pos: 500, start: 0, end: 800 });
  });

  it("多候选时取绝对位移最小者", () => {
    const other: Rect = { x: 300, y: 0, w: 100, h: 50 };
    const moving: Rect = { x: 298, y: 400, w: 110, h: 100 };
    const result = snap(moving, [other]);
    // 左边 298→300 差 +2；中线 353→350 差 -3；取 +2
    expect(result.dx).toBe(2);
  });

  it("active 过滤：只允许中线参与时不吸左边", () => {
    const other: Rect = { x: 300, y: 0, w: 100, h: 50 };
    const moving: Rect = { x: 298, y: 400, w: 110, h: 100 };
    const result = snap(moving, [other], { active: { centerX: true, left: false, right: false } });
    expect(result.dx).toBe(-3);
  });

  it("active 过滤：右边不参与时完全不动", () => {
    const other: Rect = { x: 300, y: 0, w: 100, h: 50 };
    const moving: Rect = { x: 398, y: 400, w: 10, h: 100 };
    // 右边 408 距 400 差 -8 超阈值；左边 398 距 400 差 +2，但 left 被禁用
    const result = snap(moving, [other], {
      active: { left: false, centerX: false, right: true },
    });
    expect(result.dx).toBe(0);
  });

  it("网格兜底：无对象吸附时按主边对齐网格", () => {
    const moving: Rect = { x: 103, y: 201, w: 100, h: 100 };
    const result = snap(moving, [], { grid: 8 });
    expect(result.dx).toBe(1);
    expect(result.dy).toBe(-1);
    expect(result.guides).toEqual([]);
  });

  it("对象吸附优先于网格", () => {
    const other: Rect = { x: 105, y: 0, w: 10, h: 10 };
    const moving: Rect = { x: 103, y: 400, w: 100, h: 100 };
    const result = snap(moving, [other], { grid: 8 });
    expect(result.dx).toBe(2); // 吸左边到 105，而不是网格 104
  });
});
