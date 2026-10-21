import { enterEditMode, expect, test } from "./fixtures";

type Page = Parameters<typeof enterEditMode>[0];

async function addModule(newTab: Page, id: string) {
  await newTab.getByTestId("open-module-center").click();
  await expect(newTab.getByTestId(`module-card-${id}`)).toBeVisible();
  await newTab.getByTestId(`module-add-${id}`).click();
  await expect(newTab.locator(`.kt-item[data-widget-type="${id}"]`)).toBeVisible({ timeout: 15_000 });
}

/** 退出编辑态：编辑态下元件内容刻意不可交互（拖拽层覆盖），操作内容前必须退出 */
async function exitEdit(newTab: Page) {
  await newTab.getByTestId("edit-done").click();
  await expect(newTab.getByTestId("editor-toolbar")).toHaveCount(0);
}

function localDateString(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

test.describe("新模块：便签 / 待办 / 倒计时", () => {
  test("便签：输入后自动保存，刷新仍在", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await addModule(newTab, "note");
    await exitEdit(newTab);

    const area = newTab.getByTestId("note-area");
    await area.click();
    await area.fill("买牛奶\n周五交周报");
    await expect(newTab.getByTestId("note-foot")).toContainText("已保存", { timeout: 5000 });

    const page = await reopen();
    await expect(page.getByTestId("note-area")).toHaveValue(/买牛奶/, { timeout: 15_000 });
    await expect(page.getByTestId("note-area")).toHaveValue(/周五交周报/);
    await page.close();
  });

  test("待办：添加、勾选、进度与持久化", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await addModule(newTab, "todo");
    await exitEdit(newTab);

    await newTab.getByTestId("todo-input").fill("买牛奶");
    await newTab.getByTestId("todo-input").press("Enter");
    await newTab.getByTestId("todo-input").fill("交周报");
    await newTab.getByTestId("todo-input").press("Enter");

    await expect(newTab.getByTestId("todo-progress")).toContainText("0 / 2");
    await expect(newTab.getByText("买牛奶")).toBeVisible();

    // 勾选第一项 → 进度 1/2，且样式变删除线
    const firstRow = newTab.locator('[data-testid^="todo-row-"]').first();
    await firstRow.locator('input[type="checkbox"]').click();
    await expect(newTab.getByTestId("todo-progress")).toContainText("1 / 2");
    await expect(firstRow.locator(".kt-todo-done")).toBeVisible();

    const page = await reopen();
    await expect(page.getByText("买牛奶")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("todo-progress")).toContainText("1 / 2");
    await page.close();
  });

  test("倒计时：日期设为今天/明天分别显示正确", async ({ newTab }) => {
    await enterEditMode(newTab);
    await addModule(newTab, "countdown");

    const item = newTab.locator('.kt-item[data-widget-type="countdown"]');
    const setDate = async (value: string) => {
      await item.click({ button: "right" });
      await newTab.getByTestId("menu-settings").click();
      await newTab.getByTestId("field-date").fill(value);
      await newTab.getByTestId("instance-settings-save").click();
      await newTab.waitForTimeout(300);
    };

    await setDate(localDateString(1));
    await expect(newTab.getByTestId("countdown-number")).toHaveText("1");

    await setDate(localDateString(0));
    await expect(newTab.locator(".kt-countdown-today")).toContainText("就是今天");

    await setDate(localDateString(30));
    await expect(newTab.getByTestId("countdown-number")).toHaveText("30");
  });
});

