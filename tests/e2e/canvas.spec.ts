import { dragBy, enterEditMode, expect, parseTransform, storedItems, test } from "./fixtures";

test.describe("画布引擎", () => {
  test("首次加载播种核心元件", async ({ newTab }) => {
    await expect(newTab.locator('.kt-item[data-widget-type="core:search"]')).toBeVisible();
    await expect(newTab.locator('.kt-item[data-widget-type="core:shortcuts"]')).toBeVisible();
    await expect(newTab.getByTestId("edit-entry")).toBeAttached();
  });

  test("拖拽元件：位置变化并持久化", async ({ newTab }) => {
    const item = newTab.locator('.kt-item[data-widget-type="core:search"]');
    const before = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));

    await enterEditMode(newTab);
    const storedBefore = (await storedItems(newTab)).find((i) => i.type === "core:search");
    expect(storedBefore).toBeTruthy();

    await dragBy(newTab, '.kt-item[data-widget-type="core:search"] [data-testid="drag-layer"]', 80, 100);

    const after = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));
    expect(after.x).toBeGreaterThan(before.x + 40);
    expect(after.y).toBeGreaterThan(before.y + 60);

    await newTab.waitForTimeout(700);
    const storedAfter = (await storedItems(newTab)).find((i) => i.type === "core:search");
    expect(storedAfter).toBeTruthy();
    expect(storedAfter!.x).toBeGreaterThan(storedBefore!.x);
    expect(storedAfter!.y).toBeGreaterThan(storedBefore!.y);
  });

  test("撤销与重做", async ({ newTab }) => {
    const item = newTab.locator('.kt-item[data-widget-type="core:search"]');
    await enterEditMode(newTab);

    const original = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));
    await dragBy(newTab, '.kt-item[data-widget-type="core:search"] [data-testid="drag-layer"]', 120, 0);
    const moved = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));
    expect(moved.x).toBeGreaterThan(original.x + 60);

    await newTab.keyboard.press("Control+z");
    const undone = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));
    expect(Math.abs(undone.x - original.x)).toBeLessThan(2);
    expect(Math.abs(undone.y - original.y)).toBeLessThan(2);

    await newTab.keyboard.press("Control+Shift+z");
    const redone = parseTransform(await item.evaluate((el) => (el as HTMLElement).style.transform));
    expect(Math.abs(redone.x - moved.x)).toBeLessThan(2);
  });

  test("缩放元件：尺寸写入存储", async ({ newTab }) => {
    await enterEditMode(newTab);
    const storedBefore = (await storedItems(newTab)).find((i) => i.type === "core:search")!;

    // 单击选中
    const item = newTab.locator('.kt-item[data-widget-type="core:search"]');
    await item.locator('[data-testid="drag-layer"]').click();
    const handle = item.locator('[data-handle="se"]');
    await expect(handle).toBeVisible();

    await dragBy(newTab, '.kt-item[data-widget-type="core:search"] [data-handle="se"]', 60, 40);
    await newTab.waitForTimeout(700);

    const storedAfter = (await storedItems(newTab)).find((i) => i.type === "core:search")!;
    expect(storedAfter.w).toBeGreaterThan(storedBefore.w + 30);
    expect(storedAfter.h).toBeGreaterThan(storedBefore.h + 20);
  });

  test("刷新后布局保留", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await dragBy(newTab, '.kt-item[data-widget-type="core:search"] [data-testid="drag-layer"]', 40, 40);
    await newTab.waitForTimeout(700);
    const saved = (await storedItems(newTab)).find((i) => i.type === "core:search")!;

    const page = await reopen();
    await expect(page.locator('.kt-item[data-widget-type="core:search"]')).toBeVisible();
    const afterReload = (await storedItems(page)).find((i) => i.type === "core:search")!;
    expect(afterReload.x).toBeCloseTo(saved.x, 3);
    expect(afterReload.y).toBeCloseTo(saved.y, 3);
    await page.close();
  });

  test("删除元件（右键菜单）", async ({ newTab }) => {
    await enterEditMode(newTab);
    const item = newTab.locator('.kt-item[data-widget-type="core:shortcuts"]');
    await item.click({ button: "right" });
    await newTab.getByTestId("item-menu").waitFor();
    await newTab.getByTestId("menu-delete").click();
    await newTab.waitForTimeout(500);
    await expect(item).toHaveCount(0);
    const items = await storedItems(newTab);
    expect(items.some((i) => i.type === "core:shortcuts")).toBe(false);
  });
});
