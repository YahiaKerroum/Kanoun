import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/staff/e2e",
  testIgnore: /pr-03-guided-setup\.real-stack\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "corepack pnpm --filter @rms/staff-web dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "corepack pnpm --filter @rms/admin-web dev",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "corepack pnpm --filter @rms/customer-web dev",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
