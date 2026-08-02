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
const secondDishId = "00000000-0000-4000-8000-000000000113";

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
  customerName: "Nadia Cheriet",
  approval: "accepted",
  fulfilment: "ready",
  financial: "partially_refunded",
  closure: "active",
  customerSafeStatusReason: null,
  total: { amount: "4200.00", currency: "DZD" },
  submittedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  acceptedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  cancellationRequested: false,
  items: [
    {
      id: orderItemId,
      dishId,
      menuVersion: "7",
      name: "Couscous royale",
      quantity: 1,
      unitPrice: { amount: "4200.00", currency: "DZD" },
      selectedOptions: [],
      note: null,
      total: { amount: "4200.00", currency: "DZD" },
    },
  ],
};

interface PortalOverrides {
  readonly permissions?: readonly string[];
  readonly enabledFeatures?: readonly string[];
  readonly includeReadmeNavigation?: boolean;
  readonly grants?: readonly {
    readonly permissionKey: string;
    readonly restaurantId?: string;
    readonly branchId?: string;
  }[];
}

const readmeNavigationLabels = [
  "Home",
  "Notifications",
  "Orders",
  "Tables",
  "Kitchen",
  "Payments",
  "Menu",
  "Staff",
  "Reports",
  "Setup",
  "Audit",
] as const;

const readmePermissions = [
  "orders.view",
  "tables.view",
  "kitchen.view",
  "payments.view",
  "menu.view",
  "employees.view",
  "reports.view",
  "features.manage",
  "audit.view",
] as const;

const readmeFeatures = [
  "restaurant_configuration",
  "identity_access",
  "menu",
  "ordering",
  "tables",
  "kitchen",
  "payments",
  "notifications",
  "reporting",
  "audit",
] as const;

function withReadmeValues(
  values: readonly string[] | undefined,
  readmeValues: readonly string[],
  includeReadmeNavigation: boolean,
): readonly string[] | undefined {
  if (!includeReadmeNavigation) {
    return values;
  }
  return [...new Set([...readmeValues, ...(values ?? [])])];
}

async function expectCanonicalReadmeNavigation(page: Page): Promise<void> {
  const navigation = page.getByRole("navigation", {
    name: "Staff navigation",
  });
  await expect(navigation).toBeVisible();
  const navigationBox = await navigation.boundingBox();
  expect(navigationBox).not.toBeNull();
  for (const label of readmeNavigationLabels) {
    const destination = navigation.getByRole("button", {
      name: label,
      exact: true,
    });
    await expect(destination).toBeVisible();
    const destinationBox = await destination.boundingBox();
    expect(destinationBox).not.toBeNull();
    if (navigationBox !== null && destinationBox !== null) {
      expect(destinationBox.x).toBeGreaterThanOrEqual(navigationBox.x);
      expect(destinationBox.x + destinationBox.width).toBeLessThanOrEqual(
        navigationBox.x + navigationBox.width,
      );
    }
  }
  await expect(
    navigation.getByRole("button", { name: "Stock", exact: true }),
  ).toHaveCount(0);
}

async function resetReadmeCaptureScroll(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            document.scrollingElement?.scrollTo(0, 0);
            document.querySelector<HTMLElement>(".workspace")?.scrollTo(0, 0);
            document
              .querySelector<HTMLElement>(".navigation-rail__items")
              ?.scrollTo(0, 0);
            resolve();
          }),
        );
      }),
  );
}