test.describe("新模块：天气（网络拦截）", () => {
  test("成功路径：渲染温度与天气文案", async ({ newTab, context, reopen }) => {
    await context.route("**/geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({
        json: {
          results: [{ name: "北京", country: "中国", latitude: 39.9, longitude: 116.4 }],
        },
      }),
    );
    await context.route("**/api.open-meteo.com/**", (route) =>
      route.fulfill({
        json: {
          current: {
            temperature_2m: 23.4,
            apparent_temperature: 25.1,
            weather_code: 0,
            relative_humidity_2m: 62,
            wind_speed_10m: 8.5,
          },
          daily: { temperature_2m_max: [27.2], temperature_2m_min: [18.9] },
        },
      }),
    );

    void reopen;
    await enterEditMode(newTab);
    await addModule(newTab, "weather");

    await expect(newTab.getByTestId("weather-temp")).toHaveText("23°", { timeout: 15_000 });
    await expect(newTab.getByTestId("weather")).toContainText("晴");
    await expect(newTab.getByTestId("weather")).toContainText("体感 25°");
    await expect(newTab.getByTestId("weather")).toContainText("27° / 19°");
  });

  test("失败路径：显示错误与重试按钮", async ({ newTab, context }) => {
    await context.route("**/geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    // 境内备用源也要断掉，才能走到最终错误态（保持 E2E 不依赖外网）
    for (const host of ["toy1.weather.com.cn", "t.weather.itboy.net", "t.weather.sojson.com"]) {
      await context.route(`**/${host}/**`, (route) => route.abort());
    }

    await enterEditMode(newTab);
    await addModule(newTab, "weather");

    await expect(newTab.getByTestId("weather-error")).toBeVisible({ timeout: 15_000 });
    await expect(newTab.getByTestId("weather-error")).toContainText("HTTP 500");
    await expect(newTab.getByTestId("weather-error").getByText("重试")).toBeVisible();
  });

  test("备用源：Open-Meteo 全挂时走中国天气网镜像并标注来源", async ({ newTab, context }) => {
    await context.route("**/geocoding-api.open-meteo.com/**", (route) => route.abort());
    await context.route("**/api.open-meteo.com/**", (route) => route.abort());
    await context.route("**/toy1.weather.com.cn/**", (route) =>
      route.fulfill({
        json: [{ ref: "101010100~beijing~北京~Beijing~北京~Beijing~11~100000~BJ~北京" }],
      }),
    );
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    await context.route("**/t.weather.itboy.net/**", (route) =>
      route.fulfill({
        json: {
          status: 200,
          cityInfo: { city: "北京", parent: "北京" },
          data: {
            wendu: 15,
            shidu: "40%",
            forecast: [
              { ymd: day(0), week: "星期四", high: "高温 21℃", low: "低温 9℃", type: "晴" },
              { ymd: day(1), week: "星期五", high: "高温 19℃", low: "低温 7℃", type: "多云" },
            ],
          },
        },
      }),
    );

    await enterEditMode(newTab);
    await addModule(newTab, "weather");

    await expect(newTab.getByTestId("weather-temp")).toHaveText("15°", { timeout: 15_000 });
    await expect(newTab.getByTestId("weather")).toContainText("21° / 9°");
    await expect(newTab.getByTestId("weather")).toContainText("中国天气网");
  });
});

test.describe("新模块：浏览器书签", () => {
  test("展示书签栏、实时刷新、进入文件夹", async ({ newTab }) => {
    await enterEditMode(newTab);
    await addModule(newTab, "bookmarks");
    await exitEdit(newTab);

    // 实时刷新：创建书签后模块应自动出现
    await newTab.evaluate(async () => {
      await new Promise<void>((resolve) =>
        chrome.bookmarks.create(
          { parentId: "1", title: "KaijTab 测试书签", url: "https://example.com/" },
          () => resolve(),
        ),
      );
    });
    await expect(newTab.getByText("KaijTab 测试书签")).toBeVisible({ timeout: 10_000 });

    // 文件夹：创建后在模块里进入，能看到子书签
    const folderId = await newTab.evaluate(
      async () =>
        await new Promise<string>((resolve) =>
          chrome.bookmarks.create({ parentId: "1", title: "测试文件夹" }, (node) =>
            resolve(node.id),
          ),
        ),
    );
    await newTab.evaluate(async (parentId) => {
      await new Promise<void>((resolve) =>
        chrome.bookmarks.create(
          { parentId, title: "子书签", url: "https://example.org/" },
          () => resolve(),
        ),
      );
    }, folderId);

    await newTab.getByTestId(`bm-folder-${folderId}`).click();
    await expect(newTab.getByText("子书签")).toBeVisible({ timeout: 10_000 });
    await expect(newTab.getByText("测试文件夹")).toBeVisible();

    // 返回上一层
    await newTab.locator(".kt-bm-back").click();
    await expect(newTab.getByText("KaijTab 测试书签")).toBeVisible();
  });
});
