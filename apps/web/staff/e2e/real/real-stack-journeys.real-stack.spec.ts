import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  readLatestRealE2eOrder,
  readRealE2eInvariants,
} from "@rms/test-support";

interface Credentials {
  readonly businessCode: string;
  readonly email: string;
  readonly password: string;
}

interface RoleCredentials extends Credentials {
  readonly employeeId: string;
}

type JsonRecord = Record<string, unknown>;

interface EmployeeResponse {
  readonly id: string;
}

interface PermissionsResponse {
  readonly version: number;
}

interface InvitationResponse {
  readonly invitationToken: string;
}

interface CategoryResponse {
  readonly id: string;
}

interface DishResponse {
  readonly id: string;
  readonly name: string;
}

interface TableResponse {
  readonly id: string;
}

interface QrResponse {
  readonly qrCode: { readonly id: string };
  readonly qrUrl: string;
}

interface MenuResponse {
  readonly menuVersion: string | number;
}

interface OrderResponse {
  readonly id: string;
  readonly reference: string;
}

interface StaffOrder {
  readonly id: string;
  readonly version: number;
}

interface StaffOrderPage {
  readonly items: readonly StaffOrder[];
}

interface FeatureConfigurationResponse {
  readonly configuration: { readonly version: number };
}

interface FeatureConfiguration {
  readonly version: number;
}

interface ProblemResponse {
  readonly code: string;
}

interface Tenant {
  readonly businessCode: string;
  readonly owner: Credentials;
  readonly restaurantId: string;
  readonly branchId: string;
}

interface OrderRun {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly session: { readonly csrfToken: string };
  readonly order: OrderResponse;
  readonly requestBody: JsonRecord;
  readonly idempotencyKey: string;
}

const apiOrigin = process.env.REAL_E2E_API_ORIGIN ?? "";
const adminOrigin = process.env.REAL_E2E_ADMIN_ORIGIN ?? "";
const staffOrigin = process.env.REAL_E2E_STAFF_ORIGIN ?? "";
const customerOrigin = process.env.REAL_E2E_CUSTOMER_ORIGIN ?? "";
const recoveryOrigin = process.env.REAL_E2E_RECOVERY_ORIGIN ?? "";
const databaseUrl = process.env.REAL_E2E_DATABASE_URL ?? "";
const primary: Tenant = {
  businessCode: process.env.REAL_E2E_PRIMARY_BUSINESS_CODE ?? "",
  owner: {
    businessCode: process.env.REAL_E2E_PRIMARY_BUSINESS_CODE ?? "",
    email: process.env.REAL_E2E_PRIMARY_OWNER_EMAIL ?? "",
    password: process.env.REAL_E2E_PRIMARY_OWNER_PASSWORD ?? "",
  },
  restaurantId: process.env.REAL_E2E_PRIMARY_RESTAURANT_ID ?? "",
  branchId: process.env.REAL_E2E_PRIMARY_BRANCH_ID ?? "",
};
const secondary: Tenant = {
  businessCode: process.env.REAL_E2E_SECONDARY_BUSINESS_CODE ?? "",
  owner: {
    businessCode: process.env.REAL_E2E_SECONDARY_BUSINESS_CODE ?? "",
    email: process.env.REAL_E2E_SECONDARY_OWNER_EMAIL ?? "",
    password: process.env.REAL_E2E_SECONDARY_OWNER_PASSWORD ?? "",
  },
  restaurantId: "",
  branchId: process.env.REAL_E2E_SECONDARY_BRANCH_ID ?? "",
};

let ownerContext!: BrowserContext;
let ownerPage: Page;
let generalContext!: BrowserContext;
let generalPage: Page;
let kitchenContext!: BrowserContext;
let kitchenPage: Page;
let cashierContext!: BrowserContext;
let cashierPage: Page;
let administratorContext!: BrowserContext;
let administratorPage: Page;
let categoryId = "";
let dishId = "";
let dishName = "";
let tableId = "";
let qrUrl = "";
let menuVersion = "";
let generalRole: RoleCredentials;
let kitchenRole: RoleCredentials;
let cashierRole: RoleCredentials;
let administratorRole: RoleCredentials;
let firstOrder!: OrderRun;

