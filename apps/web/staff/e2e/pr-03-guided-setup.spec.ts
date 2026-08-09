import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { z } from "zod";

test("guided setup recalculates readiness and gates the Staff handoff", async ({
  page,
}) => {
  const restaurantId = "00000000-0000-4000-8000-000000000210";
  const secondRestaurantId = "00000000-0000-4000-8000-000000000219";
  const branchId = "00000000-0000-4000-8000-000000000211";
  const secondBranchId = "00000000-0000-4000-8000-000000000220";
  const employeeId = "00000000-0000-4000-8000-000000000212";
  const secondEmployeeId = "00000000-0000-4000-8000-000000000221";
  const tableId = "00000000-0000-4000-8000-000000000213";
  const secondTableId = "00000000-0000-4000-8000-000000000222";
  const qrId = "00000000-0000-4000-8000-000000000214";
  const secondQrId = "00000000-0000-4000-8000-000000000223";
  const categoryId = "00000000-0000-4000-8000-000000000215";
  const secondCategoryId = "00000000-0000-4000-8000-000000000224";
  const dishId = "00000000-0000-4000-8000-000000000216";
  const secondDishId = "00000000-0000-4000-8000-000000000225";
  const featureIds = [
    "CFG-001",
    "CFG-002",
    "CFG-003",
    "CFG-004",
    "CFG-005",
    "CFG-006",
    "CFG-007",
    "CFG-008",
  ];
  const featureCatalog = featureIds.map((id) => ({
    id,
    key: id.toLowerCase(),
    kind: "core_module",
    scope: "branch",
    mvp: true,
    defaultState: "enabled",
    dependsOn: [],
    mutableInMvp: true,
  }));
  const featureConfiguration = (
    configurationId: string,
    targetBranchId = branchId,
  ) => ({
    id: configurationId,
    branchId: targetBranchId,
    version: 1,
    values: Object.fromEntries(featureIds.map((id) => [id, "enabled"])),
    createdAtUtc: "2026-08-09T10:00:00.000Z",
  });
  let branchServiceStatus: "open" | "closed" | "temporarily_unavailable" =
    "open";
  let branchVersion = 1;
  const branchRecord = () => ({
    id: branchId,
    restaurantId,
    name: "Hydra",
    address: {
      line1: "12 Rue Didouche Mourad",
      city: "Algiers",
      countryCode: "DZ",
    },
    contact: { email: "hydra@dar-nedjma.test", phone: "+213555010101" },
    timeZone: "Africa/Algiers",
    currency: "DZD",
    status: "active",
    serviceStatus: branchServiceStatus,
    allowOrderOverride: false,
    version: branchVersion,
    openingHours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "22:00" }],
  });
  const secondBranchRecord = () => ({
    id: secondBranchId,
    restaurantId: secondRestaurantId,
    name: "Bab Ezzouar",
    address: {
      line1: "24 Avenue des Frères",
      city: "Algiers",
      countryCode: "DZ",
    },
    contact: { email: "bab-ezzouar@dar-nedjma.test", phone: "+213555010102" },
    timeZone: "Africa/Algiers",
    currency: "DZD",
    status: "active",
    serviceStatus: "open",
    allowOrderOverride: false,
    version: 1,
    openingHours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "22:00" }],
  });

  page.on("dialog", (dialog) => dialog.accept());

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
        authorizedBranchIds: [branchId, secondBranchId],
        grants: [restaurantId, secondRestaurantId].flatMap(
          (grantRestaurantId) =>
            [
              "restaurant.view",
              "restaurant.edit",
              "branches.view",
              "branches.manage",
              "features.manage",
              "employees.view",
              "employees.manage",
              "employees.manage_permissions",
              "menu.view",
              "tables.view",
              "qr.manage",
              "orders.view",
              "kitchen.view",
              "payments.view",
            ].map((permissionKey) => ({
              permissionKey,
              restaurantId: grantRestaurantId,
            })),
        ),
        expiresAt: "2030-08-09T18:00:00.000Z",
      });
    }
    if (url.pathname.endsWith("/staff/restaurants")) {
      return json({
        items: [
          {
            id: restaurantId,
            name: "Dar Nedjma",
            status: "active",
            version: 1,
          },
          {
            id: secondRestaurantId,
            name: "Second Kitchen",
            status: "active",
            version: 1,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/staff/branches")) {
      return json({
        items: [branchRecord(), secondBranchRecord()],
      });
    }
    if (
      url.pathname.endsWith(`/staff/branches/${branchId}`) &&
      route.request().method() === "PATCH"
    ) {
      const body = z
        .object({
          serviceStatus: z
            .enum(["open", "closed", "temporarily_unavailable"])
            .optional(),
        })
        .parse(route.request().postDataJSON());
      if (body.serviceStatus) branchServiceStatus = body.serviceStatus;
      branchVersion += 1;
      return json(branchRecord());
    }
    if (url.pathname.endsWith("/staff/permission-templates")) {
      return json({ items: [], catalog: [] });
    }
    if (url.pathname.endsWith("/staff/employees")) {
      if (url.searchParams.get("restaurantId") === secondRestaurantId) {
        return json({
          items: [
            {
              id: secondEmployeeId,
              restaurantId: secondRestaurantId,
              displayName: "Nadia Saidi",
              email: "nadia.saidi@dar-nedjma.test",
              status: "active",
              version: 1,
              branchIds: [secondBranchId],
            },
          ],
        });
      }
      return json({
        items: [
          {
            id: employeeId,
            restaurantId,
            displayName: "Imane Khellaf",
            email: "imane.khellaf@dar-nedjma.test",
            status: "active",
            version: 1,
            branchIds: [branchId],
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/features`)) {
      return json({
        configuration: featureConfiguration(
          "00000000-0000-4000-8000-000000000217",
        ),
        catalog: featureCatalog,
      });
    }
    if (url.pathname.endsWith(`/branches/${secondBranchId}/features`)) {
      return json({
        configuration: featureConfiguration(
          "00000000-0000-4000-8000-000000000226",
          secondBranchId,
        ),
        catalog: featureCatalog,
      });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/features`)) {
      return json({
        configuration: {
          ...featureConfiguration("00000000-0000-4000-8000-000000000218"),
          branchId: undefined,
        },
        catalog: featureCatalog,
      });
    }
    if (url.pathname.endsWith(`/restaurants/${secondRestaurantId}/features`)) {
      return json({
        configuration: {
          ...featureConfiguration(
            "00000000-0000-4000-8000-000000000227",
            secondBranchId,
          ),
          branchId: undefined,
        },
        catalog: featureCatalog,
      });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/menu/categories`)) {
      return json({ items: [{ id: categoryId, status: "active" }] });
    }
    if (
      url.pathname.endsWith(
        `/restaurants/${secondRestaurantId}/menu/categories`,
      )
    ) {
      return json({ items: [{ id: secondCategoryId, status: "active" }] });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/menu/dishes`)) {
      return json({
        items: [{ id: dishId, status: "active", available: true }],
      });
    }
    if (
      url.pathname.endsWith(`/restaurants/${secondRestaurantId}/menu/dishes`)
    ) {
      return json({
        items: [{ id: secondDishId, status: "active", available: true }],
      });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/tables`)) {
      return json({ items: [{ id: tableId, status: "active" }] });
    }
    if (url.pathname.endsWith(`/branches/${secondBranchId}/tables`)) {
      return json({ items: [{ id: secondTableId, status: "active" }] });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/qr-codes`)) {
      return json({
        items: [{ id: qrId, tableId, kind: "table", status: "active" }],
      });
    }
    if (url.pathname.endsWith(`/branches/${secondBranchId}/qr-codes`)) {
      return json({
        items: [
          {
            id: secondQrId,
            tableId: secondTableId,
            kind: "table",
            status: "active",
          },
        ],
      });
    }
    return json({ items: [] });
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("http://127.0.0.1:5175/setup");

  await expect(
    page.getByRole("heading", { name: "Service readiness review" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Service readiness review" })
      .getByText("Core setup complete", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("0 blocked · 0 need setup · 1 optional", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Workforce" }),
  ).toHaveAttribute("href", "/employees");
  await expect(
    page.getByRole("link", { name: "Open Staff workspace" }),
  ).toHaveAttribute("href", "http://127.0.0.1:5173/");
  await expect(
    page.getByRole("link", { name: "Review Tables & QR" }),
  ).toHaveAttribute("href", "/tables");

  await page.getByLabel("Service status").selectOption("closed");
  await page
    .getByLabel("Explanation for a closed or temporarily unavailable status")
    .fill("Kitchen maintenance is underway");
  await page.getByRole("button", { name: "Save branch and hours" }).click();
  await expect(
    page.getByText("0 blocked · 1 need setup · 1 optional", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Staff workspace" }),
  ).toHaveCount(0);

  await page.getByLabel("Service status").selectOption("open");
  await page
    .getByLabel("Explanation for a closed or temporarily unavailable status")
    .fill("Kitchen maintenance is complete");
  await page.getByRole("button", { name: "Save branch and hours" }).click();
  await expect(
    page.getByText("Core setup complete", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Staff workspace" }),
  ).toHaveAttribute("href", "http://127.0.0.1:5173/");

  await page.getByRole("link", { name: "Open", exact: true }).first().click();
  await expect(page).toHaveURL("http://127.0.0.1:5175/setup#restaurant-editor");
  await expect(page.locator("#restaurant-editor")).toBeVisible();

  await page
    .locator("#restaurant-editor .record-selector button")
    .filter({ hasText: "Second Kitchen" })
    .click();
  await expect(
    page.locator(
      'section[aria-labelledby="readiness-review-title"] .section-heading > span',
    ),
  ).toHaveText("Bab Ezzouar");
  await expect(page.locator("label.setup-select-label select")).toHaveValue(
    secondBranchId,
  );
  await expect(
    page
      .locator("#restaurant-editor .record-selector button")
      .filter({ hasText: "Second Kitchen" }),
  ).toHaveClass(/is-selected/);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("heading", { name: "Service readiness review" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
});
