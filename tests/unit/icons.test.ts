import { describe, expect, it } from "vitest";
import { iconCandidates, ICON_LOAD_TIMEOUT_MS } from "@/newtab/core/icons";

describe("iconCandidates", () => {
  const base = { url: "https://www.bilibili.com/video/x", icon: undefined };

  it("顺序：站点 favicon.ico → apple-touch-icon → favicon.png", () => {
    expect(iconCandidates(base)).toEqual([
      "https://www.bilibili.com/favicon.ico",
      "https://www.bilibili.com/apple-touch-icon.png",
      "https://www.bilibili.com/favicon.png",
    ]);
  });

  it("自定义图标排在最前且会去空格", () => {
    const list = iconCandidates({ ...base, icon: "  https://cdn.test/i.png  " });
    expect(list[0]).toBe("https://cdn.test/i.png");
    expect(list.length).toBe(4);
  });

  it("非 http(s) 协议不生成站点候选", () => {
    expect(iconCandidates({ url: "chrome://newtab", icon: undefined })).toEqual([]);
  });

  it("非法 URL 不抛错", () => {
    expect(iconCandidates({ url: "not a url", icon: undefined })).toEqual([]);
    expect(iconCandidates({ url: "not a url", icon: "x.png" })).toEqual(["x.png"]);
  });

  it("带端口与查询串的 URL 只取 origin", () => {
    expect(iconCandidates({ url: "http://localhost:5173/app?a=1#h" })[0]).toBe(
      "http://localhost:5173/favicon.ico",
    );
  });

  it("超时阈值是正数", () => {
    expect(ICON_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
