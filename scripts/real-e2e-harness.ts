import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { resetDemoDatabase, removeMarkedDatabase } from "./demo-database.js";
import { generatedDemoPassword, generatedDemoSecret } from "./demo-secrets.js";
import {
  startManagedDemoProcess,
  waitForDatabase,
  waitForHttp,
  type ManagedDemoProcess,
  type DemoProcessSpec,
} from "./demo-process.js";
import { createRealE2eConfig, type RealE2eConfig } from "./real-e2e-config.js";
import {
  startDemoRecoveryDelivery,
  type DemoRecoveryDelivery,
} from "./demo-recovery-delivery.js";
import {
  inspectDemoPostgresCapabilities,
  selectDemoPostgresMode,
  startIsolatedDemoPostgres,
  type IsolatedDemoPostgresRuntime,
} from "./demo-postgres.js";

const executeFile = promisify(execFile);
const repositoryRoot = process.cwd();
const workerReadyMessage = "Worker process is ready; outbox dispatch is active";

const bootstrapResultSchema = z.object({
  businessAccountId: z.uuid(),
  restaurant: z.object({ id: z.uuid(), name: z.string() }),
  branch: z.object({ id: z.uuid(), name: z.string() }),
  employeeId: z.uuid(),
  userId: z.uuid(),
});

export interface RealE2eCredentials {
  readonly businessCode: string;
  readonly email: string;
  readonly password: string;
}

export interface RealE2eTenant {
  readonly businessCode: string;
  readonly businessName: string;
  readonly restaurantName: string;
  readonly restaurantId: string;
  readonly branchName: string;
  readonly branchId: string;
  readonly owner: RealE2eCredentials;
}

export interface RealE2eHarness {
  readonly config: RealE2eConfig;
  readonly primary: RealE2eTenant;
  readonly secondary: RealE2eTenant;
  readonly environment: NodeJS.ProcessEnv;
  restartWorker(): Promise<void>;
  close(): Promise<void>;
}

function runtimeEnvironment(config: RealE2eConfig): {
  readonly environment: NodeJS.ProcessEnv;
  readonly secrets: readonly string[];
  readonly bootstrapSecret: string;
} {
  const secrets = [
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    config.recoverySecret,
  ] as const;
  return {
    bootstrapSecret: secrets[1],
    secrets,
    environment: {
      ...process.env,
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: new URL(config.apiOrigin).port,
      DATABASE_URL: config.databaseUrl,
      TEST_DATABASE_URL: config.databaseUrl,
      SESSION_SECRET: secrets[0],
      BOOTSTRAP_SECRET: secrets[1],
      SUPPORT_ACCESS_SECRET: secrets[2],
      GUEST_ACCESS_SECRET: secrets[3],
      SESSION_COOKIE_SECURE: "false",
      WEB_ORIGIN: config.adminOrigin,
      STAFF_WEB_ORIGIN: config.staffOrigin,
      CUSTOMER_WEB_ORIGIN: config.customerOrigin,
      WORKER_ID: config.workerId,
      LOG_LEVEL: "info",
      API_PROXY_ORIGIN: config.apiOrigin,
      RECOVERY_DELIVERY_URL: `${config.recoveryOrigin}/deliver`,
      RECOVERY_DELIVERY_SECRET: config.recoverySecret,
    },
  };
}

