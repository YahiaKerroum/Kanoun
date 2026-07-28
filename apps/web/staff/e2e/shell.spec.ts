import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const branchId = "00000000-0000-4000-8000-000000000101";
const employeeId = "00000000-0000-4000-8000-000000000102";
const restaurantId = "00000000-0000-4000-8000-000000000103";
const businessAccountId = "00000000-0000-4000-8000-000000000104";
const categoryId = "00000000-0000-4000-8000-000000000105";
const dishId = "00000000-0000-4000-8000-000000000106";
const tableId = "00000000-0000-4000-8000-000000000107";
const orderId = "00000000-0000-4000-8000-000000000108";
const tableSessionId = "00000000-0000-4000-8000-000000000109";
const orderItemId = "00000000-0000-4000-8000-000000000110";
const optionGroupId = "00000000-0000-4000-8000-000000000111";
const optionId = "00000000-0000-4000-8000-000000000112";

const activeOrder = {
  id: orderId,
  reference: "ORD-000021",
  version: 2,
  branchId,
  tableSessionId,
  tableId,
  tableCode: "T-12",
  creatorType: "staff",
  createdByEmployeeId: employeeId,
  customerName: "Nadia",
  approval: "accepted",
  fulfilment: "ready",
  financial: "unpaid",
  closure: "active",
  customerSafeStatusReason: null,
  total: { amount: "21.00", currency: "USD" },
  submittedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  acceptedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  cancellationRequested: false,
  items: [
    {
      id: orderItemId,
      dishId,
      menuVersion: "7",
      name: "Saffron chicken",
      quantity: 1,
      unitPrice: { amount: "21.00", currency: "USD" },
      selectedOptions: [],
      note: null,
      total: { amount: "21.00", currency: "USD" },
    },
  ],
};

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
  await page.route("**/api/v1/staff/orders?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
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
  await expect(page.getByRole("heading", { name: "Order flow" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No active orders match these filters",
    }),
  ).toBeVisible();
});

test("keeps order list and entry dependencies behind their exact permission gates", async ({
  page,
}) => {
  let orderRequests = 0;
  let dependencyRequests = 0;
  await mockReadyPortal(page, {
    permissions: ["orders.create"],
    enabledFeatures: ["ordering"],
    grants: [
      {
        permissionKey: "orders.create",
        restaurantId,
        branchId,
      },
    ],
  });
  await page.route("**/api/v1/staff/orders**", (route) => {
    orderRequests += 1;
    return route.fulfill({ status: 500 });
  });
  await page.route("**/api/v1/staff/**/menu/**", (route) => {
    dependencyRequests += 1;
    return route.fulfill({ status: 500 });
  });
  await page.route("**/api/v1/staff/branches/*/tables", (route) => {
    dependencyRequests += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(
    page.getByRole("heading", { name: "Order view permission required" }),
  ).toBeVisible();
  expect(orderRequests).toBe(0);

  await page.getByRole("button", { name: "Create order" }).click();
  await expect(
    page.getByRole("heading", { name: "Order-entry data is unavailable" }),
  ).toBeVisible();
  expect(dependencyRequests).toBe(0);
});

test("filters active orders, displays elapsed time, and preserves stale results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockReadyPortal(page, {
    permissions: ["orders.view"],
    enabledFeatures: ["ordering"],
    grants: [
      {
        permissionKey: "orders.view",
        restaurantId,
        branchId,
      },
    ],
  });
  let failReload = false;
  let lastOrderUrl = "";
  await page.route("**/api/v1/staff/orders?*", (route) => {
    lastOrderUrl = route.request().url();
    return failReload
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: lastOrderUrl.includes("fulfilment=ready")
              ? [activeOrder]
              : [],
            nextCursor: null,
          }),
        });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(
    page.getByRole("heading", {
      name: "No active orders match these filters",
    }),
  ).toBeVisible();
  await page.getByLabel("Fulfilment").selectOption("ready");
  await page.getByRole("button", { name: "Created by me" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page.getByText("ORD-000021")).toBeVisible();
  await expect(page.getByText("T-12")).toBeVisible();
  await expect(page.getByText(/\d+ min/)).toBeVisible();
  expect(lastOrderUrl).toContain("fulfilment=ready");
  expect(lastOrderUrl).toContain(
    `createdByEmployeeId=${encodeURIComponent(employeeId)}`,
  );
  expect(lastOrderUrl).not.toContain("station");

  failReload = true;
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByText("may be stale")).toBeVisible();
  await expect(page.getByText("ORD-000021")).toBeVisible();
});

