import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabasePool,
  createOpaqueToken,
  hashOpaqueToken,
} from "@rms/building-blocks";
import {
  ApplicationError,
  guestSessionAbsoluteTimeoutMs,
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresMenuStore,
  PostgresOrderingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  type GuestRequestContext,
  type PermissionKey,
  type StaffRequestContext,
} from "@rms/modules";
import { MenuTablesService } from "./menu-tables-service.js";
import { PostgresServiceWorkflow } from "./postgres-service-workflow.js";
import {
  TenantOwnerService,
  type CredentialTokenDelivery,
  type TenantBootstrapResult,
} from "./tenant-owner-service.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const guestAccessSecret = "slice-004-test-guest-secret-with-32-characters";
const customerWebOrigin = "http://127.0.0.1:5174";
const ownerPassword = "Correct-Horse-42";
const hourMs = 60 * 60 * 1000;

function metadata(now = new Date()) {
  const correlationId = randomUUID();
  return {
    correlationId,
    causationId: correlationId,
    now,
  };
}

function bootstrapInput(code: string) {
  return {
    businessCode: code,
    businessName: `${code} Hospitality`,
    restaurantName: `${code} Kitchen`,
    branch: {
      name: "Central branch",
      address: {
        line1: "12 Test Street",
        city: "Algiers",
        countryCode: "DZ",
      },
      contact: {
        email: `branch-${code}@example.test`,
        phone: "+213555010101",
      },
      timeZone: "Africa/Algiers",
      currency: "DZD",
      openingHours: [
        { dayOfWeek: 0, opensAt: "18:00", closesAt: "02:00" },
        { dayOfWeek: 1, opensAt: "18:00", closesAt: "23:00" },
      ],
    },
    owner: {
      displayName: `${code} Owner`,
      email: `owner-${code}@example.test`,
      password: ownerPassword,
    },
  } as const;
}

function contextWithout(
  context: StaffRequestContext,
  removed: readonly PermissionKey[],
): StaffRequestContext {
  return {
    ...context,
    grants: context.grants.filter(
      (grant) => !removed.includes(grant.permissionKey),
    ),
  };
}

function money(amount: string) {
  return { amount, currency: "DZD" } as const;
}

