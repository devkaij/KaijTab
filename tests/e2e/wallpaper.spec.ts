import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enterEditMode, expect, readState, test } from "./fixtures";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SAMPLE_MP4 = readFileSync(resolve(import.meta.dirname, "../fixtures/sample.mp4"));

async function importVideo(newTab: Parameters<typeof enterEditMode>[0], name = "sample.mp4") {
  await enterEditMode(newTab);
  await newTab.getByTestId("open-wallpaper-panel").click();
  await newTab.setInputFiles('[data-testid="file-input"]', {
    name,
    mimeType: "video/mp4",
    buffer: SAMPLE_MP4,
  });
  await expect(newTab.getByTestId("wallpaper-video")).toBeVisible({ timeout: 30_000 });
}

test.describe("壁纸管线", () => {
  test("导入图片壁纸并应用", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();
    await expect(newTab.getByTestId("wallpaper-panel")).toBeVisible();

    await newTab.setInputFiles('[data-testid="file-input"]', {
      name: "kaijtab-test.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });

    await expect(newTab.getByTestId("wallpaper-image")).toBeVisible({ timeout: 20_000 });
    await newTab.waitForTimeout(600);

    const state = await readState(newTab);
    const library = state.wallpaperLibrary as Array<{ name: string; kind: string; file: string }>;
    expect(library.length).toBe(1);
    expect(library[0]!.name).toBe("kaijtab-test.png");
    expect(library[0]!.kind).toBe("image");
    expect(state.wallpaperCurrent).toBeTruthy();

    // OPFS 中确实存在文件
    const exists = await newTab.evaluate(async (path: string) => {
      const [dirName, fileName] = path.split("/") as [string, string];
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(dirName);
        await dir.getFileHandle(fileName);
        return true;
      } catch {
        return false;
      }
    }, library[0]!.file);
    expect(exists).toBe(true);
  });

  test("刷新后壁纸仍在", async ({ newTab, reopen }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();
    await newTab.setInputFiles('[data-testid="file-input"]', {
      name: "keep.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });
    await expect(newTab.getByTestId("wallpaper-image")).toBeVisible({ timeout: 20_000 });
    await newTab.waitForTimeout(600);

    const page = await reopen();
    await expect(page.getByTestId("wallpaper-image")).toBeVisible({ timeout: 15_000 });
    await page.close();
  });

  test("不可播放的视频给出明确错误", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();

    await newTab.setInputFiles('[data-testid="file-input"]', {
      name: "broken.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("this is not a real video file at all"),
    });

    await expect(newTab.getByTestId("import-errors")).toBeVisible({ timeout: 20_000 });
    await expect(newTab.getByTestId("import-errors")).toContainText("broken.mp4");

    const state = await readState(newTab);
    expect((state.wallpaperLibrary as unknown[]).length).toBe(0);
  });

  test("切回默认壁纸", async ({ newTab }) => {
    await enterEditMode(newTab);
    await newTab.getByTestId("open-wallpaper-panel").click();
    await newTab.setInputFiles('[data-testid="file-input"]', {
      name: "apply.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });
    await expect(newTab.getByTestId("wallpaper-image")).toBeVisible({ timeout: 20_000 });

    await newTab.getByTestId("wallpaper-default-card").click();
    await expect(newTab.getByTestId("wallpaper-default")).toBeVisible();
    await newTab.waitForTimeout(500);
    const state = await readState(newTab);
    expect(state.wallpaperCurrent).toBeNull();
  });

  test("导入真实视频壁纸：解码、静音循环播放、时长入库", async ({ newTab }) => {
    await importVideo(newTab);

    const video = newTab.getByTestId("wallpaper-video-el");
    const info = await video.evaluate((el) => {
      const v = el as HTMLVideoElement;
      return {
        readyState: v.readyState,
        duration: v.duration,
        muted: v.muted,
        loop: v.loop,
        source: v.currentSrc.startsWith("blob:"),
      };
    });

    expect(info.muted).toBe(true);
    expect(info.loop).toBe(true);
    expect(info.source).toBe(true);
    expect(info.readyState).toBeGreaterThanOrEqual(2);
    expect(info.duration).toBeGreaterThan(1.5);
    expect(info.duration).toBeLessThan(3);

    await newTab.waitForTimeout(700);
    const state = await readState(newTab);
    const record = (
      state.wallpaperLibrary as Array<{ name: string; kind: string; duration?: number }>
    ).find((r) => r.name === "sample.mp4");
    expect(record?.kind).toBe("video");
    expect(record?.duration ?? 0).toBeGreaterThan(1.5);
  });

  test("页面隐藏时暂停、恢复可见后继续", async ({ newTab }) => {
    await importVideo(newTab, "bg.mp4");

    const video = newTab.getByTestId("wallpaper-video-el");
    await expect
      .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), {
        timeout: 10_000,
      })
      .toBe(false);

    // 模拟浏览器切到后台：document.hidden → true 并广播 visibilitychange
    await newTab.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect
      .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), {
        timeout: 5_000,
      })
      .toBe(true);

    // 恢复可见 → 续播
    await newTab.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect
      .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), {
        timeout: 5_000,
      })
      .toBe(false);
  });
});
