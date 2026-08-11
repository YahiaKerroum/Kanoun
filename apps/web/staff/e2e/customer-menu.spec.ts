import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const branchId = "00000000-0000-4000-8000-000000000201";
const tableId = "00000000-0000-4000-8000-000000000202";
const categoryId = "00000000-0000-4000-8000-000000000203";
const dishId = "00000000-0000-4000-8000-000000000204";
const unavailableDishId = "00000000-0000-4000-8000-000000000208";
const optionGroupId = "00000000-0000-4000-8000-000000000205";
const optionId = "00000000-0000-4000-8000-000000000206";
const orderId = "00000000-0000-4000-8000-000000000209";
const tableSessionId = "00000000-0000-4000-8000-000000000210";
const orderItemId = "00000000-0000-4000-8000-000000000211";
const activeToken = "active-table-token-00000000000000000001";
const csrfToken = "customer-csrf-token-000000000000000001";

async function expectNoWcagViolations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("confirms the detected table and browses the current branch menu accessibly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/api/v1/public/qr/${activeToken}/session`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        branchId,
        tableId,
        tableCode: "T-12",
        expiresAt: "2026-07-29T02:00:00.000Z",
        csrfToken,
      }),
    }),
  );
  await page.route("**/api/v1/public/menu", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "4",
        currency: "DZD",
        categories: [
          {
            id: categoryId,
            name: "Signature dishes",
            dishes: [
              {
                id: dishId,
                name: "Couscous royale",
                description:
                  "Lamb, chicken, seasonal vegetables, and sweet onions.",
                imageUrl: "http://127.0.0.1:5174/images/couscous-royale.webp",
                unitPrice: { amount: "1850.00", currency: "DZD" },
                available: true,
                optionGroups: [
                  {
                    id: optionGroupId,
                    name: "Sides",
                    minimum: 0,
                    maximum: 1,
                    options: [
                      {
                        id: optionId,
                        name: "Roasted potatoes",
                        priceDelta: {
                          amount: "250.00",
                          currency: "DZD",
                        },
                      },
                    ],
                  },
                ],
              },
              {
                id: unavailableDishId,
                name: "Rechta au poulet",
                description:
                  "Hand-cut noodles with chicken, turnips, and chickpeas.",
                imageUrl: "http://127.0.0.1:5174/images/rechta.webp",
                unitPrice: { amount: "2400.00", currency: "DZD" },
                available: false,
                optionGroups: [],
              },
            ],
          },
        ],
      }),
    }),
  );

  await page.goto(`http://127.0.0.1:5174/qr/${activeToken}`);

  await expect(
    page.getByRole("heading", { name: "Are you at this table?" }),
  ).toBeFocused();
  await expect(page.getByLabel("Table T-12")).toBeVisible();
  await expectNoWcagViolations(page);

  const name = page.getByLabel("Your name (optional)");
  const continueButton = page.getByRole("button", {
    name: "Yes, show the menu",
  });
  const buttonBox = await continueButton.boundingBox();
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox?.width).toBeGreaterThanOrEqual(44);

  await name.fill("Amel");
  await name.focus();
  await page.keyboard.press("Tab");
  await expect(continueButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "What’s being served" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Couscous royale" }),
  ).toBeVisible();
  await expect(page.getByText("DZD 1,850")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Couscous royale" }),
  ).toHaveAttribute("src", "http://127.0.0.1:5174/images/couscous-royale.webp");
  await page.screenshot({
    path: "test-results/readme-customer-menu.png",
    fullPage: true,
  });

  const choices = page.getByText("View choices");
  await choices.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Roasted potatoes")).toBeVisible();
  await expect(page.getByText("+DZD 250")).toBeVisible();
  await expect(
    page.getByRole("article", {
      name: "Rechta au poulet, Unavailable today",
    }),
  ).toContainText("Unavailable today");
  await expectNoWcagViolations(page);
});

