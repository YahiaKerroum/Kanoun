import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  createDatabasePool,
  PostgresOutboxProcessor,
} from "@rms/building-blocks";
import {
  IdentitySecurity,
  NotificationService,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresKitchenStore,
  PostgresMenuStore,
  PostgresNotificationStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresReportingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  ReportingService,
} from "@rms/modules";
import {
  KitchenServingService,
  MenuTablesService,
  OrderSubmissionService,
  PaymentCompletionService,
  PostgresServiceWorkflow,
  TenantOwnerService,
} from "@rms/service-workflow";
import { resetDemoDatabase } from "./demo-database.js";
import { parseDemoConfig, type DemoConfig } from "./demo-config.js";
import { generatedDemoPassword, generatedDemoSecret } from "./demo-secrets.js";
import {
  DEMO_ROLE_DEFINITIONS,
  DEMO_SCENARIO,
  type DemoSeedResult,
} from "./demo-types.js";

const demoBusinessCode = "dar-nedjma-demo";
const executeFile = promisify(execFile);

function algerianServiceNoon(): Date {
  const formattedParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const year = formattedParts.find((part) => part.type === "year")?.value;
  const month = formattedParts.find((part) => part.type === "month")?.value;
  const day = formattedParts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(
      "Could not resolve the Algerian business date for the demo seed.",
    );
  }
  return new Date(`${year}-${month}-${day}T12:00:00.000+01:00`);
}

const demoNow = algerianServiceNoon();

function metadata(now = demoNow) {
  const correlationId = randomUUID();
  return { correlationId, causationId: correlationId, now };
}

async function applyMigrations(connectionString: string): Promise<void> {
  await executeFile(
    process.execPath,
    ["./node_modules/drizzle-kit/bin.cjs", "migrate"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString },
    },
  );
}

