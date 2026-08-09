import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  DEMO_DATABASE_NAME,
  parseDemoConfig,
  type DemoConfig,
} from "./demo-config.js";
import { startDemoLauncher, type DemoLauncher } from "./demo-launcher.js";
import {
  startDemoRecoveryDelivery,
  type DemoRecoveryDelivery,
} from "./demo-recovery-delivery.js";
import { generatedDemoPassword, generatedDemoSecret } from "./demo-secrets.js";
import {
  inspectDemoPostgresCapabilities,
  selectDemoPostgresMode,
  startIsolatedDemoPostgres,
} from "./demo-postgres.js";
import {
  startManagedDemoProcess,
  waitForDatabase,
  waitForHttp,
  type ManagedDemoProcess,
} from "./demo-process.js";
import { seedDemo } from "./seed-demo.js";
import type { DemoSeedResult } from "./demo-types.js";

const executeFile = promisify(execFile);
const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const apiOrigin = "http://127.0.0.1:3000";
const staffOrigin = "http://127.0.0.1:5173";
const customerOrigin = "http://127.0.0.1:5174";
const adminOrigin = "http://127.0.0.1:5175";
const recoveryDeliveryOrigin = "http://127.0.0.1:4171";
const workerReadyMessage = "Worker process is ready; outbox dispatch is active";

interface PostgresRuntime {
  readonly config: DemoConfig;
  readonly mode: "existing" | "docker" | "isolated";
  close(): Promise<void>;
}

function runtimeEnvironment(config: DemoConfig): {
  readonly environment: NodeJS.ProcessEnv;
  readonly secrets: readonly string[];
  readonly password: string;
} {
  const password = config.seedPassword ?? generatedDemoPassword();
  const secrets = [
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    generatedDemoSecret(),
    password,
  ] as const;
  return {
    password,
    secrets,
    environment: {
      ...process.env,
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      DATABASE_URL: config.databaseUrl,
      SESSION_SECRET: secrets[0],
      BOOTSTRAP_SECRET: secrets[1],
      SUPPORT_ACCESS_SECRET: secrets[2],
      GUEST_ACCESS_SECRET: secrets[3],
      SESSION_COOKIE_SECURE: "false",
      WEB_ORIGIN: adminOrigin,
      STAFF_WEB_ORIGIN: staffOrigin,
      CUSTOMER_WEB_ORIGIN: customerOrigin,
      RECOVERY_DELIVERY_URL: `${recoveryDeliveryOrigin}/deliver`,
      RECOVERY_DELIVERY_SECRET: secrets[4],
      WORKER_ID: "rms-demo-worker",
      LOG_LEVEL: "info",
      OUTBOX_LEASE_MS: "30000",
      OUTBOX_MAX_ATTEMPTS: "5",
      OUTBOX_RETENTION_DAYS: "90",
    },
  };
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await executeFile(
      process.platform === "win32" ? "docker.exe" : "docker",
      ["info", "--format", "{{.ServerVersion}}"],
      { cwd: repositoryRoot },
    );
    return true;
  } catch {
    return false;
  }
}

async function ensurePostgres(config: DemoConfig): Promise<PostgresRuntime> {
  let localAvailable = false;
  try {
    await waitForDatabase(config.adminDatabaseUrl, 5_000);
    localAvailable = true;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw error;
    }
  }
  if (localAvailable) {
    const capabilities = await inspectDemoPostgresCapabilities(
      config.adminDatabaseUrl,
    );
    if (selectDemoPostgresMode(capabilities) === "existing") {
      process.stdout.write("[demo] PostgreSQL is available locally.\n");
      return {
        config,
        mode: "existing",
        close: () => Promise.resolve(),
      };
    }
    process.stdout.write(
      "[demo] Local PostgreSQL is restricted; starting an owned loopback cluster.\n",
    );
    return startIsolatedDemoPostgres(config);
  }
  if (!(await dockerAvailable())) {
    throw new Error(
      `PostgreSQL is unavailable and Docker is not running. Start PostgreSQL on loopback before using the isolated ${DEMO_DATABASE_NAME} demo database.`,
    );
  }
  process.stdout.write(
    "[demo] Starting the managed Docker PostgreSQL service.\n",
  );
  await executeFile(
    process.platform === "win32" ? "docker.exe" : "docker",
    ["compose", "up", "-d", "postgres"],
    { cwd: repositoryRoot },
  );
  await waitForDatabase(config.adminDatabaseUrl);
  return {
    config,
    mode: "docker",
    close: async () => {
      await executeFile(
        process.platform === "win32" ? "docker.exe" : "docker",
        ["compose", "stop", "postgres"],
        { cwd: repositoryRoot },
      );
    },
  };
}

async function stopManagedPostgres(runtime: PostgresRuntime): Promise<void> {
  await runtime.close();
}

