import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDatabasePool } from "@rms/building-blocks";
import {
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresMenuStore,
  PostgresOrderingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
} from "@rms/modules";
import {
  MenuTablesService,
  PostgresServiceWorkflow,
  TenantOwnerService,
  type CredentialTokenDelivery,
} from "@rms/service-workflow";
import { resetDemoDatabase, removeMarkedDatabase } from "./demo-database.js";
import {
  startManagedDemoProcess,
  waitForDatabase,
  waitForHttp,
  type ManagedDemoProcess,
} from "./demo-process.js";
import {
  inspectDemoPostgresCapabilities,
  selectDemoPostgresMode,
  startIsolatedDemoPostgres,
  type IsolatedDemoPostgresRuntime,
} from "./demo-postgres.js";
import { generatedDemoPassword } from "./demo-secrets.js";
import {
  createLoadProfileConfig,
  LOAD_PROFILE,
  type LoadProfileConfig,
} from "./load-profile-config.js";

const executeFile = promisify(execFile);
const repositoryRoot = process.cwd();

interface SeededMenu {
  readonly dishId: string;
  readonly optionId: string;
  readonly menuVersion: number;
}

interface SeededScenario {
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly businessCode: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
  readonly menu: SeededMenu;
  readonly qrTokensByTable: readonly string[];
}

function metadata() {
  const correlationId = randomUUID();
  return { correlationId, causationId: correlationId, now: new Date() };
}

async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  worker: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let cursor = 0;
  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runOne),
  );
  return results;
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

