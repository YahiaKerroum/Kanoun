import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const branchId = "00000000-0000-4000-8000-000000000101";
const employeeId = "00000000-0000-4000-8000-000000000102";
const restaurantId = "00000000-0000-4000-8000-000000000103";
const businessAccountId = "00000000-0000-4000-8000-000000000104";
const categoryId = "00000000-0000-4000-8000-000000000105";
const dishId = "00000000-0000-4000-8000-000000000106";
const tableId = "00000000-0000-4000-8000-000000000107";

interface PortalOverrides {
  readonly permissions?: readonly string[];
  readonly enabledFeatures?: readonly string[];
  readonly grants?: readonly {
    readonly permissionKey: string;
    readonly restaurantId?: string;
    readonly branchId?: string;
  }[];
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
        grants: overrides.grants ?? [],
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

test("loads real read-only menu and derived table states for the active scope", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockReadyPortal(page, {
    permissions: ["menu.view", "tables.view"],
    enabledFeatures: ["menu", "tables"],
    grants: [
      {
        permissionKey: "menu.view",
        restaurantId,
        branchId,
      },
      {
        permissionKey: "tables.view",
        restaurantId,
        branchId,
      },
    ],
  });
  await page.route(
    `**/api/v1/staff/restaurants/${restaurantId}/menu/categories`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: categoryId,
              businessAccountId,
              restaurantId,
              name: "Wood-fired plates",
              displayOrder: 1,
              status: "active",
              version: 2,
            },
          ],
        }),
      }),
  );
  await page.route(
    `**/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: dishId,
              businessAccountId,
              restaurantId,
              categoryId,
              name: "Saffron chicken",
              description: "Charred lemon and preserved pepper.",
              basePrice: { amount: "18.50", currency: "USD" },
              status: "active",
              available: true,
              displayOrder: 1,
              version: 3,
            },
          ],
        }),
      }),
  );
  await page.route(`**/api/v1/staff/branches/${branchId}/tables`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: tableId,
            businessAccountId,
            branchId,
            code: "T-12",
            area: "Dining room",
            status: "active",
            outOfService: false,
            version: 1,
            derivedState: "available",
          },
        ],
      }),
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();

  await expect(
    page.getByRole("heading", { name: "What guests can order" }),
  ).toBeVisible();
  await expect(page.getByText("Saffron chicken")).toBeVisible();
  await expect(page.getByText("$18.50")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Wood-fired plates" })
      .getByText("Available", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Tables" }).click();

  await expect(
    page.getByRole("heading", { name: "Table availability" }),
  ).toBeVisible();
  await expect(page.getByText("T-12")).toBeVisible();
  await expect(page.getByText("Dining room")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Dining room" })
      .getByText("Available", { exact: true }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("does not fetch or render lists without the exact view permissions", async ({
  page,
}) => {
  let menuRequests = 0;
  let tableRequests = 0;
  await mockReadyPortal(page, {
    permissions: ["menu.manage", "tables.assign"],
    enabledFeatures: ["menu", "tables"],
    grants: [
      {
        permissionKey: "menu.manage",
        restaurantId,
      },
      {
        permissionKey: "tables.assign",
        restaurantId,
        branchId,
      },
    ],
  });
  await page.route("**/api/v1/staff/restaurants/*/menu/**", (route) => {
    menuRequests += 1;
    return route.fulfill({ status: 500 });
  });
  await page.route("**/api/v1/staff/branches/*/tables", (route) => {
    tableRequests += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    page.getByRole("heading", { name: "Menu view permission required" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(
    page.getByRole("heading", { name: "Table view permission required" }),
  ).toBeVisible();

  expect(menuRequests).toBe(0);
  expect(tableRequests).toBe(0);
});

test("keeps the last verified menu visible when a reload fails", async ({
  page,
}) => {
  let failDishReload = false;
  await mockReadyPortal(page, {
    permissions: ["menu.view"],
    enabledFeatures: ["menu"],
    grants: [
      {
        permissionKey: "menu.view",
        restaurantId,
        branchId,
      },
    ],
  });
  await page.route(
    `**/api/v1/staff/restaurants/${restaurantId}/menu/categories`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: categoryId,
              businessAccountId,
              restaurantId,
              name: "Lunch",
              displayOrder: 0,
              status: "active",
              version: 1,
            },
          ],
        }),
      }),
  );
  await page.route(
    `**/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
    (route) => {
      return failDishReload
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [
                {
                  id: dishId,
                  businessAccountId,
                  restaurantId,
                  categoryId,
                  name: "Verified soup",
                  basePrice: { amount: "9.00", currency: "USD" },
                  status: "active",
                  available: true,
                  displayOrder: 0,
                  version: 1,
                },
              ],
            }),
          });
    },
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText("Verified soup")).toBeVisible();
  failDishReload = true;
  await page.getByRole("button", { name: "Reload data" }).click();

  await expect(page.getByText("may be stale")).toBeVisible();
  await expect(page.getByText("Verified soup")).toBeVisible();
});
