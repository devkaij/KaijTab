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
await page.waitForTimeout(600);

// 1. 展示态（默认壁纸）
await page.screenshot({ path: resolve(out, "01-view-default.png") });

// 2. 编辑态 + 模块中心
await page.locator(".kt-app").hover();
await page.getByTestId("edit-entry").click();
await page.getByTestId("open-module-center").click();
await page.getByTestId("module-add-clock").click();
await page.waitForTimeout(800);
await page.getByTestId("open-module-center").click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(out, "02-edit-module-center.png") });
await page.getByTestId("module-center").locator(".kt-panel-close").click();
await page.waitForTimeout(300);

// 3. 选中元件（手柄 + 选中框）
await page.locator('.kt-item[data-widget-type="clock"] [data-testid="drag-layer"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(out, "03-edit-selected.png") });

// 4. 导入动态壁纸（用生成的演示视频）
await page.getByTestId("open-wallpaper-panel").click();
await page.setInputFiles('[data-testid="file-input"]', {
  name: "渐变演示.mp4",
  mimeType: "video/mp4",
  buffer: readFileSync(demoVideo),
});
await page.getByTestId("wallpaper-panel").getByText("渐变演示", { exact: false }).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(out, "04-wallpaper-panel.png") });

// 5. 展示态 + 动态壁纸
await page.getByTestId("wallpaper-panel").locator(".kt-panel-close").click();
await page.getByTestId("edit-done").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(out, "05-view-wallpaper.png") });

await context.close();
console.log(`截图已生成：${out}`);