function processSpecs(
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
) {
  const tsxImport = "tsx";
  const viteEntry = (application: string): string =>
    join(
      repositoryRoot,
      "..",
      "apps",
      "web",
      application,
      "node_modules",
      "vite",
      "bin",
      "vite.js",
    );
  return [
    {
      label: "api",
      command: process.execPath,
      args: [
        "--import",
        tsxImport,
        join(repositoryRoot, "..", "apps", "api", "src", "server.ts"),
      ],
      cwd: join(repositoryRoot, ".."),
      env: environment,
      secrets,
    },
    {
      label: "worker",
      command: process.execPath,
      args: [
        "--import",
        tsxImport,
        join(repositoryRoot, "..", "apps", "worker", "src", "worker.ts"),
      ],
      cwd: join(repositoryRoot, ".."),
      env: environment,
      secrets,
    },
    {
      label: "customer",
      command: process.execPath,
      args: [viteEntry("customer"), "--host", "127.0.0.1", "--port", "5174"],
      cwd: join(repositoryRoot, "..", "apps", "web", "customer"),
      env: environment,
      secrets,
    },
    {
      label: "staff",
      command: process.execPath,
      args: [viteEntry("staff"), "--host", "127.0.0.1", "--port", "5173"],
      cwd: join(repositoryRoot, "..", "apps", "web", "staff"),
      env: environment,
      secrets,
    },
    {
      label: "admin",
      command: process.execPath,
      args: [viteEntry("admin"), "--host", "127.0.0.1", "--port", "5175"],
      cwd: join(repositoryRoot, "..", "apps", "web", "admin"),
      env: environment,
      secrets,
    },
  ] as const;
}

async function loginSmoke(result: DemoSeedResult): Promise<void> {
  for (const role of result.roles) {
    const response = await fetch(new URL("/api/v1/auth/login", apiOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessCode: result.businessCode,
        email: role.email,
        password: role.password,
      }),
    });
    if (!response.ok || response.headers.getSetCookie().length === 0) {
      throw new Error(`Real-stack login smoke failed for ${role.key}.`);
    }
  }
}

async function qrSmoke(result: DemoSeedResult): Promise<void> {
  const customerUrl = result.customerUrls[0]?.url;
  if (!customerUrl) {
    throw new Error("Real-stack QR smoke did not receive a customer URL.");
  }
  const pathParts = new URL(customerUrl).pathname.split("/").filter(Boolean);
  const rawToken = pathParts.at(-1);
  if (!rawToken) {
    throw new Error(
      "Real-stack QR smoke could not resolve the table URL token.",
    );
  }
  const response = await fetch(
    new URL(
      `/api/v1/public/qr/${encodeURIComponent(rawToken)}/session`,
      apiOrigin,
    ),
    { method: "POST" },
  );
  if (response.status !== 201 || response.headers.getSetCookie().length === 0) {
    const body = await response.text();
    throw new Error(
      `Real-stack table QR exchange smoke failed with status ${response.status}: ${body.slice(0, 160)}`,
    );
  }
}

async function realStackSmoke(result: DemoSeedResult): Promise<void> {
  await loginSmoke(result);
  await qrSmoke(result);
  for (const customerUrl of result.customerUrls) {
    const response = await fetch(customerUrl.url);
    if (response.status !== 200) {
      throw new Error("Real-stack customer URL smoke failed.");
    }
  }
}

async function closeProcesses(
  processes: readonly ManagedDemoProcess[],
): Promise<void> {
  for (const child of [...processes].reverse()) {
    await child.terminate();
  }
}

async function main(): Promise<void> {
  if (existsSync(join(repositoryRoot, "..", ".env"))) {
    process.loadEnvFile(join(repositoryRoot, "..", ".env"));
  }
  const config = parseDemoConfig(process.env);
  const postgres = await ensurePostgres(config);
  const runtime = runtimeEnvironment(postgres.config);
  const processes: ManagedDemoProcess[] = [];
  let recoveryDelivery: DemoRecoveryDelivery | undefined;
  let launcher: DemoLauncher | undefined;
  try {
    process.stdout.write(
      "[demo] Resetting and seeding the isolated demo database.\n",
    );
    const result = await seedDemo({
      config: postgres.config,
      password: runtime.password,
      sessionSecret: runtime.environment.SESSION_SECRET ?? "",
      guestAccessSecret: runtime.environment.GUEST_ACCESS_SECRET ?? "",
      customerWebOrigin: customerOrigin,
    });
    recoveryDelivery = await startDemoRecoveryDelivery({
      host: "127.0.0.1",
      port: 4171,
      authorizationSecret: runtime.environment.RECOVERY_DELIVERY_SECRET ?? "",
      staffOrigin,
    });
    const specs = processSpecs(runtime.environment, runtime.secrets);
    const api = startManagedDemoProcess(specs[0]);
    processes.push(api);
    await waitForHttp(`${apiOrigin}/health/live`);
    await waitForHttp(`${apiOrigin}/health/ready`);
    const worker = startManagedDemoProcess(specs[1]);
    processes.push(worker);
    await worker.waitForText(workerReadyMessage);
    for (const spec of specs.slice(2)) {
      processes.push(startManagedDemoProcess(spec));
    }
    await waitForHttp(`${customerOrigin}/`);
    await waitForHttp(`${staffOrigin}/`);
    await waitForHttp(`${adminOrigin}/`);
    await realStackSmoke(result);
    launcher = await startDemoLauncher({
      result,
      apiOrigin,
      adminOrigin,
      staffOrigin,
      recoveryOrigin: recoveryDelivery.origin,
      host: postgres.config.launcherHost,
      port: postgres.config.launcherPort,
    });
    await waitForHttp(`${launcher.origin}/health/live`);
    process.stdout.write(
      `[demo] Ready at ${launcher.origin} for ${result.businessCode}. Use separate browser contexts for each role.\n`,
    );
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } finally {
    await launcher?.close().catch(() => undefined);
    await recoveryDelivery?.close().catch(() => undefined);
    await closeProcesses(processes);
    await stopManagedPostgres(postgres);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown demo failure.";
  process.stderr.write(`Demo environment failed: ${message}\n`);
  process.exitCode = 1;
});
