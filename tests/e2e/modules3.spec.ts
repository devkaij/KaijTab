import { enterEditMode, expect, test } from "./fixtures";

type Page = Parameters<typeof enterEditMode>[0];

/** 一个 0.1 秒的静音 WAV（用于电台播放测试） */
function silentWav(): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function addModule(page: Page, id: string): Promise<void> {
  await enterEditMode(page);
  await page.getByTestId("open-module-center").click();
  await expect(page.getByTestId(`module-card-${id}`)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`module-add-${id}`).click();
  await expect(page.locator(`.kt-item[data-widget-type="${id}"]`)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("edit-done").click();
  await expect(page.getByTestId("editor-toolbar")).toHaveCount(0);
}

interface SeedPayload {
  type: string;
  props?: Record<string, unknown>;
  moduleData?: unknown;
}

/** 通过应用自身的 store 写入数据并刷新（用于绕过需要用户手势的授权流程） */
async function seedAndReload(page: Page, payload: SeedPayload): Promise<void> {
  await page.evaluate(async (seed) => {
    const store = (
      window as unknown as { __kaijtab: { commit: (fn: (s: unknown) => unknown) => void } }
    ).__kaijtab;
    store.commit((raw) => {
      const state = structuredClone(raw) as {
        layout: { items: Array<{ id: string; type: string; props: Record<string, unknown> }> };
        moduleData: Record<string, unknown>;
      };
      const item = state.layout.items.find((i) => i.type === seed.type);
      if (item && seed.props) Object.assign(item.props, seed.props);
      if (item && seed.moduleData !== undefined) {
        state.moduleData[`${seed.type}:${item.id}`] = seed.moduleData;
      }
      return state;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
  }, payload as unknown as SeedPayload);
  await page.reload();
  await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
}

test.describe("新一批模块：离线", () => {
  test("每日一句渲染内置语料，世界时钟显示多个时区", async ({ newTab }) => {
    await addModule(newTab, "quote");
    await expect(newTab.getByTestId("quote")).toBeVisible();
    const quoteText = await newTab.locator(".kt-quote-text").innerText();
    expect(quoteText.length).toBeGreaterThan(3);

    await addModule(newTab, "world-clock");
    await expect(newTab.getByTestId("world-clock")).toBeVisible();
    const times = await newTab.locator(".kt-world-time").allInnerTexts();
    expect(times.length).toBe(3);
    for (const time of times) {
      expect(time).toMatch(/\d{2}:\d{2}:\d{2}/);
    }
    const cities = (await newTab.locator(".kt-world-city").allInnerTexts()).join(" ");
    expect(cities).toContain("Shanghai");
    expect(cities).toContain("本机");
  });
});

test.describe("新一批模块：联网", () => {
  test("今日热榜：解析百度接口并渲染排名与置顶", async ({ newTab, context }) => {
    await context.route("**/top.baidu.com/**", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            cards: [
              {
                component: "tabTextList",
                content: [
                  {
                    content: [
                      { isTop: true, word: "置顶热搜", url: "https://m.baidu.com/s?word=top" },
                      { word: "普通热搜一", url: "https://m.baidu.com/s?word=one" },
                      { word: "普通热搜二", url: "https://m.baidu.com/s?word=two" },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    await addModule(newTab, "hot-list");
    const items = newTab.getByTestId("hot-item");
    await expect(items).toHaveCount(3, { timeout: 20_000 });
    await expect(items.first()).toContainText("置顶热搜");
    await expect(items.first()).toContainText("置顶");
    await expect(items.nth(1)).toHaveAttribute("href", "https://m.baidu.com/s?word=one");
    await expect(newTab.locator(".kt-hot-rank").first()).toHaveText("1");

    // 结果写入本地缓存（moduleData 是命名空间对象，缓存在 cache 键下）
    const cached = await newTab.evaluate(() => {
      const store = (
        window as unknown as {
          __kaijtab: {
            state: { value: { moduleData: Record<string, { cache?: { items?: unknown[] } }> } };
          };
        }
      ).__kaijtab;
      const data = store.state.value.moduleData;
      const key = Object.keys(data).find((k) => k.startsWith("hot-list:"));
      return key ? (data[key]?.cache?.items?.length ?? 0) : 0;
    });
    expect(cached).toBeGreaterThanOrEqual(3);

    // 国内源没有「译」按钮（只有国外源才需要翻译）
    await expect(newTab.getByTestId("hot-translate")).toHaveCount(0);
  });

  test("在线电台：列表渲染并可播放（点击后进入播放态）", async ({ newTab, context }) => {
    await context.route(/radio-browser\.info/, (route) =>
      route.fulfill({
        json: [
          {
            stationuuid: "s1",
            name: "测试电台一",
            url_resolved: "https://stream.example.com/one",
            country: "China",
            tags: "jazz,relax",
            bitrate: 128,
          },
          {
            stationuuid: "s2",
            name: "测试电台二",
            url_resolved: "https://stream.example.com/two",
            tags: "jazz",
          },
          {
            stationuuid: "s3",
            name: "http 电台（应被过滤）",
            url_resolved: "http://stream.example.com/three",
          },
        ],
      }),
    );
    await context.route(/stream\.example\.com\/one/, (route) =>
      route.fulfill({ body: silentWav(), contentType: "audio/wav" }),
    );

    await addModule(newTab, "radio");
    const stations = newTab.getByTestId("radio-station");
    await expect(stations).toHaveCount(2, { timeout: 20_000 });
    await expect(stations.first()).toContainText("测试电台一");
    await expect(newTab.getByTestId("radio")).not.toContainText("http 电台");

    await stations.first().click();
    await expect(stations.first()).toHaveClass(/kt-radio-active/, { timeout: 10_000 });
    await expect(newTab.getByTestId("radio-stop")).toBeVisible();
    await expect(newTab.getByTestId("radio")).toContainText("正在播放：测试电台一");
  });

  test("RSS：未授权时给出授权入口，缓存条目照常渲染", async ({ newTab }) => {
    await addModule(newTab, "rss");
    await seedAndReload(newTab, {
      type: "rss",
      props: { feeds: "https://feeds.example.com/rss.xml" },
      moduleData: {
        cache: {
          at: Date.now(),
          items: [
            {
              title: "缓存里的第一条",
              url: "https://feeds.example.com/post/1",
              time: Date.now() - 3_600_000,
              source: "feeds",
            },
            {
              title: "缓存里的第二条",
              url: "https://feeds.example.com/post/2",
              time: Date.now() - 7_200_000,
              source: "feeds",
            },
          ],
        },
      },
    });

    await expect(newTab.getByTestId("rss-item")).toHaveCount(2, { timeout: 15_000 });
    await expect(newTab.getByTestId("rss")).toContainText("缓存里的第一条");
    await expect(newTab.getByTestId("rss-authorize")).toBeVisible();
  });

  test("日历：未配置时给提示；有缓存时按时间列出事件", async ({ newTab }) => {
    await addModule(newTab, "calendar");
    await expect(newTab.getByTestId("calendar")).toContainText("还没有日历地址");

    const later = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const faraway = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await seedAndReload(newTab, {
      type: "calendar",
      props: { url: "https://cal.example.com/basic.ics" },
      moduleData: {
        cache: {
          at: Date.now(),
          events: [
            {
              uid: "e1",
              summary: "两小时后的会议",
              start: later,
              end: null,
              allDay: false,
              location: "会议室 B",
            },
            { uid: "e2", summary: "很久以后的事", start: faraway, end: null, allDay: false },
          ],
        },
      },
    });

    const items = newTab.getByTestId("calendar-item");
    await expect(items).toHaveCount(1, { timeout: 15_000 });
    await expect(items.first()).toContainText("两小时后的会议");
    await expect(items.first()).toContainText("会议室 B");
    await expect(newTab.getByTestId("calendar")).not.toContainText("很久以后的事");
  });

  test("天气：渲染 7 天预报", async ({ newTab, context }) => {
    const times = [
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
    ];

    await context.route("**/geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({
        json: { results: [{ name: "北京", country: "中国", latitude: 39.9, longitude: 116.4 }] },
      }),
    );
    await context.route("**/api.open-meteo.com/**", (route) =>
      route.fulfill({
        json: {
          current: {
            temperature_2m: 21.5,
            apparent_temperature: 20.1,
            weather_code: 1,
            relative_humidity_2m: 55,
            wind_speed_10m: 6,
          },
          daily: {
            time: times,
            weather_code: [1, 2, 3, 61, 71, 80, 95],
            temperature_2m_max: [25, 24, 23, 20, 18, 22, 26],
            temperature_2m_min: [15, 14, 13, 12, 10, 14, 17],
          },
        },
      }),
    );

    await addModule(newTab, "weather");
    await expect(newTab.getByTestId("weather-temp")).toHaveText("22°", { timeout: 20_000 });

    const week = newTab.getByTestId("weather-week");
    await expect(week).toBeVisible();
    await expect(week.locator(".kt-weather-day")).toHaveCount(7);
    await expect(week).toContainText("今天");
    await expect(week).toContainText("明天");
    await expect(week).toContainText("25°");
  });
});

/** 把热榜实例切到国外源，可选写入共享的 AI 接口配置（模拟用户已配置） */
async function seedHotSource(page: Page, source: string, aiBaseUrl: string | null): Promise<void> {
  await page.evaluate(
    async (payload) => {
      const store = (
        window as unknown as { __kaijtab: { commit: (fn: (s: unknown) => unknown) => void } }
      ).__kaijtab;
      store.commit((raw) => {
        const state = structuredClone(raw) as {
          layout: { items: Array<{ id: string; type: string; props: Record<string, unknown> }> };
          modules: { settings: Record<string, unknown> };
          localSecrets: Record<string, unknown>;
        };
        const item = state.layout.items.find((i) => i.type === "hot-list");
        if (item) item.props.source = payload.source;
        const next = { ...state };
        if (payload.baseUrl) {
          next.modules = {
            ...state.modules,
            settings: {
              ...state.modules.settings,
              ai: { baseUrl: payload.baseUrl, model: "test-model" },
            },
          };
          next.localSecrets = { ...state.localSecrets, "ai:apiKey": "sk-test" };
        }
        return next;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    },
    { source, baseUrl: aiBaseUrl },
  );
  await page.reload();
  await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
}

test.describe("热榜：国外源与译中", () => {
  test("Hacker News：解析英文榜，点「译」出中文并在下方保留原文", async ({ newTab, context }) => {
    await context.route("**/hn.algolia.com/**", (route) =>
      route.fulfill({
        json: {
          hits: [
            {
              objectID: "1",
              title: "Mistral Large 4 is here",
              url: "https://example.com/a",
              points: 1899,
            },
            {
              objectID: "2",
              title: "Sharing AI progress in mathematics",
              url: "https://example.com/b",
              points: 1032,
            },
          ],
        },
      }),
    );

    const bodies: string[] = [];
    await context.route("**/ai.example.com/**", async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill({
        json: {
          choices: [{ message: { content: '["Mistral Large 4 来了","分享数学领域的 AI 进展"]' } }],
        },
      });
    });

    await addModule(newTab, "hot-list");
    await seedHotSource(newTab, "hackernews", "https://ai.example.com/v1");

    const items = newTab.getByTestId("hot-item");
    await expect(items).toHaveCount(2, { timeout: 20_000 });
    await expect(items.first()).toContainText("Mistral Large 4 is here");
    await expect(items.first()).toContainText("▲ 1899");
    await expect(newTab.locator(".kt-hot-source")).toHaveText("Hacker News");

    await newTab.getByTestId("hot-translate").click();
    await expect(items.first()).toContainText("Mistral Large 4 来了", { timeout: 15_000 });
    // 原文作为第二行保留（方便对照）
    await expect(items.first().getByTestId("hot-original")).toHaveText("Mistral Large 4 is here");
    await expect(items.nth(1)).toContainText("分享数学领域的 AI 进展");
    await expect(newTab.getByTestId("hot-translate")).toHaveClass(/kt-hot-translate-on/);

    // 发给模型的是标题原文，用的是共享配置里的模型名
    const sent = bodies.join("\n");
    expect(sent).toContain("Mistral Large 4 is here");
    expect(sent).toContain("test-model");

    // 译文与开关都落到本地
    const stored = await newTab.evaluate(() => {
      const store = (
        window as unknown as {
          __kaijtab: {
            state: {
              value: {
                moduleData: Record<string, { translations?: Record<string, string> }>;
                modules: { settings: Record<string, { translate?: boolean }> };
              };
            };
          };
        }
      ).__kaijtab;
      const data = store.state.value.moduleData;
      const key = Object.keys(data).find((k) => k.startsWith("hot-list:"));
      return {
        translations: key ? Object.keys(data[key]?.translations ?? {}).length : 0,
        translate: store.state.value.modules.settings["hot-list"]?.translate === true,
      };
    });
    expect(stored.translations).toBeGreaterThanOrEqual(2);
    expect(stored.translate).toBe(true);
  });

  test("Lobsters：未配置 AI 时点「译」弹出设置层，且挂在 body 上不被元件裁切", async ({
    newTab,
    context,
  }) => {
    await context.route("**/lobste.rs/**", (route) =>
      route.fulfill({
        json: [
          {
            title: "Brut, the Brutal Router for Unix Tools",
            url: "https://example.com/l",
            score: 31,
            short_id: "abc123",
          },
        ],
      }),
    );

    await addModule(newTab, "hot-list");
    await seedHotSource(newTab, "lobsters", null);

    await expect(newTab.getByTestId("hot-item").first()).toContainText(
      "Brut, the Brutal Router for Unix Tools",
      { timeout: 20_000 },
    );

    await newTab.getByTestId("hot-translate").click();

    const modal = newTab.getByTestId("hot-translate-modal");
    await expect(modal).toBeVisible();
    // 弹窗 portal 到 body：元件容器的 overflow:hidden 裁不到它
    await expect(newTab.locator("body > .kt-hot-modal")).toHaveCount(1);
    await expect(modal).toContainText("接入你的 AI 接口");
    await expect(modal.getByTestId("ai-base-url")).toBeVisible();

    // 关掉弹窗后开关不留在打开状态
    await modal.locator(".kt-hot-modal-close").click();
    await expect(modal).toHaveCount(0);
    await expect(newTab.getByTestId("hot-translate")).not.toHaveClass(/kt-hot-translate-on/);
  });
});
