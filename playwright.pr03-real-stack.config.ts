import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/staff/e2e",
  testMatch: /pr-03-guided-setup\.real-stack\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
  },
});
