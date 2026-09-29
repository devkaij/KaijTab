import { dragBy, enterEditMode, expect, test } from "./fixtures";

const SEARCH_ITEM = '.kt-item[data-widget-type="core:search"]';

async function addClock(newTab: Parameters<typeof enterEditMode>[0]) {
  await enterEditMode(newTab);
  await newTab.getByTestId("open-module-center").click();
  await newTab.getByTestId("module-add-clock").click();
  await expect(newTab.getByTestId("clock")).toBeVisible({ timeout: 15_000 });
}

async function chooseGlass(
  newTab: Parameters<typeof enterEditMode>[0],
  mode: "none" | "frost" | "liquid",
) {
  await newTab.getByTestId("open-settings").click();
  await newTab.getByTestId(`glass-${mode}`).click();
  await newTab.getByTestId("settings-panel").locator(".kt-panel-close").click();
}

test.describe("外观：玻璃效果与尺寸自适应", () => {
  test("全局玻璃效果切换写入并反映到元件上", async ({ newTab }) => {
    await enterEditMode(newTab);

    // 默认磨砂玻璃
    await expect(newTab.locator(SEARCH_ITEM)).toHaveAttribute("data-glass", "frost");

    await chooseGlass(newTab, "liquid");
    await expect(newTab.locator(SEARCH_ITEM)).toHaveAttribute("data-glass", "liquid");

    await chooseGlass(newTab, "none");
    await expect(newTab.locator(SEARCH_ITEM)).toHaveAttribute("data-glass", "none");

    // 设置持久化
    await newTab.waitForTimeout(600);
    const stored = await newTab.evaluate(async () => {
      const data = await chrome.storage.local.get("state");
      return (data.state as { settings: { glassEffect: string } }).settings.glassEffect;
    });
    expect(stored).toBe("none");
  });

  test("实例级覆盖优先于全局", async ({ newTab }) => {
    await enterEditMode(newTab);
    await chooseGlass(newTab, "liquid");

    // 右键 → 设置 → 该元件改为"无"
    await newTab.locator(SEARCH_ITEM).click({ button: "right" });
    await newTab.getByTestId("menu-settings").click();
    await expect(newTab.getByTestId("instance-settings")).toBeVisible();
    await newTab.getByTestId("item-glass").selectOption("none");
    await newTab.getByTestId("instance-settings-save").click();

    await expect(newTab.locator(SEARCH_ITEM)).toHaveAttribute("data-glass", "none");
    // 其他元件不受影响
    await expect(newTab.locator('.kt-item[data-widget-type="core:shortcuts"]')).toHaveAttribute(
      "data-glass",
      "liquid",
    );
  });

  test("元件内容随尺寸缩放（时钟）", async ({ newTab }) => {
    await addClock(newTab);

    const clockItem = newTab.locator('.kt-item[data-widget-type="clock"]');
    const timeText = newTab.locator(".kt-clock-time");
    const inlineSize = () =>
      clockItem.evaluate((el) => {
        const node = el as HTMLElement;
        return { w: node.style.width, h: node.style.height };
      });

    // 选中（拖拽层 pointerdown 即选中）并确认手柄出现
    await clockItem.locator('[data-testid="drag-layer"]').click();
    const handle = clockItem.locator('[data-handle="se"]');
    await expect(handle).toBeVisible();

    const sizeBefore = await inlineSize();
    const fontBefore = await timeText.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontBefore).toBeGreaterThan(30);

    // 放大
    await dragBy(newTab, '.kt-item[data-widget-type="clock"] [data-handle="se"]', 160, 120);
    await newTab.waitForTimeout(400);

    const sizeAfter = await inlineSize();
    const fontAfter = await timeText.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(parseFloat(sizeAfter.w)).toBeGreaterThan(parseFloat(sizeBefore.w) + 100);
    expect(fontAfter).toBeGreaterThan(fontBefore * 1.15);

    // 缩小回去，字号应变小
    await dragBy(newTab, '.kt-item[data-widget-type="clock"] [data-handle="se"]', -240, -180);
    await newTab.waitForTimeout(400);
    const fontShrunk = await timeText.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontShrunk).toBeLessThan(fontAfter);
  });

  test("网站图标：站点候选失败时回退首字母，且不残留破图", async ({ newTab, context }) => {
    // 断掉站点自带的图标请求，验证回退链最终落到首字母色块（而不是空白格）
    await context.route(/\/favicon\.(ico|png)$/, (route) => route.abort());
    await context.route(/\/apple-touch-icon\.png$/, (route) => route.abort());

    await newTab.reload();
    await newTab.locator(".kt-item").first().waitFor();
    await newTab.waitForTimeout(2500);

    const letters = await newTab.locator(".kt-sc-letter").count();
    expect(letters).toBeGreaterThanOrEqual(5);

    // 已加载成功的图标必须能正常解码；未成功的应已被首字母替换（不能是破图）
    const broken = await newTab.locator(".kt-sc-icon img").evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).filter((img) => img.complete && img.naturalWidth === 0).length,
    );
    expect(broken).toBe(0);
  });
});
