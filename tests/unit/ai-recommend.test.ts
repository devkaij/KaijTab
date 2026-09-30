import { describe, expect, it } from "vitest";
import {
  buildBrowsingContext,
  buildChatPayload,
  buildUserPrompt,
  chatCompletionsUrl,
  domainOf,
  formatRelative,
  formatWeekday,
  isCacheFresh,
  MAX_OUTPUT_TOKENS,
  MAX_TOP_SITES,
  normalizeBaseUrl,
  parseRecommendations,
  partOfDay,
  permissionOrigin,
  sanitizeUrl,
  SYSTEM_PROMPT,
  truncate,
} from "@/modules/ai-recommend/logic";

describe("URL 脱敏", () => {
  it("去掉查询串与锚点，保留路径", () => {
    expect(sanitizeUrl("https://github.com/kaijtab/repo?token=secret#readme")).toBe(
      "https://github.com/kaijtab/repo",
    );
    expect(sanitizeUrl("https://www.baidu.com/s?wd=私密搜索词")).toBe("https://www.baidu.com/s");
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("非 http(s) 一律拒绝", () => {
    expect(sanitizeUrl("chrome://newtab")).toBeNull();
    expect(sanitizeUrl("file:///C:/secret.txt")).toBeNull();
    expect(sanitizeUrl("not a url")).toBeNull();
  });

  it("域名去掉 www 前缀", () => {
    expect(domainOf("https://www.bilibili.com/video/x")).toBe("bilibili.com");
    expect(domainOf("https://mail.google.com/")).toBe("mail.google.com");
    expect(domainOf("oops")).toBeNull();
  });
});

describe("文本与时间", () => {
  it("truncate 压平空白并截断", () => {
    expect(truncate("  hello   world  ")).toBe("hello world");
    expect(truncate("一二三四五六", 4)).toBe("一二三…");
  });

  it("星期与时段", () => {
    expect(formatWeekday(new Date(2026, 8, 30))).toBe("周三");
    expect(partOfDay(new Date(2026, 8, 30, 8))).toBe("早上");
    expect(partOfDay(new Date(2026, 8, 30, 11))).toBe("上午");
    expect(partOfDay(new Date(2026, 8, 30, 21))).toBe("晚上");
    expect(partOfDay(new Date(2026, 8, 30, 2))).toBe("凌晨");
  });

  it("相对时间文案", () => {
    const now = 1_000_000_000;
    expect(formatRelative(now - 30_000, now)).toBe("刚刚");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe("3 小时前");
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe("2 天前");
  });
});

describe("buildBrowsingContext", () => {
  const now = new Date(2026, 8, 30, 10, 0);

  it("按域名聚合访问次数、最近访问与样本标题（不含查询串）", () => {
    const context = buildBrowsingContext({
      history: [
        { url: "https://github.com/a?token=x", title: "repo A", visitCount: 5, lastVisitTime: Date.UTC(2026, 8, 29) },
        { url: "https://github.com/b", title: "repo B", visitCount: 2, lastVisitTime: Date.UTC(2026, 8, 30) },
        { url: "https://www.bilibili.com/video/1", title: "视频", visitCount: 9, lastVisitTime: Date.UTC(2026, 8, 28) },
      ],
      bookmarks: [{ title: "知乎", url: "https://www.zhihu.com/hot?x=1" }],
      shortcuts: [{ title: "百度", url: "https://www.baidu.com" }],
      now,
    });

    expect(context.now.weekday).toBe("周三");
    expect(context.topSites.map((s) => s.domain)).toEqual(["bilibili.com", "github.com"]);
    const github = context.topSites.find((s) => s.domain === "github.com")!;
    expect(github.visits).toBe(7);
    expect(github.lastVisit).toBe("2026-09-30");
    expect(github.titles).toEqual(["repo A", "repo B"]);
    expect(context.bookmarks).toEqual([{ title: "知乎", domain: "zhihu.com" }]);
    expect(context.shortcuts).toEqual(["百度"]);

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("token=x");
    expect(serialized).not.toContain("https://github.com/a");
  });

  it("域名数量有上限，按访问量排序", () => {
    const history = Array.from({ length: MAX_TOP_SITES + 5 }, (_, i) => ({
      url: `https://site${i}.example.com/`,
      title: `站点 ${i}`,
      visitCount: i + 1,
    }));
    const context = buildBrowsingContext({ history, bookmarks: [], shortcuts: [], now });
    expect(context.topSites.length).toBe(MAX_TOP_SITES);
    expect(context.topSites[0]?.domain).toBe(`site${MAX_TOP_SITES + 4}.example.com`);
  });

  it("书签去重并跳过非法 URL", () => {
    const context = buildBrowsingContext({
      history: [],
      bookmarks: [
        { title: "A", url: "https://a.com/x" },
        { title: "A 重复", url: "https://a.com/x" },
        { title: "本地", url: "file:///C:/x" },
        { title: "无 URL" },
      ],
      shortcuts: [],
      now,
    });
    expect(context.bookmarks).toEqual([{ title: "A", domain: "a.com" }]);
  });
});

describe("请求构造", () => {
  const context = buildBrowsingContext({
    history: [{ url: "https://example.com/", title: "示例", visitCount: 1 }],
    bookmarks: [],
    shortcuts: [],
    now: new Date(2026, 8, 30, 10, 0),
  });

  it("chat/completions 端点自动补齐", () => {
    expect(chatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(chatCompletionsUrl("http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://x.com/v1/chat/completions")).toBe(
      "https://x.com/v1/chat/completions",
    );
    expect(normalizeBaseUrl("  https://api.deepseek.com/v1// ")).toBe("https://api.deepseek.com/v1");
  });

  it("权限 origin 与非法地址", () => {
    expect(permissionOrigin("https://api.openai.com/v1")).toBe("https://api.openai.com/*");
    expect(permissionOrigin("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/*");
    expect(permissionOrigin("nope")).toBeNull();
  });

  it("payload 包含模型、系统提示、输出上限与用户数据", () => {
    const payload = buildChatPayload(context, 5, "gpt-4o-mini") as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      reasoning_effort?: string;
    };
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(payload.messages[0]?.role).toBe("system");
    expect(payload.messages[1]?.content).toContain("请推荐 5 个链接");
    expect(payload.messages[1]?.content).toContain("example.com");
    expect(buildUserPrompt(context, 3)).toContain("请推荐 3 个链接");
  });

  it("低思考档位：附带思考控制字段，关闭时一个都不带", () => {
    const low = buildChatPayload(context, 5, "m", { lowThinking: true }) as Record<string, unknown>;
    expect(low.reasoning_effort).toBe("low");
    expect(low.enable_thinking).toBe(false);
    expect(low.thinking).toEqual({ type: "disabled" });

    const plain = buildChatPayload(context, 5, "m") as Record<string, unknown>;
    expect(plain.reasoning_effort).toBeUndefined();
    expect(plain.enable_thinking).toBeUndefined();
    expect(plain.thinking).toBeUndefined();
  });

  it("系统提示要求快速输出与简短理由", () => {
    expect(SYSTEM_PROMPT).toContain("不要展开思考过程");
    expect(SYSTEM_PROMPT).toContain("12 个字");
  });
});

describe("parseRecommendations", () => {
  it("解析标准 JSON", () => {
    const items = parseRecommendations(
      '{"recommendations":[{"title":"GitHub","url":"https://github.com?x=1","reason":"你的常用站点"}]}',
    );
    expect(items).toEqual([{ title: "GitHub", url: "https://github.com", reason: "你的常用站点" }]);
  });

  it("容忍代码围栏与多余文字", () => {
    const items = parseRecommendations(
      '好的，这里是推荐：\n```json\n[{"title":"B站","url":"https://www.bilibili.com/","reason":"放松一下"}]\n```\n希望有用！',
    );
    expect(items[0]?.title).toBe("B站");
    // 末尾的 "/" 会被规范化掉（本就不影响访问）
    expect(items[0]?.url).toBe("https://www.bilibili.com");
  });

  it("丢弃非法条目并限制数量", () => {
    const payload = {
      recommendations: [
        { title: "非法", url: "chrome://settings", reason: "x" },
        { title: "正常", url: "https://a.com/", reason: "y" },
        ...Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, url: `https://t${i}.com/`, reason: "" })),
      ],
    };
    const items = parseRecommendations(JSON.stringify(payload));
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items.some((i) => i.url.startsWith("chrome://"))).toBe(false);
  });

  it("无法解析时返回空数组而不是崩溃", () => {
    expect(parseRecommendations("")).toEqual([]);
    expect(parseRecommendations("这不是 JSON")).toEqual([]);
    expect(parseRecommendations("{坏掉的")).toEqual([]);
  });
});

describe("缓存时效", () => {
  it("4 小时内算新鲜", () => {
    const now = 10_000_000;
    expect(isCacheFresh(now - 1000, now)).toBe(true);
    expect(isCacheFresh(now - 5 * 3_600_000, now)).toBe(false);
    expect(isCacheFresh(now + 1000, now)).toBe(false);
  });
});
