import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    actionTimeout: 0,
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] }
    }
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      DEV_AUTH_BYPASS: "true",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "true",
      DEV_AUTH_BYPASS_UID: "e2e-user",
      DEV_AUTH_BYPASS_EMAIL: "e2e@example.com",
      DEV_AUTH_BYPASS_TOKEN: "playwright-stub-token",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_DR_BASE_URL: "https://api.openai.com/v1"
    }
  }
});
