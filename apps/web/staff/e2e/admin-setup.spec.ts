import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("administration begins at a protected, accessible sign-in state", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "/problems/authentication-required",
        title: "Authentication required",
        status: 401,
        code: "authentication_required",
        correlationId: "00000000-0000-4000-8000-000000000001",
      }),
    });
  });
  await page.goto("http://127.0.0.1:5175");

  await expect(
    page.getByRole("heading", {
      name: "Restaurant access starts with verified scope.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Business code")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("employee, permission, and feature administration is responsive and accessible", async ({
  page,
}) => {
  const restaurantId = "00000000-0000-4000-8000-000000000010";
  const branchId = "00000000-0000-4000-8000-000000000011";
  const employeeId = "00000000-0000-4000-8000-000000000012";
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/auth/session")) {
      return json({
        employeeId,
        activeBranchId: branchId,
        authorizedBranchIds: [branchId],
        grants: [
          {
            permissionKey: "restaurant.view",
            restaurantId,
          },
          { permissionKey: "branches.view", restaurantId },
          { permissionKey: "features.manage", restaurantId },
          { permissionKey: "employees.view", restaurantId },
          { permissionKey: "employees.manage", restaurantId },
          {
            permissionKey: "employees.manage_permissions",
            restaurantId,
          },
          { permissionKey: "orders.view", restaurantId },
        ],
        expiresAt: "2026-07-27T18:00:00.000Z",
      });
    }
    if (url.pathname.endsWith("/staff/restaurants")) {
      return json({
        items: [
          {
            id: restaurantId,
            name: "Test Kitchen",
            status: "active",
            version: 1,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/staff/branches")) {
      return json({
        items: [
          {
            id: branchId,
            restaurantId,
            name: "Central branch",
            timeZone: "Africa/Algiers",
            currency: "DZD",
            status: "active",
            serviceStatus: "open",
            version: 1,
            openingHours: [],
          },
        ],
      });
    }
    if (url.pathname.endsWith("/staff/permission-templates")) {
      return json({
        items: [
          {
            key: "general_staff",
            displayName: "General Staff",
            permissionKeys: ["orders.view"],
            version: 1,
          },
        ],
        catalog: [
          {
            key: "employees.view",
            id: "PERM-006",
            module: "restaurant_configuration",
            scope: "restaurant",
            risk: "medium",
          },
          {
            key: "orders.view",
            id: "PERM-018",
            module: "ordering",
            scope: "branch",
            risk: "low",
          },
        ],
      });
    }
    if (url.pathname.endsWith("/staff/employees")) {
      return json({
        items: [
          {
            id: employeeId,
            restaurantId,
            displayName: "Ada Service",
            email: "ada@example.test",
            status: "active",
            version: 1,
            branchIds: [branchId],
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/features`)) {
      return json({
        configuration: {
          id: "00000000-0000-4000-8000-000000000013",
          branchId,
          version: 1,
          values: {
            "CFG-005": "enabled",
            "CFG-008": "automatic",
          },
          createdAtUtc: "2026-07-27T15:00:00.000Z",
        },
        catalog: [
          {
            id: "CFG-005",
            key: "ordering",
            kind: "core_module",
            scope: "branch",
            mvp: true,
            defaultState: "enabled",
            dependsOn: [],
            mutableInMvp: true,
          },
          {
            id: "CFG-008",
            key: "order_acceptance",
            kind: "strategy",
            scope: "branch",
            mvp: true,
            defaultState: "automatic",
            dependsOn: ["CFG-005"],
            mutableInMvp: false,
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/features`)) {
      return json({
        configuration: {
          id: "00000000-0000-4000-8000-000000000014",
          version: 1,
          values: {
            "CFG-001": "enabled",
            "CFG-002": "enabled",
            "CFG-003": "enabled",
            "CFG-014": "enabled",
          },
          createdAtUtc: "2026-07-27T15:00:00.000Z",
        },
        catalog: [],
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("http://127.0.0.1:5175");

  await expect(
    page.getByRole("heading", { name: "People & configuration" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workforce" })).toBeVisible();
  await expect(page.getByText("automatic · fixed in MVP")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
