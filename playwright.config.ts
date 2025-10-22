import { defineConfig, devices } from "@playwright/test";

const devAuthBypass =
  process.env.DEV_AUTH_BYPASS !== undefined ? process.env.DEV_AUTH_BYPASS : "true";
const nextPublicDevAuthBypass =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== undefined
    ? process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS
    : devAuthBypass;

const webServerEnv = {
  DEV_AUTH_BYPASS: devAuthBypass,
  NEXT_PUBLIC_DEV_AUTH_BYPASS: nextPublicDevAuthBypass,
  DEV_AUTH_BYPASS_UID: process.env.DEV_AUTH_BYPASS_UID ?? "e2e-user",
  DEV_AUTH_BYPASS_EMAIL: process.env.DEV_AUTH_BYPASS_EMAIL ?? "e2e@example.com",
  DEV_AUTH_BYPASS_TOKEN: process.env.DEV_AUTH_BYPASS_TOKEN ?? "playwright-stub-token",
  DEMO_MODE: process.env.DEMO_MODE ?? "true",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-openai-key",
  OPENAI_DR_BASE_URL: process.env.OPENAI_DR_BASE_URL ?? "https://api.openai.com/v1",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "test-gemini-key",
  GEMINI_BASE_URL:
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-pro"
};

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
    env: webServerEnv
  }
});