async function seedScenario(
  config: LoadProfileConfig,
): Promise<SeededScenario> {
  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-load-profile-seed",
    maximumConnections: 8,
  });
  try {
    const workflow = new PostgresServiceWorkflow(pool);
    const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
    const identityAccess = new PostgresIdentityAccessStore();
    const menu = new PostgresMenuStore();
    const tables = new PostgresTablesStore();
    const ordering = new PostgresOrderingStore();
    const audit = new PostgresAuditWriter();
    const identitySecurity = new IdentitySecurity(config.sessionSecret);
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
      guestAccessSecret: config.guestAccessSecret,
      customerWebOrigin: config.customerWebOrigin,
    });

    const businessCode = `load-${config.runId}`;
    const ownerEmail = `owner-${config.runId}@load-profile.test`;
    const ownerPassword = generatedDemoPassword();
    const tenant = await tenantOwnerService.bootstrapTenant(
      {
        businessCode,
        businessName: `PR-07 Load Profile ${config.runId}`,
        restaurantName: "Load Profile Restaurant",
        branch: {
          name: "Main Branch",
          address: {
            line1: "1 Load Profile Way",
            city: "Algiers",
            countryCode: "DZ",
          },
          contact: { email: `branch-${config.runId}@load-profile.test` },
          timeZone: "Africa/Algiers",
          currency: "DZD",
          openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            opensAt: "00:00",
            closesAt: "23:59",
          })),
        },
        owner: {
          displayName: "Load Profile Owner",
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

    const categoryCount = 20;
    const dishesPerCategory = Math.ceil(LOAD_PROFILE.dishCount / categoryCount);
    const categories = await mapWithConcurrency(
      Array.from({ length: categoryCount }, (_, index) => index),
      5,
      (index) =>
        menuTablesService.createCategory(
          login.context,
          {
            restaurantId: tenant.restaurant.id,
            name: `Category ${index + 1}`,
            displayOrder: index,
          },
          metadata(),
        ),
    );

    const dishSpecs = categories
      .flatMap((category, categoryIndex) =>
        Array.from({ length: dishesPerCategory }, (_, dishIndex) => ({
          category,
          name: `Dish ${categoryIndex + 1}-${dishIndex + 1}`,
          displayOrder: dishIndex,
        })),
      )
      .slice(0, LOAD_PROFILE.dishCount);

    const dishes = await mapWithConcurrency(dishSpecs, 10, (spec) =>
      menuTablesService.createDish(
        login.context,
        {
          restaurantId: tenant.restaurant.id,
          categoryId: spec.category.id,
          name: spec.name,
          basePrice: { amount: "1000.00", currency: "DZD" },
          displayOrder: spec.displayOrder,
        },
        metadata(),
      ),
    );
    const firstDish = dishes[0];
    if (!firstDish) {
      throw new Error("Load profile seeding requires at least one dish.");
    }
    const group = await menuTablesService.createOptionGroup(
      login.context,
      {
        dishId: firstDish.id,
        name: "Size",
        selectionType: "single",
        isRequired: true,
        minimumSelections: 1,
        maximumSelections: 1,
        displayOrder: 0,
        options: [
          {
            name: "Regular",
            priceDelta: { amount: "0.00", currency: "DZD" },
            displayOrder: 0,
          },
        ],
      },
      metadata(),
    );
    const option = group.options[0];
    if (!option) {
      throw new Error("Load profile seeding requires at least one option.");
    }
    const currentMenu = await menu.getMenu(
      pool,
      tenant.businessAccountId,
      tenant.restaurant.id,
    );
    if (!currentMenu) {
      throw new Error("Load profile seeding could not read the seeded menu.");
    }

    const tableSpecs = Array.from(
      { length: LOAD_PROFILE.tableCount },
      (_, index) => `T-${index + 1}`,
    );
    const tables_ = await mapWithConcurrency(tableSpecs, 10, (code) =>
      menuTablesService.createTable(
        login.context,
        tenant.branch.id,
        { code },
        metadata(),
      ),
    );
    const qrTables = tables_.slice(0, LOAD_PROFILE.guestSessionCount);
    const qrTokens = await mapWithConcurrency(qrTables, 10, async (table) => {
      const qr = await menuTablesService.issueTableQrCode(
        login.context,
        table.id,
        metadata(),
      );
      return qr.rawToken;
    });

    return {
      businessAccountId: tenant.businessAccountId,
      restaurantId: tenant.restaurant.id,
      branchId: tenant.branch.id,
      businessCode,
      ownerEmail,
      ownerPassword,
      menu: {
        dishId: firstDish.id,
        optionId: option.id,
        menuVersion: currentMenu.version,
      },
      qrTokensByTable: qrTokens,
    };
  } finally {
    await pool.end();
  }
}

function runtimeEnvironment(config: LoadProfileConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: new URL(config.apiOrigin).port,
    DATABASE_URL: config.databaseUrl,
    SESSION_SECRET: config.sessionSecret,
    BOOTSTRAP_SECRET: config.bootstrapSecret,
    SUPPORT_ACCESS_SECRET: config.supportAccessSecret,
    GUEST_ACCESS_SECRET: config.guestAccessSecret,
    SESSION_COOKIE_SECURE: "false",
    WEB_ORIGIN: config.staffWebOrigin,
    CUSTOMER_WEB_ORIGIN: config.customerWebOrigin,
    WORKER_ID: config.workerId,
    LOG_LEVEL: "warn",
  };
}

async function startStack(config: LoadProfileConfig): Promise<{
  readonly api: ManagedDemoProcess;
  readonly worker: ManagedDemoProcess;
  stop(): Promise<void>;
}> {
  const environment = runtimeEnvironment(config);
  const secrets = [
    config.sessionSecret,
    config.bootstrapSecret,
    config.supportAccessSecret,
    config.guestAccessSecret,
  ];
  const api = startManagedDemoProcess({
    label: "load-profile-api",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "api", "dist", "server.js")],
    cwd: repositoryRoot,
    env: environment,
    secrets,
  });
  const worker = startManagedDemoProcess({
    label: "load-profile-worker",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "worker", "dist", "worker.js")],
    cwd: repositoryRoot,
    env: { ...environment, LOG_LEVEL: "info" },
    secrets,
  });
  try {
    await Promise.all([
      waitForHttp(`${config.apiOrigin}/health/ready`),
      worker.waitForText("Worker process is ready; outbox dispatch is active"),
    ]);
  } catch (error) {
    await Promise.all([api.terminate(), worker.terminate()]);
    throw error;
  }
  return {
    api,
    worker,
    async stop() {
      await Promise.all([api.terminate(), worker.terminate()]);
    },
  };
}

