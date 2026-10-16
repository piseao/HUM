import { defineConfig, devices } from "@playwright/test";

// File upload and editing only: desktop WebKit cannot verify an iPhone microphone.
export default defineConfig({
  testDir: "./tests",
  testMatch: "mobile.spec.ts",
  grep: /mobile humming upload/,
  timeout: Number(process.env.HUM_TEST_ANALYSIS_TIMEOUT_MS || 150_000) + 60_000,
  workers: 1,
  use: {
    ...devices["iPhone 13"],
    browserName: "webkit",
    baseURL: process.env.HUM_TEST_URL || "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
  },
});