async function captureReadmeScreenshot(
  page: Page,
  path: string,
  options: { readonly scrollTarget?: string } = {},
): Promise<void> {
  if (path.includes("readme-staff-")) {
    await page.setViewportSize({ width: 820, height: 1200 });
    await resetReadmeCaptureScroll(page);
    await expectCanonicalReadmeNavigation(page);
  }
  await page.evaluate(() => {
    const focusedElement = document.activeElement;
    if (focusedElement instanceof HTMLElement) {
      focusedElement.blur();
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".workspace")?.scrollTo(0, 0);
  });
  const viewport = page.viewportSize();
  const isCompactCapture = viewport !== null && viewport.width <= 820;
  if (isCompactCapture) {
    const contentHeight = await page.evaluate(() =>
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      ),
    );
    await page.setViewportSize({
      width: viewport.width,
      height: Math.min(contentHeight, 1600),
    });
    await resetReadmeCaptureScroll(page);
    if (path.includes("readme-staff-")) {
      await expectCanonicalReadmeNavigation(page);
      await resetReadmeCaptureScroll(page);
    }
  }
  if (options.scrollTarget !== undefined) {
    await page.locator(options.scrollTarget).evaluate((element) => {
      element.scrollIntoView({ block: "start" });
      document
        .querySelector<HTMLElement>(".navigation-rail__items")
        ?.scrollTo(0, 0);
    });
    await expectCanonicalReadmeNavigation(page);
  }
  await page.screenshot({ path, fullPage: !isCompactCapture });
}

async function mockReadyPortal(
  page: Page,
  overrides: PortalOverrides = {},
): Promise<void> {
  const includeReadmeNavigation = overrides.includeReadmeNavigation ?? false;
  const permissions = withReadmeValues(
    overrides.permissions,
    readmePermissions,
    includeReadmeNavigation,
  );
  const enabledFeatures = withReadmeValues(
    overrides.enabledFeatures,
    readmeFeatures,
    includeReadmeNavigation,
  );
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
          branchName: "Hydra",
          restaurantId,
          timeZone: "Africa/Algiers",
          currency: "DZD",
          permissions: permissions ?? [
            "orders.view",
            "kitchen.update",
            "menu.view",
            "audit.view",
          ],
          enabledFeatures: enabledFeatures ?? [
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
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready",
        dependencies: { database: "available" },
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
  await mockReadyPortal(page, {
    permissions: ["orders.view", "kitchen.update"],
    enabledFeatures: ["notifications", "ordering", "kitchen"],
    grants: [
      { permissionKey: "orders.view", restaurantId, branchId },
      { permissionKey: "kitchen.update", restaurantId, branchId },
    ],
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Your branch is ready for service.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Orders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kitchen" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Tables" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Staff", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reports" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);

  const accessIcons = page.locator(".access-icon");
  await expect(accessIcons).toHaveCount(3);
  for (const accessIcon of await accessIcons.all()) {
    await expect(accessIcon).toHaveCSS("display", "grid");
    const iconTile = await accessIcon.boundingBox();
    const iconGlyph = await accessIcon.locator("svg").boundingBox();
    expect(iconTile).not.toBeNull();
    expect(iconGlyph).not.toBeNull();
    if (iconTile === null || iconGlyph === null) {
      continue;
    }
    expect(iconGlyph.x + iconGlyph.width / 2).toBeCloseTo(
      iconTile.x + iconTile.width / 2,
      1,
    );
    expect(iconGlyph.y + iconGlyph.height / 2).toBeCloseTo(
      iconTile.y + iconTile.height / 2,
      1,
    );
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await captureReadmeScreenshot(
    page,
    "test-results/visual-qa-staff-workspace-mobile.png",
  );
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
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
    includeReadmeNavigation: true,
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
  await captureReadmeScreenshot(page, "test-results/readme-staff-orders.png");
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
    includeReadmeNavigation: true,
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
      customerName: "Nadia Cheriet",
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
  await dialog.getByLabel("Customer name (optional)").fill("Nadia Cheriet");
  await dialog.getByLabel("Dish").selectOption(dishId);
  await dialog.getByLabel("Roasted potatoes").check();
  await dialog.getByLabel("Preparation note (optional)").fill("No chilli");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(dialog.getByText("$21.00").first()).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1200 });
  await resetReadmeCaptureScroll(page);
  await expectCanonicalReadmeNavigation(page);
  await dialog.screenshot({
    path: "test-results/readme-staff-order-entry-tablet.png",
  });
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
    includeReadmeNavigation: true,
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
  await captureReadmeScreenshot(page, "test-results/readme-staff-kitchen.png");
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

test("keeps every current MVP destination available in the README navigation profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1200 });
  await mockReadyPortal(page, {
    includeReadmeNavigation: true,
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
  await page.route("**/api/v1/staff/branches/*/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branch: {
          branchName: "Hydra",
          restaurantName: "Dar Nedjma",
          timeZone: "Africa/Algiers",
          currency: "DZD",
        },
        activeOrders: 2,
        orderStates: [],
        occupiedTables: 2,
        pendingRequests: { bills: 0, cancellations: 0 },
        kitchenWaiting: [],
        dailySales: [
          {
            currency: "DZD",
            grossAmount: "2750.00",
            paidAmount: "2750.00",
            refundedAmount: "0.00",
            cancelledAmount: "0.00",
          },
        ],
        enabledWidgets: ["orders", "tables", "kitchen", "payments"],
      }),
    }),
  );
  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Staff navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Payments", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Staff", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stock" })).toHaveCount(0);
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-workspace.png",
  );
  await navigation.screenshot({
    path: "test-results/readme-staff-tablet-navigation.png",
  });
});