function assertHarness(): void {
  for (const value of [
    apiOrigin,
    adminOrigin,
    staffOrigin,
    customerOrigin,
    recoveryOrigin,
    databaseUrl,
    primary.branchId,
  ]) {
    if (!value)
      throw new Error("The real E2E harness environment is incomplete.");
  }
}

async function login(
  context: BrowserContext,
  origin: string,
  credentials: Credentials,
  returnTo: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `${origin}/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await expect(page.getByLabel("Business code")).toBeVisible();
  await page.getByLabel("Business code").fill(credentials.businessCode);
  await page.getByLabel("Work email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${origin}${returnTo}`);
  return page;
}

async function apiJson<T = JsonRecord>(
  context: BrowserContext,
  method: string,
  path: string,
  body?: unknown,
  expectedStatus?: number,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const csrf = (await context.cookies(apiOrigin)).find(
    (cookie) => cookie.name === "rms_csrf",
  )?.value;
  const pageOrigin = context
    .pages()
    .map((page) => {
      try {
        return new URL(page.url()).origin;
      } catch {
        return "";
      }
    })
    .find((origin) => origin !== "null" && origin !== "");
  const response = await context.request.fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
      ...(pageOrigin ? { origin: pageOrigin } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { data: body }),
  });
  if (expectedStatus !== undefined && response.status() === expectedStatus) {
    return (await readResponseJson(response)) as T;
  }
  if (!response.ok()) {
    const problem: unknown = await readResponseJson(response);
    const detail =
      typeof problem === "object" &&
      problem !== null &&
      "detail" in problem &&
      typeof problem.detail === "string"
        ? ` ${problem.detail}`
        : "";
    throw new Error(
      `${method} ${path} returned ${response.status()}.${detail}`,
    );
  }
  return (await readResponseJson(response)) as T;
}

async function readResponseJson(response: APIResponse): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new Error(
      `Expected JSON from ${response.url()}, received an invalid response body.`,
      { cause: error },
    );
  }
}

async function provisionRole(
  role: "administrator" | "general_staff" | "kitchen_staff" | "cashier",
  label: string,
): Promise<RoleCredentials> {
  const suffix = `${process.env.REAL_E2E_RUN_ID}-${role}`;
  const email = `${role}-${suffix}@real-e2e.test`;
  const password = `PR05-${randomUUID()}Aa1`;
  const employee = await apiJson<EmployeeResponse>(
    ownerContext,
    "POST",
    "/api/v1/staff/employees",
    {
      restaurantId: primary.restaurantId,
      displayName: label,
      email,
      branchIds: [primary.branchId],
    },
  );
  const permissions = await apiJson<PermissionsResponse>(
    ownerContext,
    "GET",
    `/api/v1/staff/employees/${employee.id}/permissions`,
  );
  await apiJson(
    ownerContext,
    "POST",
    `/api/v1/staff/employees/${employee.id}/permission-template`,
    {
      templateKey: role,
      expectedVersion: permissions.version,
      reason: "Provision the PR-05 real-stack role.",
    },
  );
  const invitation = await apiJson<InvitationResponse>(
    ownerContext,
    "POST",
    `/api/v1/staff/employees/${employee.id}/invitations`,
  );
  await apiJson(ownerContext, "POST", "/api/v1/invitations/accept", {
    token: invitation.invitationToken,
    password,
  });
  return {
    businessCode: primary.businessCode,
    email,
    password,
    employeeId: employee.id,
  };
}

async function createConfiguration(): Promise<void> {
  const category = await apiJson<CategoryResponse>(
    ownerContext,
    "POST",
    `/api/v1/staff/restaurants/${primary.restaurantId}/menu/categories`,
    {
      name: `PR-05 category ${process.env.REAL_E2E_RUN_ID}`,
      displayOrder: 0,
    },
  );
  categoryId = category.id;
  const dish = await apiJson<DishResponse>(
    ownerContext,
    "POST",
    `/api/v1/staff/restaurants/${primary.restaurantId}/menu/dishes`,
    {
      categoryId,
      name: `PR-05 dish ${process.env.REAL_E2E_RUN_ID}`,
      description: "A real-stack verification dish.",
      basePrice: { amount: "1200.00", currency: "DZD" },
      displayOrder: 0,
    },
  );
  dishId = dish.id;
  dishName = dish.name;
  const table = await apiJson<TableResponse>(
    ownerContext,
    "POST",
    `/api/v1/staff/branches/${primary.branchId}/tables`,
    {
      code: `E2E-${String(process.env.REAL_E2E_RUN_ID).slice(-6)}`,
      area: "PR-05 verification",
    },
  );
  tableId = table.id;
  const issued = await apiJson<QrResponse>(
    ownerContext,
    "POST",
    `/api/v1/staff/tables/${tableId}/qr-codes`,
  );
  qrUrl = issued.qrUrl;
  const menu = await apiJson<MenuResponse>(
    ownerContext,
    "GET",
    `/api/v1/staff/restaurants/${primary.restaurantId}/menu/dishes`,
  );
  menuVersion = String(menu.menuVersion);
}

