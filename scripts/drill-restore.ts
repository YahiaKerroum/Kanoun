import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createDatabasePool,
  createServiceMetrics,
  type DatabasePool,
  type ServiceMetrics,
} from "@rms/building-blocks";
import {
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresKitchenStore,
  PostgresMenuStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
} from "@rms/modules";
import {
  MenuTablesService,
  OrderSubmissionService,
  PaymentCompletionService,
  PostgresServiceWorkflow,
  TenantOwnerService,
  type CredentialTokenDelivery,
} from "@rms/service-workflow";
import { resetDemoDatabase, removeMarkedDatabase } from "./demo-database.js";
import {
  inspectDemoPostgresCapabilities,
  selectDemoPostgresMode,
  startIsolatedDemoPostgres,
  type IsolatedDemoPostgresRuntime,
} from "./demo-postgres.js";
import { generatedDemoPassword } from "./demo-secrets.js";
import {
  createDrillRestoreConfig,
  type DrillDatabaseTarget,
  type DrillRestoreConfig,
} from "./drill-restore-config.js";

function retarget(
  target: DrillDatabaseTarget,
  isolatedAdminUrl: string,
): DrillDatabaseTarget {
  const base = new URL(isolatedAdminUrl);
  const databaseUrl = new URL(base);
  databaseUrl.pathname = `/${target.databaseName}`;
  return {
    ...target,
    databaseUrl: databaseUrl.toString(),
    databaseHost: base.hostname,
    databasePort: base.port ? Number(base.port) : 5432,
    adminDatabaseUrl: base.toString(),
  };
}

async function preparePostgres(config: DrillRestoreConfig): Promise<{
  readonly config: DrillRestoreConfig;
  close(): Promise<void>;
}> {
  const capabilities = await inspectDemoPostgresCapabilities(
    config.adminDatabaseUrl,
  );
  if (selectDemoPostgresMode(capabilities) === "existing") {
    return { config, close: () => Promise.resolve() };
  }
  console.log(
    "The configured PostgreSQL role cannot create databases; starting an owned, isolated local cluster for this run.",
  );
  const isolated: IsolatedDemoPostgresRuntime = await startIsolatedDemoPostgres(
    config.source,
  );
  return {
    config: {
      ...config,
      adminDatabaseUrl: isolated.config.adminDatabaseUrl,
      source: retarget(config.source, isolated.config.adminDatabaseUrl),
      restored: retarget(config.restored, isolated.config.adminDatabaseUrl),
    },
    close: () => isolated.close(),
  };
}

const executeFile = promisify(execFile);
const repositoryRoot = process.cwd();
const drillSecret = "rms-drill-restore-identity-secret-32-bytes-min";
const guestSecret = "rms-drill-restore-guest-access-secret-32-bytes";

function metadata() {
  const correlationId = randomUUID();
  return { correlationId, causationId: correlationId, now: new Date() };
}

async function applyMigrations(connectionString: string): Promise<void> {
  await executeFile(
    process.execPath,
    [join(repositoryRoot, "node_modules", "drizzle-kit", "bin.cjs"), "migrate"],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: connectionString },
      windowsHide: true,
    },
  );
}

interface SeededTenant {
  readonly businessAccountId: string;
  readonly paymentId: string;
  readonly refundAmount: string;
  readonly orderTotal: string;
}

