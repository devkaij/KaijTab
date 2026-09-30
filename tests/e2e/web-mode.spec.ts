import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:4173/main.html";

/** 纯网页（PWA）模式：没有 chrome.* API，也能正常启动、编辑、持久化 */
test.describe("纯网页 / PWA 模式", () => {
  test("启动与自适应布局（无扩展 API）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });

    // 运行环境确实是网页模式
    const mode = await page.evaluate(() => ({
      hasChrome:
        typeof (globalThis as { chrome?: { storage?: unknown } }).chrome?.storage !== "undefined",
      hasManifest: Boolean(document.querySelector('link[rel="manifest"]')),
    }));
    expect(mode.hasChrome).toBe(false);
    expect(mode.hasManifest).toBe(true);

    await expect(page.locator('.kt-item[data-widget-type="core:search"]')).toBeVisible();
    await expect(page.locator('.kt-item[data-widget-type="core:shortcuts"]')).toBeVisible();
  });

  test("编辑布局并持久化（localStorage 存储）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator(".kt-item").first().waitFor();

    await page.locator(".kt-app").hover();
    await page.getByTestId("edit-entry").click();
    await expect(page.getByTestId("editor-toolbar")).toBeVisible();

    const item = page.locator('.kt-item[data-widget-type="core:search"]');
    const before = (await item.boundingBox())!;
    const layer = item.locator('[data-testid="drag-layer"]');
    const box = (await layer.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = (await item.boundingBox())!;
    expect(after.y).toBeGreaterThan(before.y + 40);

    // 存储落在 localStorage（kaijtab: 前缀）
    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("kaijtab:")),
    );
    expect(stored).toContain("kaijtab:state");

    // 刷新后位置保留
    await page.reload();
    await page.locator(".kt-item").first().waitFor();
    const reloaded = (await page.locator('.kt-item[data-widget-type="core:search"]').boundingBox())!;
    expect(Math.abs(reloaded.y - after.y)).toBeLessThan(4);
  });

  test("设置面板显示运行模式，且同步不可用有明确说明", async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator(".kt-item").first().waitFor();

    await page.locator(".kt-app").hover();
    await page.getByTestId("edit-entry").click();
    await page.getByTestId("open-settings").click();

    const panel = page.getByTestId("settings-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("纯网页（PWA）");
    await expect(page.getByTestId("sync-unavailable")).toBeVisible();
    await expect(page.getByTestId("sync-toggle")).toHaveCount(0);
  });

  test("壁纸管线在网页模式下可用（OPFS）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator(".kt-item").first().waitFor();

    await page.locator(".kt-app").hover();
    await page.getByTestId("edit-entry").click();
    await page.getByTestId("open-wallpaper-panel").click();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.setInputFiles('[data-testid="file-input"]', {
      name: "web-mode.png",
      mimeType: "image/png",
      buffer: png,
    });

    await expect(page.getByTestId("wallpaper-image")).toBeVisible({ timeout: 20_000 });
  });

  test("PWA 可安装要素齐全（manifest + service worker）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator(".kt-item").first().waitFor();
    await page.waitForTimeout(1500);

    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) return null;
      const response = await fetch(link.href);
      return (await response.json()) as { name?: string; start_url?: string; icons?: unknown[] };
    });
    expect(manifest?.name).toContain("KaijTab");
    expect(manifest?.start_url).toBe("./main.html");
    expect((manifest?.icons ?? []).length).toBeGreaterThanOrEqual(2);

    const registered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    expect(registered).toBe(true);
  });
});