function processSpecs(
  config: RealE2eConfig,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): readonly DemoProcessSpec[] {
  const app = (name: string): string =>
    join(repositoryRoot, "apps", "web", name);
  const vite = (name: string): string =>
    join(app(name), "node_modules", "vite", "bin", "vite.js");
  const api = join(repositoryRoot, "apps", "api", "dist", "server.js");
  const worker = join(repositoryRoot, "apps", "worker", "dist", "worker.js");
  const apiEnvironment = { ...environment, LOG_LEVEL: "warn" };
  const workerEnvironment = { ...environment, LOG_LEVEL: "info" };
  return [
    {
      label: "real-e2e-api",
      command: process.execPath,
      args: [api],
      cwd: repositoryRoot,
      env: apiEnvironment,
      secrets,
    },
    {
      label: "real-e2e-worker",
      command: process.execPath,
      args: [worker],
      cwd: repositoryRoot,
      env: workerEnvironment,
      secrets,
    },
    ...(
      [
        ["real-e2e-staff", "staff", config.staffOrigin],
        ["real-e2e-customer", "customer", config.customerOrigin],
        ["real-e2e-admin", "admin", config.adminOrigin],
      ] as const
    ).map(([label, name, origin]) => ({
      label,
      command: process.execPath,
      args: [
        vite(name),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        new URL(origin).port,
      ],
      cwd: app(name),
      env: environment,
      secrets,
    })),
  ];
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

async function preparePostgres(
  config: RealE2eConfig,
): Promise<{ readonly config: RealE2eConfig; close(): Promise<void> }> {
  try {
    const capabilities = await inspectDemoPostgresCapabilities(
      config.adminDatabaseUrl,
    );
    if (selectDemoPostgresMode(capabilities) === "existing") {
      return { config, close: () => Promise.resolve() };
    }
  } catch (error: unknown) {
    void error;
  }
  const isolated: IsolatedDemoPostgresRuntime =
    await startIsolatedDemoPostgres(config);
  return {
    config: { ...config, ...isolated.config },
    close: () => isolated.close(),
  };
}

async function provisionTenant(
  config: RealE2eConfig,
  bootstrapSecret: string,
  suffix: string,
): Promise<RealE2eTenant> {
  const businessCode = `real-e2e-${suffix}`;
  const email = `owner-${suffix}@real-e2e.test`;
  const password = generatedDemoPassword();
  const businessName = `PR-05 Real Stack ${suffix}`;
  const restaurantName = `Real Stack Restaurant ${suffix}`;
  const branchName = `Main Branch ${suffix}`;
  const response = await fetch(
    new URL("/api/v1/platform/tenants", config.apiOrigin),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-bootstrap-secret": bootstrapSecret,
      },
      body: JSON.stringify({
        businessCode,
        businessName,
        restaurantName,
        branch: {
          name: branchName,
          address: {
            line1: "1 Real Stack Way",
            city: "Algiers",
            countryCode: "DZ",
          },
          contact: { email: `branch-${suffix}@real-e2e.test` },
          timeZone: "Africa/Algiers",
          currency: "DZD",
          openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            opensAt: "00:00",
            closesAt: "23:59",
          })),
        },
        owner: { displayName: `Owner ${suffix}`, email, password },
      }),
    },
  );
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      `Real E2E tenant provisioning failed with status ${response.status}.`,
    );
  }
  const result = bootstrapResultSchema.safeParse(body);
  if (!result.success) {
    throw new Error(
      "Real E2E tenant provisioning returned an invalid contract.",
    );
  }
  return {
    businessCode,
    businessName,
    restaurantName,
    restaurantId: result.data.restaurant.id,
    branchName,
    branchId: result.data.branch.id,
    owner: { businessCode, email, password },
  };
}

