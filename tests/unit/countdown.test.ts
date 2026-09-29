import { describe, expect, it } from "vitest";
import {
  countdownInfo,
  daysBetween,
  formatDate,
  parseDateOnly,
  resolveOccurrence,
  toDayNumber,
} from "@/modules/countdown/logic";

const d = (value: string) => parseDateOnly(value)!;

describe("parseDateOnly", () => {
  it("解析合法日期", () => {
    expect(formatDate(d("2026-09-30"))).toBe("2026-09-30");
  });

  it("拒绝非法输入与溢出日期", () => {
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(parseDateOnly("2026/09/30")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly(20260930)).toBeNull();
  });
});

describe("daysBetween", () => {
  it("相邻两天差 1，跨月跨年正确", () => {
    expect(daysBetween(d("2026-09-30"), d("2026-10-01"))).toBe(1);
    expect(daysBetween(d("2026-12-31"), d("2027-01-01"))).toBe(1);
    expect(daysBetween(d("2026-09-30"), d("2026-09-30"))).toBe(0);
    expect(daysBetween(d("2027-01-01"), d("2026-12-31"))).toBe(-1);
  });

  it("跨闰年 2 月正确", () => {
    expect(daysBetween(d("2028-02-28"), d("2028-03-01"))).toBe(2);
    expect(daysBetween(d("2027-02-28"), d("2027-03-01"))).toBe(1);
  });

  it("与时间部分无关（同一天不同时刻相同）", () => {
    const a = new Date(2026, 8, 30, 0, 5);
    const b = new Date(2026, 8, 30, 23, 55);
    expect(toDayNumber(a)).toBe(toDayNumber(b));
  });
});

describe("resolveOccurrence", () => {
  const today = d("2026-09-30");

  it("不重复：原样返回", () => {
    const target = d("2020-01-01");
    expect(resolveOccurrence(target, today, false, "until")).toBe(target);
  });

  it("每年重复 · until：今年未到用今年，已过用明年", () => {
    expect(formatDate(resolveOccurrence(d("2020-12-25"), today, true, "until"))).toBe("2026-12-25");
    // 10-01 在 09-30 之后 → 今年还没到，用今年
    expect(formatDate(resolveOccurrence(d("2020-10-01"), today, true, "until"))).toBe("2026-10-01");
    // 05-20 已过 → 用明年
    expect(formatDate(resolveOccurrence(d("2020-05-20"), today, true, "until"))).toBe("2027-05-20");
  });

  it("每年重复 · since：今年已过用今年，未到用去年", () => {
    expect(formatDate(resolveOccurrence(d("2020-05-20"), today, true, "since"))).toBe("2026-05-20");
    expect(formatDate(resolveOccurrence(d("2020-12-25"), today, true, "since"))).toBe("2025-12-25");
  });

  it("2/29 在非闰年回退到 2/28", () => {
    const leap = d("2024-02-29");
    expect(formatDate(resolveOccurrence(leap, d("2026-01-15"), true, "until"))).toBe("2026-02-28");
    expect(formatDate(resolveOccurrence(leap, d("2028-01-15"), true, "until"))).toBe("2028-02-29");
  });

  it("当天命中：当天即视为本次发生", () => {
    expect(formatDate(resolveOccurrence(d("2000-09-30"), today, true, "until"))).toBe("2026-09-30");
    expect(formatDate(resolveOccurrence(d("2000-09-30"), today, true, "since"))).toBe("2026-09-30");
  });
});

describe("countdownInfo", () => {
  const today = d("2026-09-30");

  it("倒数模式：剩余天数与 今天 判定", () => {
    const info = countdownInfo(d("2027-01-01"), today, false, "until")!;
    expect(info.days).toBe(93);
    expect(info.isToday).toBe(false);

    const todayInfo = countdownInfo(today, today, false, "until")!;
    expect(todayInfo.days).toBe(0);
    expect(todayInfo.isToday).toBe(true);
  });

  it("累计模式：已过去天数", () => {
    const info = countdownInfo(d("2026-09-29"), today, false, "since")!;
    expect(info.days).toBe(1);
  });

  it("无目标日期返回 null", () => {
    expect(countdownInfo(null, today, true, "until")).toBeNull();
  });
});
