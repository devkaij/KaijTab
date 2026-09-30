import { enterEditMode, expect, test } from "./fixtures";

const ENDPOINT_HOST = "**/api.example.com/**";

async function seedConfig(
  page: Parameters<typeof enterEditMode>[0],
  baseUrl = "https://api.example.com/v1",
): Promise<void> {
  // 通过应用自身的 store 写入（内存与磁盘保持一致，避免 pagehide 落盘时被旧状态覆盖）
  await page.evaluate(async (url) => {
    const store = (window as unknown as { __kaijtab: { commit: (fn: (s: unknown) => unknown) => void } })
      .__kaijtab;
    store.commit((raw) => {
      const state = raw as {
        modules: { enabled: string[]; settings: Record<string, unknown> };
        localSecrets: Record<string, unknown>;
      };
      return {
        ...state,
        modules: {
          ...state.modules,
          settings: { ...state.modules.settings, "ai-recommend": { baseUrl: url, model: "test-model" } },
        },
        localSecrets: { ...state.localSecrets, "ai-recommend:apiKey": "sk-test" },
      };
    });
    // 等防抖落盘
    await new Promise((resolve) => setTimeout(resolve, 600));
  }, baseUrl);
}

/** 写入配置并刷新页面，校验配置真的生效 */
async function seedAndReload(
  page: Parameters<typeof enterEditMode>[0],
): Promise<void> {
  await seedConfig(page);
  await page.reload();
  await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
  await expect(page.getByTestId("ai-recommend-setup")).toHaveCount(0, { timeout: 10_000 });
}

async function addModule(page: Parameters<typeof enterEditMode>[0]): Promise<void> {
  await enterEditMode(page);
  await page.getByTestId("open-module-center").click();
  await page.getByTestId("module-add-ai-recommend").click();
  await expect(page.locator('.kt-item[data-widget-type="ai-recommend"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("edit-done").click();
  await expect(page.getByTestId("editor-toolbar")).toHaveCount(0);
}

function okResponse(title: string) {
  return {
    json: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              recommendations: [{ title, url: "https://example.com/", reason: "测试" }],
            }),
          },
        },
      ],
    },
  };
}

async function moduleDataKeys(page: Parameters<typeof enterEditMode>[0]): Promise<string[]> {
  return page.evaluate(async () => {
    const data = await chrome.storage.local.get("state");
    const state = data.state as { moduleData?: Record<string, unknown> };
    return Object.keys(state.moduleData ?? {});
  });
}