async function seedTenant(
  pool: DatabasePool,
  label: string,
): Promise<SeededTenant> {
  const workflow = new PostgresServiceWorkflow(pool);
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const menu = new PostgresMenuStore();
  const tables = new PostgresTablesStore();
  const ordering = new PostgresOrderingStore();
  const kitchen = new PostgresKitchenStore();
  const audit = new PostgresAuditWriter();
  const identitySecurity = new IdentitySecurity(drillSecret);
  const tokenDelivery: CredentialTokenDelivery = {
    deliverRecoveryToken() {
      return Promise.resolve();
    },
  };
  const tenantOwnerService = new TenantOwnerService({
    databasePool: pool,
    workflow,
    restaurantConfiguration,
    identityAccess,
    identitySecurity,
    audit,
    credentialTokenDelivery: tokenDelivery,
    ordering,
    tables,
  });
  const menuTablesService = new MenuTablesService({
    databasePool: pool,
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
    databasePool: pool,
    workflow,
    restaurantConfiguration,
    menu,
    tables,
    ordering,
    kitchen,
    audit,
    idempotencySecret: guestSecret,
  });
  const paymentsStore = new PostgresPaymentsStore();
  const paymentService = new PaymentCompletionService({
    databasePool: pool,
    workflow,
    restaurantConfiguration,
    menu,
    tables,
    ordering,
    kitchen,
    payments: paymentsStore,
    audit,
    idempotencySecret: guestSecret,
  });

  const businessCode = `drill-${label}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `owner-${businessCode}@drill.test`;
  const ownerPassword = generatedDemoPassword();
  const tenant = await tenantOwnerService.bootstrapTenant(
    {
      businessCode,
      businessName: `PR-07 Restore Drill ${label}`,
      restaurantName: `Restore Drill Kitchen ${label}`,
      branch: {
        name: "Main Branch",
        address: { line1: "1 Drill Way", city: "Algiers", countryCode: "DZ" },
        contact: { email: `branch-${businessCode}@drill.test` },
        timeZone: "Africa/Algiers",
        currency: "DZD",
        openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          opensAt: "00:00",
          closesAt: "23:59",
        })),
      },
      owner: {
        displayName: `Drill Owner ${label}`,
        email: ownerEmail,
        password: ownerPassword,
      },
    },
    metadata(),
  );
  const login = await tenantOwnerService.login(
    { businessCode, email: ownerEmail, password: ownerPassword },
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
    { restaurantId: tenant.restaurant.id, name: "Mains", displayOrder: 0 },
    metadata(),
  );
  const dish = await menuTablesService.createDish(
    login.context,
    {
      restaurantId: tenant.restaurant.id,
      categoryId: category.id,
      name: "Drill Dish",
      basePrice: { amount: "1000.00", currency: "DZD" },
      displayOrder: 0,
    },
    metadata(),
  );
  const table = await menuTablesService.createTable(
    login.context,
    tenant.branch.id,
    { code: "D-1" },
    metadata(),
  );
  const qr = await menuTablesService.issueTableQrCode(
    login.context,
    table.id,
    metadata(),
  );
  const exchange = await menuTablesService.exchangeTableQr(
    qr.rawToken,
    metadata(),
  );
  const guestContext = await menuTablesService.authenticateGuestSession(
    exchange.sessionToken,
  );
  if (!guestContext) {
    throw new Error("Restore drill seeding requires a valid guest context.");
  }
  const currentMenu = await menu.getMenu(
    pool,
    tenant.businessAccountId,
    tenant.restaurant.id,
  );
  if (!currentMenu) {
    throw new Error("Restore drill seeding could not read the seeded menu.");
  }
  const order = await orderService.submitGuestOrder(
    guestContext,
    {
      menuVersion: currentMenu.version,
      customerName: `Guest ${label}`,
      items: [{ dishId: dish.id, quantity: 2, optionIds: [] }],
    },
    `drill-submit-${randomUUID()}`,
    metadata(),
  );
  const paid = await paymentService.recordPayment(
    login.context,
    order.id,
    {
      amount: order.total,
      method: "card",
      externalReference: `DRILL-${label}`,
    },
    `drill-pay-${randomUUID()}`,
    metadata(),
  );
  const refundAmount = { amount: "500.00", currency: order.total.currency };
  await paymentService.recordRefund(
    login.context,
    paid.payment.id,
    {
      amount: refundAmount,
      reason: "Restore drill refund evidence",
      confirmed: true,
    },
    `drill-refund-${randomUUID()}`,
    metadata(),
  );

  return {
    businessAccountId: tenant.businessAccountId,
    paymentId: paid.payment.id,
    refundAmount: refundAmount.amount,
    orderTotal: order.total.amount,
  };
}

async function backupDatabase(
  target: DrillDatabaseTarget,
  backupFilePath: string,
): Promise<void> {
  await executeFile(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${backupFilePath}`,
      target.databaseUrl,
    ],
    { windowsHide: true },
  );
}

async function restoreDatabase(
  target: DrillDatabaseTarget,
  backupFilePath: string,
): Promise<void> {
  await executeFile(
    "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      `--dbname=${target.databaseUrl}`,
      backupFilePath,
    ],
    { windowsHide: true },
  );
}

interface RelationComparison {
  readonly relation: string;
  readonly sourceCount: number;
  readonly restoredCount: number;
  readonly matches: boolean;
}

