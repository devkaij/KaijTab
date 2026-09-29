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

await context.close();
console.log(`截图已生成：${out}`);
