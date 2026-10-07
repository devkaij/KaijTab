#!/usr/bin/env node
/**
 * 0.7.0 热榜：国外源 + 译中 的截图。
 * 国外榜单与翻译接口都用假响应，保证内容稳定、离线可复现。
 * 用法：node scripts/screenshot-hot-translate.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ext = resolve(root, "dist");
const out = resolve(root, "docs", "screenshots");
await mkdir(out, { recursive: true });

const HN_TITLES = [
  ["Mistral Large 4", "https://mistral.ai/news/mistral-large-4/", 1899],
  [
    "Sharing AI progress in mathematics",
    "https://openai.com/index/sharing-ai-progress-in-mathematics/",
    1032,
  ],
  [
    "EmbeddingGemma 2: An open, lightweight multimodal embedding model",
    "https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/",
    365,
  ],
  [
    "Tell HN: GitHub refuses to remove cracked copies of my software",
    "https://news.ycombinator.com/item?id=49982498",
    352,
  ],
  ["A tiny ray tracer in 200 lines of Rust", "https://example.com/raytracer", 240],
];

const ZH_TITLES = [
  "Mistral Large 4 发布",
  "分享数学领域的 AI 进展",
  "EmbeddingGemma 2：开放、轻量的多模态嵌入模型",
  "Tell HN：一个月过去，GitHub 仍拒绝下架我的软件破解版",
  "用 200 行 Rust 写成的迷你光线追踪器",
];

const context = await chromium.launchPersistentContext("", {
  headless: false,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run"],
});

await context.route("**/hn.algolia.com/**", (route) =>
  route.fulfill({
    json: {
      hits: HN_TITLES.map(([title, url, points], index) => ({
        objectID: String(index + 1),
        title,
        url,
        points,
      })),
    },
  }),
);

await context.route("**/api.example.com/**", (route) =>
  route.fulfill({
    json: { choices: [{ message: { content: JSON.stringify(ZH_TITLES) } }] },
  }),
);

let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent("serviceworker");
const extensionId = new URL(worker.url()).host;

const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/main.html`);
await page.locator(".kt-item").first().waitFor();
await page.evaluate(() => window.__kaijtab.updateSettings({ theme: "dark" }));
await page.waitForTimeout(900);

const placeHotList = async () => {
  await page.evaluate(() => {
    const store = window.__kaijtab;
    store.commit((raw) => {
      const state = structuredClone(raw);
      const keep = new Set(["core:search", "core:shortcuts", "hot-list"]);
      state.layout.items = state.layout.items.filter((item) => keep.has(item.type));
      return state;
    });
    const item = store.state.value.layout.items.find((i) => i.type === "hot-list");
    if (item) store.updateItemRect(item.id, { x: 860, y: 430, w: 470, h: 330 });
  });
  await page.waitForTimeout(600);
};

// 1. 加一个热榜元件，切到 Hacker News（先不配 AI）
await page.locator(".kt-app").hover();
await page.getByTestId("edit-entry").click();
await page.getByTestId("open-module-center").click();
await page.getByTestId("module-add-hot-list").waitFor({ timeout: 10_000 });
await page.getByTestId("module-add-hot-list").click();
await page.waitForTimeout(400);
await page.getByTestId("edit-done").click();
await page.waitForTimeout(300);

await page.evaluate(async () => {
  const store = window.__kaijtab;
  store.commit((raw) => {
    const state = structuredClone(raw);
    const item = state.layout.items.find((i) => i.type === "hot-list");
    if (item) item.props.source = "hackernews";
    return state;
  });
  await new Promise((r) => setTimeout(r, 600));
});
await page.reload();
await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
await page.waitForSelector('[data-testid="hot-item"]', { timeout: 20_000 });
await page.waitForTimeout(1200);
await placeHotList();

// 2. 未配置 AI 时点「译」：弹出接入层（挂在 body 上，不被元件裁切）
await page.getByTestId("hot-translate").click();
await page.getByTestId("hot-translate-modal").waitFor({ timeout: 10_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: resolve(out, "24-hot-list-translate-setup.png") });
await page.locator(".kt-hot-modal-close").click();
await page.waitForTimeout(300);

// 3. 配好接口后点「译」：中文在上、原文在下（+ 热榜英文榜）
await page.evaluate(async () => {
  const store = window.__kaijtab;
  store.commit((raw) => ({
    ...raw,
    modules: {
      ...raw.modules,
      settings: {
        ...raw.modules.settings,
        ai: { baseUrl: "https://api.example.com/v1", model: "gpt-4o-mini" },
      },
    },
    localSecrets: { ...raw.localSecrets, "ai:apiKey": "sk-demo" },
  }));
  await new Promise((r) => setTimeout(r, 700));
});
await page.reload();
await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
await page.waitForSelector('[data-testid="hot-item"]', { timeout: 20_000 });
await page.waitForTimeout(1200);
await placeHotList();
await page.getByTestId("hot-translate").click();
await page.waitForSelector('[data-testid="hot-original"]', { timeout: 20_000 });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(out, "23-hot-list-translate.png") });

await context.close();
console.log(`截图已生成：${out}`);
