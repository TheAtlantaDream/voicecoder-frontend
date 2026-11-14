import { defineConfig, devices } from "@playwright/test";

const PORT = 5179;

// End-to-end runs against the fake services (VITE_FAKE=1 via `--mode fake`), so
// no bridge is needed. The fake-media flags let MicAudio run in Chromium once a
// real-bridge suite is added (add --use-file-for-fake-audio-capture=<wav> then).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev:fake -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