describeWithDatabase("menu, tables, and QR service against PostgreSQL", () => {
  if (!connectionString) {
    return;
  }

  const databasePool = createDatabasePool({
    connectionString,
    applicationName: "rms-slice-004-integration-test",
    maximumConnections: 8,
  });
  const workflow = new PostgresServiceWorkflow(databasePool);
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const menu = new PostgresMenuStore();
  const tables = new PostgresTablesStore();
  const ordering = new PostgresOrderingStore();
  const audit = new PostgresAuditWriter();
  const identitySecurity = new IdentitySecurity(
    "slice-004-test-token-secret-with-32-characters",
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
    guestAccessSecret,
    customerWebOrigin,
  });

  interface Fixture {
    readonly code: string;
    readonly tenant: TenantBootstrapResult;
    readonly context: StaffRequestContext;
  }

  async function bootstrapFixture(prefix: string): Promise<Fixture> {
    const code = `${prefix}-${randomUUID().slice(0, 8)}`;
    const tenant = await tenantOwnerService.bootstrapTenant(
      bootstrapInput(code),
      metadata(),
    );
    const owner = await tenantOwnerService.login(
      {
        businessCode: code,
        email: `owner-${code}@example.test`,
        password: ownerPassword,
      },
      metadata(),
    );
    return { code, tenant, context: owner.context };
  }

  async function countRows(
    text: string,
    values: readonly unknown[],
  ): Promise<number> {
    const result = await databasePool.query<{ count: number }>(text, [
      ...values,
    ]);
    return result.rows[0]?.count ?? 0;
  }

  function outboxCount(
    businessAccountId: string,
    eventType: string,
  ): Promise<number> {
    return countRows(
      `
        select count(*)::integer as count
        from platform.outbox_messages
        where business_account_id = $1 and event_type = $2
      `,
      [businessAccountId, eventType],
    );
  }

  function auditCount(
    businessAccountId: string,
    action: string,
  ): Promise<number> {
    return countRows(
      `
        select count(*)::integer as count
        from audit.audit_events
        where business_account_id = $1
          and action = $2
          and target_type = 'table_qr_code'
      `,
      [businessAccountId, action],
    );
  }

  function evidenceCount(businessAccountId: string): Promise<number> {
    return countRows(
      `
        select (
          (select count(*) from audit.audit_events where business_account_id = $1) +
          (select count(*) from platform.outbox_messages where business_account_id = $1)
        )::integer as count
      `,
      [businessAccountId],
    );
  }

  async function createCategoryAndDish(
    fixture: Fixture,
    dishPrice = "1200.00",
  ) {
    const category = await menuTablesService.createCategory(
      fixture.context,
      {
        restaurantId: fixture.tenant.restaurant.id,
        name: "Mains",
        displayOrder: 0,
      },
      metadata(),
    );
    const dish = await menuTablesService.createDish(
      fixture.context,
      {
        restaurantId: fixture.tenant.restaurant.id,
        categoryId: category.id,
        name: "Couscous royal",
        basePrice: money(dishPrice),
        displayOrder: 0,
      },
      metadata(),
    );
    return { category, dish };
  }

  let first: Fixture;
  let second: Fixture;

  beforeAll(async () => {
    first = await bootstrapFixture("first");
    second = await bootstrapFixture("second");
  });

  afterAll(async () => {
    await databasePool.end();
  });

  // -------------------------------------------------------------------
  // Menu
  // -------------------------------------------------------------------

  it("persists the menu structure for one tenant and leaves another tenant empty", async () => {
    const fixture = await bootstrapFixture("menu-scope");
    const { category, dish } = await createCategoryAndDish(fixture);
    const group = await menuTablesService.createOptionGroup(
      fixture.context,
      {
        dishId: dish.id,
        name: "Extras",
        selectionType: "multiple",
        isRequired: false,
        minimumSelections: 0,
        maximumSelections: 2,
        displayOrder: 0,
        options: [
          { name: "Extra lamb", priceDelta: money("250.00"), displayOrder: 0 },
          { name: "Extra broth", priceDelta: money("0.00"), displayOrder: 1 },
        ],
      },
      metadata(),
    );
    const override = await menuTablesService.upsertBranchOverride(
      fixture.context,
      fixture.tenant.branch.id,
      dish.id,
      { expectedVersion: 0, price: money("1000.00"), visible: true },
      metadata(),
    );

    expect(category.version).toBe(1);
    expect(dish.basePrice).toEqual({ amount: "1200.00", currency: "DZD" });
    expect(dish.available).toBe(true);
    expect(group.options.map((option) => option.priceDelta.amount)).toEqual([
      "250.00",
      "0.00",
    ]);
    expect(override.price).toEqual({ amount: "1000.00", currency: "DZD" });

    const owned = await databasePool.query<{
      categories: number;
      dishes: number;
      option_groups: number;
      options: number;
      overrides: number;
      menus: number;
    }>(
      `
        select
          (select count(*)::integer from menu.categories where business_account_id = $1) as categories,
          (select count(*)::integer from menu.dishes where business_account_id = $1) as dishes,
          (select count(*)::integer from menu.option_groups where business_account_id = $1) as option_groups,
          (select count(*)::integer from menu.options where business_account_id = $1) as options,
          (select count(*)::integer from menu.branch_dish_overrides where business_account_id = $1) as overrides,
          (select count(*)::integer from menu.menus where business_account_id = $1) as menus
      `,
      [fixture.tenant.businessAccountId],
    );
    expect(owned.rows[0]).toEqual({
      categories: 1,
      dishes: 1,
      option_groups: 1,
      options: 2,
      overrides: 1,
      menus: 1,
    });

    const other = await databasePool.query<{
      categories: number;
      dishes: number;
      option_groups: number;
      options: number;
      overrides: number;
      menus: number;
    }>(
      `
        select
          (select count(*)::integer from menu.categories where business_account_id = $1) as categories,
          (select count(*)::integer from menu.dishes where business_account_id = $1) as dishes,
          (select count(*)::integer from menu.option_groups where business_account_id = $1) as option_groups,
          (select count(*)::integer from menu.options where business_account_id = $1) as options,
          (select count(*)::integer from menu.branch_dish_overrides where business_account_id = $1) as overrides,
          (select count(*)::integer from menu.menus where business_account_id = $1) as menus
      `,
      [second.tenant.businessAccountId],
    );
    expect(other.rows[0]).toEqual({
      categories: 0,
      dishes: 0,
      option_groups: 0,
      options: 0,
      overrides: 0,
      menus: 0,
    });
    expect(
      await menuTablesService.listCategories(
        second.context,
        second.tenant.restaurant.id,
      ),
    ).toEqual([]);
  });

  it("increments the menu aggregate version on every structural mutation", async () => {
    const fixture = await bootstrapFixture("menu-version");
    const restaurantId = fixture.tenant.restaurant.id;
    const businessAccountId = fixture.tenant.businessAccountId;

    expect(
      await menu.getMenu(databasePool, businessAccountId, restaurantId),
    ).toBeUndefined();

    const versions: number[] = [];
    const readVersion = async (): Promise<number> => {
      const aggregate = await menu.getMenu(
        databasePool,
        businessAccountId,
        restaurantId,
      );
      const version = aggregate?.version ?? 0;
      versions.push(version);
      return version;
    };

    const category = await menuTablesService.createCategory(
      fixture.context,
      { restaurantId, name: "Starters", displayOrder: 0 },
      metadata(),
    );
    await readVersion();
    const dish = await menuTablesService.createDish(
      fixture.context,
      {
        restaurantId,
        categoryId: category.id,
        name: "Chorba",
        basePrice: money("450.00"),
        displayOrder: 0,
      },
      metadata(),
    );
    await readVersion();
    await menuTablesService.createOptionGroup(
      fixture.context,
      {
        dishId: dish.id,
        name: "Spice level",
        selectionType: "single",
        isRequired: true,
        minimumSelections: 1,
        maximumSelections: 1,
        displayOrder: 0,
        options: [
          { name: "Mild", priceDelta: money("0.00"), displayOrder: 0 },
          { name: "Hot", priceDelta: money("0.00"), displayOrder: 1 },
        ],
      },
      metadata(),
    );
    await readVersion();
    await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 1, name: "Chorba frik" },
      metadata(),
    );
    await readVersion();
    await menuTablesService.upsertBranchOverride(
      fixture.context,
      fixture.tenant.branch.id,
      dish.id,
      { expectedVersion: 0, price: money("400.00") },
      metadata(),
    );
    await readVersion();

    expect(versions).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects a stale dish update with concurrency_conflict and writes no partial state", async () => {
    const fixture = await bootstrapFixture("dish-stale");
    const { dish } = await createCategoryAndDish(fixture);

    const updated = await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 1, name: "Couscous merguez" },
      metadata(),
    );
    expect(updated.version).toBe(2);

    const before = await databasePool.query(
      `
        select name, base_price_amount, base_price_currency, available, status, version
        from menu.dishes
        where business_account_id = $1 and id = $2
      `,
      [fixture.tenant.businessAccountId, dish.id],
    );
    const evidenceBefore = await evidenceCount(
      fixture.tenant.businessAccountId,
    );

    await expect(
      menuTablesService.updateDish(
        fixture.context,
        { dishId: dish.id, expectedVersion: 1, name: "Stale update" },
        metadata(),
      ),
    ).rejects.toMatchObject({
      code: "concurrency_conflict",
      status: 409,
      currentVersion: 2,
    });

    const after = await databasePool.query(
      `
        select name, base_price_amount, base_price_currency, available, status, version
        from menu.dishes
        where business_account_id = $1 and id = $2
      `,
      [fixture.tenant.businessAccountId, dish.id],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(after.rows[0]).toMatchObject({
      name: "Couscous merguez",
      version: 2,
    });
    expect(await evidenceCount(fixture.tenant.businessAccountId)).toBe(
      evidenceBefore,
    );
  });

  it("rejects a negative worst-case option group before writing any row", async () => {
    const fixture = await bootstrapFixture("pricing-guard");
    const { dish } = await createCategoryAndDish(fixture, "10.00");
    const versionBefore = await menu.getMenu(
      databasePool,
      fixture.tenant.businessAccountId,
      fixture.tenant.restaurant.id,
    );

    const failure = await menuTablesService
      .createOptionGroup(
        fixture.context,
        {
          dishId: dish.id,
          name: "Loyalty discount",
          selectionType: "single",
          isRequired: true,
          minimumSelections: 1,
          maximumSelections: 1,
          displayOrder: 0,
          options: [
            {
              name: "Regular discount",
              priceDelta: money("-15.00"),
              displayOrder: 0,
            },
          ],
        },
        metadata(),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(ApplicationError);
    expect(failure).toMatchObject({ code: "validation_error", status: 422 });
    expect(
      await countRows(
        `
          select count(*)::integer as count
          from menu.option_groups
          where business_account_id = $1 and dish_id = $2
        `,
        [fixture.tenant.businessAccountId, dish.id],
      ),
    ).toBe(0);
    expect(
      await countRows(
        `
          select count(*)::integer as count
          from menu.options
          where business_account_id = $1
        `,
        [fixture.tenant.businessAccountId],
      ),
    ).toBe(0);
    const versionAfter = await menu.getMenu(
      databasePool,
      fixture.tenant.businessAccountId,
      fixture.tenant.restaurant.id,
    );
    expect(versionAfter?.version).toBe(versionBefore?.version);
  });

  it("creates then updates a branch override and rejects a genuine stale version", async () => {
    const fixture = await bootstrapFixture("override");
    const { dish } = await createCategoryAndDish(fixture);
    const branchId = fixture.tenant.branch.id;

    const created = await menuTablesService.upsertBranchOverride(
      fixture.context,
      branchId,
      dish.id,
      { expectedVersion: 0, price: money("1100.00"), visible: true },
      metadata(),
    );
    expect(created).toMatchObject({
      version: 1,
      price: { amount: "1100.00", currency: "DZD" },
      visible: true,
    });

    const updatedOverride = await menuTablesService.upsertBranchOverride(
      fixture.context,
      branchId,
      dish.id,
      { expectedVersion: 1, price: money("950.00"), visible: true },
      metadata(),
    );
    expect(updatedOverride).toMatchObject({
      version: 2,
      price: { amount: "950.00", currency: "DZD" },
    });

    await expect(
      menuTablesService.upsertBranchOverride(
        fixture.context,
        branchId,
        dish.id,
        { expectedVersion: 1, price: money("1.00"), visible: true },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "concurrency_conflict", status: 409 });

    const stored = await databasePool.query<{
      price_amount: string;
      version: number;
    }>(
      `
        select price_amount, version
        from menu.branch_dish_overrides
        where business_account_id = $1 and branch_id = $2 and dish_id = $3
      `,
      [fixture.tenant.businessAccountId, branchId, dish.id],
    );
    expect(stored.rows[0]).toEqual({ price_amount: "950.00", version: 2 });
  });

  it("appends a menu availability event only when availability actually changes", async () => {
    const fixture = await bootstrapFixture("availability");
    const { dish } = await createCategoryAndDish(fixture);
    const businessAccountId = fixture.tenant.businessAccountId;
    const eventType = "menu.availability_changed.v1";

    expect(await outboxCount(businessAccountId, eventType)).toBe(0);

    const disabled = await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 1, available: false },
      metadata(),
    );
    expect(disabled.available).toBe(false);
    expect(await outboxCount(businessAccountId, eventType)).toBe(1);

    await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 2, name: "Couscous maison" },
      metadata(),
    );
    expect(await outboxCount(businessAccountId, eventType)).toBe(1);

    await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 3, available: false },
      metadata(),
    );
    expect(await outboxCount(businessAccountId, eventType)).toBe(1);

    const enabled = await menuTablesService.updateDish(
      fixture.context,
      { dishId: dish.id, expectedVersion: 4, available: true },
      metadata(),
    );
    expect(enabled.available).toBe(true);
    expect(await outboxCount(businessAccountId, eventType)).toBe(2);

    const payloads = await databasePool.query<{
      payload: { dishId: string; available: boolean };
    }>(
      `
        select payload
        from platform.outbox_messages
        where business_account_id = $1 and event_type = $2
        order by occurred_at_utc, event_id
      `,
      [businessAccountId, eventType],
    );
    expect(payloads.rows.map((row) => row.payload.available)).toContain(false);
    expect(payloads.rows.map((row) => row.payload.available)).toContain(true);
    expect(payloads.rows.every((row) => row.payload.dishId === dish.id)).toBe(
      true,
    );
  });

  it("denies menu commands and reads without the required permission", async () => {
    const fixture = await bootstrapFixture("menu-perm");
    const { category } = await createCategoryAndDish(fixture);
    const withoutManage = contextWithout(fixture.context, ["menu.manage"]);
    const withoutView = contextWithout(fixture.context, ["menu.view"]);
    const restaurantId = fixture.tenant.restaurant.id;

    await expect(
      menuTablesService.createCategory(
        withoutManage,
        { restaurantId, name: "Desserts", displayOrder: 1 },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    await expect(
      menuTablesService.createDish(
        withoutManage,
        {
          restaurantId,
          categoryId: category.id,
          name: "Baklava",
          basePrice: money("300.00"),
          displayOrder: 1,
        },
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    await expect(
      menuTablesService.listCategories(withoutView, restaurantId),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    await expect(
      menuTablesService.listDishes(withoutView, restaurantId),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
  });

  it("resolves the guest menu with branch overrides applied", async () => {
    const fixture = await bootstrapFixture("guest-menu");
    const restaurantId = fixture.tenant.restaurant.id;
    const branchId = fixture.tenant.branch.id;
    const category = await menuTablesService.createCategory(
      fixture.context,
      { restaurantId, name: "Grill", displayOrder: 0 },
      metadata(),
    );
    const inherited = await menuTablesService.createDish(
      fixture.context,
      {
        restaurantId,
        categoryId: category.id,
        name: "Mechoui",
        description: "Slow roasted lamb",
        basePrice: money("2400.00"),
        displayOrder: 0,
      },
      metadata(),
    );
    const overridden = await menuTablesService.createDish(
      fixture.context,
      {
        restaurantId,
        categoryId: category.id,
        name: "Brochettes",
        basePrice: money("1500.00"),
        displayOrder: 1,
      },
      metadata(),
    );
    const hidden = await menuTablesService.createDish(
      fixture.context,
      {
        restaurantId,
        categoryId: category.id,
        name: "Seasonal special",
        basePrice: money("900.00"),
        displayOrder: 2,
      },
      metadata(),
    );
    await menuTablesService.createOptionGroup(
      fixture.context,
      {
        dishId: inherited.id,
        name: "Sides",
        selectionType: "multiple",
        isRequired: false,
        minimumSelections: 0,
        maximumSelections: 2,
        displayOrder: 0,
        options: [
          { name: "Salad", priceDelta: money("100.00"), displayOrder: 0 },
          { name: "Bread", priceDelta: money("50.00"), displayOrder: 1 },
        ],
      },
      metadata(),
    );
    await menuTablesService.upsertBranchOverride(
      fixture.context,
      branchId,
      overridden.id,
      {
        expectedVersion: 0,
        price: money("1250.00"),
        available: false,
        visible: true,
      },
      metadata(),
    );
    await menuTablesService.upsertBranchOverride(
      fixture.context,
      branchId,
      hidden.id,
      { expectedVersion: 0, price: null, visible: false },
      metadata(),
    );

    const guestContext: GuestRequestContext = {
      guestSessionId: randomUUID(),
      businessAccountId: fixture.tenant.businessAccountId,
      restaurantId,
      branchId,
      expiresAtUtc: new Date(Date.now() + hourMs),
    };
    const guestMenu = await menuTablesService.getGuestMenu(guestContext);

    expect(guestMenu.currency).toBe("DZD");
    expect(guestMenu.version).toBeGreaterThan(0);
    const grill = guestMenu.categories.find((item) => item.id === category.id);
    expect(grill?.dishes.map((dish) => dish.id)).toEqual([
      inherited.id,
      overridden.id,
    ]);
    expect(grill?.dishes[0]).toMatchObject({
      id: inherited.id,
      name: "Mechoui",
      description: "Slow roasted lamb",
      unitPrice: { amount: "2400.00", currency: "DZD" },
      available: true,
    });
    expect(grill?.dishes[0]?.optionGroups[0]).toMatchObject({
      name: "Sides",
      minimum: 0,
      maximum: 2,
    });
    expect(
      grill?.dishes[0]?.optionGroups[0]?.options.map((option) => option.name),
    ).toEqual(["Salad", "Bread"]);
    expect(grill?.dishes[1]).toMatchObject({
      id: overridden.id,
      unitPrice: { amount: "1250.00", currency: "DZD" },
      available: false,
    });
    expect(
      guestMenu.categories.flatMap((item) =>
        item.dishes.map((dish) => dish.id),
      ),
    ).not.toContain(hidden.id);
  });

  // -------------------------------------------------------------------
  // Tables & QR
  // -------------------------------------------------------------------

  it("surfaces a duplicate table code inside a branch as a unique violation", async () => {
    const fixture = await bootstrapFixture("table-code");
    const branchId = fixture.tenant.branch.id;
    const code = `T-${randomUUID().slice(0, 4)}`;

    const created = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code, area: "Terrace" },
      metadata(),
    );
    expect(created).toMatchObject({
      code,
      area: "Terrace",
      status: "active",
      outOfService: false,
      version: 1,
      derivedState: "available",
    });

    const failure = await menuTablesService
      .createTable(fixture.context, branchId, { code }, metadata())
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    // Current behaviour: neither the store nor the service maps Postgres
    // 23505 on `table_branch_code_uidx` into an ApplicationError. Only the
    // HTTP error middleware translates it (to 409 concurrency_conflict), so
    // at the service boundary the raw driver error surfaces unchanged.
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(ApplicationError);
    expect(failure).toMatchObject({
      code: "23505",
      constraint: "table_branch_code_uidx",
    });

    expect(
      await countRows(
        `
          select count(*)::integer as count
          from tables.tables
          where business_account_id = $1 and branch_id = $2 and code = $3
        `,
        [fixture.tenant.businessAccountId, branchId, code],
      ),
    ).toBe(1);

    // The same code in another tenant's branch is unaffected: the unique
    // index is scoped by business account and branch.
    const otherTenantTable = await menuTablesService.createTable(
      second.context,
      second.tenant.branch.id,
      { code },
      metadata(),
    );
    expect(otherTenantTable.code).toBe(code);
    expect(otherTenantTable.businessAccountId).toBe(
      second.tenant.businessAccountId,
    );
  });

  it("rotates a table QR code and invalidates the previous raw token", async () => {
    const fixture = await bootstrapFixture("qr-rotate");
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "R-1" },
      metadata(),
    );

    const firstIssue = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    expect(firstIssue.qrUrl).toBe(
      `${customerWebOrigin}/qr/${firstIssue.rawToken}`,
    );
    expect(firstIssue.qrCode).toMatchObject({
      kind: "table",
      status: "active",
      tableId: table.id,
    });
    const firstExchange = await menuTablesService.exchangeTableQr(
      firstIssue.rawToken,
      metadata(),
    );
    expect(firstExchange.tableId).toBe(table.id);
    expect(firstExchange.tableCode).toBe("R-1");

    const secondIssue = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    expect(secondIssue.qrCode.id).not.toBe(firstIssue.qrCode.id);

    await expect(
      menuTablesService.exchangeTableQr(firstIssue.rawToken, metadata()),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
    const rotatedExchange = await menuTablesService.exchangeTableQr(
      secondIssue.rawToken,
      metadata(),
    );
    expect(rotatedExchange.tableId).toBe(table.id);

    const rows = await databasePool.query<{
      id: string;
      status: string;
      revoked_reason: string | null;
    }>(
      `
        select id, status, revoked_reason
        from tables.table_qr_codes
        where business_account_id = $1 and table_id = $2
        order by created_at_utc
      `,
      [fixture.tenant.businessAccountId, table.id],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.filter((row) => row.status === "active")).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      id: firstIssue.qrCode.id,
      status: "revoked",
      revoked_reason: "rotated",
    });
    expect(rows.rows[1]).toMatchObject({
      id: secondIssue.qrCode.id,
      status: "active",
    });
    expect(
      (
        await menuTablesService.listQrCodes(
          fixture.context,
          fixture.tenant.branch.id,
        )
      ).filter((qrCode) => qrCode.status === "active"),
    ).toHaveLength(1);
  });

  it("makes a revoked QR token indistinguishable from an unknown one", async () => {
    const fixture = await bootstrapFixture("qr-revoke");
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "V-1" },
      metadata(),
    );
    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    const revoked = await menuTablesService.revokeQrCode(
      fixture.context,
      issued.qrCode.id,
      "Table retired from service",
      metadata(),
    );
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedReason).toBe("Table retired from service");

    const attempts = await Promise.allSettled([
      menuTablesService.exchangeTableQr(issued.rawToken, metadata()),
      menuTablesService.exchangeTableQr(createOpaqueToken(), metadata()),
    ]);
    expect(attempts.every((attempt) => attempt.status === "rejected")).toBe(
      true,
    );
    const shapes = attempts.map((attempt) => {
      const reason: unknown =
        attempt.status === "rejected" ? attempt.reason : undefined;
      if (!(reason instanceof ApplicationError)) {
        throw new Error("Expected an ApplicationError rejection.");
      }
      return {
        code: reason.code,
        status: reason.status,
        title: reason.title,
      };
    });
    expect(shapes[0]).toEqual({
      code: "resource_not_found",
      status: 404,
      title: "Resource not found",
    });
    expect(shapes[1]).toEqual(shapes[0]);

    await expect(
      menuTablesService.revokeQrCode(
        fixture.context,
        issued.qrCode.id,
        "Second revocation",
        metadata(),
      ),
    ).rejects.toMatchObject({ code: "invalid_state_transition", status: 409 });
  });

  it("issues a browse-only branch QR that resolves without a table", async () => {
    const fixture = await bootstrapFixture("qr-branch");
    const issued = await menuTablesService.issueBranchQrCode(
      fixture.context,
      fixture.tenant.branch.id,
      metadata(),
    );
    expect(issued.qrCode).toMatchObject({ kind: "branch", status: "active" });
    expect(issued.qrCode.tableId).toBeUndefined();

    const exchanged = await menuTablesService.exchangeTableQr(
      issued.rawToken,
      metadata(),
    );
    expect(exchanged.branchId).toBe(fixture.tenant.branch.id);
    expect(exchanged.tableId).toBeUndefined();
    expect(exchanged.tableCode).toBeUndefined();

    const guestContext = await menuTablesService.authenticateGuestSession(
      exchanged.sessionToken,
    );
    expect(guestContext).toBeDefined();
    expect(guestContext?.tableId).toBeUndefined();
    expect(guestContext?.restaurantId).toBe(fixture.tenant.restaurant.id);

    const stored = await databasePool.query<{ table_id: string | null }>(
      `
        select table_id
        from ordering.customer_sessions
        where token_hash = $1
      `,
      [hashOpaqueToken(exchanged.sessionToken, guestAccessSecret)],
    );
    expect(stored.rows[0]?.table_id).toBeNull();
  });

  it("derives table state from status and out-of-service through the store", async () => {
    const fixture = await bootstrapFixture("table-state");
    const branchId = fixture.tenant.branch.id;
    const available = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code: "A-1" },
      metadata(),
    );
    const outOfService = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code: "B-1" },
      metadata(),
    );
    const inactive = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code: "C-1" },
      metadata(),
    );

    expect(
      await menuTablesService.updateTable(
        fixture.context,
        outOfService.id,
        { expectedVersion: 1, outOfService: true },
        metadata(),
      ),
    ).toMatchObject({ outOfService: true, derivedState: "out_of_service" });
    // `inactive` wins over `out_of_service` even when both are set.
    expect(
      await menuTablesService.updateTable(
        fixture.context,
        inactive.id,
        { expectedVersion: 1, status: "inactive", outOfService: true },
        metadata(),
      ),
    ).toMatchObject({
      status: "inactive",
      outOfService: true,
      derivedState: "inactive",
    });

    const listed = await menuTablesService.listTables(
      fixture.context,
      branchId,
    );
    expect(
      listed.map((table) => [table.id, table.derivedState] as const),
    ).toEqual([
      [available.id, "available"],
      [outOfService.id, "out_of_service"],
      [inactive.id, "inactive"],
    ]);
    // No code path in slice 004 opens a `tables.table_sessions` row, so
    // `occupied` is not reachable end-to-end and is deliberately not forced.
    expect(listed.map((table) => table.derivedState)).not.toContain("occupied");
    expect(
      await countRows(
        `
          select count(*)::integer as count
          from tables.table_sessions
          where business_account_id = $1
        `,
        [fixture.tenant.businessAccountId],
      ),
    ).toBe(0);
  });

  it("serializes concurrent table updates behind optimistic concurrency", async () => {
    const fixture = await bootstrapFixture("table-race");
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "X-1" },
      metadata(),
    );

    const attempts = await Promise.allSettled([
      menuTablesService.updateTable(
        fixture.context,
        table.id,
        { expectedVersion: 1, area: "Patio" },
        metadata(),
      ),
      menuTablesService.updateTable(
        fixture.context,
        table.id,
        { expectedVersion: 1, area: "Mezzanine" },
        metadata(),
      ),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.filter(
      (attempt) => attempt.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    for (const attempt of rejected) {
      expect(attempt.reason).toBeInstanceOf(ApplicationError);
      expect(attempt.reason).toMatchObject({ code: "concurrency_conflict" });
    }
    const stored = await databasePool.query<{ version: number }>(
      `select version from tables.tables where business_account_id = $1 and id = $2`,
      [fixture.tenant.businessAccountId, table.id],
    );
    expect(stored.rows[0]?.version).toBe(2);
  });

  it("audits QR issuance and revocation", async () => {
    const fixture = await bootstrapFixture("qr-audit");
    const businessAccountId = fixture.tenant.businessAccountId;
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "Q-1" },
      metadata(),
    );
    expect(await auditCount(businessAccountId, "qr_code.issued")).toBe(0);

    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    expect(await auditCount(businessAccountId, "qr_code.issued")).toBe(1);

    await menuTablesService.revokeQrCode(
      fixture.context,
      issued.qrCode.id,
      "Damaged sticker",
      metadata(),
    );
    expect(await auditCount(businessAccountId, "qr_code.revoked")).toBe(1);

    const events = await databasePool.query<{
      action: string;
      target_type: string;
      target_id: string;
      outcome: string;
      reason: string | null;
    }>(
      `
        select action, target_type, target_id, outcome, reason
        from audit.audit_events
        where business_account_id = $1 and target_type = 'table_qr_code'
        order by occurred_at_utc, action
      `,
      [businessAccountId],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      "qr_code.issued",
      "qr_code.revoked",
    ]);
    expect(events.rows.every((row) => row.target_id === issued.qrCode.id)).toBe(
      true,
    );
    expect(events.rows.every((row) => row.outcome === "succeeded")).toBe(true);
    expect(events.rows[1]?.reason).toBe("Damaged sticker");
  });

  it("denies table and QR commands without the required permission", async () => {
    const fixture = await bootstrapFixture("table-perm");
    const branchId = fixture.tenant.branch.id;
    const table = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code: "P-1" },
      metadata(),
    );
    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    const withoutQr = contextWithout(fixture.context, ["qr.manage"]);
    const withoutManage = contextWithout(fixture.context, ["tables.manage"]);
    const withoutView = contextWithout(fixture.context, ["tables.view"]);
    const denied = { code: "permission_denied", status: 403 };

    await expect(
      menuTablesService.issueTableQrCode(withoutQr, table.id, metadata()),
    ).rejects.toMatchObject(denied);
    await expect(
      menuTablesService.issueBranchQrCode(withoutQr, branchId, metadata()),
    ).rejects.toMatchObject(denied);
    await expect(
      menuTablesService.revokeQrCode(
        withoutQr,
        issued.qrCode.id,
        "Unauthorized revocation",
        metadata(),
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      menuTablesService.listQrCodes(withoutQr, branchId),
    ).rejects.toMatchObject(denied);

    await expect(
      menuTablesService.createTable(
        withoutManage,
        branchId,
        { code: "P-2" },
        metadata(),
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      menuTablesService.updateTable(
        withoutManage,
        table.id,
        { expectedVersion: 1, area: "Window" },
        metadata(),
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      menuTablesService.listTables(withoutView, branchId),
    ).rejects.toMatchObject(denied);
  });

  it("hides another tenant's tables, QR codes, and dishes", async () => {
    // Uses the two tenants bootstrapped for the whole run: `first` owns the
    // resources, `second` is a fully authorised owner of a different tenant.
    const fixture = first;
    const branchId = fixture.tenant.branch.id;
    const table = await menuTablesService.createTable(
      fixture.context,
      branchId,
      { code: "I-1" },
      metadata(),
    );
    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    const { dish } = await createCategoryAndDish(fixture);
    const notFound = { code: "resource_not_found", status: 404 };

    await expect(
      menuTablesService.listTables(second.context, branchId),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.updateTable(
        second.context,
        table.id,
        { expectedVersion: 1, area: "Stolen" },
        metadata(),
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.issueTableQrCode(second.context, table.id, metadata()),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.revokeQrCode(
        second.context,
        issued.qrCode.id,
        "Cross-tenant revocation",
        metadata(),
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.listQrCodes(second.context, branchId),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.updateDish(
        second.context,
        { dishId: dish.id, expectedVersion: 1, name: "Cross-tenant rename" },
        metadata(),
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      menuTablesService.upsertBranchOverride(
        second.context,
        branchId,
        dish.id,
        { expectedVersion: 0, price: money("1.00") },
        metadata(),
      ),
    ).rejects.toMatchObject(notFound);

    // Tenant-scoped reads keyed by restaurant simply resolve to nothing.
    expect(
      await menuTablesService.listDishes(
        second.context,
        fixture.tenant.restaurant.id,
      ),
    ).toEqual([]);
    expect(
      await countRows(
        `
          select count(*)::integer as count
          from tables.tables
          where business_account_id = $1 and id = $2
        `,
        [second.tenant.businessAccountId, table.id],
      ),
    ).toBe(0);
  });

  // -------------------------------------------------------------------
  // Guest sessions
  // -------------------------------------------------------------------

  it("stores only a hashed guest session token with a fixed 12h expiry", async () => {
    const fixture = await bootstrapFixture("guest-token");
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "G-1" },
      metadata(),
    );
    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    const exchanged = await menuTablesService.exchangeTableQr(
      issued.rawToken,
      metadata(),
    );

    const stored = await databasePool.query<{
      id: string;
      token_hash: string;
      business_account_id: string;
      restaurant_id: string;
      branch_id: string;
      table_id: string | null;
      created_at_utc: Date;
      last_seen_at_utc: Date;
      expires_at_utc: Date;
    }>(
      `
        select
          id, token_hash, business_account_id, restaurant_id, branch_id, table_id,
          created_at_utc, last_seen_at_utc, expires_at_utc
        from ordering.customer_sessions
        where token_hash = $1
      `,
      [hashOpaqueToken(exchanged.sessionToken, guestAccessSecret)],
    );
    const row = stored.rows[0];
    expect(row).toBeDefined();
    if (!row) {
      throw new Error("Expected the guest session row to exist.");
    }
    expect(row.token_hash).not.toBe(exchanged.sessionToken);
    expect(row.token_hash).toBe(
      hashOpaqueToken(exchanged.sessionToken, guestAccessSecret),
    );
    expect(row.business_account_id).toBe(fixture.tenant.businessAccountId);
    expect(row.restaurant_id).toBe(fixture.tenant.restaurant.id);
    expect(row.branch_id).toBe(fixture.tenant.branch.id);
    expect(row.table_id).toBe(table.id);
    expect(row.expires_at_utc.getTime() - row.created_at_utc.getTime()).toBe(
      guestSessionAbsoluteTimeoutMs,
    );
    expect(row.last_seen_at_utc.getTime()).toBe(row.created_at_utc.getTime());
    expect(exchanged.expiresAtUtc.getTime()).toBe(row.expires_at_utc.getTime());
  });

  it("authenticates a live guest session and advances its last-seen timestamp", async () => {
    const fixture = await bootstrapFixture("guest-touch");
    const table = await menuTablesService.createTable(
      fixture.context,
      fixture.tenant.branch.id,
      { code: "G-2" },
      metadata(),
    );
    const issued = await menuTablesService.issueTableQrCode(
      fixture.context,
      table.id,
      metadata(),
    );
    const exchanged = await menuTablesService.exchangeTableQr(
      issued.rawToken,
      metadata(),
    );
    const tokenHash = hashOpaqueToken(
      exchanged.sessionToken,
      guestAccessSecret,
    );

    // Push `last_seen_at_utc` two hours back: still inside the 4h idle window
    // and the 12h absolute cap, so a successful authenticate must move it.
    await databasePool.query(
      `
        update ordering.customer_sessions
        set last_seen_at_utc = now() - interval '2 hours'
        where token_hash = $1
      `,
      [tokenHash],
    );
    const before = await databasePool.query<{ last_seen_at_utc: Date }>(
      `select last_seen_at_utc from ordering.customer_sessions where token_hash = $1`,
      [tokenHash],
    );

    const guestContext = await menuTablesService.authenticateGuestSession(
      exchanged.sessionToken,
    );
    expect(guestContext).toMatchObject({
      businessAccountId: fixture.tenant.businessAccountId,
      restaurantId: fixture.tenant.restaurant.id,
      branchId: fixture.tenant.branch.id,
      tableId: table.id,
    });

    const after = await databasePool.query<{ last_seen_at_utc: Date }>(
      `select last_seen_at_utc from ordering.customer_sessions where token_hash = $1`,
      [tokenHash],
    );
    const beforeSeen = before.rows[0]?.last_seen_at_utc.getTime() ?? 0;
    const afterSeen = after.rows[0]?.last_seen_at_utc.getTime() ?? 0;
    expect(afterSeen).toBeGreaterThan(beforeSeen);

    // The refreshed idle window keeps a second authenticate succeeding.
    expect(
      await menuTablesService.authenticateGuestSession(exchanged.sessionToken),
    ).toBeDefined();
    expect(
      await menuTablesService.authenticateGuestSession(createOpaqueToken()),
    ).toBeUndefined();
  });

  it("rejects guest sessions past the absolute cap or the idle window", async () => {
    const fixture = await bootstrapFixture("guest-expiry");
    const now = Date.now();
    const insertSession = async (input: {
      readonly createdOffsetMs: number;
      readonly lastSeenOffsetMs: number;
      readonly expiresOffsetMs: number;
    }): Promise<string> => {
      const rawToken = createOpaqueToken();
      await databasePool.query(
        `
          insert into ordering.customer_sessions (
            id, business_account_id, restaurant_id, branch_id, table_id,
            token_hash, created_at_utc, last_seen_at_utc, expires_at_utc
          )
          values ($1, $2, $3, $4, null, $5, $6, $7, $8)
        `,
        [
          randomUUID(),
          fixture.tenant.businessAccountId,
          fixture.tenant.restaurant.id,
          fixture.tenant.branch.id,
          hashOpaqueToken(rawToken, guestAccessSecret),
          new Date(now + input.createdOffsetMs),
          new Date(now + input.lastSeenOffsetMs),
          new Date(now + input.expiresOffsetMs),
        ],
      );
      return rawToken;
    };

    // Past the fixed 12h absolute cap.
    const expiredToken = await insertSession({
      createdOffsetMs: -13 * hourMs,
      lastSeenOffsetMs: -13 * hourMs,
      expiresOffsetMs: -1 * hourMs,
    });
    // Idle beyond 4h but still inside the 12h cap.
    const idleToken = await insertSession({
      createdOffsetMs: -5 * hourMs,
      lastSeenOffsetMs: -5 * hourMs,
      expiresOffsetMs: 7 * hourMs,
    });
    // Control: recently seen and well inside both windows.
    const liveToken = await insertSession({
      createdOffsetMs: -1 * hourMs,
      lastSeenOffsetMs: -1 * hourMs,
      expiresOffsetMs: 11 * hourMs,
    });

    expect(
      await menuTablesService.authenticateGuestSession(expiredToken),
    ).toBeUndefined();
    expect(
      await menuTablesService.authenticateGuestSession(idleToken),
    ).toBeUndefined();
    expect(
      await menuTablesService.authenticateGuestSession(liveToken),
    ).toBeDefined();
  });
});