test("builds, reviews, submits, tracks, and requests cancellation for an order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/api/v1/public/qr/${activeToken}/session`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        branchId,
        tableId,
        tableCode: "T-12",
        expiresAt: "2026-07-29T02:00:00.000Z",
        csrfToken,
      }),
    }),
  );
  await page.route("**/api/v1/public/menu", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "4",
        currency: "DZD",
        categories: [
          {
            id: categoryId,
            name: "Signature dishes",
            dishes: [
              {
                id: dishId,
                name: "Saffron chicken",
                description: "Charred lemon and preserved pepper.",
                unitPrice: { amount: "1750.00", currency: "DZD" },
                available: true,
                optionGroups: [
                  {
                    id: optionGroupId,
                    name: "Sides",
                    minimum: 0,
                    maximum: 1,
                    options: [
                      {
                        id: optionId,
                        name: "Roasted potatoes",
                        priceDelta: {
                          amount: "250.00",
                          currency: "DZD",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    }),
  );

  const acceptedOrder = {
    id: orderId,
    reference: "ORD-000012",
    version: 2,
    branchId,
    tableSessionId,
    tableId,
    tableCode: "T-12",
    creatorType: "guest",
    createdByEmployeeId: null,
    customerName: "Amel",
    approval: "accepted",
    fulfilment: "not_started",
    financial: "unpaid",
    closure: "active",
    customerSafeStatusReason: null,
    total: { amount: "4000.00", currency: "DZD" },
    submittedAt: "2026-07-28T18:00:00.000Z",
    acceptedAt: "2026-07-28T18:00:00.000Z",
    cancellationRequested: false,
    items: [
      {
        id: orderItemId,
        dishId,
        menuVersion: "4",
        name: "Saffron chicken",
        quantity: 2,
        basePrice: { amount: "1750.00", currency: "DZD" },
        unitPrice: { amount: "2000.00", currency: "DZD" },
        selectedOptions: [
          {
            groupId: optionGroupId,
            groupName: "Sides",
            optionId,
            optionName: "Roasted potatoes",
            priceDelta: { amount: "250.00", currency: "DZD" },
          },
        ],
        note: "No chilli",
        taxInclusive: true,
        total: { amount: "4000.00", currency: "DZD" },
      },
    ],
  };

  await page.route("**/api/v1/public/orders", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
    expect(request.headers()["idempotency-key"]?.length).toBeGreaterThanOrEqual(
      16,
    );
    expect(request.postDataJSON()).toMatchObject({
      menuVersion: "4",
      customerName: "Amel",
      items: [
        {
          dishId,
          quantity: 2,
          optionIds: [optionId],
          note: "No chilli",
        },
      ],
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(acceptedOrder),
    });
  });
  await page.route(`**/api/v1/public/orders/${orderId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...acceptedOrder, fulfilment: "ready" }),
    }),
  );
  await page.route(
    `**/api/v1/public/orders/${orderId}/cancellation-requests`,
    async (route) => {
      expect(route.request().headers()["x-csrf-token"]).toBe(csrfToken);
      expect(
        route.request().headers()["idempotency-key"]?.length,
      ).toBeGreaterThanOrEqual(16);
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000212",
          orderId,
          status: "open",
          reason: "Ordered the wrong dish",
          createdAt: "2026-07-28T18:02:00.000Z",
        }),
      });
    },
  );
  await page.route(
    `**/api/v1/public/orders/${orderId}/bill-requests`,
    async (route) => {
      expect(route.request().headers()["x-csrf-token"]).toBe(csrfToken);
      expect(
        route.request().headers()["idempotency-key"]?.length,
      ).toBeGreaterThanOrEqual(16);
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000213",
          orderId,
          status: "open",
          requestedAt: "2026-07-28T18:03:00.000Z",
        }),
      });
    },
  );

  await page.goto(`http://127.0.0.1:5174/qr/${activeToken}`);
  await page.getByLabel("Your name (optional)").fill("Amel");
  await page.getByRole("button", { name: "Yes, show the menu" }).click();
  await page.getByText("View choices").click();
  await page.getByLabel("Roasted potatoes").check();
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Preparation note (optional)").fill("No chilli");
  await page.getByRole("button", { name: "Add to order" }).click();

  await page.setViewportSize({ width: 390, height: 720 });
  const reviewButton = page.getByRole("button", { name: "Review order" });
  await reviewButton.click();
  const dialog = page.getByRole("dialog", { name: "Your order" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue browsing" }),
  ).toBeFocused();
  await expect(dialog).toContainText("DZD 4,000");
  await expect(dialog).toHaveCSS("transform", "none");
  const reviewBounds = await dialog.boundingBox();
  const reviewViewport = page.viewportSize();
  expect(reviewBounds).not.toBeNull();
  expect(reviewViewport).not.toBeNull();
  if (reviewBounds !== null && reviewViewport !== null) {
    expect(reviewBounds.x).toBe(0);
    expect(reviewBounds.y).toBe(0);
    expect(reviewBounds.width).toBe(reviewViewport.width);
    expect(reviewBounds.height).toBe(reviewViewport.height);
  }
  const reviewScreenshot = await page.screenshot({
    path: "test-results/readme-customer-order-review-mobile.png",
  });
  if (reviewViewport !== null) {
    expect(reviewScreenshot.readUInt32BE(20)).toBeLessThanOrEqual(
      reviewViewport.height,
    );
  }
  await expectNoWcagViolations(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(reviewButton).toBeFocused();
  await reviewButton.click();
  await page.getByRole("button", { name: "Submit order" }).click();

  await expect(
    page.getByRole("heading", { name: "Order reference" }),
  ).toBeVisible();
  await expect(page.getByText("ORD-000012")).toBeVisible();
  await expect(page.getByText("Received")).toBeVisible();
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/readme-customer-order-status-mobile.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Request the bill" }).click();
  await expect(
    page.getByText("Bill requested. Staff have been notified."),
  ).toBeVisible();

  await page.getByLabel("Reason").fill("Ordered the wrong dish");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(
    page.getByText("Cancellation requested. Staff can now review it."),
  ).toBeVisible();
  await expectNoWcagViolations(page);
});

test("keeps the customer critical flow usable at a 200 percent zoom equivalent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.route(`**/api/v1/public/qr/${activeToken}/session`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        branchId,
        tableId,
        tableCode: "T-12",
        expiresAt: "2026-07-29T02:00:00.000Z",
        csrfToken,
      }),
    }),
  );
  await page.route("**/api/v1/public/menu", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "4",
        currency: "DZD",
        categories: [
          {
            id: categoryId,
            name: "Signature dishes",
            dishes: [
              {
                id: dishId,
                name: "Saffron chicken",
                description: null,
                unitPrice: { amount: "1750.00", currency: "DZD" },
                available: true,
                optionGroups: [],
              },
            ],
          },
        ],
      }),
    }),
  );

  await page.goto(`http://127.0.0.1:5174/qr/${activeToken}`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  await expect(page.getByLabel("Table T-12")).toBeVisible();
  await page.getByRole("button", { name: "Yes, show the menu" }).click();
  await expect(
    page.getByRole("heading", { name: "Saffron chicken" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("shows the same accessible recovery state for revoked and unknown QR tokens", async ({
  page,
}) => {
  const problem = {
    type: "/problems/resource-not-found",
    title: "Resource not found",
    status: 404,
    code: "resource_not_found",
    correlationId: "00000000-0000-4000-8000-000000000207",
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/public/qr/*/session", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/problem+json",
      body: JSON.stringify(problem),
    }),
  );

  const heading = page.getByRole("heading", {
    name: "This menu link is no longer available",
  });
  await page.goto(
    "http://127.0.0.1:5174/qr/revoked-token-000000000000000000000001",
  );
  await expect(heading).toBeFocused();
  await expectNoWcagViolations(page);

  await page.goto(
    "http://127.0.0.1:5174/qr/unknown-token-000000000000000000000001",
  );
  await expect(heading).toBeFocused();
  await expectNoWcagViolations(page);
});
