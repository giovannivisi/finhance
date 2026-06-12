import { defineConfig, devices } from "@playwright/test";

const webServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER
  ? undefined
  : {
      command: "pnpm --filter api exec ts-node test/playwright-stack.ts",
      url: "http://127.0.0.1:3101",
      reuseExistingServer: false,
      timeout: 180_000,
    };

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer,
});