async function compareRowCount(
  sourcePool: DatabasePool,
  restoredPool: DatabasePool,
  relation: string,
  businessAccountId: string,
): Promise<RelationComparison> {
  const query = `select count(*)::integer as count from ${relation} where business_account_id = $1`;
  const [sourceResult, restoredResult] = await Promise.all([
    sourcePool.query<{ count: number }>(query, [businessAccountId]),
    restoredPool.query<{ count: number }>(query, [businessAccountId]),
  ]);
  const sourceCount = sourceResult.rows[0]?.count ?? 0;
  const restoredCount = restoredResult.rows[0]?.count ?? 0;
  return {
    relation,
    sourceCount,
    restoredCount,
    matches: sourceCount === restoredCount && sourceCount > 0,
  };
}

async function main(): Promise<void> {
  const requested: DrillRestoreConfig = createDrillRestoreConfig(process.env);
  const postgres = await preparePostgres(requested);
  const config = postgres.config;
  console.log(`Restore drill run ${config.runId}`);
  const serviceMetrics: ServiceMetrics = createServiceMetrics();

  try {
    await resetDemoDatabase(config.source);
    await applyMigrations(config.source.databaseUrl);
    const sourcePool = createDatabasePool({
      connectionString: config.source.databaseUrl,
      applicationName: "rms-drill-restore-source",
      maximumConnections: 4,
    });
    const tenants: SeededTenant[] = [];
    try {
      tenants.push(await seedTenant(sourcePool, "alpha"));
      tenants.push(await seedTenant(sourcePool, "bravo"));
    } finally {
      await sourcePool.end();
    }

    const backupStartedAt = Date.now();
    await backupDatabase(config.source, config.backupFilePath);
    const backupCompletedAt = Date.now();
    const backupElapsedMs = backupCompletedAt - backupStartedAt;

    await resetDemoDatabase(config.restored);
    const restoreStartedAt = Date.now();
    await restoreDatabase(config.restored, config.backupFilePath);
    const restoreCompletedAt = Date.now();
    const restoreElapsedMs = restoreCompletedAt - restoreStartedAt;
    const totalElapsedMs = restoreCompletedAt - backupStartedAt;

    serviceMetrics.setBackupLastSuccessAgeSeconds(
      (Date.now() - backupCompletedAt) / 1_000,
    );

    const readSourcePool = createDatabasePool({
      connectionString: config.source.databaseUrl,
      applicationName: "rms-drill-restore-compare-source",
      maximumConnections: 4,
    });
    const restoredPool = createDatabasePool({
      connectionString: config.restored.databaseUrl,
      applicationName: "rms-drill-restore-compare-restored",
      maximumConnections: 4,
    });

    const relations = [
      "restaurant.restaurants",
      "identity.users",
      "ordering.orders",
      "payments.payments",
      "payments.refunds",
      "audit.audit_events",
    ];
    const comparisons: RelationComparison[] = [];
    try {
      for (const tenant of tenants) {
        for (const relation of relations) {
          const comparison = await compareRowCount(
            readSourcePool,
            restoredPool,
            relation,
            tenant.businessAccountId,
          );
          comparisons.push(comparison);
          if (!comparison.matches) {
            serviceMetrics.countPaymentReconciliationFailure();
          }
        }
      }

      const crossTenantLeaks: string[] = [];
      for (const tenant of tenants) {
        for (const other of tenants) {
          if (other.businessAccountId === tenant.businessAccountId) continue;
          const leak = await restoredPool.query<{ count: number }>(
            `select count(*)::integer as count from ordering.orders
           where business_account_id = $1
             and id in (
               select id from ordering.orders where business_account_id = $2
             )`,
            [tenant.businessAccountId, other.businessAccountId],
          );
          if ((leak.rows[0]?.count ?? 0) > 0) {
            crossTenantLeaks.push(
              `${tenant.businessAccountId} vs ${other.businessAccountId}`,
            );
            serviceMetrics.countTenantIsolationSignal();
          }
        }
      }

      const outboxComparison = await compareRowCount(
        readSourcePool,
        restoredPool,
        "platform.outbox_messages",
        tenants[0]?.businessAccountId ?? "",
      );

      const rtoTargetHours = 4;
      const rtoOk = totalElapsedMs <= rtoTargetHours * 60 * 60 * 1_000;

      const report = {
        runId: config.runId,
        recordedAtUtc: new Date().toISOString(),
        timing: {
          backupElapsedMs,
          restoreElapsedMs,
          totalElapsedMs,
          rtoTargetHours,
          rtoWithinTarget: rtoOk,
        },
        tenants: tenants.map((tenant) => ({
          businessAccountId: tenant.businessAccountId,
          orderTotal: tenant.orderTotal,
          refundAmount: tenant.refundAmount,
        })),
        relationComparisons: comparisons,
        outboxReconciliation: outboxComparison,
        crossTenantLeaks,
        allRelationsMatch: comparisons.every(
          (comparison) => comparison.matches,
        ),
        tenantIsolationHeld: crossTenantLeaks.length === 0,
        metricsSnapshot: serviceMetrics.snapshot(),
        notes: [
          "This drill runs against isolated loopback PostgreSQL databases created and dropped by this script; it does not touch a production backup or managed PITR path, which remains blocked on ADR-0007.",
          "RTO is measured for the backup-plus-restore path exercised here; production RTO/RPO depend on the eventual managed PostgreSQL platform.",
        ],
      };

      const outputDirectory = join(
        repositoryRoot,
        "output",
        "drills",
        `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}-${config.runId}`,
      );
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        join(outputDirectory, "report.json"),
        JSON.stringify(report, null, 2),
        "utf8",
      );
      await writeFile(
        join(outputDirectory, "report.md"),
        renderMarkdown(report),
        "utf8",
      );
      console.log(`Restore-drill report written to ${outputDirectory}`);
      console.log(
        JSON.stringify(
          {
            allRelationsMatch: report.allRelationsMatch,
            tenantIsolationHeld: report.tenantIsolationHeld,
            timing: report.timing,
          },
          null,
          2,
        ),
      );

      if (!report.allRelationsMatch || !report.tenantIsolationHeld) {
        throw new Error(
          "Restore drill found a relation mismatch or a tenant-isolation leak; see the report for detail.",
        );
      }
      if (!rtoOk) {
        throw new Error(
          `Restore drill exceeded the ${rtoTargetHours}-hour RTO target: ${String(totalElapsedMs)}ms.`,
        );
      }
    } finally {
      await readSourcePool.end();
      await restoredPool.end();
      await removeMarkedDatabase(config.source);
      await removeMarkedDatabase(config.restored);
      await rm(config.backupFilePath, { force: true });
    }
  } finally {
    await postgres.close();
  }
}

