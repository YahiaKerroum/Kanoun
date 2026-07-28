import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const branchId = "00000000-0000-4000-8000-000000000201";
const tableId = "00000000-0000-4000-8000-000000000202";
const categoryId = "00000000-0000-4000-8000-000000000203";
const dishId = "00000000-0000-4000-8000-000000000204";
const unavailableDishId = "00000000-0000-4000-8000-000000000208";
const optionGroupId = "00000000-0000-4000-8000-000000000205";
const optionId = "00000000-0000-4000-8000-000000000206";
const activeToken = "active-table-token-00000000000000000001";

async function expectNoWcagViolations(page: Page): Promise<void> {
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
              {
                id: unavailableDishId,
                name: "Seasonal mechoui",
                description: "Returns with the next market delivery.",
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
    page.getByRole("heading", { name: "Saffron chicken" }),
  ).toBeVisible();
  await expect(page.getByText("DZD 1,750")).toBeVisible();

  const choices = page.getByText("View choices");
  await choices.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Roasted potatoes")).toBeVisible();
  await expect(page.getByText("+DZD 250")).toBeVisible();
  await expect(
    page.getByRole("article", {
      name: "Seasonal mechoui, Unavailable today",
    }),
  ).toContainText("Unavailable today");
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
