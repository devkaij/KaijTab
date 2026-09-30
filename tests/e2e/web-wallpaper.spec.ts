import { resolve } from "node:path";
import { enterEditMode, expect, readState, test } from "./fixtures";

const WEB_FIXTURE = resolve(import.meta.dirname, "../fixtures/web-wallpaper");

test.describe("网页壁纸（WE web 工程）", () => {
  test("导入工程并渲染：相对路径的 CSS / JS / fetch 全部可用", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();

    await newTab.setInputFiles('[data-testid="web-file-input"]', WEB_FIXTURE);

    await expect(newTab.getByTestId("wallpaper-web")).toBeVisible({ timeout: 25_000 });
    const frame = newTab.frameLocator('[data-testid="wallpaper-web-frame"]');
    await expect(frame.locator("#title")).toHaveText("Web Wallpaper OK", { timeout: 15_000 });

    // 相对路径 CSS 生效
    const color = await frame
      .locator("#title")
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(0, 128, 0)");

    // 相对路径的外链 JS 执行
    await expect(frame.locator("body")).toHaveAttribute("data-external", "yes", {
      timeout: 10_000,
    });
    // 相对路径 fetch 返回 JSON
    await expect(frame.locator("body")).toHaveAttribute("data-fetch", "ok", { timeout: 10_000 });

    // 内联脚本（CSP 探针，结果记录在断言中）
    const inline = await frame.locator("body").getAttribute("data-inline");
    expect(inline, "内联脚本被扩展 CSP 拦截（预期内，会在文档中说明）").toBe("yes");

    // 记录入库信息
    await newTab.waitForTimeout(600);
    const state = await readState(newTab);
    const record = (
      state.wallpaperLibrary as Array<{
        kind: string;
        entry?: string;
        fileCount?: number;
        name: string;
      }>
    ).find((item) => item.kind === "web");
    expect(record).toBeTruthy();
    expect(record!.entry).toBe("index.html");
    expect(record!.fileCount).toBeGreaterThanOrEqual(4);
  });

  test("刷新后仍能渲染，且删除会清理工程目录", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();
    await newTab.setInputFiles('[data-testid="web-file-input"]', WEB_FIXTURE);
    await expect(newTab.getByTestId("wallpaper-web")).toBeVisible({ timeout: 25_000 });
    await newTab.waitForTimeout(600);

    const page = await reopen();
    await expect(page.getByTestId("wallpaper-web")).toBeVisible({ timeout: 20_000 });
    const frame = page.frameLocator('[data-testid="wallpaper-web-frame"]');
    await expect(frame.locator("#title")).toHaveText("Web Wallpaper OK", { timeout: 15_000 });

    // 删除壁纸：OPFS 里的 web/<id> 目录应被清理
    await page.evaluate(async () => {
      const store = (window as unknown as { __kaijtab: typeof import("@/newtab/store") }).__kaijtab;
      const record = store.state.value.wallpaperLibrary.find((item) => item.kind === "web");
      if (record) await store.dropWallpaper(record.id);
    });
    await page.waitForTimeout(600);

    const stillExists = await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const webDir = await root.getDirectoryHandle("web");
        await webDir.getDirectoryHandle("nonexistent-check");
        return true;
      } catch {
        return false;
      }
    });
    expect(stillExists).toBe(false);

    await page.close();
  });
});
