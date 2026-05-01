import { defineConfig } from "@playwright/test";

const PORT = 1420;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/*.local.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host ${HOST}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
