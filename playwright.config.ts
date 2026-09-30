import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command: "node tests/e2e/static-server.mjs",
    url: "http://127.0.0.1:4173/main.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    trace: "retain-on-failure",
  },
});
