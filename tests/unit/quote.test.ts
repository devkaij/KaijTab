import { describe, expect, it } from "vitest";
import {
  dateKey,
  hashString,
  isThursday,
  pickQuote,
  QUOTES,
  THURSDAY_LINES,
} from "@/modules/quote/logic";

describe("dateKey / hashString", () => {
  it("日期键补零", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("同一输入哈希稳定，不同输入大概率不同", () => {
    expect(hashString("2026-09-30")).toBe(hashString("2026-09-30"));
    expect(hashString("2026-09-30")).not.toBe(hashString("2026-10-01"));
  });
});

describe("pickQuote", () => {
  it("daily 模式：同一天始终同一条", () => {
    const day = new Date(2026, 8, 30);
    const first = pickQuote(day, "daily");
    const second = pickQuote(new Date(2026, 8, 30, 23, 59), "daily");
    expect(first).toEqual(second);
    expect(QUOTES).toContainEqual(first);
  });

  it("周四在 daily 模式下走彩蛋文案", () => {
    const thursday = new Date(2026, 9, 1); // 2026-10-01 是周四
    expect(isThursday(thursday)).toBe(true);
    expect(THURSDAY_LINES).toContainEqual(pickQuote(thursday, "daily"));
  });

  it("random 模式用注入的随机数", () => {
    const when = new Date(2026, 8, 30); // 周三
    expect(pickQuote(when, "random", () => 0)).toEqual(QUOTES[0]);
    expect(pickQuote(when, "random", () => 0.999)).toEqual(QUOTES[QUOTES.length - 1]);
  });

  it("语料本身完整（有正文）", () => {
    for (const quote of [...QUOTES, ...THURSDAY_LINES]) {
      expect(quote.text.length).toBeGreaterThan(3);
    }
    expect(QUOTES.length).toBeGreaterThanOrEqual(30);
  });
});
