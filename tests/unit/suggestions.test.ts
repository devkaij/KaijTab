import { describe, expect, it } from "vitest";
import {
  ENGINE_SUGGEST,
  flattenBookmarks,
  parseBaiduSuggest,
  parseJsonSuggest,
  parseSogouSuggest,
  rankSuggestions,
  scoreSuggestion,
  type SuggestionSource,
} from "@/newtab/core/suggestions";

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

function source(partial: Partial<SuggestionSource> & { url: string }): SuggestionSource {
  return {
    title: partial.title ?? "",
    kind: partial.kind ?? "history",
    ...partial,
  };
}

describe("scoreSuggestion", () => {
  it("标题前缀命中 > 标题子串 > 仅 URL 命中", () => {
    const prefix = scoreSuggestion(source({ title: "kaijtab 官网", url: "https://a.com" }), "kaijtab", NOW);
    const substring = scoreSuggestion(source({ title: "关于 kaijtab 的一切", url: "https://b.com" }), "kaijtab", NOW);
    const urlOnly = scoreSuggestion(source({ title: "别的", url: "https://kaijtab.com/x" }), "kaijtab", NOW);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(urlOnly);
    expect(urlOnly).toBeGreaterThan(0);
  });

  it("完全没命中返回 0", () => {
    expect(scoreSuggestion(source({ title: "无关", url: "https://x.com" }), "kaijtab", NOW)).toBe(0);
    expect(scoreSuggestion(source({ url: "https://x.com" }), "", NOW)).toBe(0);
  });

  it("访问次数、新鲜度、书签都有加分", () => {
    const base = source({ title: "kaijtab", url: "https://a.com" });
    const visited = source({ title: "kaijtab", url: "https://a.com", visitCount: 50, lastVisitTime: NOW - 3600_000 });
    const old = source({ title: "kaijtab", url: "https://a.com", visitCount: 0, lastVisitTime: NOW - 200 * 86_400_000 });
    const bookmark = source({ title: "kaijtab", url: "https://a.com", kind: "bookmark" });
    expect(scoreSuggestion(visited, "kaijtab", NOW)).toBeGreaterThan(scoreSuggestion(base, "kaijtab", NOW));
    expect(scoreSuggestion(bookmark, "kaijtab", NOW)).toBeGreaterThan(scoreSuggestion(base, "kaijtab", NOW));
    expect(scoreSuggestion(visited, "kaijtab", NOW)).toBeGreaterThan(scoreSuggestion(old, "kaijtab", NOW));
  });
});

describe("rankSuggestions", () => {
  it("按分数排序、URL 去重、截断", () => {
    const items: SuggestionSource[] = [
      source({ title: "低频", url: "https://a.com/1", visitCount: 1 }),
      source({ title: "高频", url: "https://a.com/2", visitCount: 200, lastVisitTime: NOW }),
      source({ title: "重复 URL", url: "https://a.com/2", visitCount: 5 }),
      source({ title: "无关项", url: "https://other.com" }),
      source({ title: "前缀命中", url: "https://kaijtab.dev", title2: undefined } as never),
    ];
    const ranked = rankSuggestions(items, "kaijtab", 3, NOW);
    expect(ranked.length).toBeLessThanOrEqual(3);
    expect(ranked.map((item) => item.url)).not.toContain("https://other.com");
    expect(new Set(ranked.map((item) => item.url)).size).toBe(ranked.length);
  });

  it("给出域名与访问次数的副标题", () => {
    const ranked = rankSuggestions(
      [source({ title: "kaijtab", url: "https://www.kaijtab.dev/docs", visitCount: 7, lastVisitTime: NOW })],
      "kaijtab",
      8,
      NOW,
    );
    expect(ranked[0]?.sub).toBe("kaijtab.dev · 访问 7 次");
  });

  it("标题为空时退回域名", () => {
    const ranked = rankSuggestions([source({ title: "", url: "https://kaijtab.io/x" })], "kaijtab", 8, NOW);
    expect(ranked[0]?.title).toBe("kaijtab.io");
  });

  it("空查询返回空", () => {
    expect(rankSuggestions([source({ title: "a", url: "https://a.com" })], "   ", 8, NOW)).toEqual([]);
  });
});

describe("搜索引擎联想词解析", () => {
  it("百度：取 g[].q", () => {
    const text =
      '{"q":"贴吧","p":false,"g":[{"type":"sug","sa":"s_1","q":"贴吧 百度"},{"type":"sug","sa":"s_2","q":"贴吧工具箱"},{"type":"sug","q":"  "}]}';
    expect(parseBaiduSuggest(text)).toEqual(["贴吧 百度", "贴吧工具箱"]);
    expect(parseBaiduSuggest("不是 json")).toEqual([]);
  });

  it("Bing / Google：取数组第二项", () => {
    const text = '["贴吧",["贴吧","贴吧 百度","贴吧工具箱"]]';
    expect(parseJsonSuggest(text)).toEqual(["贴吧", "贴吧 百度", "贴吧工具箱"]);
    expect(parseJsonSuggest('{"hmm":1}')).toEqual([]);
    expect(parseJsonSuggest("")).toEqual([]);
  });

  it("搜狗：剥掉 JSONP 外壳", () => {
    const text = 'window.sogou.sug(["贴吧",["贴吧","百度贴吧"],["0;15;0;0"],[""]]);';
    expect(parseSogouSuggest(text)).toEqual(["贴吧", "百度贴吧"]);
    expect(parseSogouSuggest("乱七八糟")).toEqual([]);
  });

  it("三家都有可用的 URL 构造", () => {
    for (const source of Object.values(ENGINE_SUGGEST)) {
      expect(source.buildUrl("贴吧 测试")).toContain(encodeURIComponent("贴吧 测试"));
      expect(source.parse("")).toEqual([]);
    }
  });
});

describe("flattenBookmarks", () => {
  const tree = [
    {
      id: "1",
      title: "书签栏",
      children: [
        { id: "2", title: "A", url: "https://a.com" },
        { id: "3", title: "文件夹", children: [{ id: "4", title: "B", url: "https://b.com" }] },
      ],
    },
  ] as chrome.bookmarks.BookmarkTreeNode[];

  it("拍平并保留标题", () => {
    const items = flattenBookmarks(tree);
    expect(items.map((item) => item.url)).toEqual(["https://a.com", "https://b.com"]);
    expect(items.every((item) => item.kind === "bookmark")).toBe(true);
  });

  it("深度受限（第 5 层之后不再进入）", () => {
    const deep = [
      {
        id: "0",
        title: "L0",
        children: [
          {
            id: "1",
            title: "L1",
            children: [
              {
                id: "2",
                title: "L2",
                children: [
                  { id: "3", title: "L3", children: [{ id: "4", title: "L4", children: [{ id: "5", title: "L5", url: "https://deep.com" }] }] },
                ],
              },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];
    const items = flattenBookmarks(deep);
    expect(items).toEqual([]);
  });
});
