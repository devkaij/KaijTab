import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // 每条用例都要新起一个带扩展的浏览器，机器负载高时偶发抖动；重试一次以吸收环境噪声
  retries: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