function renderMarkdown(report: {
  readonly runId: string;
  readonly recordedAtUtc: string;
  readonly timing: {
    readonly backupElapsedMs: number;
    readonly restoreElapsedMs: number;
    readonly totalElapsedMs: number;
    readonly rtoTargetHours: number;
    readonly rtoWithinTarget: boolean;
  };
  readonly relationComparisons: readonly RelationComparison[];
  readonly outboxReconciliation: RelationComparison;
  readonly crossTenantLeaks: readonly string[];
  readonly allRelationsMatch: boolean;
  readonly tenantIsolationHeld: boolean;
  readonly notes: readonly string[];
}): string {
  const rows = report.relationComparisons
    .map(
      (comparison) =>
        `| ${comparison.relation} | ${comparison.sourceCount} | ${comparison.restoredCount} | ${comparison.matches ? "match" : "MISMATCH"} |`,
    )
    .join("\n");
  return `# Isolated backup/restore drill report

Run: ${report.runId}
Recorded: ${report.recordedAtUtc}
Backup elapsed: ${String(report.timing.backupElapsedMs)}ms
Restore elapsed: ${String(report.timing.restoreElapsedMs)}ms
Total (RTO) elapsed: ${String(report.timing.totalElapsedMs)}ms against a ${String(report.timing.rtoTargetHours)}-hour target (${report.timing.rtoWithinTarget ? "within target" : "EXCEEDED"})

## Per-tenant relation comparison (source vs restored)

| Relation | Source count | Restored count | Result |
|---|---|---|---|
${rows}

Outbox reconciliation (${report.outboxReconciliation.relation}): source ${report.outboxReconciliation.sourceCount}, restored ${report.outboxReconciliation.restoredCount} (${report.outboxReconciliation.matches ? "match" : "MISMATCH"}).

Tenant isolation: ${report.tenantIsolationHeld ? "held — no cross-tenant rows found in the restored database" : `FAILED — leaks: ${report.crossTenantLeaks.join(", ")}`}.

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

await main();
