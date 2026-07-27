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
      name: "Restaurant setup starts with a protected owner.",
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
