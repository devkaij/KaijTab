import { enterEditMode, expect, readState, storedItems, test } from "./fixtures";

test.describe("模块机制", () => {
  test("模块中心：启用并添加时钟，骨架后渲染", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-module-center").click();
    await expect(newTab.getByTestId("module-center")).toBeVisible();

    await expect(newTab.getByTestId("module-card-clock")).toBeVisible();
    await newTab.getByTestId("module-add-clock").click();

    // 画布上出现时钟实例（骨架可能一闪而过）
    const clock = newTab.locator('.kt-item[data-widget-type="clock"]');
    await expect(clock).toBeVisible({ timeout: 15_000 });
    await expect(newTab.getByTestId("clock")).toBeVisible({ timeout: 15_000 });

    // 模块中心添加后自动关闭
    await expect(newTab.getByTestId("module-center")).toHaveCount(0);

    await newTab.waitForTimeout(600);
    const items = await storedItems(newTab);
    const instance = items.find((i) => i.type === "clock");
    expect(instance).toBeTruthy();

    const state = await readState(newTab);
    expect((state.modules as { enabled: string[] }).enabled).toContain("clock");
  });

  test("实例设置：修改属性并持久化", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-module-center").click();
    await newTab.getByTestId("module-add-clock").click();
    await expect(newTab.getByTestId("clock")).toBeVisible({ timeout: 15_000 });

    const clockItem = newTab.locator('.kt-item[data-widget-type="clock"]');
    await clockItem.click({ button: "right" });
    await newTab.getByTestId("menu-settings").click();
    await expect(newTab.getByTestId("instance-settings")).toBeVisible();

    // 关闭"显示秒"
    await newTab.getByTestId("field-showSeconds").click();
    await newTab.getByTestId("instance-settings-save").click();
    await newTab.waitForTimeout(600);

    const items = await storedItems(newTab);
    const clock = items.find((i) => i.type === "clock") as unknown as {
      props: Record<string, unknown>;
    };
    expect(clock.props.showSeconds).toBe(false);

    // 秒不再渲染
    await expect(newTab.locator(".kt-clock-seconds")).toHaveCount(0);
  });

  test("停用模块会移除其实例", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-module-center").click();
    await newTab.getByTestId("module-add-clock").click();
    await expect(newTab.getByTestId("clock")).toBeVisible({ timeout: 15_000 });

    newTab.on("dialog", (dialog) => void dialog.accept());
    await newTab.getByTestId("open-module-center").click();
    await newTab.getByTestId("module-toggle-clock").click();
    await newTab.waitForTimeout(600);

    const items = await storedItems(newTab);
    expect(items.some((i) => i.type === "clock")).toBe(false);
    const state = await readState(newTab);
    expect((state.modules as { enabled: string[] }).enabled).not.toContain("clock");
  });

  test("未知元件显示缺失卡片，不影响其他元件", async ({ newTab, reopen }) => {
    await newTab.evaluate(async () => {
      const store = (window as unknown as { __kaijtab: { state: { value: unknown } } }).__kaijtab;
      const state = store.state.value as {
        layout: { items: unknown[] };
      };
      state.layout.items.push({
        id: "inst_ghost",
        type: "ghost-module",
        x: 0.6,
        y: 0.6,
        w: 200,
        h: 120,
        z: 9,
        props: {},
      });
      await chrome.storage.local.set({ state });
    });

    const page = await reopen();
    await expect(page.locator('.kt-item[data-widget-type="ghost-module"]')).toBeVisible();
    await expect(page.locator('.kt-item[data-widget-type="ghost-module"]')).toContainText("未知元件");
    await expect(page.locator('.kt-item[data-widget-type="core:search"]')).toBeVisible();
    await page.close();
  });
});