test("creates a menu- and table-backed staff order with CSRF and idempotency", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await context.addCookies([
    {
      name: "rms_csrf",
      value: "staff-csrf-token",
      url: "http://127.0.0.1:5173",
    },
  ]);
  await mockReadyPortal(page, {
    permissions: ["orders.view", "orders.create", "menu.view", "tables.view"],
    enabledFeatures: ["ordering", "menu", "tables"],
    grants: [
      {
        permissionKey: "orders.create",
        restaurantId,
        branchId,
      },
    ],
  });
  await page.route("**/api/v1/staff/orders?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
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
            code: "T-12",
            status: "active",
            outOfService: false,
            derivedState: "available",
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
          menuVersion: 7,
          items: [
            {
              id: dishId,
              name: "Saffron chicken",
              basePrice: { amount: "18.50", currency: "USD" },
              status: "active",
              available: true,
              displayOrder: 1,
            },
          ],
        }),
      }),
  );
  await page.route(
    `**/api/v1/staff/menu/dishes/${dishId}/option-groups`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: optionGroupId,
              dishId,
              name: "Sides",
              minimum: 0,
              maximum: 1,
              options: [
                {
                  id: optionId,
                  name: "Roasted potatoes",
                  priceDelta: { amount: "2.50", currency: "USD" },
                  displayOrder: 0,
                  status: "active",
                },
              ],
            },
          ],
        }),
      }),
  );
  await page.route(
    `**/api/v1/staff/branches/${branchId}/menu/dishes/${dishId}/override`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          branchId,
          dishId,
          price: null,
          available: null,
          visible: true,
        }),
      }),
  );
  await page.route("**/api/v1/staff/orders", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-csrf-token"]).toBe("staff-csrf-token");
    expect(request.headers()["idempotency-key"]?.length).toBeGreaterThanOrEqual(
      16,
    );
    expect(request.postDataJSON()).toMatchObject({
      tableId,
      menuVersion: 7,
      customerName: "Nadia",
      items: [
        {
          dishId,
          quantity: 1,
          optionIds: [optionId],
          note: "No chilli",
        },
      ],
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(activeOrder),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Orders" }).click();
  const trigger = page.getByRole("button", { name: "Create order" });
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Close order entry" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Create order" });
  await dialog.getByLabel("Table").selectOption(tableId);
  await dialog.getByLabel("Customer name (optional)").fill("Nadia");
  await dialog.getByLabel("Dish").selectOption(dishId);
  await dialog.getByLabel("Roasted potatoes").check();
  await dialog.getByLabel("Preparation note (optional)").fill("No chilli");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(dialog.getByText("$21.00").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Submit order" }).click();
  await expect(dialog.getByText("ORD-000021")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
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

test("processes the grouped kitchen queue and ready-order collection accessibly", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "rms_csrf",
      value: "staff-csrf-token",
      url: "http://127.0.0.1:5173",
    },
  ]);
  await mockReadyPortal(page, {
    permissions: [
      "orders.view",
      "orders.serve",
      "kitchen.view",
      "kitchen.update",
    ],
    enabledFeatures: ["ordering", "kitchen"],
    grants: [
      {
        permissionKey: "kitchen.update",
        restaurantId,
        branchId,
      },
    ],
  });
  const workItemId = "00000000-0000-4000-8000-000000000091";
  const kitchenOrderId = "00000000-0000-4000-8000-000000000092";
  let state: "queued" | "preparing" | "ready" | "served" = "queued";
  let version = 1;
  let orderVersion = 2;
  const queueItem = () => ({
    id: workItemId,
    version,
    orderId: kitchenOrderId,
    orderReference: "ORD-000091",
    orderVersion,
    orderFulfilment:
      state === "ready" ? "ready" : state === "queued" ? "not_started" : state,
    orderSubmittedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    tableId: "00000000-0000-4000-8000-000000000093",
    tableCode: "PATIO-4",
    itemName: "Couscous royale",
    quantity: 2,
    selectedOptions: [
      {
        groupId: "00000000-0000-4000-8000-000000000094",
        groupName: "Size",
        optionId: "00000000-0000-4000-8000-000000000095",
        optionName: "Large",
      },
    ],
    note: "No parsley",
    state,
    queuedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    startedAt:
      state === "queued"
        ? null
        : new Date(Date.now() - 4 * 60_000).toISOString(),
    startedByEmployeeId:
      state === "queued" ? null : "00000000-0000-4000-8000-000000000096",
    readyAt: state === "ready" ? new Date().toISOString() : null,
    readyByEmployeeId:
      state === "ready" ? "00000000-0000-4000-8000-000000000096" : null,
  });
  await page.route("**/api/v1/staff/kitchen/queue?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state === "served" ? [] : [queueItem()]),
    }),
  );
  await page.route("**/api/v1/staff/kitchen/items/*/start", async (route) => {
    expect(route.request().headers()["if-match"]).toBe('"1"');
    expect(route.request().headers()["x-csrf-token"]).toBe("staff-csrf-token");
    state = "preparing";
    version = 2;
    orderVersion = 3;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(queueItem()),
    });
  });
  await page.route("**/api/v1/staff/kitchen/items/*/ready", async (route) => {
    expect(route.request().headers()["if-match"]).toBe('"2"');
    state = "ready";
    version = 3;
    orderVersion = 4;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(queueItem()),
    });
  });
  await page.route("**/api/v1/staff/orders/*/served", async (route) => {
    expect(route.request().headers()["if-match"]).toBe('"4"');
    state = "served";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: kitchenOrderId,
        version: 5,
        fulfilment: "served",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Kitchen" }).click();
  await expect(
    page.getByRole("heading", { name: "Kitchen and serving" }),
  ).toBeVisible();
  await expect(page.getByText("2× Couscous royale")).toBeVisible();
  await expect(page.getByText("Large")).toBeVisible();
  await expect(page.getByText("Note: No parsley")).toBeVisible();
  await expect(page.getByText("New · queued")).toBeVisible();
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("preparing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(
    page.getByRole("button", { name: "Collect · mark served" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Collect · mark served" }).click();
  await expect(
    page.getByText("No items waiting for preparation"),
  ).toBeVisible();
});

test("preserves the last verified kitchen queue and recovers authoritative state after reconnect", async ({
  page,
}) => {
  await mockReadyPortal(page, {
    permissions: ["kitchen.view"],
    enabledFeatures: ["kitchen"],
    grants: [
      {
        permissionKey: "kitchen.view",
        restaurantId,
        branchId,
      },
    ],
  });
  let fail = false;
  let recovered = false;
  await page.route("**/api/v1/staff/kitchen/queue?*", (route) => {
    if (fail) {
      return route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          title: "Queue unavailable",
          detail: "Reconnect and reload the authoritative queue.",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        recovered
          ? []
          : [
              {
                id: "00000000-0000-4000-8000-000000000097",
                version: 1,
                orderId: "00000000-0000-4000-8000-000000000098",
                orderReference: "ORD-000098",
                orderVersion: 2,
                orderFulfilment: "not_started",
                orderSubmittedAt: new Date().toISOString(),
                tableId: "00000000-0000-4000-8000-000000000099",
                tableCode: "T-9",
                itemName: "Soup",
                quantity: 1,
                selectedOptions: [],
                note: null,
                state: "queued",
                queuedAt: new Date().toISOString(),
                startedAt: null,
                startedByEmployeeId: null,
                readyAt: null,
                readyByEmployeeId: null,
              },
            ],
      ),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Kitchen" }).click();
  await expect(page.getByText("1× Soup")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Refresh queue" }).click();
  await expect(
    page.getByText(/last verified queue and may be stale/i),
  ).toBeVisible();
  await expect(page.getByText("1× Soup")).toBeVisible();

  fail = false;
  recovered = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText("No items waiting for preparation"),
  ).toBeVisible();
  await expect(page.getByText(/may be stale/i)).toHaveCount(0);
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
