import { defineConfig, devices } from "@playwright/test";
import { assertRealE2eSourceClean } from "./scripts/real-e2e-guard.js";

await assertRealE2eSourceClean();

const requestedBrowser = process.env.REAL_E2E_BROWSER;
if (
  requestedBrowser !== undefined &&
  requestedBrowser !== "chromium" &&
  requestedBrowser !== "firefox" &&
  requestedBrowser !== "webkit"
) {
  throw new Error(
    "REAL_E2E_BROWSER must be chromium, firefox, or webkit when set.",
  );
}

const browser = requestedBrowser ?? "chromium";
const device =
  browser === "firefox"
    ? devices["Desktop Firefox"]
    : browser === "webkit"
      ? devices["Desktop Safari"]
      : devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./apps/web/staff/e2e/real",
  testMatch: /.*\.real-stack\.spec\.ts/u,
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "output/playwright/real",
  use: {
    ...device,
    baseURL: process.env.REAL_E2E_STAFF_ORIGIN,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: `${browser}-real-stack`, use: { ...device } }],
});