function controlServer(
  config: RealE2eConfig,
  stopWorker: () => Promise<void>,
  restartWorker: () => Promise<void>,
): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${config.controlSecret}`) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (
      (request.url !== "/worker/stop" && request.url !== "/worker/restart") ||
      request.method !== "POST"
    ) {
      response.statusCode = 404;
      response.end();
      return;
    }
    const action = request.url === "/worker/stop" ? stopWorker : restartWorker;
    void action()
      .then(() => {
        response.statusCode = 204;
        response.end();
      })
      .catch((error: unknown) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : "restart failed");
      });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.launcherPort, config.launcherHost, () =>
      resolve(server),
    );
  });
}

export async function startRealE2eHarness(
  environment = process.env,
): Promise<RealE2eHarness> {
  const requestedConfig = await createRealE2eConfig(environment);
  const postgres = await preparePostgres(requestedConfig);
  const config = postgres.config;
  await waitForDatabase(config.adminDatabaseUrl);
  await resetDemoDatabase(config);
  await applyMigrations(config.databaseUrl);
  const runtime = runtimeEnvironment(config);
  const processes: ManagedDemoProcess[] = [];
  let worker: ManagedDemoProcess | undefined;
  let control: Server | undefined;
  let recovery: DemoRecoveryDelivery | undefined;
  let closed = false;
  const stopWorker = async (): Promise<void> => {
    await worker?.terminate();
    worker = undefined;
  };
  const restartWorker = async (): Promise<void> => {
    await stopWorker();
    const spec = processSpecs(config, runtime.environment, runtime.secrets)[1];
    if (!spec) throw new Error("Real E2E worker specification is missing.");
    worker = startManagedDemoProcess(spec);
    await worker.waitForText(workerReadyMessage);
  };
  try {
    recovery = await startDemoRecoveryDelivery({
      host: config.databaseHost,
      port: Number(new URL(config.recoveryOrigin).port),
      authorizationSecret: config.recoverySecret,
      staffOrigin: config.staffOrigin,
    });
    const specs = processSpecs(config, runtime.environment, runtime.secrets);
    const apiSpec = specs[0];
    if (!apiSpec) throw new Error("Real E2E API specification is missing.");
    processes.push(startManagedDemoProcess(apiSpec));
    await waitForHttp(`${config.apiOrigin}/health/live`);
    await waitForHttp(`${config.apiOrigin}/health/ready`);
    await restartWorker();
    if (worker) processes.push(worker);
    for (const spec of specs.slice(2)) {
      processes.push(startManagedDemoProcess(spec));
    }
    await Promise.all([
      waitForHttp(`${config.staffOrigin}/`),
      waitForHttp(`${config.customerOrigin}/`),
      waitForHttp(`${config.adminOrigin}/`),
    ]);
    const primary = await provisionTenant(
      config,
      runtime.bootstrapSecret,
      `${config.runId}-a`,
    );
    const secondary = await provisionTenant(
      config,
      runtime.bootstrapSecret,
      `${config.runId}-b`,
    );
    control = await controlServer(config, stopWorker, restartWorker);
    const exposedEnvironment = {
      ...runtime.environment,
      REAL_E2E_RUN_ID: config.runId,
      REAL_E2E_API_ORIGIN: config.apiOrigin,
      REAL_E2E_STAFF_ORIGIN: config.staffOrigin,
      REAL_E2E_CUSTOMER_ORIGIN: config.customerOrigin,
      REAL_E2E_ADMIN_ORIGIN: config.adminOrigin,
      REAL_E2E_CONTROL_ORIGIN: config.controlOrigin,
      REAL_E2E_CONTROL_SECRET: config.controlSecret,
      REAL_E2E_DATABASE_URL: config.databaseUrl,
      REAL_E2E_PRIMARY_BUSINESS_CODE: primary.businessCode,
      REAL_E2E_PRIMARY_OWNER_EMAIL: primary.owner.email,
      REAL_E2E_PRIMARY_OWNER_PASSWORD: primary.owner.password,
      REAL_E2E_PRIMARY_RESTAURANT_ID: primary.restaurantId,
      REAL_E2E_PRIMARY_BRANCH_ID: primary.branchId,
      REAL_E2E_SECONDARY_BUSINESS_CODE: secondary.businessCode,
      REAL_E2E_SECONDARY_OWNER_EMAIL: secondary.owner.email,
      REAL_E2E_SECONDARY_OWNER_PASSWORD: secondary.owner.password,
      REAL_E2E_SECONDARY_BRANCH_ID: secondary.branchId,
    };
    return {
      config,
      primary,
      secondary,
      environment: exposedEnvironment,
      restartWorker,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        await new Promise<void>(
          (resolve) => control?.close(() => resolve()) ?? resolve(),
        );
        await worker?.terminate().catch(() => undefined);
        await recovery?.close().catch(() => undefined);
        for (const processHandle of [...processes].reverse()) {
          await processHandle.terminate().catch(() => undefined);
        }
        await removeMarkedDatabase(config);
        await postgres.close();
      },
    };
  } catch (error) {
    await new Promise<void>(
      (resolve) => control?.close(() => resolve()) ?? resolve(),
    );
    await worker?.terminate().catch(() => undefined);
    await recovery?.close().catch(() => undefined);
    for (const processHandle of [...processes].reverse()) {
      await processHandle.terminate().catch(() => undefined);
    }
    await removeMarkedDatabase(config).catch(() => undefined);
    await postgres.close().catch(() => undefined);
    throw error;
  }
}

if (existsSync(join(repositoryRoot, ".env"))) {
  process.loadEnvFile(join(repositoryRoot, ".env"));
}