/**
 * A freshly initialized local isolated PostgreSQL cluster can briefly
 * restart its backends under an initial burst of new connections (the API
 * and worker each opening a pool at the same moment); the cluster recovers
 * within seconds. Retry the stack start after confirming the database is
 * reachable again rather than failing the whole run on that transient state.
 */
async function startStackWithRetry(
  config: LoadProfileConfig,
  attempts = 3,
): Promise<{
  readonly api: ManagedDemoProcess;
  readonly worker: ManagedDemoProcess;
  stop(): Promise<void>;
}> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await startStack(config);
    } catch (error) {
      lastError = error;
      console.log(
        `Stack start attempt ${String(attempt)}/${String(attempts)} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt === attempts) break;
      await waitForDatabase(config.adminDatabaseUrl, 30_000);
    }
  }
  throw lastError;
}

interface Sample {
  readonly durationMs: number;
  readonly ok: boolean;
  readonly errorReason?: string;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] ?? 0;
}

interface LatencySummary {
  readonly count: number;
  readonly errors: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly errorReasons: Readonly<Record<string, number>>;
}

function summarize(samples: readonly Sample[]): LatencySummary {
  const durations = samples
    .map((sample) => sample.durationMs)
    .sort((left, right) => left - right);
  const errorReasons: Record<string, number> = {};
  for (const sample of samples) {
    if (sample.ok || !sample.errorReason) continue;
    errorReasons[sample.errorReason] =
      (errorReasons[sample.errorReason] ?? 0) + 1;
  }
  return {
    count: samples.length,
    errors: samples.filter((sample) => !sample.ok).length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations.at(-1) ?? 0,
    errorReasons,
  };
}

async function timed(
  action: () => Promise<Response>,
): Promise<Sample & { readonly response?: Response }> {
  const startedAt = performance.now();
  try {
    const response = await action();
    return {
      durationMs: performance.now() - startedAt,
      ok: response.ok,
      ...(response.ok
        ? {}
        : { errorReason: `http_${String(response.status)}` }),
      response,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      ok: false,
      errorReason:
        error instanceof Error ? error.message.slice(0, 80) : "unknown_error",
    };
  }
}

function parseSetCookie(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/,(?=[^;]+?=)/u)) {
    const pair = part.trim().split(";")[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (pair && separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

interface StaffSession {
  readonly cookie: string;
  readonly csrfToken: string;
}

async function loginStaff(
  config: LoadProfileConfig,
  scenario: SeededScenario,
): Promise<StaffSession | undefined> {
  const response = await fetch(
    new URL("/api/v1/auth/login", config.apiOrigin),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessCode: scenario.businessCode,
        email: scenario.ownerEmail,
        password: scenario.ownerPassword,
      }),
    },
  );
  if (!response.ok) return undefined;
  const setCookies = response.headers.getSetCookie();
  const combined = setCookies.join(", ");
  const session = parseSetCookie(combined, "rms_staff_session");
  const csrf = parseSetCookie(combined, "rms_csrf");
  if (!session || !csrf) return undefined;
  return {
    cookie: `rms_staff_session=${session}; rms_csrf=${csrf}`,
    csrfToken: csrf,
  };
}

interface GuestSession {
  readonly cookie: string;
  readonly csrfToken: string;
}

async function exchangeGuestSession(
  config: LoadProfileConfig,
  rawToken: string,
): Promise<GuestSession | undefined> {
  const response = await fetch(
    new URL(`/api/v1/public/qr/${rawToken}/session`, config.apiOrigin),
    { method: "POST" },
  );
  if (!response.ok) return undefined;
  const setCookies = response.headers.getSetCookie();
  const session = parseSetCookie(setCookies.join(", "), "rms_guest_session");
  if (!session) return undefined;
  const body = (await response.json().catch(() => undefined)) as
    { csrfToken?: string } | undefined;
  if (!body?.csrfToken) return undefined;
  return {
    cookie: `rms_guest_session=${session}`,
    csrfToken: body.csrfToken,
  };
}

/**
 * A "concurrent session" in the PD-025 profile is a person using the
 * product, not a request generator: a guest re-checks the menu every few
 * seconds, a staff member polls a read screen on a similar cadence. Each
 * virtual user paces its own requests with randomized think-time instead of
 * looping as fast as possible, which would multiply the target concurrency
 * into an unrealistic connection-churn rate no real session count implies.
 */
async function runReadLoop(
  concurrency: number,
  deadline: number,
  thinkTimeMsRange: readonly [number, number],
  fetchOne: () => Promise<Response>,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  const [minThinkMs, maxThinkMs] = thinkTimeMsRange;
  async function worker(): Promise<void> {
    while (Date.now() < deadline) {
      const sample = await timed(fetchOne);
      samples.push(sample);
      const thinkTimeMs =
        minThinkMs + Math.random() * (maxThinkMs - minThinkMs);
      await new Promise((resolve) => setTimeout(resolve, thinkTimeMs));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return samples;
}

async function runOrderSubmissionLoop(
  config: LoadProfileConfig,
  scenario: SeededScenario,
  guestSessions: readonly GuestSession[],
  deadline: number,
  submittedAtByOrderId: Map<string, number>,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  const intervalMs = 60_000 / LOAD_PROFILE.orderSubmissionsPerMinute;
  let index = 0;
  while (Date.now() < deadline && guestSessions.length > 0) {
    const guest = guestSessions[index % guestSessions.length];
    index += 1;
    if (!guest) break;
    const submittedAt = Date.now();
    const sample = await timed(() =>
      fetch(new URL("/api/v1/public/orders", config.apiOrigin), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: guest.cookie,
          origin: config.customerWebOrigin,
          "x-csrf-token": guest.csrfToken,
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify({
          menuVersion: scenario.menu.menuVersion,
          customerName: "Load Profile Guest",
          items: [
            {
              dishId: scenario.menu.dishId,
              quantity: 1,
              optionIds: [scenario.menu.optionId],
            },
          ],
        }),
      }),
    );
    samples.push(sample);
    if (sample.ok && sample.response) {
      const body = (await sample.response.json().catch(() => undefined)) as
        { id?: string } | undefined;
      if (body?.id) {
        submittedAtByOrderId.set(body.id, submittedAt);
      }
    }
    const elapsed = Date.now() - submittedAt;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, intervalMs - elapsed)),
    );
  }
  return samples;
}

async function measureSseDelivery(
  config: LoadProfileConfig,
  staffSession: StaffSession,
  submittedAtByOrderId: Map<string, number>,
  windowMs: number,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), windowMs);
  try {
    const response = await fetch(
      new URL("/api/v1/staff/notification-events", config.apiOrigin),
      {
        headers: { cookie: staffSession.cookie, accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    if (!response.ok || !response.body) {
      console.log(`SSE connection failed: status ${String(response.status)}`);
      return samples;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawEventCount = 0;
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      finished = done;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        rawEventCount += 1;
        const receivedAt = Date.now();
        for (const [orderId, submittedAt] of submittedAtByOrderId) {
          if (dataLine.includes(orderId)) {
            samples.push({
              durationMs: receivedAt - submittedAt,
              ok: true,
            });
          }
        }
      }
    }
    console.log(
      `SSE stream ended: ${String(rawEventCount)} notification events observed.`,
    );
  } catch (error) {
    const isExpectedWindowClose =
      error instanceof Error && error.name === "AbortError";
    if (!isExpectedWindowClose) {
      console.log(
        "SSE stream error:",
        error instanceof Error ? error.message : String(error),
      );
    }
  } finally {
    clearTimeout(timeout);
  }
  return samples;
}

async function preparePostgres(config: LoadProfileConfig): Promise<{
  readonly config: LoadProfileConfig;
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
  const isolated: IsolatedDemoPostgresRuntime =
    await startIsolatedDemoPostgres(config);
  return {
    config: { ...config, ...isolated.config },
    close: () => isolated.close(),
  };
}

async function main(): Promise<void> {
  const requested = await createLoadProfileConfig(process.env);
  const postgres = await preparePostgres(requested);
  const config = postgres.config;
  console.log(
    `Load profile run ${config.runId} targeting database ${config.databaseName}`,
  );
  try {
    await waitForDatabase(config.adminDatabaseUrl);
    await resetDemoDatabase(config);
    const migrateStartedAt = Date.now();
    await applyMigrations(config.databaseUrl);
    console.log(
      `Migrations applied in ${String(Date.now() - migrateStartedAt)}ms`,
    );
    const seedStartedAt = Date.now();
    const scenario = await seedScenario(config);
    console.log(
      `Seeded ${LOAD_PROFILE.dishCount} dishes, ${LOAD_PROFILE.tableCount} tables, and ${scenario.qrTokensByTable.length} QR sessions in ${String(Date.now() - seedStartedAt)}ms.`,
    );

    const stack = await startStackWithRetry(config);
    try {
      const staffSessions = (
        await mapWithConcurrency(
          Array.from({ length: LOAD_PROFILE.staffSessionCount }, (_, i) => i),
          1,
          () => loginStaff(config, scenario),
        )
      ).filter((session): session is StaffSession => session !== undefined);
      const guestSessions = (
        await mapWithConcurrency(scenario.qrTokensByTable, 5, (rawToken) =>
          exchangeGuestSession(config, rawToken),
        )
      ).filter((session): session is GuestSession => session !== undefined);

      console.log(
        `Authenticated ${staffSessions.length}/${LOAD_PROFILE.staffSessionCount} staff sessions and ${guestSessions.length}/${LOAD_PROFILE.guestSessionCount} guest sessions.`,
      );
      if (staffSessions.length === 0 || guestSessions.length === 0) {
        throw new Error(
          "Load profile could not authenticate any staff or guest session.",
        );
      }

      const runDeadline = Date.now() + LOAD_PROFILE.runDurationSeconds * 1_000;
      const submittedAtByOrderId = new Map<string, number>();
      const sseGraceMs = 5_000;
      const firstStaffSession = staffSessions[0];
      if (!firstStaffSession) {
        throw new Error("Load profile requires at least one staff session.");
      }

      const [menuSamples, staffReadSamples, orderSamples, sseDeliverySamples] =
        await Promise.all([
          runReadLoop(
            LOAD_PROFILE.guestReadConcurrency,
            runDeadline,
            [1_000, 3_000],
            () => {
              const guest =
                guestSessions[Math.floor(Math.random() * guestSessions.length)];
              return fetch(new URL("/api/v1/public/menu", config.apiOrigin), {
                headers: { cookie: guest?.cookie ?? "" },
              });
            },
          ),
          runReadLoop(
            LOAD_PROFILE.staffReadConcurrency,
            runDeadline,
            [2_000, 5_000],
            () => {
              const staff =
                staffSessions[Math.floor(Math.random() * staffSessions.length)];
              return fetch(new URL("/api/v1/auth/session", config.apiOrigin), {
                headers: { cookie: staff?.cookie ?? "" },
              });
            },
          ),
          runOrderSubmissionLoop(
            config,
            scenario,
            guestSessions,
            runDeadline,
            submittedAtByOrderId,
          ),
          measureSseDelivery(
            config,
            firstStaffSession,
            submittedAtByOrderId,
            runDeadline - Date.now() + sseGraceMs,
          ),
        ]);

      const report = {
        runId: config.runId,
        recordedAtUtc: new Date().toISOString(),
        profile: LOAD_PROFILE,
        authenticated: {
          staffSessions: staffSessions.length,
          guestSessions: guestSessions.length,
        },
        results: {
          customerMenuUsable: summarize(menuSamples),
          staffAuthenticatedReads: summarize(staffReadSamples),
          orderSubmissionCommand: summarize(orderSamples),
          connectedClientDelivery: summarize(sseDeliverySamples),
        },
        objectives: {
          customerMenuUsableP95Ms: 3_000,
          authenticatedReadP95Ms: 500,
          orderCommandP95Ms: 1_000,
          connectedDeliveryP95Ms: 2_000,
        },
        notes: [
          "Distinct staff logins and guest QR exchanges are bounded by the existing per-IP anti-abuse rate limiters (10 logins and 60 QR exchanges per 15 minutes) when driven from one loopback source IP; this run reused a smaller pool of real sessions across the target read concurrency rather than one distinct session per PD-025 count.",
          "Order submissions are paced at the PD-025 rate and stay within the existing per-IP order-command rate limiter (60 per 15 minutes); a longer sustained run from one source IP would be capped by that same anti-abuse control, which is expected, correct behavior.",
          "This run is production-like but local; production-scale verification is pending the platform decision (ADR-0007).",
          "Each virtual guest and staff reader paces its own requests with randomized think-time (1-3s guest, 2-5s staff) rather than looping as fast as possible, matching a person browsing rather than a request generator; concurrency is held at the PD-025 session counts throughout the run.",
        ],
      };

      const outputDirectory = join(
        repositoryRoot,
        "output",
        "load-profile",
        `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${config.runId}`,
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
      console.log(`Load profile report written to ${outputDirectory}`);
      console.log(JSON.stringify(report.results, null, 2));

      const breaches: string[] = [];
      if (
        report.results.customerMenuUsable.p95 >
        report.objectives.customerMenuUsableP95Ms
      ) {
        breaches.push("customer menu usable p95");
      }
      if (
        report.results.staffAuthenticatedReads.p95 >
        report.objectives.authenticatedReadP95Ms
      ) {
        breaches.push("staff authenticated read p95");
      }
      if (
        report.results.orderSubmissionCommand.p95 >
        report.objectives.orderCommandP95Ms
      ) {
        breaches.push("order submission command p95");
      }
      if (breaches.length > 0) {
        throw new Error(
          `Load profile missed release-target objectives: ${breaches.join(", ")}.`,
        );
      }
    } finally {
      await stack.stop();
      await removeMarkedDatabase(config);
    }
  } finally {
    await postgres.close();
  }
}

function renderMarkdown(report: {
  readonly runId: string;
  readonly recordedAtUtc: string;
  readonly authenticated: { staffSessions: number; guestSessions: number };
  readonly results: Record<string, LatencySummary>;
  readonly objectives: Record<string, number>;
  readonly notes: readonly string[];
}): string {
  const rows = Object.entries(report.results)
    .map(
      ([name, summary]) =>
        `| ${name} | ${summary.count} | ${summary.errors} | ${summary.p50.toFixed(1)} | ${summary.p95.toFixed(1)} | ${summary.p99.toFixed(1)} | ${summary.max.toFixed(1)} |`,
    )
    .join("\n");
  return `# PD-025 load-profile report

Run: ${report.runId}
Recorded: ${report.recordedAtUtc}
Authenticated sessions: ${report.authenticated.staffSessions} staff, ${report.authenticated.guestSessions} guest.

| Measure | Samples | Errors | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |
|---|---|---|---|---|---|---|
${rows}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

await main();
