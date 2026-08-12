import { defineConfig, devices } from "@playwright/test";
import { assertRealE2eSourceClean } from "./scripts/real-e2e-guard.js";

await assertRealE2eSourceClean();

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
    ...devices["Desktop Chrome"],
    baseURL: process.env.REAL_E2E_STAFF_ORIGIN,
    trace: "off",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-real-stack", use: { ...devices["Desktop Chrome"] } },
  ],
});