function configured(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export interface DemoSeedOptions {
  readonly config: DemoConfig;
  readonly password: string;
  readonly sessionSecret: string;
  readonly guestAccessSecret: string;
  readonly customerWebOrigin: string;
}

export async function seedDemo(
  options: DemoSeedOptions,
): Promise<DemoSeedResult> {
  const connectionString = options.config.databaseUrl;
  const demoPassword = options.password;
  const sessionSecret = options.sessionSecret;
  const guestAccessSecret = options.guestAccessSecret;
  const customerWebOrigin = options.customerWebOrigin;
  await resetDemoDatabase(options.config);
  const customerImageUrl = (filename: string): string =>
    new URL(`/images/${filename}`, customerWebOrigin).toString();
  await applyMigrations(connectionString);
  const databasePool = createDatabasePool({
    connectionString,
    applicationName: "rms-demo-seed",
  });

  try {
    const workflow = new PostgresServiceWorkflow(databasePool);
    const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
    const identityAccess = new PostgresIdentityAccessStore();
    const menu = new PostgresMenuStore();
    const tables = new PostgresTablesStore();
    const ordering = new PostgresOrderingStore();
    const kitchen = new PostgresKitchenStore();
    const payments = new PostgresPaymentsStore();
    const audit = new PostgresAuditWriter();
    const identitySecurity = new IdentitySecurity(sessionSecret);
    const tenantOwner = new TenantOwnerService({
      databasePool,
      workflow,
      restaurantConfiguration,
      identityAccess,
      identitySecurity,
      audit,
      credentialTokenDelivery: {
        deliverRecoveryToken: () => Promise.resolve(),
      },
      ordering,
      tables,
    });
    const menuTables = new MenuTablesService({
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
    const orders = new OrderSubmissionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      audit,
      idempotencySecret: guestAccessSecret,
    });
    const kitchenService = new KitchenServingService({
      databasePool,
      workflow,
      restaurantConfiguration,
      kitchen,
      ordering,
      audit,
      idempotencySecret: guestAccessSecret,
    });
    const paymentsService = new PaymentCompletionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      payments,
      audit,
      idempotencySecret: guestAccessSecret,
    });

    const bootstrapped = await tenantOwner.bootstrapTenant(
      {
        businessCode: demoBusinessCode,
        businessName: "Dar Nedjma Hospitality",
        restaurantName: "Dar Nedjma",
        branch: {
          name: "Hydra",
          address: {
            line1: "18 Chemin Sidi Yahia",
            city: "Algiers",
            countryCode: "DZ",
          },
          contact: {
            email: "hydra@dar-nedjma.demo",
            phone: "+213 560 00 12 12",
          },
          timeZone: "Africa/Algiers",
          currency: "DZD",
          openingHours: [
            { dayOfWeek: 0, opensAt: "11:30", closesAt: "23:00" },
            { dayOfWeek: 1, opensAt: "11:30", closesAt: "23:00" },
            { dayOfWeek: 2, opensAt: "11:30", closesAt: "23:00" },
            { dayOfWeek: 3, opensAt: "11:30", closesAt: "23:00" },
            { dayOfWeek: 4, opensAt: "11:30", closesAt: "23:00" },
            { dayOfWeek: 5, opensAt: "11:30", closesAt: "23:30" },
            { dayOfWeek: 6, opensAt: "11:30", closesAt: "23:30" },
          ],
        },
        owner: {
          displayName: "Nadia Cheriet",
          email: "nadia.cheriet@dar-nedjma.demo",
          password: demoPassword,
        },
      },
      metadata(),
    );
    const owner = await tenantOwner.login(
      {
        businessCode: demoBusinessCode,
        email: "nadia.cheriet@dar-nedjma.demo",
        password: demoPassword,
      },
      metadata(),
    );
    const ownerContext = owner.context;
    const branch = await tenantOwner.updateBranch(
      ownerContext,
      {
        branchId: bootstrapped.branch.id,
        expectedVersion: bootstrapped.branch.version,
        serviceStatus: "open",
      },
      metadata(),
    );

    for (const role of DEMO_ROLE_DEFINITIONS.slice(1)) {
      const employee = await tenantOwner.createEmployee(
        ownerContext,
        {
          restaurantId: bootstrapped.restaurant.id,
          displayName: role.displayName,
          email: role.email,
          branchIds: [branch.id],
        },
        metadata(),
      );
      const permissionSet = await tenantOwner.getEmployeePermissions(
        ownerContext,
        employee.id,
      );
      await tenantOwner.applyPermissionTemplate(
        ownerContext,
        employee.id,
        role.templateKey,
        permissionSet.version,
        "Apply the demo staff role.",
        metadata(),
      );
      const invitation = await tenantOwner.inviteStaff(
        ownerContext,
        employee.id,
        metadata(),
      );
      await tenantOwner.acceptInvitation(
        invitation.invitationToken,
        demoPassword,
        metadata(),
      );
    }

    const mains = await menuTables.createCategory(
      ownerContext,
      {
        restaurantId: bootstrapped.restaurant.id,
        name: "Mains",
        displayOrder: 1,
      },
      metadata(),
    );
    const drinks = await menuTables.createCategory(
      ownerContext,
      {
        restaurantId: bootstrapped.restaurant.id,
        name: "Drinks",
        displayOrder: 2,
      },
      metadata(),
    );
    const couscous = await menuTables.createDish(
      ownerContext,
      {
        restaurantId: bootstrapped.restaurant.id,
        categoryId: mains.id,
        name: "Couscous royale",
        description:
          "Steamed semolina with lamb, merguez, and seasonal vegetables.",
        imageUrl: customerImageUrl("couscous-royale.webp"),
        basePrice: { amount: "1850.00", currency: "DZD" },
        displayOrder: 1,
      },
      metadata(),
    );
    const rechta = await menuTables.createDish(
      ownerContext,
      {
        restaurantId: bootstrapped.restaurant.id,
        categoryId: mains.id,
        name: "Rechta au poulet",
        description: "Hand-cut noodles with chicken, turnips, and chickpeas.",
        imageUrl: customerImageUrl("rechta.webp"),
        basePrice: { amount: "2400.00", currency: "DZD" },
        displayOrder: 2,
      },
      metadata(),
    );
    const tea = await menuTables.createDish(
      ownerContext,
      {
        restaurantId: bootstrapped.restaurant.id,
        categoryId: drinks.id,
        name: "Thé à la menthe",
        description: "Fresh mint tea served in a traditional glass.",
        basePrice: { amount: "350.00", currency: "DZD" },
        displayOrder: 1,
      },
      metadata(),
    );
    const [mainTable, terraceTable] = await Promise.all([
      menuTables.createTable(
        ownerContext,
        branch.id,
        { code: "T-12", area: "Salle principale" },
        metadata(),
      ),
      menuTables.createTable(
        ownerContext,
        branch.id,
        { code: "T-08", area: "Terrasse" },
        metadata(),
      ),
      menuTables.createTable(
        ownerContext,
        branch.id,
        { code: "T-04", area: "Salon" },
        metadata(),
      ),
    ]);
    const mainTableQr = await menuTables.issueTableQrCode(
      ownerContext,
      mainTable.id,
      metadata(),
    );
    const menuVersion = await menuTables.getMenuVersion(
      ownerContext,
      bootstrapped.restaurant.id,
    );
    await orders.createStaffOrder(
      ownerContext,
      mainTable.id,
      {
        menuVersion,
        customerName: "Amel Benkhaled",
        items: [{ dishId: couscous.id, quantity: 2, optionIds: [] }],
      },
      "demo-open-order-v1",
      metadata(),
    );
    const settledOrder = await orders.createStaffOrder(
      ownerContext,
      terraceTable.id,
      {
        menuVersion,
        customerName: "Karim Bouzid",
        items: [
          { dishId: rechta.id, quantity: 1, optionIds: [] },
          { dishId: tea.id, quantity: 1, optionIds: [] },
        ],
      },
      "demo-settled-order-v1",
      metadata(),
    );
    const queue = await kitchenService.getKitchenQueue(ownerContext, branch.id);
    for (const workItem of queue.filter(
      (item) => item.orderId === settledOrder.id,
    )) {
      const started = await kitchenService.startKitchenWorkItem(
        ownerContext,
        workItem.id,
        workItem.version,
        undefined,
        `demo-start-${workItem.id}`,
        metadata(),
      );
      await kitchenService.markKitchenWorkItemReady(
        ownerContext,
        started.id,
        started.version,
        undefined,
        `demo-ready-${started.id}`,
        metadata(),
      );
    }
    const readyOrder = await orders.listStaffOrders(ownerContext, {
      branchId: branch.id,
      pageSize: 50,
      fulfilment: "ready",
    });
    const served = await kitchenService.markOrderServed(
      ownerContext,
      settledOrder.id,
      readyOrder.items.find((order) => order.id === settledOrder.id)?.version ??
        0,
      undefined,
      "demo-serve-order-v1",
      metadata(),
    );
    const paymentResult = await paymentsService.recordPayment(
      ownerContext,
      served.id,
      {
        amount: served.total,
        method: "card",
        externalReference: "CIB-ALG-DEMO-2400",
      },
      "demo-payment-v1",
      metadata(),
    );
    await paymentsService.recordRefund(
      ownerContext,
      paymentResult.payment.id,
      {
        amount: { amount: "500.00", currency: "DZD" },
        reason: "Courtesy adjustment for a delayed side dish.",
        confirmed: true,
      },
      "demo-refund-v1",
      metadata(),
    );

    const notificationService = new NotificationService({
      databasePool,
      store: new PostgresNotificationStore(),
      identityAccess,
      restaurantConfiguration,
    });
    const reportingService = new ReportingService({
      databasePool,
      store: new PostgresReportingStore(),
      restaurantConfiguration,
    });
    const outbox = new PostgresOutboxProcessor(databasePool, {
      workerId: "rms-demo-seed",
      handlers: [notificationService, reportingService],
      leaseMilliseconds: 30_000,
      maximumAttempts: 5,
      now: () => demoNow,
    });
    let outboxResult = await outbox.processNext();
    while (outboxResult === "processed") {
      outboxResult = await outbox.processNext();
    }
    console.log(
      `Seeded ${demoBusinessCode}: ${bootstrapped.restaurant.name} / ${branch.name} with staff, menu, tables, orders, payments, refunds, audit, notifications, and reports.`,
    );
    return {
      businessCode: demoBusinessCode,
      businessName: "Dar Nedjma Hospitality",
      restaurantName: bootstrapped.restaurant.name,
      branchName: branch.name,
      roles: DEMO_ROLE_DEFINITIONS.map((role) => ({
        key: role.key,
        label: role.label,
        displayName: role.displayName,
        email: role.email,
        target: role.target,
        password: demoPassword,
      })),
      customerUrls: [{ tableCode: mainTable.code, url: mainTableQr.qrUrl }],
      scenario: DEMO_SCENARIO,
    };
  } finally {
    await databasePool.end();
  }
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = parseDemoConfig(process.env);
  const result = await seedDemo({
    config,
    password: config.seedPassword ?? generatedDemoPassword(),
    sessionSecret: configured("SESSION_SECRET", generatedDemoSecret()),
    guestAccessSecret: configured("GUEST_ACCESS_SECRET", generatedDemoSecret()),
    customerWebOrigin: configured(
      "CUSTOMER_WEB_ORIGIN",
      "http://127.0.0.1:5174",
    ),
  });
  console.log(
    `Demo seed ready for ${result.businessCode}: ${result.roles.length} roles and ${result.customerUrls.length} table QR URL.`,
  );
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
