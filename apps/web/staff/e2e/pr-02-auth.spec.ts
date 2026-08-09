import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const employeeId = "00000000-0000-4100-8000-000000000201";
const restaurantId = "00000000-0000-4100-8000-000000000202";
const branchId = "00000000-0000-4100-8000-000000000203";

test.beforeEach(async ({ page }) => {
  await page.route("**/health/ready", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready",
        dependencies: { database: "available" },
      }),
    }),
  );
});

test("public staff and administration auth routes are keyboard and WCAG accessible", async ({
  page,
}) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of [
      "http://127.0.0.1:5173/auth/sign-in",
      "http://127.0.0.1:5175/auth/sign-in",
    ]) {
      await page.goto(url);
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", {
          name: url.includes("5173")
            ? "MISE staff access"
            : "MISE administration access",
        }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Business code")).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await page.screenshot({
        path: `test-results/pr-02-${width}-${url.includes("5173") ? "staff" : "admin"}-auth.png`,
        fullPage: true,
      });
    }
  }
});

test("signed-out staff access exposes a safe stable sign-in route", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/session", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 401, title: "Authentication required" }),
    }),
  );
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );

  await page.goto("/");
  const signInLink = page.getByRole("link", {
    name: "Sign in to staff access",
  });
  await expect(signInLink).toHaveAttribute(
    "href",
    "/auth/sign-in?returnTo=%2F",
  );

  await page.goto(
    "/auth/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fcapture",
  );
  await expect(
    page.getByRole("heading", { name: "Sign in securely" }),
  ).toBeVisible();
  await page.getByLabel("Business code").fill("demo-business");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Correct-Horse-42");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5173/");
  await expect(page).not.toHaveURL(/evil\.example/);
});

test("invitation token is removed from history and errors stay generic", async ({
  page,
}) => {
  await page.route("**/api/v1/invitations/accept", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 404, title: "Invitation not found" }),
    }),
  );
  const syntheticToken = "i".repeat(64);
  await page.goto(`/invite/accept?token=${syntheticToken}`);
  await expect(page).toHaveURL("http://127.0.0.1:5173/invite/accept");
  await page.getByLabel("Invitation token").fill(syntheticToken);
  await page.getByLabel("Password", { exact: true }).fill("Correct-Horse-42");
  await page.getByLabel("Confirm password").fill("Correct-Horse-42");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("invalid, expired, or already used");
  await expect(alert).not.toContainText(syntheticToken);
});

test("logout sends the CSRF header and only redirects after server confirmation", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "rms_csrf",
      value: "csrf-for-test",
      url: "http://127.0.0.1:5173/",
    },
  ]);
  await page.route("**/api/v1/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        employeeId,
        activeBranchId: branchId,
        authorizedBranchIds: [branchId],
        grants: [
          { permissionKey: "orders.view", restaurantId, branchId },
          { permissionKey: "employees.view", restaurantId },
        ],
        expiresAt: "2026-08-31T12:00:00.000Z",
        profile: {
          employee: {
            id: employeeId,
            displayName: "Imane Khellaf",
            email: "imane@example.test",
          },
          restaurant: { id: restaurantId, name: "Dar Nedjma" },
          activeBranch: { id: branchId, name: "Hydra" },
        },
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
          permissions: ["orders.view"],
          enabledFeatures: ["ordering"],
          configurationVersion: 1,
        }),
      }),
  );
  let csrfHeader = "";
  await page.route("**/api/v1/auth/logout", async (route) => {
    csrfHeader = route.request().headers()["x-csrf-token"] ?? "";
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page.getByText("Imane Khellaf").first()).toBeVisible();
  await page.locator(".account-context summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in\?notice=signed-out/);
  expect(csrfHeader).toBe("csrf-for-test");
});

test("administration has a stable sign-in URL and rejects external return targets", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:5175/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
  await page.route("http://127.0.0.1:5175/api/v1/auth/session", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 401 }),
    }),
  );
  await page.goto(
    "http://127.0.0.1:5175/auth/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fadmin",
  );
  await expect(
    page.getByRole("heading", { name: "Sign in securely" }),
  ).toBeVisible();
  await page.getByLabel("Business code").fill("demo-business");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Correct-Horse-42");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5175/context");
});