test("loads real read-only menu and derived table states for the active scope", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockReadyPortal(page, {
    includeReadmeNavigation: true,
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
              name: "Traditional mains",
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
              name: "Couscous royale",
              description:
                "Lamb, chicken, seasonal vegetables, and sweet onions.",
              basePrice: { amount: "1850.00", currency: "DZD" },
              status: "active",
              available: true,
              displayOrder: 1,
              version: 3,
            },
            {
              id: secondDishId,
              businessAccountId,
              restaurantId,
              categoryId,
              name: "Rechta au poulet",
              description:
                "Hand-cut noodles with chicken, turnips, and chickpeas.",
              basePrice: { amount: "2400.00", currency: "DZD" },
              status: "active",
              available: false,
              displayOrder: 2,
              version: 1,
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
            area: "Salle principale",
            status: "active",
            outOfService: false,
            version: 1,
            derivedState: "occupied",
          },
          {
            id: "00000000-0000-4000-8000-000000000114",
            businessAccountId,
            branchId,
            code: "T-08",
            area: "Terrasse",
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
  await expect(page.getByText("Couscous royale")).toBeVisible();
  await expect(page.getByText("DZD\u00a01,850.00")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Traditional mains" })
      .getByText("Available", { exact: true }),
  ).toBeVisible();
  await captureReadmeScreenshot(page, "test-results/readme-staff-menu.png");

  await page.getByRole("button", { name: "Tables" }).click();

  await expect(
    page.getByRole("heading", { name: "Table availability" }),
  ).toBeVisible();
  await expect(page.getByText("T-12")).toBeVisible();
  await expect(page.getByText("Salle principale")).toBeVisible();
  await captureReadmeScreenshot(page, "test-results/readme-staff-tables.png");
  await expect(
    page
      .getByRole("region", { name: "Terrasse" })
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

test("records payment and refund with confirmation in the responsive payment desk", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const paymentId = "00000000-0000-4000-8000-000000000140";
  let paid = false;
  let refunded = false;
  await mockReadyPortal(page, {
    includeReadmeNavigation: true,
    permissions: ["payments.view", "payments.record", "payments.refund"],
    enabledFeatures: ["payments"],
    grants: [
      { permissionKey: "payments.view", restaurantId, branchId },
      { permissionKey: "payments.record", restaurantId, branchId },
      { permissionKey: "payments.refund", restaurantId, branchId },
    ],
  });
  const ledger = () => ({
    orderId,
    orderReference: "ORD-000021",
    orderVersion: refunded ? 4 : paid ? 3 : 2,
    branchId,
    tableId,
    tableCode: "T-12",
    total: { amount: "4200.00", currency: "DZD" },
    financial: refunded ? "partially_refunded" : paid ? "paid" : "unpaid",
    fulfilment: "served",
    closure: "active",
    payment: paid
      ? {
          id: paymentId,
          orderId,
          amount: { amount: "4200.00", currency: "DZD" },
          method: "card",
          externalReference: "CIB-ALG-4200",
          recordedAt: "2026-07-29T10:00:00.000Z",
          recordedByEmployeeId: employeeId,
        }
      : null,
    refunds: refunded
      ? [
          {
            id: "00000000-0000-4000-8000-000000000141",
            orderId,
            paymentId,
            amount: { amount: "500.00", currency: "DZD" },
            reason: "Courtesy adjustment for Nadia Cheriet",
            source: "manual",
            refundedAt: "2026-07-29T10:10:00.000Z",
            refundedByEmployeeId: employeeId,
          },
        ]
      : [],
    refundedAmount: {
      amount: refunded ? "500.00" : "0.00",
      currency: "DZD",
    },
    netPaidAmount: {
      amount: refunded ? "3700.00" : paid ? "4200.00" : "0.00",
      currency: "DZD",
    },
  });
  await page.route("**/api/v1/staff/payments/bill-requests?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: paid
          ? []
          : [
              {
                id: "00000000-0000-4000-8000-000000000142",
                requestedAt: "2026-07-29T09:58:00.000Z",
                ...ledger(),
              },
            ],
      }),
    }),
  );
  await page.route("**/api/v1/staff/orders/*/payments", async (route) => {
    const request = route.request();
    expect(request.headers()["idempotency-key"]?.length).toBeGreaterThanOrEqual(
      16,
    );
    expect(request.postDataJSON()).toEqual({
      amount: { amount: "4200.00", currency: "DZD" },
      method: "card",
      externalReference: "CIB-ALG-4200",
    });
    paid = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        payment: ledger().payment,
        order: { id: orderId, version: 3, financial: "paid" },
      }),
    });
  });
  await page.route("**/api/v1/staff/orders/*/payment-ledger", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ledger()),
    }),
  );
  await page.route("**/api/v1/staff/payments/*/refunds", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      amount: { amount: "500.00", currency: "DZD" },
      reason: "Courtesy adjustment for Nadia Cheriet",
      confirmed: true,
    });
    refunded = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        refund: ledger().refunds[0],
        order: {
          id: orderId,
          version: 4,
          financial: "partially_refunded",
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Payments" }).click();
  await expect(
    page.getByRole("heading", { name: "Bill requests" }),
  ).toBeVisible();
  await page.getByLabel("Method").selectOption("card");
  await page.getByLabel("External reference (optional)").fill("CIB-ALG-4200");
  await page
    .getByLabel("Confirm receipt of exactly DZD\u00a04,200.00.")
    .check();
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("No open bill requests.")).toBeVisible();

  await page.getByLabel("Order identifier").fill(orderId);
  await page.getByRole("button", { name: "Find ledger" }).click();
  await expect(page.getByText("Original payment")).toBeVisible();
  await expect(page.getByLabel("Order identifier")).toHaveValue("");
  await page.getByLabel("Amount (DZD)").fill("500.00");
  await page.getByLabel("Reason").fill("Courtesy adjustment for Nadia Cheriet");
  await page.getByLabel("Confirm this append-only refund.").check();
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText("Refunded", { exact: true })).toBeVisible();
  await expect(page.getByText("DZD\u00a0500.00")).toBeVisible();
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-payments-mobile.png",
  );
  await page.setViewportSize({ width: 390, height: 844 });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
});

