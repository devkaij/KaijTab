import { expect, test } from "./fixtures";

test.describe("搜索框：下拉与建议", () => {
  test("引擎下拉完整可见（不被元件容器裁切）且能切换", async ({ newTab }) => {
    await newTab.getByTestId("engine-switch").click();

    const menu = newTab.getByTestId("engine-menu");
    await expect(menu).toBeVisible();

    // 三项都在可视区内：之前被元件的 overflow:hidden 裁掉，只能看到一两项
    await expect(menu.getByText("Bing")).toBeVisible();
    await expect(menu.getByText("百度")).toBeVisible();
    await expect(menu.getByText("Google")).toBeVisible();

    const box = (await menu.boundingBox())!;
    const viewport = newTab.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    await menu.getByText("Google").click();
    await expect(newTab.getByTestId("engine-switch")).toContainText("Google");
  });

  test("输入时给出历史建议，键盘下移 + 回车可直接进入", async ({ newTab, context }) => {
    // 本用例只验证本地建议：把在线联想接口打掉，避免依赖外网
    await context.route(/api\.bing\.com/, (route) => route.fulfill({ status: 500, body: "x" }));
    await context.route(/kaijtab-test\.example\.com/, (route) =>
      route.fulfill({ body: "<h1>ok</h1>", contentType: "text/html" }),
    );
    await newTab.evaluate(async () => {
      await chrome.history.addUrl({ url: "https://kaijtab-test.example.com/hello" });
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await newTab.getByTestId("search-input").fill("kaijtab-test");

    const menu = newTab.getByTestId("suggest-menu");
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await expect(newTab.getByTestId("suggest-search")).toContainText("用");
    const items = newTab.getByTestId("suggest-item");
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    await expect(menu).toContainText("kaijtab-test.example.com");

    await newTab.keyboard.press("ArrowDown");
    await expect(items.first()).toHaveClass(/kt-suggest-active/);
    await newTab.keyboard.press("Enter");
    await newTab.waitForURL(/kaijtab-test\.example\.com/, { timeout: 15_000 });
  });

  test("书签也能被搜到并点击进入", async ({ newTab, context }) => {
    await context.route(/api\.bing\.com/, (route) => route.fulfill({ status: 500, body: "x" }));
    await context.route(/bookmark-hit\.example\.com/, (route) =>
      route.fulfill({ body: "<h1>ok</h1>", contentType: "text/html" }),
    );
    await newTab.evaluate(async () => {
      await new Promise<void>((resolve) =>
        chrome.bookmarks.create(
          { parentId: "1", title: "KaijTab 唯一书签", url: "https://bookmark-hit.example.com/page" },
          () => resolve(),
        ),
      );
    });

    await newTab.getByTestId("search-input").fill("唯一书签");
    const menu = newTab.getByTestId("suggest-menu");
    await expect(menu).toBeVisible({ timeout: 10_000 });

    const item = newTab.getByTestId("suggest-item").first();
    await expect(item).toContainText("KaijTab 唯一书签");
    await expect(item).toContainText("★");

    await item.click();
    await newTab.waitForURL(/bookmark-hit\.example\.com/, { timeout: 15_000 });
  });

  test("在线联想词：来自搜索引擎，点击即用当前引擎搜索", async ({ newTab, context }) => {
    await context.route(/api\.bing\.com/, (route) =>
      route.fulfill({
        contentType: "text/plain",
        body: '["贴吧",["贴吧","贴吧 百度","贴吧工具箱","贴吧网页版登录入口"]]',
      }),
    );
    await context.route(/bing\.com\/search/, (route) =>
      route.fulfill({ body: "<h1>search</h1>", contentType: "text/html" }),
    );

    await newTab.getByTestId("search-input").fill("贴吧");
    const items = newTab.getByTestId("suggest-item");
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    await expect(newTab.getByTestId("suggest-menu")).toContainText("贴吧 百度");
    await expect(newTab.getByTestId("suggest-menu")).toContainText("贴吧工具箱");

    // 引擎联想词用放大镜图标
    await expect(items.first()).toContainText("🔍");

    await items.filter({ hasText: "贴吧工具箱" }).first().click();
    await newTab.waitForURL(/bing\.com\/search\?q=/, { timeout: 15_000 });
    expect(decodeURIComponent(newTab.url())).toContain("贴吧工具箱");
  });

  test("在线联想接口失败时静默降级，本地建议照常", async ({ newTab, context }) => {
    await context.route(/api\.bing\.com/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await newTab.evaluate(async () => {
      await chrome.history.addUrl({ url: "https://kaijtab-local.example.com/page" });
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await newTab.getByTestId("search-input").fill("kaijtab-local");
    const items = newTab.getByTestId("suggest-item");
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    await expect(newTab.getByTestId("suggest-menu")).toContainText("kaijtab-local.example.com");
    // 没有引擎联想词时不应出现放大镜行
    await expect(items.first()).toContainText("🕘");
  });

  test("没有匹配时给提示，回车直接搜索", async ({ newTab, context }) => {
    await context.route(/api\.bing\.com/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await newTab.getByTestId("search-input").fill("zzz-不存在的历史-zzz");

    const menu = newTab.getByTestId("suggest-menu");
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await expect(menu).toContainText("没有建议，回车直接搜索");

    // Esc 关闭浮层
    await newTab.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
});
