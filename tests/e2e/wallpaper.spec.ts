import { enterEditMode, expect, readState, test } from "./fixtures";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
});
