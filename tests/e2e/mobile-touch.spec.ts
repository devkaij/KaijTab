import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";

const EXTENSION_PATH = resolve(import.meta.dirname, "../../dist");

/** 手机/平板形态：触摸 + 窄视口（独立的 context，不走桌面 fixture） */
test.describe("安卓手机 / 平板适配", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext("", {
      headless: false,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
      ],
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/main.html`);
    await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("首次播种按窄屏自适应，不出界", async () => {
    const search = page.locator('.kt-item[data-widget-type="core:search"]');
    const shortcuts = page.locator('.kt-item[data-widget-type="core:shortcuts"]');
    await expect(search).toBeVisible();

    const searchBox = (await search.boundingBox())!;
    const shortcutsBox = (await shortcuts.boundingBox())!;
    expect(searchBox.width).toBeLessThanOrEqual(390);
    expect(searchBox.x).toBeGreaterThanOrEqual(0);
    expect(shortcutsBox.width).toBeLessThanOrEqual(390);
    expect(shortcutsBox.x + shortcutsBox.width).toBeLessThanOrEqual(391);
  });

  test("触屏上编辑入口常驻可见（不依赖悬停），按钮可点", async () => {
    const entry = page.getByTestId("edit-entry");
    await expect(entry).toBeVisible();

    const box = (await entry.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);

    await entry.tap();
    await expect(page.getByTestId("editor-toolbar")).toBeVisible();

    // 工具栏在窄屏换行，不溢出
    const toolbar = (await page.getByTestId("editor-toolbar").boundingBox())!;
    expect(toolbar.x).toBeGreaterThanOrEqual(0);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(391);
  });

  test("触摸长按弹出上下文菜单（等价右键），不改变位置", async () => {
    const item = page.locator('.kt-item[data-widget-type="core:search"]');
    const before = await item.evaluate((el) => (el as HTMLElement).style.transform);
    const box = (await item.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await item.locator('[data-testid="drag-layer"]').dispatchEvent("pointerdown", {
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
    });
    await page.waitForTimeout(700);
    await expect(page.getByTestId("item-menu")).toBeVisible();

    await page.dispatchEvent("body", "pointerup", { pointerType: "touch", pointerId: 1 });
    await page.waitForTimeout(200);

    // 长按只是弹菜单：位置没有被拖动
    const after = await item.evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).toBe(before);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-menu")).toHaveCount(0);
  });

  test("面板在窄屏是全屏抽屉", async () => {
    await page.getByTestId("open-module-center").click();
    const panel = page.getByTestId("module-center");
    await expect(panel).toBeVisible();

    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThan(340);
    expect(box.x).toBeLessThanOrEqual(2);

    await panel.locator(".kt-panel-close").click();
    await expect(panel).toHaveCount(0);
  });

  test("触屏拖拽元件：跟手且不被页面滚动打断", async () => {
    const item = page.locator('.kt-item[data-widget-type="core:search"]');
    const before = (await item.boundingBox())!;

    await item.locator('[data-testid="drag-layer"]').dispatchEvent("pointerdown", {
      pointerType: "touch",
      button: 0,
      clientX: before.x + before.width / 2,
      clientY: before.y + before.height / 2,
      isPrimary: true,
      pointerId: 2,
    });
    // 合成事件不会真的做指针捕获，所以 move/up 也要派发在同一个元素上
    await item.locator('[data-testid="drag-layer"]').dispatchEvent("pointermove", {
      pointerType: "touch",
      pointerId: 2,
      clientX: before.x + before.width / 2 + 60,
      clientY: before.y + before.height / 2 + 120,
    });
    await page.waitForTimeout(150);
    await item.locator('[data-testid="drag-layer"]').dispatchEvent("pointerup", {
      pointerType: "touch",
      pointerId: 2,
    });
    await page.waitForTimeout(300);

    const after = (await item.boundingBox())!;
    expect(after.y).toBeGreaterThan(before.y + 60);
  });
});
