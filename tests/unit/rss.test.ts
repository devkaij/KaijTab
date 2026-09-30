import { describe, expect, it } from "vitest";
import {
  cleanText,
  decodeEntities,
  extractAtomLink,
  extractTag,
  formatWhen,
  MAX_FEEDS,
  mergeItems,
  parseFeed,
  parseFeedList,
} from "@/modules/rss/logic";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>我的博客</title>
    <item>
      <title>第一篇 &amp; 标题</title>
      <link>https://blog.example.com/post/1</link>
      <pubDate>Tue, 29 Sep 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>这是摘要 <b>加粗</b></p>]]></description>
    </item>
    <item>
      <title><![CDATA[第二篇]]></title>
      <link>https://blog.example.com/post/2</link>
      <pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom 源</title>
  <entry>
    <title>原子条目</title>
    <link rel="alternate" href="https://atom.example.com/1" />
    <updated>2026-09-30T08:00:00Z</updated>
    <summary>摘要文本</summary>
  </entry>
</feed>`;

describe("parseFeedList", () => {
  it("补全协议、去重、限量", () => {
    const feeds = parseFeedList("example.com/feed.xml, https://a.example.com/rss, example.com/feed.xml");
    expect(feeds).toEqual(["https://example.com/feed.xml", "https://a.example.com/rss"]);
  });

  it("过滤非法地址与超量", () => {
    expect(parseFeedList("!!!")).toEqual([]);
    expect(parseFeedList("")).toEqual([]);
    expect(parseFeedList(undefined)).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => `https://f${i}.example.com/rss`);
    expect(parseFeedList(many.join(","))).toHaveLength(MAX_FEEDS);
  });
});

describe("文本清洗", () => {
  it("解实体 + 去 CDATA + 去标签", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#65;")).toBe("a & b <c> A");
    expect(cleanText("<![CDATA[<p>正文</p>]]>")).toBe("正文");
    expect(extractTag("<title>标题 &amp; 更多</title>", "title")).toBe("标题 & 更多");
  });

  it("Atom 的 link 取 href", () => {
    expect(extractAtomLink('<link rel="alternate" href="https://a.example.com/x" />')).toBe(
      "https://a.example.com/x",
    );
    expect(extractAtomLink('<link href="https://b.example.com/y" />')).toBe("https://b.example.com/y");
  });
});

describe("parseFeed", () => {
  it("解析 RSS 2.0", () => {
    const parsed = parseFeed(RSS_SAMPLE);
    expect(parsed.title).toBe("我的博客");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.title).toBe("第一篇 & 标题");
    expect(parsed.items[0]?.url).toBe("https://blog.example.com/post/1");
    expect(parsed.items[0]?.time).toBeGreaterThan(0);
    expect(parsed.items[0]?.summary).toBe("这是摘要 加粗");
    expect(parsed.items[1]?.title).toBe("第二篇");
  });

  it("解析 Atom", () => {
    const parsed = parseFeed(ATOM_SAMPLE);
    expect(parsed.title).toBe("Atom 源");
    expect(parsed.items[0]?.title).toBe("原子条目");
    expect(parsed.items[0]?.url).toBe("https://atom.example.com/1");
    expect(parsed.items[0]?.summary).toBe("摘要文本");
  });

  it("坏输入不崩", () => {
    expect(parseFeed("").items).toEqual([]);
    expect(parseFeed("<rss><channel></channel></rss>").items).toEqual([]);
  });
});

describe("mergeItems / formatWhen", () => {
  it("按时间倒序并限量", () => {
    const items = [
      { title: "旧", url: "u1", time: 1000, source: "s" },
      { title: "新", url: "u2", time: 3000, source: "s" },
      { title: "无时间", url: "u3", time: 0, source: "s" },
    ];
    const merged = mergeItems(items, 2);
    expect(merged.map((item) => item.title)).toEqual(["新", "旧"]);
  });

  it("相对时间文案", () => {
    const now = 1_000_000_000_000;
    expect(formatWhen(now - 30_000, now)).toBe("1 分钟前");
    expect(formatWhen(now - 3 * 3_600_000, now)).toBe("3 小时前");
    expect(formatWhen(now - 2 * 86_400_000, now)).toBe("2 天前");
    expect(formatWhen(0, now)).toBe("");
  });
});
