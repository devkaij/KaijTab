import { describe, expect, it } from "vitest";
import {
  formatZoneDate,
  formatZoneTime,
  isValidZone,
  MAX_ZONES,
  parseZoneList,
  zoneDateKey,
  zoneLabel,
  zoneOffsetLabel,
} from "@/modules/world-clock/logic";

describe("parseZoneList", () => {
  it("逗号/空格分隔、去重、过滤非法项", () => {
    const zones = parseZoneList("Asia/Shanghai, Europe/London  Asia/Shanghai, Not/AZone");
    expect(zones).toEqual(["Asia/Shanghai", "Europe/London"]);
  });

  it("限量并容忍非字符串", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Zone/Test${i}`);
    // Zone/TestX 不是合法时区 → 会被过滤；这里验证上限逻辑用的是合法时区
    expect(parseZoneList(many)).toEqual([]);
    expect(parseZoneList(undefined)).toEqual([]);
    const valid = ["Asia/Shanghai", "Asia/Tokyo", "Europe/London", "America/New_York", "Europe/Paris", "Asia/Singapore", "Australia/Sydney"];
    expect(parseZoneList(valid.join(","))).toHaveLength(MAX_ZONES);
  });
});

describe("时区展示", () => {
  const instant = new Date(Date.UTC(2026, 8, 30, 0, 0, 0));

  it("城市名来自时区末段", () => {
    expect(zoneLabel("America/New_York")).toBe("New York");
    expect(zoneLabel("Asia/Shanghai")).toBe("Shanghai");
    expect(zoneLabel("UTC")).toBe("UTC");
  });

  it("同一瞬间在不同时区显示不同时间", () => {
    expect(formatZoneTime(instant, "Asia/Shanghai", false)).toBe("08:00");
    expect(formatZoneTime(instant, "America/New_York", false)).toBe("20:00");
    expect(formatZoneTime(instant, "UTC", false)).toBe("00:00");
  });

  it("偏移量文案", () => {
    expect(zoneOffsetLabel(instant, "Asia/Shanghai")).toBe("UTC+8");
    expect(zoneOffsetLabel(instant, "UTC")).toContain("UTC");
  });

  it("跨日时日期键不同", () => {
    expect(zoneDateKey(instant, "Asia/Shanghai")).toBe("2026-09-30");
    expect(zoneDateKey(instant, "America/New_York")).toBe("2026-09-29");
    expect(formatZoneDate(instant, "Asia/Shanghai")).toContain("9");
  });

  it("非法时区不抛异常", () => {
    expect(isValidZone("Not/AZone")).toBe(false);
    expect(formatZoneTime(instant, "Not/AZone")).toBe("--:--");
    expect(formatZoneDate(instant, "Not/AZone")).toBe("");
  });
});
