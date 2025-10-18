#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const truthy = new Set(["1", "true", "yes", "on"]);

function isTruthy(value) {
  if (!value) {
    return false;
  }
  return truthy.has(String(value).trim().toLowerCase());
}

const inCi = isTruthy(process.env.CI);
const skipDownload = isTruthy(process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD);
const onVercel = isTruthy(process.env.VERCEL);

if (inCi || skipDownload || onVercel) {
  console.log("Skipping Playwright browser install (CI/demo environment detected).");
  process.exit(0);
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["exec", "playwright", "install", "--with-deps"], {
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