async function submitCustomerOrder(
  browser: Browser,
  name: string,
): Promise<OrderRun> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/public/qr/") &&
      response.url().endsWith("/session") &&
      response.request().method() === "POST",
  );
  await page.goto(qrUrl);
  const session = (await (await sessionResponse).json()) as {
    csrfToken: string;
  };
  await expect(
    page.getByRole("heading", { name: "Are you at this table?" }),
  ).toBeVisible();
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Yes, show the menu" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s being served" }),
  ).toBeVisible();
  await page
    .locator("article.dish-row")
    .filter({ hasText: dishName })
    .getByRole("button", { name: "Add to order" })
    .click();
  await page.getByRole("button", { name: "Review order" }).click();
  const orderResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/public/orders") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Submit order" }).click();
  const response = await orderResponse;
  const request = response.request();
  const order = (await response.json()) as OrderResponse;
  const requestBody = request.postDataJSON() as JsonRecord;
  const idempotencyKey = await request.headerValue("idempotency-key");
  if (!idempotencyKey)
    throw new Error("The customer order did not carry an idempotency key.");
  await expect(
    page.getByText("Order reference", { exact: true }),
  ).toBeVisible();
  return { context, page, session, order, requestBody, idempotencyKey };
}

async function currentStaffOrder(
  context: BrowserContext,
  orderId: string,
): Promise<StaffOrder> {
  const page = await apiJson<StaffOrderPage>(
    context,
    "GET",
    `/api/v1/staff/orders?branchId=${primary.branchId}&closure=active&pageSize=100`,
  );
  const order = page.items.find((item) => item.id === orderId);
  if (!order) throw new Error("The real-stack staff order was not found.");
  return order;
}

