import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: process.env.HUM_TEST_ANALYSIS_TIMEOUT_MS
    ? Number(process.env.HUM_TEST_ANALYSIS_TIMEOUT_MS) + 60_000
    : 180_000,
  workers: 1,
  use: {
    baseURL: process.env.HUM_TEST_URL || "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${process.env.HUM_TEST_WAV || "/tmp/hum-smoke/test-melody.wav"}`,
      ],
    },
    screenshot: "only-on-failure",
  },
});