test("keeps the same correction key across a failed response and exposes keyboard-safe order operations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const destinationId = "00000000-0000-4000-8000-000000000143";
  const operationOrder = {
    ...activeOrder,
    fulfilment: "not_started",
    financial: "unpaid",
    tableSessionVersion: 1,
    currentItemRevision: 1,
    billRequest: null,
    corrections: [],
  };
  const correctionKeys: string[] = [];
  let attempts = 0;
  await mockReadyPortal(page, {
    permissions: [
      "orders.view",
      "orders.modify",
      "orders.cancel",
      "tables.assign",
      "tables.view",
    ],
    enabledFeatures: ["ordering", "tables"],
  });
  await page.route("**/api/v1/staff/orders?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [operationOrder], nextCursor: null }),
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
            derivedState: "occupied",
          },
          {
            id: destinationId,
            code: "T-13",
            status: "active",
            outOfService: false,
            derivedState: "available",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/staff/orders/*/corrections", async (route) => {
    attempts += 1;
    correctionKeys.push(route.request().headers()["idempotency-key"] ?? "");
    expect(route.request().headers()["if-match"]).toBe('"2"');
    expect(route.request().postDataJSON()).toMatchObject({
      menuVersion: 7,
      reason: "Correct quantity",
      items: [{ dishId, quantity: 2, optionIds: [] }],
    });
    await route.fulfill(
      attempts === 1
        ? {
            status: 503,
            contentType: "application/problem+json",
            body: JSON.stringify({
              title: "Temporary failure",
              status: 503,
              code: "service_unavailable",
            }),
          }
        : {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: orderId, version: 3 }),
          },
    );
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByLabel("Couscous royale").fill("2");
  await page.getByLabel("Correction reason").fill("Correct quantity");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("alert")).toContainText("Temporary failure");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect.poll(() => attempts).toBe(2);
  expect(correctionKeys[0]).toBe(correctionKeys[1]);
  await expect(
    page.getByRole("button", { name: "Move entire session" }),
  ).toBeVisible();
  await expect(page.getByText("Confirm cancellation")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
});

test("does not fetch payment data without payments.view", async ({ page }) => {
  let paymentRequests = 0;
  await mockReadyPortal(page, {
    permissions: ["payments.record"],
    enabledFeatures: ["payments"],
    grants: [{ permissionKey: "payments.record", restaurantId, branchId }],
  });
  await page.route("**/api/v1/staff/payments/**", (route) => {
    paymentRequests += 1;
    return route.fulfill({ status: 500 });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Payments" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment view permission required" }),
  ).toBeVisible();
  expect(paymentRequests).toBe(0);
});

test("requires explicit confirmation for the critical unpaid completion UI", async ({
  page,
}) => {
  const servedUnpaid = {
    ...activeOrder,
    fulfilment: "served",
    financial: "unpaid",
    tableSessionVersion: 1,
    currentItemRevision: 1,
    billRequest: null,
    corrections: [],
  };
  let completionCalls = 0;
  await mockReadyPortal(page, {
    permissions: ["orders.view", "orders.complete_unpaid"],
    enabledFeatures: ["ordering"],
  });
  await page.route("**/api/v1/staff/orders?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [servedUnpaid], nextCursor: null }),
    }),
  );
  await page.route("**/api/v1/staff/orders/*/completion", async (route) => {
    completionCalls += 1;
    expect(route.request().headers()["if-match"]).toBe('"2"');
    expect(route.request().postDataJSON()).toEqual({
      unpaidOverrideReason: "Manager-approved recovery",
      confirmUnpaidOverride: true,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: orderId, version: 3 }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("button", { name: "Manage" }).click();
  const submit = page.getByRole("button", { name: "Complete order" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Override reason").fill("Manager-approved recovery");
  await expect(submit).toBeDisabled();
  await page
    .getByLabel("Confirm moving this order to completed history.")
    .check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => completionCalls).toBe(1);
});

test("keeps the staff insights workspaces usable across desktop, tablet, and mobile widths", async ({
  page,
}) => {
  const notificationId = "00000000-0000-4000-8000-000000000151";
  const auditId = "00000000-0000-4000-8000-000000000152";
  const instant = "2026-08-01T12:00:00.000Z";
  await mockReadyPortal(page, {
    includeReadmeNavigation: true,
    permissions: ["reports.view", "audit.view"],
    enabledFeatures: ["notifications", "reporting", "audit"],
    grants: [
      { permissionKey: "reports.view", restaurantId, branchId },
      { permissionKey: "audit.view", restaurantId, branchId },
    ],
  });
  await page.route("**/api/v1/staff/notifications?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: notificationId,
            eventId: "00000000-0000-4000-8000-000000000153",
            restaurantId,
            branchId,
            type: "new_order",
            groupKey: "order:ORD-000021",
            title: "New order at T-12",
            body: "ORD-000021 is ready for the kitchen queue.",
            taskState: "unhandled",
            readAt: null,
            acknowledgedAt: null,
            occurredAt: instant,
            expiresAt: "2026-08-31T12:00:00.000Z",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/staff/notification-events?*", (route) =>
    route.fulfill({
      status: 204,
      contentType: "text/event-stream",
      body: "",
    }),
  );
  await page.route("**/api/v1/staff/branches/*/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branch: {
          branchName: "Hydra",
          restaurantName: "Dar Nedjma",
          timeZone: "Africa/Algiers",
          currency: "DZD",
        },
        activeOrders: 3,
        orderStates: [],
        occupiedTables: 1,
        pendingRequests: { bills: 1, cancellations: 0 },
        kitchenWaiting: [],
        dailySales: [
          {
            currency: "DZD",
            grossAmount: "4200.00",
            paidAmount: "4200.00",
            refundedAmount: "500.00",
            cancelledAmount: "0.00",
          },
        ],
        enabledWidgets: ["orders", "tables", "kitchen", "payments"],
      }),
    }),
  );
  await page.route("**/api/v1/staff/reports/sales?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [
          {
            restaurantName: "Dar Nedjma",
            branchName: "Hydra",
            orderId,
            orderReference: "ORD-000021",
            businessDate: "2026-08-01",
            currency: "DZD",
            grossAmount: "4200.00",
            cancelledAmount: "0.00",
            paidAmount: "4200.00",
            refundedAmount: "500.00",
            paymentMethod: "card",
            orderState: "completed",
          },
        ],
        totals: [
          {
            currency: "DZD",
            grossAmount: "4200.00",
            cancelledAmount: "0.00",
            paidAmount: "4200.00",
            refundedAmount: "500.00",
          },
        ],
        page: 0,
        hasMore: false,
      }),
    }),
  );
  await page.route("**/api/v1/staff/audit-events?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: auditId,
            actorUserId: employeeId,
            action: "payments.payment_recorded",
            targetType: "order",
            targetId: orderId,
            branchId,
            outcome: "succeeded",
            reason: "Payment confirmed at the desk",
            before: { financial: "unpaid" },
            after: { financial: "paid" },
            occurredAt: instant,
          },
        ],
        page: 0,
        hasMore: false,
      }),
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Current branch activity" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-dashboard.png",
    { scrollTarget: "#dashboard-title" },
  );

  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Notifications that survive reconnects",
    }),
  ).toBeVisible();
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-notifications.png",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(
    page.getByRole("heading", { name: "Sales report" }),
  ).toBeVisible();
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-reports-mobile.png",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const reportTable = page.getByLabel(
    "Sales report table. Scroll horizontally to view all columns.",
  );
  await reportTable.focus();
  const initialScrollLeft = await reportTable.evaluate(
    (element) => element.scrollLeft,
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => reportTable.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(initialScrollLeft);
  await page.screenshot({
    path: "test-results/slice008-staff-mobile-report-focused.png",
    fullPage: true,
  });
  const reportAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(reportAccessibility.violations).toEqual([]);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);

  await page.getByRole("button", { name: "Audit" }).click();
  await expect(
    page.getByRole("heading", { name: "Audit history" }),
  ).toBeVisible();
  await page.getByLabel("Exact action").fill("payments.payment_recorded");
  await page.getByRole("button", { name: "Search history" }).click();
  await captureReadmeScreenshot(
    page,
    "test-results/readme-staff-audit-mobile.png",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const auditAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(auditAccessibility.violations).toEqual([]);
});
