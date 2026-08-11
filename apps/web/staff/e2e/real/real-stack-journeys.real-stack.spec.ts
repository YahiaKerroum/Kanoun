import { randomUUID } from "node:crypto";
import {
  expect,
  test,
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

interface KitchenWorkItem {
  readonly id: string;
  readonly orderId: string;
  readonly version: number;
}

type KitchenQueueResponse = readonly KitchenWorkItem[];

interface KitchenTransitionResponse {
  readonly version: number;
  readonly state: string;
}

interface BillRequest {
  readonly orderId: string;
  readonly total: string;
}

interface BillRequestResponse {
  readonly items: readonly BillRequest[];
}

interface PaymentResponse {
  readonly payment: { readonly id: string };
  readonly order: { readonly version: number };
}

interface ServedResponse {
  readonly fulfilment: string;
}

interface CompletionResponse {
  readonly closure: string;
}

interface RefundResponse {
  readonly order: { readonly financial: string };
}

interface CorrectionResponse {
  readonly currentItemRevision: number;
}

interface CancellationResponse {
  readonly closure: string;
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
let categoryId = "";
let dishId = "";
let dishName = "";
let tableId = "";
let qrUrl = "";
let menuVersion = "";
let generalRole: RoleCredentials;
let kitchenRole: RoleCredentials;
let cashierRole: RoleCredentials;
let firstOrder!: OrderRun;

function assertHarness(): void {
  for (const value of [
    apiOrigin,
    adminOrigin,
    staffOrigin,
    customerOrigin,
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
    return (await response.json().catch(() => undefined)) as T;
  }
  if (!response.ok()) {
    const problem: unknown = await response.json().catch(() => undefined);
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
  return (await response.json().catch(() => undefined)) as T;
}

async function provisionRole(
  role: "general_staff" | "kitchen_staff" | "cashier",
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
  });

  test.afterAll(async () => {
    await Promise.all([
      ownerContext.close(),
      generalContext.close(),
      kitchenContext.close(),
      cashierContext.close(),
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
    await expect(
      kitchenPage.getByRole("heading", { name: /Kitchen/i }).first(),
    ).toBeVisible();
    const queue = await apiJson<KitchenQueueResponse>(
      kitchenContext,
      "GET",
      `/api/v1/staff/kitchen/queue?branchId=${primary.branchId}`,
    );
    const workItem = queue.find((item) => item.orderId === firstOrder.order.id);
    if (!workItem)
      throw new Error(
        "The worker did not project the order into kitchen work.",
      );
    const started = await apiJson<KitchenTransitionResponse>(
      kitchenContext,
      "POST",
      `/api/v1/staff/kitchen/items/${workItem.id}/start`,
      {},
      200,
      {
        "if-match": `"${workItem.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    const ready = await apiJson<KitchenTransitionResponse>(
      kitchenContext,
      "POST",
      `/api/v1/staff/kitchen/items/${workItem.id}/ready`,
      {},
      200,
      {
        "if-match": `"${started.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    const servedSource = await currentStaffOrder(
      generalContext,
      firstOrder.order.id,
    );
    const served = await apiJson<ServedResponse>(
      generalContext,
      "POST",
      `/api/v1/staff/orders/${firstOrder.order.id}/served`,
      {},
      200,
      {
        "if-match": `"${servedSource.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    expect(started.state).toBe("preparing");
    expect(ready.state).toBe("ready");
    expect(served.fulfilment).toBe("served");
    await firstOrder.page
      .getByRole("button", { name: "Request the bill" })
      .click();
    await expect(
      firstOrder.page.getByText("Bill requested. Staff have been notified.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      cashierPage.getByRole("heading", { name: /Bill requests/i }).first(),
    ).toBeVisible();
    const bills = await apiJson<BillRequestResponse>(
      cashierContext,
      "GET",
      `/api/v1/staff/payments/bill-requests?branchId=${primary.branchId}`,
    );
    const bill = bills.items.find(
      (item) => item.orderId === firstOrder.order.id,
    );
    if (!bill) throw new Error("The cashier did not receive the bill request.");
    const payment = await apiJson<PaymentResponse>(
      cashierContext,
      "POST",
      `/api/v1/staff/orders/${firstOrder.order.id}/payments`,
      {
        amount: bill.total,
        method: "cash",
      },
      201,
      { "idempotency-key": randomUUID() },
    );
    const completed = await apiJson<CompletionResponse>(
      cashierContext,
      "POST",
      `/api/v1/staff/orders/${firstOrder.order.id}/completion`,
      {},
      200,
      {
        "if-match": `"${payment.order.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    const refund = await apiJson<RefundResponse>(
      ownerContext,
      "POST",
      `/api/v1/staff/payments/${payment.payment.id}/refunds`,
      {
        amount: bill.total,
        reason: "PR-05 refund verification",
        confirmed: true,
      },
      201,
      { "idempotency-key": randomUUID() },
    );
    expect(completed.closure).toBe("completed");
    expect(refund.order.financial).toBe("refunded");
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
    const before = await currentStaffOrder(
      generalContext,
      correctionOrder.order.id,
    );
    const corrected = await apiJson<CorrectionResponse>(
      ownerContext,
      "POST",
      `/api/v1/staff/orders/${correctionOrder.order.id}/corrections`,
      {
        menuVersion,
        items: [{ dishId, quantity: 2, optionIds: [], note: null }],
        reason: "PR-05 correction verification",
      },
      200,
      {
        "if-match": `"${before.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    expect(corrected.currentItemRevision).toBeGreaterThan(1);
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
    const cancellationBefore = await currentStaffOrder(
      generalContext,
      cancellationOrder.order.id,
    );
    const cancelled = await apiJson<CancellationResponse>(
      ownerContext,
      "POST",
      `/api/v1/staff/orders/${cancellationOrder.order.id}/cancellation`,
      {
        reason: "PR-05 staff cancellation verification",
      },
      200,
      {
        "if-match": `"${cancellationBefore.version}"`,
        "idempotency-key": randomUUID(),
      },
    );
    expect(cancelled.closure).toBe("cancelled");
    expect(cancellationBefore.version).toBeGreaterThanOrEqual(1);
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

  test("TEST-E2E-PR05-R-WORKER-001: worker restart restores readiness without browser interception", async () => {
    const response = await fetch(
      `${process.env.REAL_E2E_CONTROL_ORIGIN}/worker/restart`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.REAL_E2E_CONTROL_SECRET}`,
        },
      },
    );
    expect(response.status).toBe(204);
    await expect(
      generalPage.getByRole("heading", { name: /Orders/i }).first(),
    ).toBeVisible();
  });

  test("TEST-E2E-PR05-R-SSE-001: notification workspace survives offline-to-online recovery", async () => {
    await generalPage.goto(`${staffOrigin}/notifications`);
    await expect(
      generalPage.getByRole("heading", { name: /notification|inbox/i }).first(),
    ).toBeVisible();
    await generalContext.setOffline(true);
    await generalContext.setOffline(false);
    await generalPage.reload();
    await expect(
      generalPage.getByRole("heading", { name: /notification|inbox/i }).first(),
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
