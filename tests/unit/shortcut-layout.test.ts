import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_STEP_Y,
  isFreeMode,
  nextFreePos,
  styleFromPos,
} from "@/newtab/core/shortcut-layout";

describe("styleFromPos", () => {
  it("换算成百分比定位（元件缩放时按比例跟随）", () => {
    expect(styleFromPos({ x: 0.25, y: 0.5 })).toEqual({ left: "25%", top: "50%" });
    expect(styleFromPos({ x: 0, y: 1 })).toEqual({ left: "0%", top: "100%" });
  });

  it("无位置返回 undefined（走自动网格）", () => {
    expect(styleFromPos(undefined)).toBeUndefined();
  });
});

describe("isFreeMode", () => {
  it("任意一个图标有位置即进入自由模式", () => {
    expect(isFreeMode([{}, {}])).toBe(false);
    expect(isFreeMode([{}, { pos: { x: 0, y: 0 } }])).toBe(true);
  });
});

describe("nextFreePos", () => {
  it("未进入自由模式时返回 undefined", () => {
    expect(nextFreePos([{}, {}])).toBeUndefined();
    expect(nextFreePos([])).toBeUndefined();
  });

  it("新图标落在最下方一行之后，x 归零", () => {
    const pos = nextFreePos([{ pos: { x: 0.1, y: 0.2 } }, { pos: { x: 0.5, y: 0.44 } }])!;
    expect(pos.x).toBe(0);
    expect(pos.y).toBeCloseTo(0.44 + DEFAULT_TILE_STEP_Y, 5);
  });

  it("y 有上限，避免跑出元件外", () => {
    expect(nextFreePos([{ pos: { x: 0, y: 0.9 } }])!.y).toBeLessThanOrEqual(0.95);
  });
});
