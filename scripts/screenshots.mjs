#!/usr/bin/env node
/**
 * 生成人工验收用的截图：scripts/screenshots.mjs
 * 产物：docs/screenshots/*.png
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ext = resolve(root, "dist");
const out = resolve(root, "docs", "screenshots");
await mkdir(out, { recursive: true });

const demoVideo = resolve(out, "demo-wallpaper.mp4");
const context = await chromium.launchPersistentContext("", {
  headless: false,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run"],
});

let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent("serviceworker");
const extensionId = new URL(worker.url()).host;

const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/main.html`);
await page.locator(".kt-item").first().waitFor();
await page.waitForTimeout(1200); // 等网站图标加载

const enterEdit = async () => {
  await page.locator(".kt-app").hover();
  await page.getByTestId("edit-entry").click();
  await page.waitForTimeout(300);
};
const exitEdit = async () => {
  await page.getByTestId("edit-done").click();
  await page.waitForTimeout(500);
};
const shot = (name) => page.screenshot({ path: resolve(out, name) });
const addModule = async (id) => {
  await page.getByTestId("open-module-center").click();
  await page.getByTestId(`module-add-${id}`).waitFor({ timeout: 10_000 });
  await page.getByTestId(`module-add-${id}`).click();
  await page.waitForTimeout(350);
};

// 1. 展示态（默认渐变壁纸）
await shot("01-view-default.png");

// 2. 模块中心（所有可用模块）
await enterEdit();
await page.getByTestId("open-module-center").click();
await page.waitForTimeout(400);
await shot("02-module-center.png");
await page.getByTestId("module-center").locator(".kt-panel-close").click();
await page.waitForTimeout(300);

// 3. 逐个添加模块，并用 store 摆成整齐的布局
for (const id of ["clock", "countdown", "weather", "note", "todo", "bookmarks"]) {
  await addModule(id);
}
await page.evaluate(() => {
  const store = window.__kaijtab;
  const boxes = {
    clock: [1200, 300, 340, 180],
    weather: [1200, 500, 340, 200],
    countdown: [60, 300, 280, 170],
    note: [60, 490, 300, 230],
    todo: [380, 480, 340, 260],
    bookmarks: [740, 480, 400, 260],
  };
  for (const [type, [x, y, w, h]] of Object.entries(boxes)) {
    const item = store.state.value.layout.items.find((i) => i.type === type);
    if (item) store.updateItemRect(item.id, { x, y, w, h });
  }
});
await page.waitForTimeout(500);

// 4. 编辑态全景（选中时钟，显示手柄）
await page.locator('.kt-item[data-widget-type="clock"] [data-testid="drag-layer"]').click();
await page.waitForTimeout(300);
await shot("03-edit-layout.png");

// 5. 设置面板（玻璃效果）
await page.getByTestId("open-settings").click();
await page.waitForTimeout(400);
await shot("04-settings-glass.png");
await page.getByTestId("settings-panel").locator(".kt-panel-close").click();

// 6. 导入动态壁纸
await page.getByTestId("open-wallpaper-panel").click();
await page.setInputFiles('[data-testid="file-input"]', {
  name: "渐变演示.mp4",
  mimeType: "video/mp4",
  buffer: readFileSync(demoVideo),
});
await page
  .getByTestId("wallpaper-panel")
  .getByText("渐变演示", { exact: false })
  .first()
  .waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await shot("05-wallpaper-panel.png");
await page.getByTestId("wallpaper-panel").locator(".kt-panel-close").click();

// 7. 展示态：把内容填起来（便签文字 / 待办条目 / 书签）
await exitEdit();

const note = page.getByTestId("note-area");
await note.click();
await note.fill("• 周五前交周报\n• 给显示器换根线\n• 周末去趟超市");

await page.getByTestId("todo-input").fill("买牛奶");
await page.getByTestId("todo-input").press("Enter");
await page.getByTestId("todo-input").fill("交周报");
await page.getByTestId("todo-input").press("Enter");
await page.getByTestId("todo-input").fill("预约体检");
await page.getByTestId("todo-input").press("Enter");
await page.locator('[data-testid^="todo-row-"]').first().locator('input[type="checkbox"]').click();

await page.evaluate(async () => {
  const create = (details) =>
    new Promise((resolveDone) => chrome.bookmarks.create(details, () => resolveDone()));
  await create({ parentId: "1", title: "GitHub", url: "https://github.com/" });
  await create({ parentId: "1", title: "哔哩哔哩", url: "https://www.bilibili.com/" });
  await create({ parentId: "1", title: "知乎", url: "https://www.zhihu.com/" });
  await create({ parentId: "1", title: "知乎热榜", url: "https://www.zhihu.com/hot" });
});

// 等天气拉取 + 书签图标
await page.waitForTimeout(6000);
await shot("06-view-frost.png");

// 8. 液态玻璃
await enterEdit();
await page.getByTestId("open-settings").click();
await page.getByTestId("glass-liquid").click();
await page.getByTestId("settings-panel").locator(".kt-panel-close").click();
await exitEdit();
await page.waitForTimeout(1200);
await shot("07-view-liquid.png");

// 8. 网站导航：排列图标（拖动中，含参考线）
await enterEdit();
await page.locator('.kt-item[data-widget-type="core:shortcuts"]').click({ button: "right" });
await page.getByTestId("menu-arrange-shortcuts").click();
await page.waitForTimeout(400);
const draggable = page.locator("[data-shortcut-tile]").nth(3);
const tileBox = await draggable.boundingBox();
await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
await page.mouse.down();
await page.mouse.move(tileBox.x + tileBox.width / 2 - 40, tileBox.y + tileBox.height / 2 + 130, {
  steps: 14,
});
await page.waitForTimeout(300);
await shot("08-shortcuts-arrange.png");
await page.mouse.up();
await page.getByTestId("shortcut-arrange-done").click();
await page.waitForTimeout(300);

// 9. 大尺寸时钟（内容自适应）
await page.evaluate(() => {
  const store = window.__kaijtab;
  const item = store.state.value.layout.items.find((i) => i.type === "clock");
  if (item) store.updateItemRect(item.id, { x: 470, y: 250, w: 660, h: 360 });
});
await page.waitForTimeout(600);
await shot("09-clock-scaled.png");

// 10. 浅色模式（跟随系统 / 手动切换）
await page.getByTestId("open-settings").click();
await page.getByTestId("theme-light").click();
await page.getByTestId("settings-panel").locator(".kt-panel-close").click();
await page.evaluate(() => {
  const store = window.__kaijtab;
  const item = store.state.value.layout.items.find((i) => i.type === "clock");
  if (item) store.updateItemRect(item.id, { x: 1200, y: 300, w: 340, h: 180 });
  store.setCurrentWallpaper(null); // 切回默认背景，展示浅色主题本身
});
await page.getByTestId("edit-done").click();
await page.waitForTimeout(1200);
await shot("10-view-light.png");

// 11. AI 推荐（接一个假接口演示交互；真实使用需填自己的 Key）
await context.route("**/api.example.com/**", (route) =>
  route.fulfill({
    json: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: [
                { title: "GitHub · 你的仓库", url: "https://github.com/", reason: "你最近常看代码" },
                { title: "哔哩哔哩 · 稍后再看", url: "https://www.bilibili.com/", reason: "晚上常刷视频" },
                { title: "知乎热榜", url: "https://www.zhihu.com/hot", reason: "午休时段常看热榜" },
                { title: "微博热搜", url: "https://s.weibo.com/top/summary", reason: "关注今日热点" },
              ],
            }),
          },
        },
      ],
    },
  }),
);
await page.evaluate(() => {
  const store = window.__kaijtab;
  store.updateSettings({ theme: "dark" });
});
await enterEdit();
await addModule("ai-recommend");
await page.getByTestId("edit-done").click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const store = window.__kaijtab;
  store.commit((s) => ({
    ...s,
    modules: {
      ...s.modules,
      settings: { ...s.modules.settings, "ai-recommend": { baseUrl: "https://api.example.com/v1", model: "gpt-4o-mini" } },
    },
    localSecrets: { ...s.localSecrets, "ai-recommend:apiKey": "sk-demo" },
  }));
});
await page.waitForTimeout(700);
await page.reload();
await page.locator(".kt-item").first().waitFor();
await page.waitForSelector('[data-testid="ai-item"]', { timeout: 20000 });
await page.evaluate(() => {
  const store = window.__kaijtab;
  const boxes = {
    "ai-recommend": [740, 470, 450, 290],
    bookmarks: [760, 770, 430, 120],
  };
  for (const [type, [x, y, w, h]] of Object.entries(boxes)) {
    const item = store.state.value.layout.items.find((i) => i.type === type);
    if (item) store.updateItemRect(item.id, { x, y, w, h });
  }
});
await page.waitForTimeout(1000);
await shot("11-ai-recommend.png");

// 12. 第二批模块：清掉旧模块，只留新模块，摆成整齐两行
await enterEdit();
await page.evaluate(() => {
  const store = window.__kaijtab;
  const keep = new Set([
    "core:search",
    "core:shortcuts",
    "quote",
    "world-clock",
    "hot-list",
    "rss",
    "calendar",
    "radio",
  ]);
  for (const item of store.state.value.layout.items.filter((i) => !keep.has(i.type))) {
    store.removeInstance(item.id);
  }
});
for (const id of ["quote", "world-clock", "hot-list", "rss", "calendar", "radio"]) {
  await addModule(id);
}

// 给 RSS / 日历注入示例内容（跳过需要用户手势的授权弹窗）
await page.evaluate(() => {
  const store = window.__kaijtab;
  const now = Date.now();
  store.commit((raw) => {
    const state = structuredClone(raw);
    const today = new Date();
    today.setHours(14, 0, 0, 0);
    for (const item of state.layout.items) {
      if (item.type === "rss") {
        item.props.feeds = "https://example.com/feed.xml";
        state.moduleData[`rss:${item.id}`] = {
          cache: {
            at: now,
            items: [
              { title: "AI 编码代理正在改变前端工程", url: "https://example.com/1", time: now - 1_800_000, source: "掘金" },
              { title: "WebGPU 实战：把着色器搬进浏览器", url: "https://example.com/2", time: now - 7_200_000, source: "InfoQ" },
              { title: "Rust 1.90 发布：编译速度再提升", url: "https://example.com/3", time: now - 10_800_000, source: "Rust Blog" },
            ],
          },
        };
      }
      if (item.type === "calendar") {
        item.props.url = "https://example.com/cal.ics";
        state.moduleData[`calendar:${item.id}`] = {
          cache: {
            at: now,
            events: [
              { uid: "e1", summary: "产品评审会", start: today.toISOString(), end: null, allDay: false, location: "会议室 A" },
              { uid: "e2", summary: "季度总结（全天）", start: new Date(today.getTime() + 86_400_000).toISOString(), end: null, allDay: true },
              { uid: "e3", summary: "周五分享：本地模型部署", start: new Date(now + 2 * 86_400_000).toISOString(), end: null, allDay: false },
            ],
          },
        };
      }
    }
    return state;
  });
});
await page.waitForTimeout(500);

// 注入示例数据后刷新一次，让 RSS / 日历从缓存渲染（刷新会退回展示态）
await page.reload();
await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  const store = window.__kaijtab;
  const boxes = {
    quote: [40, 470, 380, 200],
    "world-clock": [440, 470, 380, 200],
    "hot-list": [840, 470, 420, 210],
    rss: [40, 690, 380, 190],
    calendar: [440, 690, 380, 190],
    radio: [840, 690, 420, 190],
  };
  for (const [type, [x, y, w, h]] of Object.entries(boxes)) {
    const item = store.state.value.layout.items.find((i) => i.type === type);
    if (item) store.updateItemRect(item.id, { x, y, w, h });
  }
});
await page.waitForTimeout(1500);
await shot("14-new-modules.png");

// 13. 手机竖屏（触摸适配）：独立 profile，看到的是手机友好的首次布局
const phone = await chromium.launchPersistentContext("", {
  headless: false,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run"],
});
let [phoneWorker] = phone.serviceWorkers();
if (!phoneWorker) phoneWorker = await phone.waitForEvent("serviceworker");
const phoneExtensionId = new URL(phoneWorker.url()).host;
const phonePage = await phone.newPage();
await phonePage.goto(`chrome-extension://${phoneExtensionId}/main.html`);
await phonePage.locator(".kt-item").first().waitFor();
await phonePage.waitForTimeout(2000);
await phonePage.screenshot({ path: resolve(out, "12-mobile.png") });

// 13. 手机竖屏：全屏抽屉面板
await phonePage.getByTestId("edit-entry").tap();
await phonePage.getByTestId("open-module-center").tap();
await phonePage.waitForTimeout(500);
await phonePage.screenshot({ path: resolve(out, "13-mobile-panel.png") });
await phone.close();

await context.close();
console.log(`截图已生成：${out}`);
