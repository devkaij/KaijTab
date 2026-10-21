import { describe, expect, it, vi } from "vitest";
import {
  fetchPageIcons,
  iconCandidates,
  parseIconLinks,
  serviceIconCandidates,
  ICON_LOAD_TIMEOUT_MS,
} from "@/shared/utils/icons";

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

describe("serviceIconCandidates", () => {
  it("生成 DDG 与 Google 两个服务候选（只含主机名）", () => {
    expect(serviceIconCandidates("https://www.deepseek.com/chat/x")).toEqual([
      "https://icons.duckduckgo.com/ip3/www.deepseek.com.ico",
      "https://www.google.com/s2/favicons?domain=www.deepseek.com&sz=64",
    ]);
  });

  it("非法/非 http(s) URL 返回空", () => {
    expect(serviceIconCandidates("chrome://newtab")).toEqual([]);
    expect(serviceIconCandidates("not a url")).toEqual([]);
  });
});

describe("parseIconLinks", () => {
  it("解析相对路径的 <link rel=icon> 并转绝对地址", () => {
    const html = `<html><head><link rel="icon" href="/static/favicon.svg"></head></html>`;
    expect(parseIconLinks(html, "https://deepseek.com/")).toEqual([
      "https://deepseek.com/static/favicon.svg",
    ]);
  });

  it("shortcut icon 与无引号属性也能识别", () => {
    const html = `<link rel="shortcut icon" href=/img/icon.png>`;
    expect(parseIconLinks(html, "https://a.com/")).toEqual(["https://a.com/img/icon.png"]);
  });

  it("apple-touch-icon 优先于普通 icon，普通 icon 按 sizes 从大到小", () => {
    const html = [
      '<link rel="icon" href="/16.png" sizes="16x16">',
      '<link rel="icon" href="/192.png" sizes="192x192">',
      '<link rel="apple-touch-icon" href="/touch.png">',
    ].join("");
    expect(parseIconLinks(html, "https://a.com/")).toEqual([
      "https://a.com/touch.png",
      "https://a.com/192.png",
      "https://a.com/16.png",
    ]);
  });

  it("og:image / twitter:image 兜底在 link 之后", () => {
    const html = [
      '<meta property="og:image" content="https://cdn.a.com/og.jpg">',
      '<link rel="icon" href="/favicon.ico">',
      '<meta name="twitter:image:src" content="/tw.png">',
    ].join("");
    expect(parseIconLinks(html, "https://a.com/")).toEqual([
      "https://a.com/favicon.ico",
      "https://cdn.a.com/og.jpg",
      "https://a.com/tw.png",
    ]);
  });

  it("sizes=any（SVG 可缩放）排在固定尺寸前面", () => {
    const html = [
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="icon" href="/logo.svg" sizes="any">',
    ].join("");
    expect(parseIconLinks(html, "https://a.com/")).toEqual([
      "https://a.com/logo.svg",
      "https://a.com/32.png",
    ]);
  });

  it("去重、过滤 javascript: 与坏地址，data:image 保留", () => {
    const html = [
      '<link rel="icon" href="/favicon.ico">',
      '<link rel="icon" href="/favicon.ico">',
      '<link rel="icon" href="javascript:void(0)">',
      '<link rel="icon" href="data:image/png;base64,AAAA">',
    ].join("");
    expect(parseIconLinks(html, "https://a.com/")).toEqual([
      "https://a.com/favicon.ico",
      "data:image/png;base64,AAAA",
    ]);
  });

  it("HTML 实体被还原", () => {
    const amp = "\u0026";
    const html = `<link rel="icon" href="/icon.png?v=1${amp}amp;size=big">`;
    expect(parseIconLinks(html, "https://a.com/")).toEqual([
      `https://a.com/icon.png?v=1${amp}size=big`,
    ]);
  });

  it("空 HTML 返回空数组", () => {
    expect(parseIconLinks("", "https://a.com/")).toEqual([]);
  });
});

describe("fetchPageIcons", () => {
  const okResponse = (body: string, contentType = "text/html") =>
    new Response(body, { status: 200, headers: { "content-type": contentType } });

  it("抓取首页并解析出图标声明", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('<link rel="icon" href="/i.png">'));
    await expect(fetchPageIcons("https://a.com/page/x", fetchFn as typeof fetch)).resolves.toEqual([
      "https://a.com/i.png",
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://a.com/",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("同 origin 只抓一次（含失败结果）", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse("<html></html>"));
    const first = fetchPageIcons("https://cache.com/a", fetchFn as typeof fetch);
    const second = fetchPageIcons("https://cache.com/b", fetchFn as typeof fetch);
    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("非 2xx / 非 HTML / 网络错误都返回空数组且不抛错", async () => {
    const bad = vi.fn().mockResolvedValue(new Response("no", { status: 404 }));
    await expect(fetchPageIcons("https://bad.com/", bad as typeof fetch)).resolves.toEqual([]);

    const json = vi.fn().mockResolvedValue(okResponse("{}", "application/json"));
    await expect(fetchPageIcons("https://json.com/", json as typeof fetch)).resolves.toEqual([]);

    const boom = vi.fn().mockRejectedValue(new Error("down"));
    await expect(fetchPageIcons("https://boom.com/", boom as typeof fetch)).resolves.toEqual([]);
  });

  it("非 http(s) 与非法 URL 直接返回空", async () => {
    await expect(fetchPageIcons("chrome://newtab")).resolves.toEqual([]);
    await expect(fetchPageIcons("nonsense")).resolves.toEqual([]);
  });
});
