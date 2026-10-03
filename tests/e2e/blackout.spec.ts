import { enterEditMode, expect, test } from "./fixtures";

type Page = Parameters<typeof enterEditMode>[0];

async function addBlackout(page: Page): Promise<void> {
  await enterEditMode(page);
  await page.getByTestId("open-module-center").click();
  await expect(page.getByTestId("module-card-blackout")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("module-add-blackout").click();
  await expect(page.locator('.kt-item[data-widget-type="blackout"]')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("edit-done").click();
  await expect(page.getByTestId("editor-toolbar")).toHaveCount(0);
}

test.describe("熄屏模式", () => {
  test("一键进入全屏纯黑，点击任意处退出", async ({ newTab }) => {
    await addBlackout(newTab);
    const layer = newTab.getByTestId("blackout-layer");

    // 平时常驻但不可见、不拦截点击
    await expect(layer).toHaveAttribute("data-active", "false");

    await newTab.getByTestId("blackout-enter").click();
    await expect(layer).toHaveAttribute("data-active", "true");

    // 纯黑（#000）
    const background = await layer.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe("rgb(0, 0, 0)");

    // 覆盖整个视口
    const box = (await layer.boundingBox())!;
    const viewport = newTab.viewportSize()!;
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    // 真的进入全屏了吗（点击手势内发起的 requestFullscreen）
    const state = await newTab.evaluate(() => ({
      fullscreen: Boolean(document.fullscreenElement),
      fullscreenElementClass: document.fullscreenElement?.className ?? null,
    }));
    expect(state.fullscreenElementClass).toContain("kt-blackout-layer");

    // 提示会在几秒后淡出（之后只剩纯黑）
    await expect(newTab.getByTestId("blackout-hint")).toHaveCount(1);

    await layer.click();
    await expect(layer).toHaveAttribute("data-active", "false");
    // 退出时应同时退出全屏
    await expect
      .poll(() => newTab.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
  });

  test("Esc 也能退出", async ({ newTab }) => {
    await addBlackout(newTab);
    const layer = newTab.getByTestId("blackout-layer");
    await newTab.getByTestId("blackout-enter").click();
    await expect(layer).toHaveAttribute("data-active", "true");

    await newTab.keyboard.press("Escape");
    await expect(layer).toHaveAttribute("data-active", "false");
  });

  test("可配置：显示极暗时钟", async ({ newTab }) => {
    await addBlackout(newTab);

    // 通过实例设置打开时钟
    await enterEditMode(newTab);
    await newTab.locator('.kt-item[data-widget-type="blackout"]').click({ button: "right" });
    await newTab.getByTestId("menu-settings").click();
    await newTab.getByTestId("field-showClock").click();
    await newTab.getByTestId("instance-settings-save").click();
    await newTab.getByTestId("edit-done").click();
    await expect(newTab.getByTestId("editor-toolbar")).toHaveCount(0);

    await newTab.getByTestId("blackout-enter").click();
    const clock = newTab.getByTestId("blackout-clock");
    await expect(clock).toBeVisible();
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/);

    // 极暗：白色但透明度很低
    const color = await clock.evaluate((el) => getComputedStyle(el).color);
    expect(color).toMatch(/rgba\(255, 255, 255, 0\.1\d\)/);

    await newTab.keyboard.press("Escape");
  });
});
