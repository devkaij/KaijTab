import { describe, expect, it } from "vitest";
import {
  clamp01,
  clampToViewport,
  instanceRect,
  rectsIntersect,
  toNormalized,
  toViewportPoint,
} from "@/newtab/canvas/geometry";
import type { WidgetInstance } from "@/shared/types";

describe("坐标换算", () => {
  it("归一化 → 视口像素", () => {
    expect(toViewportPoint(0.5, 0.25, { w: 1000, h: 800 })).toEqual({ x: 500, y: 200 });
  });

  it("视口像素 → 归一化并夹在 0~1", () => {
    expect(toNormalized(500, 200, { w: 1000, h: 800 })).toEqual({ x: 0.5, y: 0.25 });
    expect(toNormalized(-40, 900, { w: 1000, h: 800 })).toEqual({ x: 0, y: 1 });
  });

  it("clamp01 边界", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });
});

describe("clampToViewport", () => {
  const viewport = { w: 1000, h: 800 };

  it("视口内不动", () => {
    const r = clampToViewport(100, 100, { w: 200, h: 100 }, viewport);
    expect(r).toEqual({ x: 100, y: 100, clampedX: false, clampedY: false });
  });

  it("右下溢出时贴右下边", () => {
    const r = clampToViewport(900, 750, { w: 200, h: 100 }, viewport);
    expect(r).toEqual({ x: 800, y: 700, clampedX: true, clampedY: true });
  });

  it("负坐标贴左上边", () => {
    const r = clampToViewport(-50, -20, { w: 200, h: 100 }, viewport, 8);
    expect(r).toEqual({ x: 8, y: 8, clampedX: true, clampedY: true });
  });

  it("元件比视口还大时贴左上、允许溢出", () => {
    const r = clampToViewport(300, 300, { w: 1600, h: 1200 }, viewport);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.clampedX).toBe(true);
    expect(r.clampedY).toBe(true);
  });
});

describe("instanceRect", () => {
  it("按归一化坐标算出钳制后的渲染矩形，尺寸不变", () => {
    const item: WidgetInstance = {
      id: "inst_1",
      type: "core:search",
      x: 0.95,
      y: 0.5,
      w: 200,
      h: 100,
      z: 0,
      props: {},
    };
    const rect = instanceRect(item, { w: 1000, h: 800 });
    expect(rect).toEqual({ x: 800, y: 400, w: 200, h: 100 });
  });
});

describe("rectsIntersect", () => {
  it("相交判断与 gap 扩展", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectsIntersect(a, { x: 150, y: 0, w: 100, h: 100 })).toBe(false);
    expect(rectsIntersect(a, { x: 150, y: 0, w: 100, h: 100 }, 60)).toBe(true);
    expect(rectsIntersect(a, { x: 99, y: 99, w: 10, h: 10 })).toBe(true);
  });
});
