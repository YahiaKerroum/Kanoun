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

test("menu, table, branch override, and QR administration use the real contracts", async ({
  page,
}) => {
  const businessAccountId = "00000000-0000-4000-8000-000000000020";
  const restaurantId = "00000000-0000-4000-8000-000000000021";
  const branchId = "00000000-0000-4000-8000-000000000022";
  const employeeId = "00000000-0000-4000-8000-000000000023";
  const categoryId = "00000000-0000-4000-8000-000000000024";
  const dishId = "00000000-0000-4000-8000-000000000025";
  const optionGroupId = "00000000-0000-4000-8000-000000000026";
  const optionId = "00000000-0000-4000-8000-000000000027";
  const tableId = "00000000-0000-4000-8000-000000000028";
  const qrCodeId = "00000000-0000-4000-8000-000000000029";
  const issuedQrCodeId = "00000000-0000-4000-8000-000000000030";
  const categoryWrites: unknown[] = [];
  const overrideWrites: unknown[] = [];

  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/auth/session")) {
      return json({
        employeeId,
        activeBranchId: branchId,
        authorizedBranchIds: [branchId],
        grants: [
          "restaurant.view",
          "branches.view",
          "features.manage",
          "employees.view",
          "employees.manage",
          "employees.manage_permissions",
          "menu.view",
          "menu.manage",
          "menu.manage_prices",
          "menu.manage_availability",
          "tables.view",
          "tables.manage",
          "qr.manage",
        ].map((permissionKey) => ({
          permissionKey,
          restaurantId,
          ...(permissionKey.startsWith("menu.") ||
          permissionKey.startsWith("tables.") ||
          permissionKey === "qr.manage"
            ? { branchId }
            : {}),
        })),
        expiresAt: "2026-07-29T18:00:00.000Z",
      });
    }
    if (url.pathname.endsWith("/staff/restaurants")) {
      return json({
        items: [
          {
            id: restaurantId,
            name: "Mise Test Kitchen",
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
      return json({ items: [], catalog: [] });
    }
    if (url.pathname.endsWith("/staff/employees")) {
      return json({ items: [] });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/features`)) {
      return json({
        configuration: {
          id: "00000000-0000-4000-8000-000000000031",
          branchId,
          version: 1,
          values: {
            "CFG-004": "enabled",
            "CFG-006": "enabled",
          },
          createdAtUtc: "2026-07-28T12:00:00.000Z",
        },
        catalog: [],
      });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/features`)) {
      return json({
        configuration: {
          id: "00000000-0000-4000-8000-000000000032",
          version: 1,
          values: { "CFG-003": "enabled" },
          createdAtUtc: "2026-07-28T12:00:00.000Z",
        },
        catalog: [],
      });
    }
    if (
      url.pathname.endsWith(`/restaurants/${restaurantId}/menu/categories`) &&
      request.method() === "POST"
    ) {
      categoryWrites.push(request.postDataJSON());
      return json(
        {
          id: "00000000-0000-4000-8000-000000000033",
          businessAccountId,
          restaurantId,
          name: "Desserts",
          displayOrder: 1,
          status: "active",
          version: 1,
        },
        201,
      );
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/menu/categories`)) {
      return json({
        items: [
          {
            id: categoryId,
            businessAccountId,
            restaurantId,
            name: "Main plates",
            displayOrder: 0,
            status: "active",
            version: 1,
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/restaurants/${restaurantId}/menu/dishes`)) {
      return json({
        items: [
          {
            id: dishId,
            businessAccountId,
            restaurantId,
            categoryId,
            name: "Saffron chicken",
            description: "Charred lemon and preserved pepper.",
            basePrice: { amount: "1800.00", currency: "DZD" },
            status: "active",
            available: true,
            displayOrder: 0,
            version: 2,
          },
        ],
      });
    }
    if (url.pathname.endsWith(`/menu/dishes/${dishId}/option-groups`)) {
      return json({
        items: [
          {
            id: optionGroupId,
            businessAccountId,
            dishId,
            name: "Sides",
            selectionType: "single",
            isRequired: false,
            minimumSelections: 0,
            maximumSelections: 1,
            displayOrder: 0,
            version: 1,
            options: [
              {
                id: optionId,
                businessAccountId,
                optionGroupId,
                name: "Roasted potatoes",
                priceDelta: { amount: "250.00", currency: "DZD" },
                displayOrder: 0,
                status: "active",
                version: 1,
              },
            ],
          },
        ],
      });
    }
    if (
      url.pathname.endsWith(
        `/branches/${branchId}/menu/dishes/${dishId}/override`,
      ) &&
      request.method() === "PUT"
    ) {
      overrideWrites.push(request.postDataJSON());
      return json({
        businessAccountId,
        branchId,
        dishId,
        price: { amount: "1750.00", currency: "DZD" },
        available: true,
        visible: true,
        version: 2,
      });
    }
    if (
      url.pathname.endsWith(
        `/branches/${branchId}/menu/dishes/${dishId}/override`,
      )
    ) {
      return json({
        businessAccountId,
        branchId,
        dishId,
        price: null,
        available: null,
        visible: true,
        version: 1,
      });
    }
    if (url.pathname.endsWith(`/branches/${branchId}/tables`)) {
      return json({
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
      });
    }
    if (
      url.pathname.endsWith(`/tables/${tableId}/qr-codes`) &&
      request.method() === "POST"
    ) {
      return json(
        {
          qrCode: {
            id: issuedQrCodeId,
            businessAccountId,
            branchId,
            tableId,
            kind: "table",
            status: "active",
            createdAtUtc: "2026-07-28T12:30:00.000Z",
          },
          rawToken: "raw-token-returned-once-1234567890",
          qrUrl:
            "https://customer.example.test/qr/raw-token-returned-once-1234567890",
        },
        201,
      );
    }
    if (url.pathname.endsWith(`/branches/${branchId}/qr-codes`)) {
      return json({
        items: [
          {
            id: qrCodeId,
            businessAccountId,
            branchId,
            tableId,
            kind: "table",
            status: "active",
            createdAtUtc: "2026-07-28T12:00:00.000Z",
          },
        ],
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto("http://127.0.0.1:5175");
  const menu = page.getByRole("region", { name: "Menu" });
  const tables = page.getByRole("region", { name: "Tables & QR" });

  await expect(
    menu.getByRole("heading", { name: "Saffron chicken" }),
  ).toBeVisible();
  await expect(menu.getByLabel("Current options")).toHaveValue(
    /Roasted potatoes \| 250\.00 \| active/,
  );
  await menu.getByLabel("Category name").fill("Desserts");
  await menu.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category created.")).toBeVisible();
  expect(categoryWrites).toEqual([{ name: "Desserts", displayOrder: 1 }]);

  await menu.getByLabel("Price (DZD)", { exact: true }).fill("1750.00");
  await menu.getByRole("button", { name: "Save branch override" }).click();
  await expect(page.getByText("Branch override saved.")).toBeVisible();
  expect(overrideWrites).toEqual([
    {
      expectedVersion: 1,
      visible: true,
      price: { amount: "1750.00", currency: "DZD" },
      available: null,
    },
  ]);

  await expect(
    tables.getByRole("heading", { name: "T-12", exact: true }),
  ).toBeVisible();
  await tables.getByRole("button", { name: "Issue / rotate table QR" }).click();
  await expect(
    tables.getByRole("heading", { name: "Table T-12" }),
  ).toBeVisible();
  const qrImage = tables.getByRole("img", { name: "QR code for table T-12" });
  await expect(qrImage).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(
    tables.getByRole("link", { name: "Download PNG" }),
  ).toHaveAttribute("download", /mise-table-.*\.png/);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