test.describe("AI 推荐模块", () => {
  test("未配置时显示接入表单，缺字段有提示，可预览脱敏后的数据", async ({ newTab }) => {
    await newTab.evaluate(async () => {
      await chrome.history.addUrl({ url: "https://github.com/kaijtab-test?token=leakme" });
    });
    await addModule(newTab);

    await expect(newTab.getByTestId("ai-recommend-setup")).toBeVisible();

    // 缺字段校验
    await newTab.getByTestId("ai-base-url").fill("");
    await newTab.getByTestId("ai-save").click();
    await expect(newTab.getByTestId("ai-recommend-setup")).toContainText("三项都要填");

    // 预览：能看到聚合后的数据，且不含查询串
    await newTab.getByTestId("ai-preview").click();
    const preview = newTab.getByTestId("ai-preview-json");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toContainText("github.com");
    await expect(preview).not.toContainText("leakme");
  });

  test("配置后生成推荐：请求体脱敏、结果渲染、点击可跳转", async ({ newTab, context }) => {
    const bodies: string[] = [];
    await context.route(ENDPOINT_HOST, async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content:
                  '好的：\n```json\n{"recommendations":[{"title":"GitHub","url":"https://github.com/","reason":"你常看代码"}]}\n```',
              },
            },
          ],
        },
      });
    });

    await newTab.evaluate(async () => {
      await chrome.history.addUrl({ url: "https://github.com/kaijtab-test?token=leakme" });
      await chrome.history.addUrl({ url: "https://www.bilibili.com/video/BV1?spm=secret" });
    });

    await addModule(newTab);
    await seedAndReload(newTab);

    const item = newTab.getByTestId("ai-item").first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item).toContainText("GitHub");
    await expect(item).toContainText("你常看代码");
    await expect(item).toHaveAttribute("href", "https://github.com");

    // 请求体：含聚合域名与模型名，不含查询串
    const body = bodies.join("\n");
    expect(body).toContain("github.com");
    expect(body).toContain("bilibili.com");
    expect(body).toContain("test-model");
    expect(body).not.toContain("leakme");
    expect(body).not.toContain("spm=secret");

    // 结果写入本地缓存（moduleData）
    const cached = await newTab.evaluate(async () => {
      const data = await chrome.storage.local.get("state");
      const state = data.state as { moduleData: Record<string, unknown> };
      const key = Object.keys(state.moduleData).find((k) => k.startsWith("ai-recommend:"));
      return key ? state.moduleData[key] : null;
    });
    expect(cached).toBeTruthy();
  });

  test("接口报错时显示原因并可重试", async ({ newTab, context }) => {
    await context.route(ENDPOINT_HOST, (route) =>
      route.fulfill({ status: 401, body: "unauthorized" }),
    );

    await addModule(newTab);
    await seedAndReload(newTab);

    const error = newTab.getByTestId("ai-error");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("HTTP 401");
    await expect(error).toContainText("API Key");
    await expect(error.getByText("重试")).toBeVisible();
  });

  test("API Key 不参与账号同步", async ({ newTab }) => {
    await addModule(newTab);
    await seedAndReload(newTab);

    // 开启同步并等待推送
    await enterEditMode(newTab);
    await newTab.getByTestId("open-settings").click();
    await newTab.getByTestId("sync-toggle").click();
    await newTab.waitForTimeout(1500);

    const syncDump = await newTab.evaluate(() => chrome.storage.sync.get(null));
    const serialized = JSON.stringify(syncDump);
    // API Key 永不参与同步
    expect(serialized).not.toContain("sk-test");
    expect(serialized).not.toContain("apiKey");
    // 非敏感的配置（接口地址 / 模型名）随设置一起同步，便于换设备直接用
    expect(serialized).toContain("test-model");
  });

  test("每次打开新标签页都重新生成（不依赖缓存）", async ({ newTab, context }) => {
    const bodies: string[] = [];
    await context.route(ENDPOINT_HOST, async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill(okResponse("每次重新生成"));
    });

    await addModule(newTab);
    await seedAndReload(newTab);
    await expect(newTab.getByTestId("ai-item").first()).toBeVisible({ timeout: 20_000 });
    const firstOpen = bodies.length;
    expect(firstOpen).toBeGreaterThanOrEqual(1);

    // 再打开一次（等价于新开一个标签页）
    await newTab.reload();
    await expect(newTab.getByTestId("ai-item").first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => bodies.length, { timeout: 10_000 }).toBeGreaterThan(firstOpen);
  });

  test("默认请求低思考档位；接口不认识该字段时自动降级重试", async ({ newTab, context }) => {
    const bodies: string[] = [];
    await context.route(ENDPOINT_HOST, async (route) => {
      const body = route.request().postData() ?? "";
      bodies.push(body);
      if (body.includes("reasoning_effort")) {
        await route.fulfill({ status: 400, body: "unsupported parameter: reasoning_effort" });
        return;
      }
      await route.fulfill(okResponse("降级成功"));
    });

    await addModule(newTab);
    await seedAndReload(newTab);

    await expect(newTab.getByTestId("ai-item").first()).toBeVisible({ timeout: 20_000 });
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies[0]).toContain("reasoning_effort");
    expect(bodies[0]).toContain("max_tokens");
    expect(bodies[1]).not.toContain("reasoning_effort");
    // 记住降级结论，界面上有提示
    await expect(newTab.getByTestId("ai-recommend")).toContainText("已降级");
  });

  test("删除元件会连带清理它的私有数据（不留垃圾）", async ({ newTab, context }) => {
    await context.route(ENDPOINT_HOST, (route) => route.fulfill(okResponse("垃圾清理测试")));

    await addModule(newTab);
    await seedAndReload(newTab);
    await expect(newTab.getByTestId("ai-item").first()).toBeVisible({ timeout: 20_000 });

    const before = await moduleDataKeys(newTab);
    expect(before.some((key) => key.startsWith("ai-recommend:"))).toBe(true);

    await enterEditMode(newTab);
    await newTab.locator('.kt-item[data-widget-type="ai-recommend"]').click({ button: "right" });
    await newTab.getByTestId("menu-delete").click();
    await newTab.waitForTimeout(700);

    const after = await moduleDataKeys(newTab);
    expect(after.some((key) => key.startsWith("ai-recommend:"))).toBe(false);
  });
});
