import { dragBy, enterEditMode, expect, readState, test } from "./fixtures";

const SHORTCUTS_ITEM = '.kt-item[data-widget-type="core:shortcuts"]';

async function enterArrangeMode(newTab: Parameters<typeof enterEditMode>[0]) {
  await newTab.locator(SHORTCUTS_ITEM).click({ button: "right" });
  await newTab.getByTestId("menu-arrange-shortcuts").click();
  await expect(newTab.getByTestId("shortcut-arrange-bar")).toBeVisible();
}

test.describe("网站导航：图标自由摆放", () => {
  test("排列图标：拖动 → 位置持久化 → 刷新保留", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await enterArrangeMode(newTab);
    await expect(newTab.locator(SHORTCUTS_ITEM)).toHaveAttribute("data-arranging", "true");

    const firstTile = newTab.locator("[data-shortcut-tile]").first();
    const tileId = (await firstTile.getAttribute("data-shortcut-tile"))!;
    const before = (await firstTile.boundingBox())!;

    await dragBy(newTab, `[data-shortcut-tile="${tileId}"]`, 150, 90);
    await newTab.waitForTimeout(500);

    // DOM 位置变了
    const after = (await firstTile.boundingBox())!;
    expect(after.x).toBeGreaterThan(before.x + 40);
    expect(after.y).toBeGreaterThan(before.y + 30);

    // 存储：被拖的图标有位置；首次拖动会为全部图标播种位置
    const state = await readState(newTab);
    const items = (
      state.shortcuts as { items: Array<{ id: string; pos?: { x: number; y: number } }> }
    ).items;
    const moved = items.find((i) => i.id === tileId);
    expect(moved?.pos).toBeTruthy();
    expect(items.filter((i) => i.pos).length).toBeGreaterThanOrEqual(2);
    for (const item of items) {
      if (!item.pos) continue;
      expect(item.pos.x).toBeGreaterThanOrEqual(0);
      expect(item.pos.x).toBeLessThanOrEqual(1);
      expect(item.pos.y).toBeGreaterThanOrEqual(0);
      expect(item.pos.y).toBeLessThanOrEqual(1);
    }

    // 完成排列 → 退出排列模式
    await newTab.getByTestId("shortcut-arrange-done").click();
    await expect(newTab.getByTestId("shortcut-arrange-bar")).toHaveCount(0);
    await expect(newTab.locator(SHORTCUTS_ITEM)).toHaveAttribute("data-arranging", "false");

    // 刷新后位置保留（绝对定位样式仍在）
    const page = await reopen();
    await page.locator(".kt-item").first().waitFor();
    const tileAfterReload = page.locator(`[data-shortcut-tile="${tileId}"]`);
    const left = await tileAfterReload.evaluate((el) => (el as HTMLElement).style.left);
    expect(left).not.toBe("");
    await page.close();
  });

  test("Esc 退出排列模式，未拖动时不写入位置", async ({ newTab }) => {
    await enterEditMode(newTab);
    await enterArrangeMode(newTab);
    await newTab.keyboard.press("Escape");
    await expect(newTab.getByTestId("shortcut-arrange-bar")).toHaveCount(0);

    await newTab.waitForTimeout(400);
    const state = await readState(newTab);
    const items = (state.shortcuts as { items: Array<{ pos?: unknown }> }).items;
    expect(items.some((i) => i.pos)).toBe(false);
  });

  test("恢复自动排列：清空位置回到网格", async ({ newTab }) => {
    await enterEditMode(newTab);
    await enterArrangeMode(newTab);

    const tileId = (await newTab.locator("[data-shortcut-tile]").first().getAttribute(
      "data-shortcut-tile",
    ))!;
    await dragBy(newTab, `[data-shortcut-tile="${tileId}"]`, 60, 60);
    await newTab.waitForTimeout(400);

    let state = await readState(newTab);
    let items = (state.shortcuts as { items: Array<{ pos?: unknown }> }).items;
    expect(items.some((i) => i.pos)).toBe(true);

    await newTab.getByTestId("shortcut-arrange-reset").click();
    await newTab.waitForTimeout(400);

    state = await readState(newTab);
    items = (state.shortcuts as { items: Array<{ pos?: unknown }> }).items;
    expect(items.some((i) => i.pos)).toBe(false);

    const left = await newTab
      .locator("[data-shortcut-tile]")
      .first()
      .evaluate((el) => (el as HTMLElement).style.left);
    expect(left).toBe("");
  });

  test("自由模式下新增图标自动落到已有图标下方", async ({ newTab }) => {
    await enterEditMode(newTab);
    await enterArrangeMode(newTab);
    const tileId = (await newTab.locator("[data-shortcut-tile]").first().getAttribute(
      "data-shortcut-tile",
    ))!;
    await dragBy(newTab, `[data-shortcut-tile="${tileId}"]`, 40, 40);
    await newTab.getByTestId("shortcut-arrange-done").click();
    await newTab.waitForTimeout(400);

    // 仍处于编辑态，直接添加快捷方式
    await newTab.getByTestId("shortcut-add").click();
    await newTab.getByTestId("shortcut-title").fill("新站点");
    await newTab.getByTestId("shortcut-url").fill("example.com");
    await newTab.getByTestId("shortcut-save").click();
    await newTab.waitForTimeout(500);

    const state = await readState(newTab);
    const items = (
      state.shortcuts as { items: Array<{ title: string; pos?: { x: number; y: number } }> }
    ).items;
    const added = items.find((i) => i.title === "新站点");
    expect(added?.pos).toBeTruthy();
    expect(added!.pos!.x).toBe(0);
  });
});
