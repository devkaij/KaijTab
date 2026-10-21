import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";

const EXTENSION_PATH = resolve(import.meta.dirname, "../../dist");

export interface KaijTabFixtures {
  context: BrowserContext;
  extensionId: string;
  newTab: Page;
  /** 重新打开一个新标签页（模拟刷新），返回新页面 */
  reopen: () => Promise<Page>;
}

export const test = base.extend<KaijTabFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const id = new URL(worker.url()).host;
    await use(id);
  },

  newTab: async ({ context, extensionId }, use) => {
    // 默认断掉第三方图标服务，保证 E2E 不依赖外网（个别测试要真行为时自行 route 覆盖）
    await context.route(
      /icons\.duckduckgo\.com|www\.google\.com\/s2\/favicons/,
      (route) => route.abort(),
    );
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/main.html`);
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__kaijtab), null, {
      timeout: 20_000,
    });
    // 等到画布真正渲染出元件（bootstrap 完成 + 播种）
    await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
    await use(page);
    await page.close().catch(() => undefined);
  },

  reopen: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/main.html`);
      await page.waitForFunction(
        () => Boolean((window as unknown as Record<string, unknown>).__kaijtab),
        null,
        { timeout: 20_000 },
      );
      await page.locator(".kt-item").first().waitFor({ timeout: 20_000 });
      return page;
    });
  },
});

export { expect } from "@playwright/test";

/** 读取扩展 storage 里的完整状态（等首次落盘完成） */
export async function readState(page: Page): Promise<Record<string, unknown>> {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(async () => {
      const data = await chrome.storage.local.get("state");
      return data.state as Record<string, unknown> | undefined;
    });
    if (state) return state;
    if (Date.now() - started > 10_000) throw new Error("storage 中没有 state");
    await page.waitForTimeout(150);
  }
}

export interface StoredItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked?: boolean;
}

export async function storedItems(page: Page): Promise<StoredItem[]> {
  const state = (await readState(page)) as {
    layout?: { items?: StoredItem[] };
  };
  return state.layout?.items ?? [];
}

/** 在编辑态拖拽某个元件的拖拽层 */
export async function dragBy(
  page: Page,
  selector: string,
  dx: number,
  dy: number,
  modifiers: Array<"Alt"> = [],
): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`元素不可见：${selector}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

export function parseTransform(transform: string): { x: number; y: number } {
  const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(transform);
  return { x: Number(match?.[1] ?? NaN), y: Number(match?.[2] ?? NaN) };
}

/** 进入编辑态 */
export async function enterEditMode(page: Page): Promise<void> {
  await page.locator(".kt-app").hover();
  await page.getByTestId("edit-entry").click();
  await page.getByTestId("editor-toolbar").waitFor();
}
