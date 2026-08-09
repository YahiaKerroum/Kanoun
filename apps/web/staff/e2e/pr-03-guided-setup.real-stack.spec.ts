import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const launcherOrigin = process.env.DEMO_LAUNCHER_URL ?? "http://127.0.0.1:4170";
const adminOrigin = process.env.ADMIN_ORIGIN ?? "http://127.0.0.1:5175";

test("real-stack owner completes restaurant and branch setup", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const restaurantName = `PR-03 verification restaurant ${suffix}`;
  const branchName = `PR-03 verification branch ${suffix}`;
  const mutationStatuses: number[] = [];

  page.on("response", (response) => {
    const method = response.request().method();
    if (
      (method === "POST" || method === "PATCH") &&
      response.url().includes("/api/v1/staff/")
    ) {
      mutationStatuses.push(response.status());
    }
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(`${launcherOrigin}/launch/owner`);
  await expect(page).toHaveURL(new RegExp(`${adminOrigin}/`));
  await page.goto(`${adminOrigin}/setup`);
  await expect(
    page.getByRole("heading", { name: "Service readiness review" }),
  ).toBeVisible();

  await page.getByLabel("New restaurant name").fill(restaurantName);
  await page.getByRole("button", { name: "Create restaurant" }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(restaurantName) }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(restaurantName) }).click();

  const newBranchForm = page.locator("form.setup-create-branch-form");
  await newBranchForm.getByLabel("New branch name").fill(branchName);
  await newBranchForm
    .locator('select[name="branchRestaurantId"]')
    .selectOption({ label: restaurantName });
  await newBranchForm.getByLabel("Address line 1").fill("12 Rue de la Paix");
  await newBranchForm.getByLabel("City").fill("Algiers");
  await newBranchForm.getByLabel("Country code").fill("DZ");
  await newBranchForm
    .getByLabel("Contact email")
    .fill(`setup-${suffix}@example.test`);
  await newBranchForm.getByLabel("IANA time zone").fill("Africa/Algiers");
  await newBranchForm.getByLabel("ISO currency").fill("DZD");
  await newBranchForm.getByRole("button", { name: "Create branch" }).click();

  await expect(
    page.getByRole("option", { name: branchName, exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("Review branch").selectOption({ label: branchName });
  await page.getByLabel("Service status").selectOption("open");
  await page
    .getByLabel("Explanation for a closed or temporarily unavailable status")
    .fill("Opening the newly configured service branch");
  await page.getByRole("button", { name: "Save branch and hours" }).click();

  await expect(
    page.getByText("Core setup complete", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Service is open", { exact: false }).first(),
  ).toBeVisible();
  expect(mutationStatuses.length).toBeGreaterThanOrEqual(3);
  expect(
    mutationStatuses.every((status) => status >= 200 && status < 300),
  ).toBe(true);
});
