import { describe, expect, it } from "vitest";
import {
  buildTranslateUserPrompt,
  formatHot,
  getSource,
  HOT_SOURCES,
  isFresh,
  parseBaidu,
  parseBilibili,
  parseDevto,
  parseGithub,
  parseGoogleTrends,
  parseHackerNews,
  parseJuejin,
  parseLobsters,
  parseTechmeme,
  parseToutiao,
  parseTranslations,
  pruneTranslations,
  translationKey,
} from "@/modules/hot-list/logic";

describe("parseBaidu", () => {
  it("解析 data.cards[0].content[0].content[]", () => {
    const items = parseBaidu({
      success: true,
      data: {
        cards: [
          {
            component: "tabTextList",
            content: [
              {
                content: [
                  { isTop: true, word: "置顶新闻", url: "https://m.baidu.com/s?word=a" },
                  { word: "普通新闻", url: "https://m.baidu.com/s?word=b" },
                  { word: "", url: "https://m.baidu.com/s?word=c" },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: "置顶新闻",
      url: "https://m.baidu.com/s?word=a",
      hot: "置顶",
    });
    expect(items[1]?.hot).toBeUndefined();
  });

  it("结构不符时返回空数组", () => {
    expect(parseBaidu({})).toEqual([]);
    expect(parseBaidu(null)).toEqual([]);
  });
});

describe("parseToutiao", () => {
  it("解析 data[] 并格式化热度", () => {
    const items = parseToutiao({
      data: [
        { Title: "今日要闻", Url: "https://www.toutiao.com/trending/1/", HotValue: 1234567 },
        { Title: "第二条", Url: "https://www.toutiao.com/trending/2/", HotValue: 500 },
      ],
    });
    expect(items[0]).toEqual({
      title: "今日要闻",
      url: "https://www.toutiao.com/trending/1/",
      hot: "123.5万",
    });
    expect(items[1]?.hot).toBe("500");
  });
});

describe("parseBilibili", () => {
  it("支持 app 接口的 data.list", () => {
    const items = parseBilibili({
      code: 0,
      data: { list: [{ keyword: "原神", show_name: "原神新版本" }] },
    });
    expect(items[0]?.title).toBe("原神新版本");
    expect(items[0]?.url).toContain("search.bilibili.com/all?keyword=");
  });

  it("也兼容 web 接口的 data.trending.list", () => {
    const items = parseBilibili({ data: { trending: { list: [{ keyword: "测试" }] } } });
    expect(items[0]?.title).toBe("测试");
  });
});

describe("parseJuejin", () => {
  it("拼出文章链接并带摘要", () => {
    const items = parseJuejin({
      data: [{ content: { title: "好文", content_id: "7123456789", brief: "摘要内容" } }],
    });
    expect(items[0]).toEqual({
      title: "好文",
      url: "https://juejin.cn/post/7123456789",
      desc: "摘要内容",
    });
  });
});

describe("parseGithub", () => {
  it("解析搜索接口的仓库列表", () => {
    const items = parseGithub({
      items: [
        {
          full_name: "foo/bar",
          html_url: "https://github.com/foo/bar",
          stargazers_count: 12345,
          description: "一个项目",
        },
      ],
    });
    expect(items[0]).toEqual({
      title: "foo/bar",
      url: "https://github.com/foo/bar",
      hot: "★ 1.2万",
      desc: "一个项目",
    });
  });
});

describe("数据源与工具", () => {
  it("10 个数据源都有 URL 与解析器，且能取到默认源", () => {
    expect(HOT_SOURCES).toHaveLength(10);
    for (const source of HOT_SOURCES) {
      expect(source.buildUrl()).toMatch(/^https:\/\//);
      expect(source.parse({})).toEqual([]);
    }
    expect(getSource("nope").id).toBe("baidu");
    expect(getSource("github").label).toBe("GitHub 趋势");
  });

  it("国外源带 foreign 标记，RSS 源用 text 解析", () => {
    expect(HOT_SOURCES.filter((s) => s.foreign).map((s) => s.id)).toEqual([
      "hackernews",
      "lobsters",
      "devto",
      "gtrends",
      "techmeme",
    ]);
    expect(getSource("gtrends").format).toBe("text");
    expect(getSource("techmeme").format).toBe("text");
    expect(getSource("hackernews").format).toBeUndefined();
    expect(getSource("baidu").foreign).toBeUndefined();
  });

  it("GitHub 趋势 URL 用最近 7 天（查询串已转义）", () => {
    const url = getSource("github").buildUrl(new Date(Date.UTC(2026, 8, 30)));
    expect(url).toContain("created%3A%3E2026-09-23");
    expect(url).toContain("sort=stars");
  });

  it("formatHot 边界", () => {
    expect(formatHot(999)).toBe("999");
    expect(formatHot(10000)).toBe("1.0万");
    expect(formatHot(250000000)).toBe("2.5亿");
    expect(formatHot(0)).toBeUndefined();
    expect(formatHot("abc")).toBeUndefined();
  });

  it("缓存时效", () => {
    const now = 10_000_000;
    expect(isFresh(now - 1000, now)).toBe(true);
    expect(isFresh(now - 11 * 60_000, now)).toBe(false);
  });
});

describe("parseHackerNews", () => {
  it("解析 hits[]，清理 URL 尾巴，缺 url 时回退到讨论页", () => {
    const items = parseHackerNews({
      hits: [
        { objectID: "1", title: "Show HN: Foo", url: "https://example.com/foo\\", points: 320 },
        { objectID: "2", title: "Ask HN: Bar?", url: null, points: 0 },
        { objectID: "3", title: "" },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: "Show HN: Foo",
      url: "https://example.com/foo",
      hot: "▲ 320",
    });
    expect(items[1]?.url).toBe("https://news.ycombinator.com/item?id=2");
    expect(items[1]?.hot).toBeUndefined();
  });
});

describe("parseLobsters", () => {
  it("解析数组，缺 url 时回退 short_id 链接", () => {
    const items = parseLobsters([
      { title: "Janet on x32 (fermion.dev)", url: "https://fermion.dev/x32", score: 42 },
      { title: "No URL item", url: "", score: 3, short_id: "abc123" },
    ]);
    expect(items[0]).toEqual({
      title: "Janet on x32 (fermion.dev)",
      url: "https://fermion.dev/x32",
      hot: "▲ 42",
    });
    expect(items[1]?.url).toBe("https://lobste.rs/s/abc123");
  });
});

describe("parseDevto", () => {
  it("解析文章数组并显示点赞数", () => {
    const items = parseDevto([
      { title: "Why TS crashes", url: "https://dev.to/x/why-ts", positive_reactions_count: 88 },
    ]);
    expect(items[0]).toEqual({
      title: "Why TS crashes",
      url: "https://dev.to/x/why-ts",
      hot: "♥ 88",
    });
    expect(parseDevto([{ title: "no url" }])).toEqual([]);
  });
});

describe("parseGoogleTrends", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Taylor Swift</title><ht:approx_traffic>2000+</ht:approx_traffic><link>https://trends.google.com/trends/explore?q=Taylor+Swift&amp;geo=US</link></item>
    <item><title>No link</title><ht:approx_traffic>500+</ht:approx_traffic></item>
  </channel></rss>`;

  it("解析 item、搜索量，链接统一拼探索页", () => {
    const items = parseGoogleTrends(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: "Taylor Swift",
      url: "https://trends.google.com/trends/explore?q=Taylor%20Swift&geo=US",
      hot: "2000+",
    });
    expect(items[1]?.url).toContain("trends.google.com/trends/explore?q=No%20link");
  });
});

describe("parseTechmeme", () => {
  it("解析 RSS item", () => {
    const xml = `<rss><channel><item><title>Publisher: Headline — Context</title><link>https://www.techmeme.com/261007/p1</link></item></channel></rss>`;
    expect(parseTechmeme(xml)).toEqual([
      { title: "Publisher: Headline — Context", url: "https://www.techmeme.com/261007/p1" },
    ]);
  });
});

describe("翻译纯逻辑", () => {
  it("translationKey 稳定、区分大小写且足够短", () => {
    expect(translationKey("Hello World")).toBe(translationKey("Hello World"));
    expect(translationKey("Hello World")).not.toBe(translationKey("Hello world"));
    expect(translationKey("a".repeat(500)).length).toBeLessThan(8);
  });

  it("buildTranslateUserPrompt 用 JSON 数组转义标题", () => {
    const titles = ['He said "hi"\nnext', "第 2 条"];
    expect(JSON.parse(buildTranslateUserPrompt(titles))).toEqual(titles);
  });

  it("parseTranslations 对齐数组，兼容代码围栏、对象编号与废话", () => {
    expect(parseTranslations('```json\n["甲","乙"]\n```', 2)).toEqual(["甲", "乙"]);
    expect(parseTranslations('好的：{"1": "甲", "2": "乙"} 完毕', 2)).toEqual(["甲", "乙"]);
    expect(parseTranslations('["甲"]', 3)).toEqual(["甲", "", ""]);
    expect(parseTranslations("无法解析", 2)).toEqual(["", ""]);
    expect(parseTranslations("", 1)).toEqual([""]);
  });

  it("pruneTranslations 只保留最近写入的若干条", () => {
    const cache: Record<string, string> = {};
    for (let i = 0; i < 10; i += 1) cache[`k${i}`] = `v${i}`;
    expect(Object.keys(pruneTranslations(cache, 3))).toEqual(["k7", "k8", "k9"]);
    expect(pruneTranslations(cache, 99)).toBe(cache);
  });
});
