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

// 1. 展示态（默认渐变壁纸）
await shot("01-view-default.png");

// 2. 编辑态 + 模块中心（添加时钟）
await enterEdit();
await page.getByTestId("open-module-center").click();
await page.getByTestId("module-add-clock").click();
await page.waitForTimeout(800);
await page.getByTestId("open-module-center").click();
await page.waitForTimeout(400);
await shot("02-edit-module-center.png");
await page.getByTestId("module-center").locator(".kt-panel-close").click();
await page.waitForTimeout(300);

// 3. 选中元件（手柄 + 选中框）
await page.locator('.kt-item[data-widget-type="clock"] [data-testid="drag-layer"]').click();
await page.waitForTimeout(300);
await shot("03-edit-selected.png");

// 4. 把时钟放大（验证内容跟随缩放）
await page.evaluate(() => {
  const store = window.__kaijtab;
  const state = store.state.value;
  const vp = store.viewport.value;
  const item = state.layout.items.find((i) => i.type === "clock");
  if (!item) return;
  store.updateItemRect(item.id, {
    x: item.x * vp.w,
    y: Math.max(0.42 * vp.h, item.y * vp.h),
    w: 640,
    h: 340,
  });
});
await page.waitForTimeout(600);
await shot("04-clock-scaled.png");

// 5. 设置面板（玻璃效果选项）
await page.getByTestId("open-settings").click();
await page.waitForTimeout(400);
await shot("05-settings-glass.png");
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
await shot("06-wallpaper-panel.png");
await page.getByTestId("wallpaper-panel").locator(".kt-panel-close").click();

// 7. 展示态：磨砂玻璃 + 动态壁纸
await exitEdit();
await page.waitForTimeout(1200);
await shot("07-view-frost.png");

// 8. 展示态：液态玻璃
await enterEdit();
await page.getByTestId("open-settings").click();
await page.getByTestId("glass-liquid").click();
await page.getByTestId("settings-panel").locator(".kt-panel-close").click();
await exitEdit();
await page.waitForTimeout(1200);
await shot("08-view-liquid.png");

await context.close();
console.log(`截图已生成：${out}`);
