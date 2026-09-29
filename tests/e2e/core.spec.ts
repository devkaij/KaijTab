import { enterEditMode, expect, readState, test } from "./fixtures";

test.describe("核心底座", () => {
  test("切换搜索引擎并持久化", async ({ newTab }) => {
    await newTab.getByTestId("engine-switch").click();
    await newTab.getByTestId("engine-menu").getByText("百度").click();

    await expect(newTab.getByTestId("engine-switch")).toContainText("百度");
    await newTab.waitForTimeout(500);
    const state = await readState(newTab);
    expect((state.settings as { searchEngine: string }).searchEngine).toBe("baidu");
  });

  test("搜索回车跳转到对应引擎", async ({ newTab }) => {
    await newTab.getByTestId("search-input").fill("kaijtab 测试");
    await newTab.getByTestId("search-input").press("Enter");
    await newTab.waitForURL(/bing\.com\/search/, { timeout: 15_000 });
    expect(newTab.url()).toContain("kaijtab");
  });

  test("新增与删除快捷方式", async ({ newTab }) => {
    await enterEditMode(newTab);

    await newTab.getByTestId("shortcut-add").click();
    await newTab.getByTestId("shortcut-title").fill("测试站点");
    await newTab.getByTestId("shortcut-url").fill("example.com");
    await newTab.getByTestId("shortcut-save").click();

    await expect(newTab.getByText("测试站点")).toBeVisible();
    await newTab.waitForTimeout(500);
    const stateAfterAdd = await readState(newTab);
    const itemsAfterAdd = (
      stateAfterAdd.shortcuts as { items: Array<{ title: string; url: string }> }
    ).items;
    const added = itemsAfterAdd.find((i) => i.title === "测试站点");
    expect(added?.url).toBe("https://example.com");

    // 删除
    newTab.on("dialog", (dialog) => void dialog.accept());
    const tile = newTab.locator('[data-testid^="shortcut-"]', { hasText: "测试站点" });
    await tile.getByTitle("删除").click();
    await newTab.waitForTimeout(500);

    const stateAfterDelete = await readState(newTab);
    const itemsAfterDelete = (stateAfterDelete.shortcuts as { items: Array<{ title: string }> }).items;
    expect(itemsAfterDelete.some((i) => i.title === "测试站点")).toBe(false);
  });
});
