import { describe, expect, it } from "vitest";
import {
  formatHot,
  getSource,
  HOT_SOURCES,
  isFresh,
  parseBaidu,
  parseBilibili,
  parseGithub,
  parseJuejin,
  parseToutiao,
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
  it("5 个数据源都有 URL 与解析器，且能取到默认源", () => {
    expect(HOT_SOURCES).toHaveLength(5);
    for (const source of HOT_SOURCES) {
      expect(source.buildUrl()).toMatch(/^https:\/\//);
      expect(source.parse({})).toEqual([]);
    }
    expect(getSource("nope").id).toBe("baidu");
    expect(getSource("github").label).toBe("GitHub 趋势");
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
