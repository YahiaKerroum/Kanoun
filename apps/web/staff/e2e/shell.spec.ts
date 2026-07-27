import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/health/ready", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        status: "not_ready",
        dependencies: { database: "unavailable" },
      }),
    });
  });
});

test("renders the truthful Slice 001 staff shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Foundation first. Service flows next.",
    }),
  ).toBeVisible();
  await expect(page.getByText("No branch selected")).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Connection not verified"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Orders" }).click();
  await expect(
    page.getByRole("heading", { name: "Orders is not implemented yet" }),
  ).toBeVisible();
});

test("has no detectable WCAG A or AA violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("adapts navigation for a tablet-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Staff navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stock" })).toBeHidden();
});
