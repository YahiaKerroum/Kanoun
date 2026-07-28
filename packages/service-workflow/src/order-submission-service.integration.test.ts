import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "@rms/building-blocks";
import {
  ApplicationError,
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresKitchenStore,
  PostgresMenuStore,
  PostgresOrderingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  type AuditWriter,
  type GuestRequestContext,
  type StaffRequestContext,
} from "@rms/modules";
import { MenuTablesService } from "./menu-tables-service.js";
import { OrderSubmissionService } from "./order-submission-service.js";
import { PostgresServiceWorkflow } from "./postgres-service-workflow.js";
import {
  TenantOwnerService,
  type CredentialTokenDelivery,
} from "./tenant-owner-service.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;
const now = new Date();
const ownerPassword = "Correct-Horse-42";
const guestSecret = "slice-005-test-guest-secret-with-32-characters";

function metadata() {
  const correlationId = randomUUID();
  return { correlationId, causationId: correlationId, now };
}

describeWithDatabase("order submission service against PostgreSQL", () => {
  if (!connectionString) {
    return;
  }

  const databasePool = createDatabasePool({
    connectionString,
    applicationName: "rms-slice-005-integration-test",
    maximumConnections: 12,
  });
  const workflow = new PostgresServiceWorkflow(databasePool);
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const menu = new PostgresMenuStore();
  const tables = new PostgresTablesStore();
  const ordering = new PostgresOrderingStore();
  const kitchen = new PostgresKitchenStore();
  const audit = new PostgresAuditWriter();
  const identitySecurity = new IdentitySecurity(
    "slice-005-test-identity-secret-with-32-characters",
  );
  const tokenDelivery: CredentialTokenDelivery = {
    deliverRecoveryToken() {
      return Promise.resolve();
    },
  };
  const tenantOwnerService = new TenantOwnerService({
    databasePool,
    workflow,
    restaurantConfiguration,
    identityAccess,
    identitySecurity,
    audit,
    credentialTokenDelivery: tokenDelivery,
  });
  const menuTablesService = new MenuTablesService({
    databasePool,
    workflow,
    menu,
    tables,
    ordering,
    restaurantConfiguration,
    audit,
    guestAccessSecret: guestSecret,
    customerWebOrigin: "http://127.0.0.1:5174",
  });
  const orderService = new OrderSubmissionService({
    databasePool,
    workflow,
    restaurantConfiguration,
    menu,
    tables,
    ordering,
    kitchen,
    audit,
    idempotencySecret: guestSecret,
  });

  interface Fixture {
    readonly businessAccountId: string;
    readonly restaurantId: string;
    readonly branchId: string;
    readonly context: StaffRequestContext;
    readonly dishId: string;
    readonly optionId: string;
    readonly menuVersion: number;
  }

  async function fixture(prefix: string): Promise<Fixture> {
    const code = `${prefix}-${randomUUID().slice(0, 8)}`;
    const tenant = await tenantOwnerService.bootstrapTenant(
      {
        businessCode: code,
        businessName: `${code} Hospitality`,
        restaurantName: `${code} Kitchen`,
        branch: {
          name: "Central",
          address: {
            line1: "12 Test Street",
            city: "Algiers",
            countryCode: "DZ",
          },
          contact: { email: `${code}@example.test` },
          timeZone: "Africa/Algiers",
          currency: "DZD",
          openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            opensAt: "00:00",
            closesAt: "23:59",
          })),
        },
        owner: {
          displayName: `${code} Owner`,
          email: `owner-${code}@example.test`,
          password: ownerPassword,
        },
      },
      metadata(),
    );
    const login = await tenantOwnerService.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: ownerPassword,
      },
      metadata(),
    );
    await tenantOwnerService.updateBranch(
      login.context,
      {
        branchId: tenant.branch.id,
        expectedVersion: tenant.branch.version,
        serviceStatus: "open",
      },
      metadata(),
    );
    const category = await menuTablesService.createCategory(
      login.context,
      {
        restaurantId: tenant.restaurant.id,
        name: "Mains",
        displayOrder: 0,
      },
      metadata(),
    );
    const dish = await menuTablesService.createDish(
      login.context,
      {
        restaurantId: tenant.restaurant.id,
        categoryId: category.id,
        name: "Couscous",
        basePrice: { amount: "1000.00", currency: "DZD" },
        displayOrder: 0,
      },
      metadata(),
    );
    const group = await menuTablesService.createOptionGroup(
      login.context,
      {
        dishId: dish.id,
        name: "Size",
        selectionType: "single",
        isRequired: true,
        minimumSelections: 1,
        maximumSelections: 1,
        displayOrder: 0,
        options: [
          {
            name: "Large",
            priceDelta: { amount: "250.00", currency: "DZD" },
            displayOrder: 0,
          },
        ],
      },
      metadata(),
    );
    const currentMenu = await menu.getMenu(
      databasePool,
      tenant.businessAccountId,
      tenant.restaurant.id,
    );
    const option = group.options[0];
    if (!option || !currentMenu) {
      throw new Error("The order fixture requires an option and current menu.");
    }
    return {
      businessAccountId: tenant.businessAccountId,
      restaurantId: tenant.restaurant.id,
      branchId: tenant.branch.id,
      context: login.context,
      dishId: dish.id,
      optionId: option.id,
      menuVersion: currentMenu.version,
    };
  }

  async function guestAtTable(
    setup: Fixture,
    code: string,
  ): Promise<{
    readonly tableId: string;
    readonly context: GuestRequestContext;
  }> {
    const table = await menuTablesService.createTable(
      setup.context,
      setup.branchId,
      { code },
      metadata(),
    );
    const qr = await menuTablesService.issueTableQrCode(
      setup.context,
      table.id,
      metadata(),
    );
    const exchange = await menuTablesService.exchangeTableQr(
      qr.rawToken,
      metadata(),
    );
    const context = await menuTablesService.authenticateGuestSession(
      exchange.sessionToken,
    );
    if (!context) {
      throw new Error("Expected a valid guest context.");
    }
    return { tableId: table.id, context };
  }

  function submission(setup: Fixture, quantity = 2) {
    return {
      menuVersion: setup.menuVersion,
      customerName: "Amina",
      items: [
        {
          dishId: setup.dishId,
          quantity,
          optionIds: [setup.optionId],
          note: "No parsley",
        },
      ],
    };
  }

  async function count(
    relation: string,
    businessAccountId: string,
  ): Promise<number> {
    const result = await databasePool.query<{ count: number }>(
      `select count(*)::integer as count from ${relation} where business_account_id = $1`,
      [businessAccountId],
    );
    return result.rows[0]?.count ?? 0;
  }

  afterAll(async () => {
    await databasePool.end();
  });

  it("atomically submits and accepts a guest order with immutable snapshots and kitchen work", async () => {
    const setup = await fixture("order-happy");
    const guest = await guestAtTable(setup, "T-1");
    const order = await orderService.submitGuestOrder(
      guest.context,
      submission(setup),
      `submit-${randomUUID()}`,
      metadata(),
    );

    expect(order).toMatchObject({
      reference: "ORD-000001",
      approval: "accepted",
      fulfilment: "not_started",
      financial: "unpaid",
      closure: "active",
      tableId: guest.tableId,
      customerDisplayName: "Amina",
      total: { amount: "2500.00", currency: "DZD" },
    });
    expect(order.items[0]).toMatchObject({
      name: "Couscous",
      unitPrice: { amount: "1250.00", currency: "DZD" },
      quantity: 2,
      note: "No parsley",
      taxInclusive: true,
      total: { amount: "2500.00", currency: "DZD" },
    });
    expect(order.items[0]?.selectedOptions[0]).toMatchObject({
      optionName: "Large",
      priceDelta: { amount: "250.00", currency: "DZD" },
    });
    expect(await count("ordering.orders", setup.businessAccountId)).toBe(1);
    expect(await count("ordering.order_items", setup.businessAccountId)).toBe(
      1,
    );
    expect(await count("tables.table_sessions", setup.businessAccountId)).toBe(
      1,
    );
    expect(await count("kitchen.work_items", setup.businessAccountId)).toBe(1);
    expect(
      await count("platform.idempotency_records", setup.businessAccountId),
    ).toBe(1);
    const orderItem = order.items[0];
    if (!orderItem) {
      throw new Error("The submitted order requires one item.");
    }
    await expect(
      databasePool.query(
        `update ordering.order_items set dish_name = 'Changed' where id = $1`,
        [orderItem.id],
      ),
    ).rejects.toThrow(/append-only/);
  });

  it("replays the same idempotency key and conflicts on a different payload", async () => {
    const setup = await fixture("order-idempotent");
    const guest = await guestAtTable(setup, "T-2");
    const key = `submit-${randomUUID()}`;
    const first = await orderService.submitGuestOrder(
      guest.context,
      submission(setup),
      key,
      metadata(),
    );
    const replay = await orderService.submitGuestOrder(
      guest.context,
      submission(setup),
      key,
      metadata(),
    );
    expect(replay.id).toBe(first.id);
    expect(await count("ordering.orders", setup.businessAccountId)).toBe(1);

    await expect(
      orderService.submitGuestOrder(
        guest.context,
        submission(setup, 3),
        key,
        metadata(),
      ),
    ).rejects.toMatchObject({
      code: "idempotency_conflict",
      status: 409,
    });
    expect(await count("ordering.orders", setup.businessAccountId)).toBe(1);
  });

  it("serializes concurrent first submissions into one table session and distinct orders", async () => {
    const setup = await fixture("order-concurrent");
    const firstGuest = await guestAtTable(setup, "T-3");
    const qr = await menuTablesService.issueTableQrCode(
      setup.context,
      firstGuest.tableId,
      metadata(),
    );
    const secondExchange = await menuTablesService.exchangeTableQr(
      qr.rawToken,
      metadata(),
    );
    const secondContext = await menuTablesService.authenticateGuestSession(
      secondExchange.sessionToken,
    );
    if (!secondContext) {
      throw new Error("Expected a second guest context.");
    }

    const [first, second] = await Promise.all([
      orderService.submitGuestOrder(
        firstGuest.context,
        submission(setup),
        `submit-${randomUUID()}`,
        metadata(),
      ),
      orderService.submitGuestOrder(
        secondContext,
        submission(setup),
        `submit-${randomUUID()}`,
        metadata(),
      ),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(first.reference).not.toBe(second.reference);
    expect(first.tableSessionId).toBe(second.tableSessionId);
    expect(await count("tables.table_sessions", setup.businessAccountId)).toBe(
      1,
    );
    expect(await count("ordering.orders", setup.businessAccountId)).toBe(2);
    await expect(
      orderService.getGuestOrder(secondContext, first.id),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  it("preserves snapshots after menu changes and rejects stale new submissions", async () => {
    const setup = await fixture("order-snapshot");
    const firstGuest = await guestAtTable(setup, "T-4");
    const submitted = await orderService.submitGuestOrder(
      firstGuest.context,
      submission(setup, 1),
      `submit-${randomUUID()}`,
      metadata(),
    );
    const dish = await menu.getDish(
      databasePool,
      setup.businessAccountId,
      setup.dishId,
    );
    if (!dish) {
      throw new Error("The order fixture dish was not found.");
    }
    await menuTablesService.updateDish(
      setup.context,
      {
        dishId: setup.dishId,
        expectedVersion: dish.version,
        name: "Changed Couscous",
        basePrice: { amount: "1500.00", currency: "DZD" },
      },
      metadata(),
    );
    const stored = await ordering.getOrder(
      databasePool,
      setup.businessAccountId,
      submitted.id,
    );
    expect(stored?.items[0]).toMatchObject({
      name: "Couscous",
      unitPrice: { amount: "1250.00", currency: "DZD" },
    });

    const secondGuest = await guestAtTable(setup, "T-5");
    await expect(
      orderService.submitGuestOrder(
        secondGuest.context,
        submission(setup),
        `submit-${randomUUID()}`,
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "menu_changed", status: 409 });
    const sessions = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from tables.table_sessions
        where business_account_id = $1 and table_id = $2
      `,
      [setup.businessAccountId, secondGuest.tableId],
    );
    expect(sessions.rows[0]?.count).toBe(0);
  });

  it("creates staff orders only with branch permission and lists scoped active orders", async () => {
    const setup = await fixture("order-staff");
    const table = await menuTablesService.createTable(
      setup.context,
      setup.branchId,
      { code: "T-6" },
      metadata(),
    );
    const withoutCreate: StaffRequestContext = {
      ...setup.context,
      grants: setup.context.grants.filter(
        (grant) => grant.permissionKey !== "orders.create",
      ),
    };
    await expect(
      orderService.createStaffOrder(
        withoutCreate,
        table.id,
        submission(setup),
        `staff-${randomUUID()}`,
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });

    const created = await orderService.createStaffOrder(
      setup.context,
      table.id,
      submission(setup),
      `staff-${randomUUID()}`,
      metadata(),
    );
    const page = await orderService.listStaffOrders(setup.context, {
      branchId: setup.branchId,
      closure: "active",
      tableId: table.id,
      createdByEmployeeId: setup.context.employeeId,
      pageSize: 10,
    });
    expect(page.items.map((order) => order.id)).toContain(created.id);
    expect(page.items[0]).toMatchObject({
      creatorType: "staff",
      createdByEmployeeId: setup.context.employeeId,
    });
  });

  it("records an idempotent guest cancellation request and rolls back every submission artifact on audit failure", async () => {
    const setup = await fixture("order-rollback");
    const guest = await guestAtTable(setup, "T-7");
    const order = await orderService.submitGuestOrder(
      guest.context,
      submission(setup),
      `submit-${randomUUID()}`,
      metadata(),
    );
    const cancellationKey = `cancel-${randomUUID()}`;
    const first = await orderService.requestGuestCancellation(
      guest.context,
      order.id,
      "Ordered by mistake",
      cancellationKey,
      metadata(),
    );
    const replay = await orderService.requestGuestCancellation(
      guest.context,
      order.id,
      "Ordered by mistake",
      cancellationKey,
      metadata(),
    );
    expect(replay.id).toBe(first.id);
    expect(
      await count("ordering.cancellation_requests", setup.businessAccountId),
    ).toBe(1);

    const rollbackTable = await guestAtTable(setup, "T-8");
    const failingAudit: AuditWriter = {
      appendInTransaction() {
        return Promise.reject(new Error("audit unavailable"));
      },
    };
    const failingService = new OrderSubmissionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      audit: failingAudit,
      idempotencySecret: guestSecret,
    });
    const beforeOrders = await count(
      "ordering.orders",
      setup.businessAccountId,
    );
    const currentMenu = await menu.getMenu(
      databasePool,
      setup.businessAccountId,
      setup.restaurantId,
    );
    if (!currentMenu) {
      throw new Error("The order fixture menu was not found.");
    }
    await expect(
      failingService.submitGuestOrder(
        rollbackTable.context,
        {
          ...submission(setup),
          menuVersion: currentMenu.version,
        },
        `submit-${randomUUID()}`,
        metadata(),
      ),
    ).rejects.toThrow("audit unavailable");
    expect(await count("ordering.orders", setup.businessAccountId)).toBe(
      beforeOrders,
    );
    const rolledBackSession = await databasePool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from tables.table_sessions
        where business_account_id = $1 and table_id = $2
      `,
      [setup.businessAccountId, rollbackTable.tableId],
    );
    expect(rolledBackSession.rows[0]?.count).toBe(0);
  });

  it("uses an actionable error when a branch is not accepting orders", async () => {
    const setup = await fixture("order-closed");
    const guest = await guestAtTable(setup, "T-9");
    const branch = await tenantOwnerService.getBranch(
      setup.context,
      setup.branchId,
    );
    await tenantOwnerService.updateBranch(
      setup.context,
      {
        branchId: setup.branchId,
        expectedVersion: branch.version,
        serviceStatus: "closed",
      },
      metadata(),
    );
    await expect(
      orderService.submitGuestOrder(
        guest.context,
        submission(setup),
        `submit-${randomUUID()}`,
        metadata(),
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      orderService.submitGuestOrder(
        guest.context,
        submission(setup),
        `submit-${randomUUID()}`,
        metadata(),
      ),
    ).rejects.toMatchObject({
      code: "invalid_state_transition",
      status: 409,
    });
  });
});