test.describe.serial("PR-05 real-stack evidence", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async ({ browser }) => {
    assertHarness();
    ownerContext = await browser.newContext();
    ownerPage = await login(
      ownerContext,
      adminOrigin,
      primary.owner,
      "/context",
    );
    ownerPage.on("dialog", (dialog) => void dialog.accept());
    await ownerPage.getByRole("link", { name: "Setup", exact: true }).click();
    await expect(ownerPage).toHaveURL(`${adminOrigin}/setup`);
    await expect(
      ownerPage.getByRole("heading", { name: "Service readiness review" }),
    ).toBeVisible();
    await ownerPage.getByLabel("Review branch").selectOption(primary.branchId);
    await ownerPage.getByLabel("Service status").selectOption("open");
    await ownerPage
      .getByLabel("Explanation for a closed or temporarily unavailable status")
      .fill("Open the isolated PR-05 verification branch.");
    await ownerPage
      .getByRole("button", { name: "Save branch and hours" })
      .click();
    await expect(
      ownerPage.getByText("Core setup complete", { exact: true }).first(),
    ).toBeVisible();
    await createConfiguration();
    generalRole = await provisionRole("general_staff", "PR-05 general staff");
    kitchenRole = await provisionRole("kitchen_staff", "PR-05 kitchen staff");
    cashierRole = await provisionRole("cashier", "PR-05 cashier");
    administratorRole = await provisionRole(
      "administrator",
      "PR-05 administrator",
    );
    generalContext = await browser.newContext();
    generalPage = await login(
      generalContext,
      staffOrigin,
      generalRole,
      "/orders",
    );
    kitchenContext = await browser.newContext();
    kitchenPage = await login(
      kitchenContext,
      staffOrigin,
      kitchenRole,
      "/kitchen",
    );
    cashierContext = await browser.newContext();
    cashierPage = await login(
      cashierContext,
      staffOrigin,
      cashierRole,
      "/payments",
    );
    administratorContext = await browser.newContext();
    administratorPage = await login(
      administratorContext,
      staffOrigin,
      administratorRole,
      "/orders",
    );
  });

  test.afterAll(async () => {
    await Promise.all([
      ownerContext.close(),
      generalContext.close(),
      kitchenContext.close(),
      cashierContext.close(),
      administratorContext.close(),
      firstOrder.context.close(),
    ]);
  });

  test("TEST-E2E-PR05-J1-OWNER-SETUP-001: owner completes setup in the built administration preview", async () => {
    await expect(
      ownerPage.getByText("Service is open", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("heading", { name: "Branches" }),
    ).toBeVisible();
  });

  test("TEST-E2E-PR05-J2-MENU-TABLE-QR-001: owner configuration is visible through the customer QR journey", async ({
    browser,
  }) => {
    const customer = await submitCustomerOrder(browser, "PR-05 customer");
    firstOrder = customer;
    await expect(
      customer.page.getByText(dishName, { exact: true }).first(),
    ).toBeVisible();
    const malformedContext = await browser.newContext();
    const malformedPage = await malformedContext.newPage();
    await malformedPage.goto(`${customerOrigin}/qr/short`);
    await expect(
      malformedPage.getByRole("heading", {
        name: "This menu link is incomplete",
      }),
    ).toBeVisible();
    const revoked = await apiJson<QrResponse>(
      ownerContext,
      "POST",
      `/api/v1/staff/tables/${tableId}/qr-codes`,
    );
    await apiJson(
      ownerContext,
      "POST",
      `/api/v1/staff/qr-codes/${revoked.qrCode.id}/revocations`,
      { reason: "PR-05 revoked link verification" },
    );
    await malformedPage.goto(revoked.qrUrl);
    await expect(
      malformedPage.getByRole("heading", {
        name: "This menu link is no longer available",
      }),
    ).toBeVisible();
    const fresh = await apiJson<QrResponse>(
      ownerContext,
      "POST",
      `/api/v1/staff/tables/${tableId}/qr-codes`,
    );
    qrUrl = fresh.qrUrl;
    await malformedContext.close();
  });

  test("TEST-E2E-PR05-J3-ORDER-IDEMPOTENCY-001: retrying the same customer command returns one persisted order", async () => {
    const duplicate = await apiJson<OrderResponse>(
      firstOrder.context,
      "POST",
      "/api/v1/public/orders",
      firstOrder.requestBody,
      201,
      {
        "idempotency-key": firstOrder.idempotencyKey,
        "x-csrf-token": firstOrder.session.csrfToken,
      },
    );
    expect(duplicate.id).toBe(firstOrder.order.id);
    expect(duplicate.reference).toBe(firstOrder.order.reference);
    const invariants = await readRealE2eInvariants(
      databaseUrl,
      primary.businessCode,
    );
    expect(invariants.orderCount).toBe(1);
    expect(invariants.idempotencyRecordCount).toBeGreaterThan(0);
  });

  test("TEST-E2E-PR05-J4-SERVICE-CLOSE-001: kitchen, service, cashier, and refund operations close the real order", async () => {
    await kitchenPage.goto(
      `${staffOrigin}/kitchen?order=${firstOrder.order.id}`,
    );
    await expect(
      kitchenPage.getByRole("heading", { name: /Kitchen/i }).first(),
    ).toBeVisible();
    const kitchenOrder = kitchenPage
      .locator("article.kitchen-order")
      .filter({ hasText: firstOrder.order.reference });
    await expect(kitchenOrder).toBeVisible();
    await kitchenOrder
      .getByRole("button", { name: "Start preparation" })
      .click();
    await kitchenOrder.getByRole("button", { name: "Mark ready" }).click();
    await administratorPage.goto(
      `${staffOrigin}/kitchen?order=${firstOrder.order.id}`,
    );
    const readyOrder = administratorPage
      .locator(".ready-order-grid article")
      .filter({ hasText: firstOrder.order.reference });
    await expect(readyOrder).toBeVisible();
    await readyOrder
      .getByRole("button", { name: "Collect · mark served" })
      .click();
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${firstOrder.order.id}`,
    );
    const servedOrder = administratorPage.locator(
      "li.order-list-item--selected",
    );
    await expect(servedOrder).toContainText(firstOrder.order.reference);
    await expect(servedOrder).toContainText(/served/i);
    await firstOrder.page
      .getByRole("button", { name: "Request the bill" })
      .click();
    await expect(
      firstOrder.page.getByText("Bill requested. Staff have been notified.", {
        exact: true,
      }),
    ).toBeVisible();
    await cashierPage.goto(
      `${staffOrigin}/payments?order=${firstOrder.order.id}`,
    );
    await expect(
      cashierPage.getByRole("heading", { name: "Bill requests" }),
    ).toBeVisible();
    await expect(
      cashierPage.getByRole("heading", { name: "Selected order ledger" }),
    ).toBeVisible();
    const paymentLedger = cashierPage.locator(".payment-ledger-result");
    await paymentLedger.getByLabel(/Confirm receipt of exactly/i).check();
    await paymentLedger.getByRole("button", { name: "Record payment" }).click();
    await expect(paymentLedger).toContainText("Paid");
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${firstOrder.order.id}`,
    );
    const selectedOrder = administratorPage.locator(
      "li.order-list-item--selected",
    );
    await expect(selectedOrder).toContainText(firstOrder.order.reference);
    const selectedManage = selectedOrder.getByRole("button", {
      name: "Manage",
    });
    if ((await selectedManage.count()) > 0) await selectedManage.click();
    await selectedOrder
      .getByLabel("Confirm moving this order to completed history.")
      .check();
    await selectedOrder.getByRole("button", { name: "Complete order" }).click();
    await expect(selectedOrder).toContainText(/Completed/i);
    await administratorPage.goto(
      `${staffOrigin}/payments?order=${firstOrder.order.id}`,
    );
    await expect(
      administratorPage.getByRole("heading", { name: "Selected order ledger" }),
    ).toBeVisible();
    await administratorPage.getByLabel("Amount (DZD)").fill("1200.00");
    await administratorPage
      .getByLabel("Reason")
      .fill("PR-05 refund verification");
    await administratorPage
      .getByLabel("Confirm this append-only refund.")
      .check();
    await administratorPage
      .getByRole("button", { name: "Record refund" })
      .click();
    await expect(
      administratorPage.getByText("Refunded", { exact: true }).last(),
    ).toBeVisible();
    const invariant = await readLatestRealE2eOrder(
      databaseUrl,
      primary.businessCode,
    );
    expect(invariant?.paymentCount).toBe(1);
    expect(invariant?.refundCount).toBe(1);
    expect(invariant?.closureState).toBe("completed");
  });

  test("TEST-E2E-PR05-J5-CORRECTION-CANCEL-REFUND-001: correction and cancellation remain append-only and tenant scoped", async ({
    browser,
  }) => {
    const correctionOrder = await submitCustomerOrder(
      browser,
      "PR-05 correction",
    );
    const staleSource = await currentStaffOrder(
      administratorContext,
      correctionOrder.order.id,
    );
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${correctionOrder.order.id}`,
    );
    const correctionCard = administratorPage.locator(
      "li.order-list-item--selected",
    );
    await expect(correctionCard).toContainText(correctionOrder.order.reference);
    const correctionManage = correctionCard.getByRole("button", {
      name: "Manage",
    });
    if ((await correctionManage.count()) > 0) await correctionManage.click();
    await correctionCard.locator("input[type=number]").fill("2");
    await correctionCard
      .getByLabel("Correction reason")
      .fill("PR-05 correction verification");
    await correctionCard
      .getByRole("button", { name: "Save correction" })
      .click();
    await expect(correctionCard).toContainText(/Corrected · revision/);
    await expect(
      apiJson<ProblemResponse>(
        administratorContext,
        "POST",
        `/api/v1/staff/orders/${correctionOrder.order.id}/corrections`,
        {
          menuVersion,
          items: [{ dishId, quantity: 2, optionIds: [], note: null }],
          reason: "PR-05 stale correction verification",
        },
        409,
        {
          "if-match": `"${staleSource.version}"`,
          "idempotency-key": randomUUID(),
        },
      ),
    ).resolves.toMatchObject({ code: "concurrency_conflict" });
    const cancellationOrder = await submitCustomerOrder(
      browser,
      "PR-05 cancellation",
    );
    await cancellationOrder.page
      .locator("#cancellation-reason")
      .fill("PR-05 guest cancellation verification");
    await cancellationOrder.page
      .getByRole("button", { name: "Send request" })
      .click();
    await expect(
      cancellationOrder.page.getByText(
        "Cancellation requested. Staff can now review it.",
        { exact: true },
      ),
    ).toBeVisible();
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${cancellationOrder.order.id}`,
    );
    const cancellationCard = administratorPage.locator(
      "li.order-list-item--selected",
    );
    await expect(cancellationCard).toContainText(
      cancellationOrder.order.reference,
    );
    const cancellationManage = cancellationCard.getByRole("button", {
      name: "Manage",
    });
    if ((await cancellationManage.count()) > 0)
      await cancellationManage.click();
    await cancellationCard
      .getByLabel("Reason", { exact: true })
      .fill("PR-05 staff cancellation verification");
    await cancellationCard
      .getByLabel("Confirm cancellation and any required append-only refund.")
      .check();
    await cancellationCard
      .getByRole("button", { name: "Cancel order" })
      .click();
    await expect(cancellationCard).toContainText("Cancelled");
    const invariants = await readRealE2eInvariants(
      databaseUrl,
      primary.businessCode,
    );
    expect(invariants.correctionCount).toBeGreaterThan(0);
    expect(invariants.auditEventCount).toBeGreaterThan(0);
    await correctionOrder.context.close();
    await cancellationOrder.context.close();
  });

  test("TEST-E2E-PR05-J6-FEATURE-DISABLEMENT-001: disabling ordering blocks new work while preserving reads", async ({
    browser,
  }) => {
    const activeOrder = await submitCustomerOrder(
      browser,
      "PR-05 active during disablement",
    );
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${activeOrder.order.id}`,
    );
    await expect(
      administratorPage.locator("li.order-list-item--selected"),
    ).toContainText(activeOrder.order.reference);
    const configuration = await apiJson<FeatureConfigurationResponse>(
      ownerContext,
      "GET",
      `/api/v1/staff/branches/${primary.branchId}/features`,
    );
    const disabled = await apiJson<FeatureConfiguration>(
      ownerContext,
      "PATCH",
      `/api/v1/staff/branches/${primary.branchId}/features`,
      {
        changes: {
          "CFG-007": "disabled",
          "CFG-011": "disabled",
          "CFG-005": "disabled",
        },
        confirmAffectedWorkflows: true,
        reason: "PR-05 disablement verification",
      },
      200,
      {
        "if-match": `"${configuration.configuration.version}"`,
      },
    );
    const activeWhileDisabled = await currentStaffOrder(
      administratorContext,
      activeOrder.order.id,
    );
    expect(activeWhileDisabled.id).toBe(activeOrder.order.id);
    const blocked = await submitCustomerOrderExpectingBlocked(browser);
    expect(blocked).toBe(409);
    const enabled = await apiJson<FeatureConfiguration>(
      ownerContext,
      "PATCH",
      `/api/v1/staff/branches/${primary.branchId}/features`,
      {
        changes: {
          "CFG-005": "enabled",
          "CFG-007": "enabled",
          "CFG-011": "enabled",
        },
        confirmAffectedWorkflows: true,
        reason: "Restore ordering after PR-05 verification",
      },
      200,
      {
        "if-match": `"${disabled.version}"`,
      },
    );
    expect(enabled.version).toBeGreaterThan(
      configuration.configuration.version,
    );

    await kitchenPage.goto(
      `${staffOrigin}/kitchen?order=${activeOrder.order.id}`,
    );
    const activeKitchenOrder = kitchenPage
      .locator("article.kitchen-order")
      .filter({ hasText: activeOrder.order.reference });
    await expect(activeKitchenOrder).toBeVisible();
    await activeKitchenOrder
      .getByRole("button", { name: "Start preparation" })
      .click();
    await activeKitchenOrder
      .getByRole("button", { name: "Mark ready" })
      .click();
    await administratorPage.goto(
      `${staffOrigin}/kitchen?order=${activeOrder.order.id}`,
    );
    const activeReadyOrder = administratorPage
      .locator(".ready-order-grid article")
      .filter({ hasText: activeOrder.order.reference });
    await expect(activeReadyOrder).toBeVisible();
    await activeReadyOrder
      .getByRole("button", { name: "Collect · mark served" })
      .click();
    await activeOrder.page
      .getByRole("button", { name: "Request the bill" })
      .click();
    await cashierPage.goto(
      `${staffOrigin}/payments?order=${activeOrder.order.id}`,
    );
    const activePaymentLedger = cashierPage.locator(".payment-ledger-result");
    await activePaymentLedger.getByLabel(/Confirm receipt of exactly/i).check();
    await activePaymentLedger
      .getByRole("button", { name: "Record payment" })
      .click();
    await expect(activePaymentLedger).toContainText("Paid");
    await administratorPage.goto(
      `${staffOrigin}/orders?order=${activeOrder.order.id}`,
    );
    const activeCard = administratorPage.locator(
      "li.order-list-item--selected",
    );
    const activeManage = activeCard.getByRole("button", { name: "Manage" });
    if ((await activeManage.count()) > 0) await activeManage.click();
    await activeCard
      .getByLabel("Confirm moving this order to completed history.")
      .check();
    await activeCard.getByRole("button", { name: "Complete order" }).click();
    await expect(activeCard).toContainText("Completed");
    await activeOrder.context.close();
  });

  test("TEST-E2E-PR05-J7-ISOLATION-001: a second tenant cannot read the primary branch or records", async ({
    browser,
  }) => {
    const isolatedContext = await browser.newContext();
    const isolatedPage = await login(
      isolatedContext,
      adminOrigin,
      secondary.owner,
      "/context",
    );
    await isolatedPage.getByRole("link", { name: "Setup" }).click();
    await expect(
      isolatedPage.getByRole("heading", { name: "Service readiness review" }),
    ).toBeVisible();
    await expect(
      apiJson(
        isolatedContext,
        "GET",
        `/api/v1/staff/branches/${primary.branchId}`,
        undefined,
        404,
      ),
    ).resolves.toMatchObject({
      code: "resource_not_found",
    } satisfies ProblemResponse);
    const primaryInvariants = await readRealE2eInvariants(
      databaseUrl,
      primary.businessCode,
    );
    const secondaryInvariants = await readRealE2eInvariants(
      databaseUrl,
      secondary.businessCode,
    );
    expect(primaryInvariants.businessAccountId).not.toBe(
      secondaryInvariants.businessAccountId,
    );
    expect(secondaryInvariants.orderCount).toBe(0);
    await isolatedContext.close();
  });

  test("TEST-E2E-PR05-R-WORKER-001: stopped worker leaves lag and restart drains the real backlog", async ({
    browser,
  }) => {
    const before = await readRealE2eInvariants(
      databaseUrl,
      primary.businessCode,
    );
    const stopped = await fetch(
      `${process.env.REAL_E2E_CONTROL_ORIGIN}/worker/stop`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.REAL_E2E_CONTROL_SECRET}`,
        },
      },
    );
    expect(stopped.status).toBe(204);
    const backlogOrder = await submitCustomerOrder(
      browser,
      "PR-05 worker backlog",
    );
    const lagging = await readRealE2eInvariants(
      databaseUrl,
      primary.businessCode,
    );
    expect(lagging.orderCount).toBeGreaterThan(before.orderCount);
    expect(lagging.outboxCount).toBeGreaterThan(lagging.processedOutboxCount);
    const restarted = await fetch(
      `${process.env.REAL_E2E_CONTROL_ORIGIN}/worker/restart`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.REAL_E2E_CONTROL_SECRET}`,
        },
      },
    );
    expect(restarted.status).toBe(204);
    await expect
      .poll(
        async () =>
          (await readRealE2eInvariants(databaseUrl, primary.businessCode))
            .processedOutboxCount,
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(lagging.outboxCount);
    await kitchenPage.goto(
      `${staffOrigin}/kitchen?order=${backlogOrder.order.id}`,
    );
    await expect(
      kitchenPage
        .locator("article.kitchen-order")
        .filter({ hasText: backlogOrder.order.reference }),
    ).toBeVisible();
    await backlogOrder.context.close();
    await expect(
      generalPage.getByRole("heading", { name: /Orders/i }).first(),
    ).toBeVisible();
  });

  test("TEST-E2E-PR05-R-SSE-001: notification workspace survives offline-to-online recovery", async () => {
    const initialStream = generalPage.waitForRequest(
      (request) =>
        new URL(request.url()).pathname ===
          "/api/v1/staff/notification-events" && request.method() === "GET",
    );
    await generalPage.goto(`${staffOrigin}/notifications`);
    await initialStream;
    await expect(
      generalPage.getByRole("heading", { name: /notification|inbox/i }).first(),
    ).toBeVisible();
    await expect(
      generalPage
        .getByRole("status")
        .filter({ hasText: "Live hints connected" }),
    ).toBeVisible();
    await generalContext.setOffline(true);
    await generalPage.evaluate(() =>
      window.dispatchEvent(new Event("offline")),
    );
    await expect(
      generalPage.getByRole("status").filter({ hasText: "Reconnecting" }),
    ).toBeVisible({ timeout: 15_000 });
    const reconnectStream = generalPage.waitForRequest(
      (request) =>
        new URL(request.url()).pathname ===
          "/api/v1/staff/notification-events" && request.method() === "GET",
    );
    await generalContext.setOffline(false);
    await generalPage.evaluate(() => window.dispatchEvent(new Event("online")));
    await reconnectStream;
    await expect(
      generalPage.getByRole("heading", { name: /notification|inbox/i }).first(),
    ).toBeVisible();
    await expect(
      generalPage
        .getByRole("status")
        .filter({ hasText: "Live hints connected" }),
    ).toBeVisible();
  });

  test("TEST-E2E-PR05-R-SESSION-001: logout revokes the staff session", async () => {
    await apiJson(generalContext, "POST", "/api/v1/auth/logout", {});
    await expect(
      apiJson(generalContext, "GET", "/api/v1/auth/session", undefined, 401),
    ).resolves.toMatchObject({
      code: "authentication_required",
    } satisfies ProblemResponse);
    await generalPage.goto(
      `${staffOrigin}/auth/sign-in?notice=session-ended&returnTo=%2Forders`,
    );
    await expect(
      generalPage.getByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeVisible();
  });

  test("TEST-E2E-PR05-R-RECOVERY-001: delivered recovery token completes password update", async ({
    browser,
  }) => {
    const recoveryContext = await browser.newContext();
    const recoveryPage = await recoveryContext.newPage();
    try {
      await recoveryPage.goto(`${staffOrigin}/auth/recover`);
      await expect(
        recoveryPage.getByRole("heading", { name: "Recover staff access" }),
      ).toBeVisible();
      await recoveryPage.getByLabel("Business code").fill(primary.businessCode);
      await recoveryPage.getByLabel("Work email").fill(generalRole.email);
      await recoveryPage
        .getByRole("button", { name: "Request recovery" })
        .click();
      await expect(
        recoveryPage.getByText(
          "This response does not confirm whether an account exists.",
          { exact: false },
        ),
      ).toBeVisible();

      await recoveryPage.goto(`${recoveryOrigin}/`);
      await expect(
        recoveryPage.getByRole("heading", { name: "Recovery inbox" }),
      ).toBeVisible();
      await expect(recoveryPage.getByText(generalRole.email)).toBeVisible();
      const recoveryLink = recoveryPage.getByRole("link", {
        name: "Open recovery form",
      });
      await expect(recoveryLink).toHaveAttribute(
        "href",
        /\/auth\/recover\/complete\?token=.{32,}/,
      );
      await recoveryLink.click();
      await expect(recoveryPage).toHaveURL(
        `${staffOrigin}/auth/recover/complete`,
      );
      await recoveryPage
        .getByLabel("New password", { exact: true })
        .fill("PR05-RecoveredAa1");
      await recoveryPage
        .getByLabel("Confirm new password", { exact: true })
        .fill("PR05-RecoveredAa1");
      await recoveryPage
        .getByRole("button", { name: "Update password" })
        .click();
      await expect(recoveryPage).toHaveURL(
        `${staffOrigin}/auth/sign-in?notice=recovery-complete`,
      );
      await expect(
        recoveryPage.getByRole("heading", {
          name: "Sign in to your workspace",
        }),
      ).toBeVisible();
    } finally {
      await recoveryContext.close();
    }
  });
});

async function submitCustomerOrderExpectingBlocked(
  browser: Browser,
): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/session") &&
      response.request().method() === "POST",
  );
  await page.goto(qrUrl);
  await sessionResponse;
  await page.getByRole("button", { name: "Yes, show the menu" }).click();
  await page.getByRole("heading", { name: "What’s being served" }).waitFor();
  await page
    .locator("article.dish-row")
    .filter({ hasText: dishName })
    .getByRole("button", { name: "Add to order" })
    .click();
  await page.getByRole("button", { name: "Review order" }).click();
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/v1/public/orders") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Submit order" }).click();
  const status = (await response).status();
  await context.close();
  return status;
}
