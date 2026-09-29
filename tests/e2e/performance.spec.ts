import { expect, test } from "./fixtures";

/** 性能预算核对（设计文档 10.4） */
test.describe("性能预算", () => {
  test("冷启动到可交互 + 首屏渲染耗时", async ({ newTab }) => {
    // 重新导航一次，拿到干净的 navigation timing
    await newTab.reload();
    await newTab.locator(".kt-item").first().waitFor();
    await newTab.waitForFunction(() => performance.getEntriesByName("kt:interactive").length > 0);

    const metrics = await newTab.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const interactive = performance.getEntriesByName("kt:interactive").at(-1);
      return {
        domContentLoaded: nav.domContentLoadedEventEnd,
        interactive: interactive?.startTime ?? -1,
        transferredJs: performance
          .getEntriesByType("resource")
          .filter((r) => r.name.endsWith(".js"))
          .reduce((sum, r) => sum + (r as PerformanceResourceTiming).encodedBodySize, 0),
      };
    });

    console.log("性能指标：", JSON.stringify(metrics, null, 2));
    expect(metrics.interactive).toBeGreaterThan(0);
    expect(metrics.interactive).toBeLessThan(150); // 预算 <100ms，留一倍余量防抖动
    expect(metrics.transferredJs).toBeLessThan(200 * 1024); // 首屏 JS（未压缩传输量）< 200KB
  });
});
