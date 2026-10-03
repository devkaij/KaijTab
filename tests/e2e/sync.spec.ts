import { dragBy, enterEditMode, expect, test } from "./fixtures";

test.describe("浏览器账号同步", () => {
  test("开启同步：写入分块快照；关闭：清理云端键", async ({ newTab }) => {
    await enterEditMode(newTab);

    await newTab.getByTestId("open-settings").click();
    await newTab.getByTestId("sync-toggle").click();
    await expect(newTab.getByTestId("sync-toggle")).toContainText("同步已开启");

    await newTab.waitForTimeout(2500);
    const syncData = await newTab.evaluate(() => chrome.storage.sync.get(null));
    expect(syncData["sync:meta"]).toBeTruthy();
    expect(typeof syncData["sync:chunk:0"]).toBe("string");

    const meta = JSON.parse(String(syncData["sync:meta"])) as { v: number; chunks: number };
    expect(meta.v).toBe(1);
    expect(meta.chunks).toBeGreaterThanOrEqual(1);

    // 快照里应包含布局与快捷方式
    let joined = "";
    for (let i = 0; i < meta.chunks; i++) joined += String(syncData[`sync:chunk:${i}`]);
    const snapshot = JSON.parse(joined) as Record<string, unknown>;
    expect(snapshot.layout).toBeTruthy();
    expect(snapshot.shortcuts).toBeTruthy();
    expect(snapshot.wallpaperLibrary).toBeUndefined();
    expect(snapshot.moduleData).toBeUndefined();

    // 变更后自动重新推送
    await newTab.getByTestId("settings-panel").locator(".kt-panel-close").click();
    await dragBy(
      newTab,
      '.kt-item[data-widget-type="core:search"] [data-testid="drag-layer"]',
      60,
      0,
    );
    await newTab.waitForTimeout(2500);
    const chunkAfter = String(
      (await newTab.evaluate(() => chrome.storage.sync.get("sync:chunk:0")))["sync:chunk:0"],
    );
    expect(chunkAfter).toContain("layout");

    // 关闭并清理
    await newTab.getByTestId("open-settings").click();
    await newTab.getByTestId("sync-toggle").click();
    await newTab.waitForTimeout(1200);
    const afterDisable = await newTab.evaluate(() => chrome.storage.sync.get(null));
    expect(Object.keys(afterDisable).some((k) => k.startsWith("sync:"))).toBe(false);
  });
});
