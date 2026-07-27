import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const branchId = "00000000-0000-4000-8000-000000000101";
const employeeId = "00000000-0000-4000-8000-000000000102";

interface PortalOverrides {
  readonly permissions?: readonly string[];
  readonly enabledFeatures?: readonly string[];
}

async function mockReadyPortal(
  page: Page,
  overrides: PortalOverrides = {},
): Promise<void> {
  await page.route("**/api/v1/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        employeeId,
        activeBranchId: branchId,
        authorizedBranchIds: [branchId],
        grants: [],
        expiresAt: "2026-07-28T02:00:00.000Z",
      }),
    }),
  );
  await page.route(
    `**/api/v1/staff/branches/${branchId}/capabilities`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          branchId,
          permissions: overrides.permissions ?? [
            "orders.view",
            "kitchen.update",
            "menu.view",
            "audit.view",
          ],
          enabledFeatures: overrides.enabledFeatures ?? [
            "restaurant_configuration",
            "identity_access",
            "ordering",
            "kitchen",
            "audit",
          ],
          configurationVersion: 3,
        }),
      }),
  );
}

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

test("keeps staff navigation behind an authenticated capability boundary", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/session", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "/problems/authentication-required",
        title: "Authentication required",
        status: 401,
        code: "authentication_required",
        correlationId: "test",
      }),
    }),
  );

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Staff access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);
});

test("shows only destinations allowed by both permissions and enabled features", async ({
  page,
}) => {
  await mockReadyPortal(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Your branch tools, resolved by access.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Orders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kitchen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Audit" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Tables" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stock" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Staff", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reports" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);

  await page.getByRole("button", { name: "Orders" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Orders is available but not implemented here yet",
    }),
  ).toBeVisible();
});

test("has no detectable WCAG A or AA violations in the capability-aware state", async ({
  page,
}) => {
  await mockReadyPortal(page);
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("keeps every authorized destination available in the tablet navigation dock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockReadyPortal(page, {
    permissions: [
      "orders.view",
      "tables.view",
      "kitchen.view",
      "menu.view",
      "employees.view",
      "reports.view",
      "features.manage",
      "audit.view",
    ],
    enabledFeatures: [
      "restaurant_configuration",
      "identity_access",
      "menu",
      "ordering",
      "tables",
      "kitchen",
      "reporting",
      "audit",
    ],
  });
  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Staff navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Staff", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stock" })).toHaveCount(0);
});
