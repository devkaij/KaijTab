import { enterEditMode, expect, readState, test } from "./fixtures";

async function cssVar(newTab: Parameters<typeof enterEditMode>[0], name: string): Promise<string> {
  return newTab.evaluate(
    (variable) =>
      getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}

test.describe("深浅色主题", () => {
  test("默认跟随系统：系统深浅色切换时自动跟随", async ({ newTab }) => {
    await newTab.emulateMedia({ colorScheme: "light" });
    await expect(newTab.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await cssVar(newTab, "--kt-fg")).toBe("#1f2937");

    await newTab.emulateMedia({ colorScheme: "dark" });
    await expect(newTab.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await cssVar(newTab, "--kt-fg")).toBe("#e6edf3");
  });

  test("固定浅色/深色不随系统变化，并写入设置", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-settings").click();

    await newTab.getByTestId("theme-light").click();
    await newTab.emulateMedia({ colorScheme: "dark" });
    await expect(newTab.locator("html")).toHaveAttribute("data-theme", "light");

    await newTab.waitForTimeout(600);
    let state = await readState(newTab);
    expect((state.settings as { theme: string }).theme).toBe("light");

    await newTab.getByTestId("theme-dark").click();
    await newTab.emulateMedia({ colorScheme: "light" });
    await expect(newTab.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await cssVar(newTab, "--kt-fg")).toBe("#e6edf3");

    // 切回跟随系统，此时系统是浅色 → 应变浅
    await newTab.getByTestId("theme-system").click();
    await expect(newTab.locator("html")).toHaveAttribute("data-theme", "light");

    await newTab.waitForTimeout(600);
    state = await readState(newTab);
    expect((state.settings as { theme: string }).theme).toBe("system");
  });

  test("浅色下玻璃与卡片令牌都可读（不是深色残留）", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-settings").click();
    await newTab.getByTestId("theme-light").click();
    await newTab.getByTestId("settings-panel").locator(".kt-panel-close").click();

    const tokens = await newTab.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        card: style.getPropertyValue("--kt-card-bg").trim(),
        input: style.getPropertyValue("--kt-input-bg").trim(),
        backdrop: style.getPropertyValue("--kt-backdrop").trim(),
        iconTile: style.getPropertyValue("--kt-icon-tile-bg").trim(),
      };
    });

    // 浅色下卡片是白色系、输入框是浅色、默认背景是浅色渐变
    // 注：Chrome 会把 rgba(255,255,255,…) 序列化成 #ffffffxx，两种形式都接受
    expect(tokens.card.toLowerCase()).toContain("ffffff");
    expect(tokens.input.toLowerCase()).toContain("ffffff");
    expect(tokens.backdrop).toContain("#dbeafe");
    expect(tokens.iconTile.toLowerCase()).toContain("ffffff");

    // 界面主体文字色是深色
    const fg = await cssVar(newTab, "--kt-fg");
    expect(fg).toBe("#1f2937");
  });
});
