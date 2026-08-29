import { createServer, type Server } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { writeFile } from "node:fs/promises";
import {
  DESKTOP_CONTROL_PORT,
  buildDesktopDemoConfig,
} from "../apps/desktop/src/shared/desktop-config.js";
import {
  ensureDesktopDirectories,
  resolveDesktopPaths,
} from "../apps/desktop/src/shared/desktop-paths.js";
import { loadOrCreateDesktopSecrets } from "../apps/desktop/src/shared/desktop-secrets.js";
import { loadOrCreateSeedResult } from "../apps/desktop/src/shared/desktop-seed-cache.js";
import { encodeReadyLine } from "../apps/desktop/src/shared/orchestrator-protocol.js";
import type { DemoConfig } from "./demo-config.js";
import { startDemoLauncher, type DemoLauncher } from "./demo-launcher.js";
import {
  startPersistentDemoPostgres,
  type PersistentDemoPostgresRuntime,
} from "./demo-postgres.js";
import {
  startManagedDemoProcess,
  waitForHttp,
  type DemoProcessSpec,
  type ManagedDemoProcess,
} from "./demo-process.js";
import {
  startDemoRecoveryDelivery,
  type DemoRecoveryDelivery,
} from "./demo-recovery-delivery.js";
import { seedDemo } from "./seed-demo.js";
import type { DemoSeedResult } from "./demo-types.js";

const apiOrigin = "http://127.0.0.1:3000";
const staffOrigin = "http://127.0.0.1:5173";
const customerOrigin = "http://127.0.0.1:5174";
const adminOrigin = "http://127.0.0.1:5175";
const recoveryDeliveryOrigin = "http://127.0.0.1:4171";
const workerReadyMessage = "Worker process is ready; outbox dispatch is active";

interface DesktopSecretsLike {
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly recoveryDeliverySecret: string;
}

function runtimeEnvironment(
  config: DemoConfig,
  secrets: DesktopSecretsLike,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    DATABASE_URL: config.databaseUrl,
    SESSION_SECRET: secrets.sessionSecret,
    BOOTSTRAP_SECRET: secrets.bootstrapSecret,
    SUPPORT_ACCESS_SECRET: secrets.supportAccessSecret,
    GUEST_ACCESS_SECRET: secrets.guestAccessSecret,
    SESSION_COOKIE_SECURE: "false",
    WEB_ORIGIN: adminOrigin,
    STAFF_WEB_ORIGIN: staffOrigin,
    CUSTOMER_WEB_ORIGIN: customerOrigin,
    RECOVERY_DELIVERY_URL: `${recoveryDeliveryOrigin}/deliver`,
    RECOVERY_DELIVERY_SECRET: secrets.recoveryDeliverySecret,
    WORKER_ID: "mise-desktop-worker",
    LOG_LEVEL: "info",
    OUTBOX_LEASE_MS: "30000",
    OUTBOX_MAX_ATTEMPTS: "5",
    OUTBOX_RETENTION_DAYS: "90",
  };
}

function apiSpec(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): DemoProcessSpec {
  return {
    label: "api",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "api", "dist", "server.js")],
    cwd: repositoryRoot,
    env: environment,
    secrets,
  };
}

function workerSpec(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): DemoProcessSpec {
  return {
    label: "worker",
    command: process.execPath,
    args: [join(repositoryRoot, "apps", "worker", "dist", "worker.js")],
    cwd: repositoryRoot,
    env: environment,
    secrets,
  };
}

function previewSpecs(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
  secrets: readonly string[],
): readonly DemoProcessSpec[] {
  const app = (name: string): string =>
    join(repositoryRoot, "apps", "web", name);
  const vite = (name: string): string =>
    join(app(name), "node_modules", "vite", "bin", "vite.js");
  return (
    [
      ["customer", customerOrigin],
      ["staff", staffOrigin],
      ["admin", adminOrigin],
    ] as const
  ).map(([name, origin]) => ({
    label: name,
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
  }));
}

async function main(): Promise<void> {
  const appDataDirectory = process.env.MISE_DESKTOP_APP_DATA_DIR;
  const repositoryRootEnv = process.env.MISE_DESKTOP_REPOSITORY_ROOT;
  if (!appDataDirectory || !repositoryRootEnv) {
    throw new Error(
      "MISE_DESKTOP_APP_DATA_DIR and MISE_DESKTOP_REPOSITORY_ROOT are required.",
    );
  }
  // Hoisted `function` declarations below (startApiAndWorker etc.) don't
  // retain the narrowing from the guard above when they close over
  // repositoryRootEnv directly, so re-bind it with an explicit `string`
  // annotation once here.
  const repositoryRoot: string = repositoryRootEnv;
  const paths = resolveDesktopPaths(appDataDirectory);
  await ensureDesktopDirectories(paths);
  const secrets = await loadOrCreateDesktopSecrets(paths.secretsFile);
  const config = buildDesktopDemoConfig(
    secrets.databasePassword,
    secrets.seedPassword,
  );

  let postgres: PersistentDemoPostgresRuntime | undefined;
  let api: ManagedDemoProcess | undefined;
  let worker: ManagedDemoProcess | undefined;
  const previewProcesses: ManagedDemoProcess[] = [];
  let recoveryDelivery: DemoRecoveryDelivery | undefined;
  let launcher: DemoLauncher | undefined;
  let seedResult: DemoSeedResult | undefined;
  let resolveShutdown: (() => void) | undefined;
  let resetInFlight = false;
  let environment: NodeJS.ProcessEnv = {};
  let secretList: readonly string[] = [];

  async function runSeed(): Promise<DemoSeedResult> {
    if (!postgres) {
      throw new Error("Cannot seed before PostgreSQL has started.");
    }
    return seedDemo({
      config: postgres.config,
      password: secrets.seedPassword,
      sessionSecret: secrets.sessionSecret,
      guestAccessSecret: secrets.guestAccessSecret,
      customerWebOrigin: customerOrigin,
    });
  }

  async function startApiAndWorker(): Promise<void> {
    api = startManagedDemoProcess(
      apiSpec(repositoryRoot, environment, secretList),
    );
    await waitForHttp(`${apiOrigin}/health/live`);
    await waitForHttp(`${apiOrigin}/health/ready`);
    worker = startManagedDemoProcess(
      workerSpec(repositoryRoot, environment, secretList),
    );
    await worker.waitForText(workerReadyMessage);
  }

  async function stopApiAndWorker(): Promise<void> {
    await worker?.terminate();
    await api?.terminate();
    worker = undefined;
    api = undefined;
  }

  async function performReset(): Promise<void> {
    await stopApiAndWorker();
    try {
      seedResult = await runSeed();
    } finally {
      // Always bring api/worker back up against whatever data currently
      // exists (freshly reseeded on success, or the pre-reset data if
      // runSeed threw) so a failed reset never leaves the app with no
      // running backend at all.
      await startApiAndWorker();
    }
    await writeFile(
      paths.seedResultFile,
      `${JSON.stringify(seedResult, null, 2)}\n`,
      "utf8",
    );
    await launcher?.close();
    launcher = await startDemoLauncher({
      result: seedResult,
      apiOrigin,
      adminOrigin,
      staffOrigin,
      recoveryOrigin: recoveryDelivery?.origin ?? recoveryDeliveryOrigin,
      host: config.launcherHost,
      port: config.launcherPort,
      roleLinkMode: "direct-sign-in",
    });
  }

  const controlServer = await new Promise<Server>((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.headers.authorization !== `Bearer ${secrets.controlSecret}`) {
        response.statusCode = 404;
        response.end();
        return;
      }
      if (request.method !== "POST") {
        response.statusCode = 404;
        response.end();
        return;
      }
      if (request.url === "/reset") {
        if (resetInFlight) {
          response.statusCode = 409;
          response.end("A reset is already in progress.");
          return;
        }
        resetInFlight = true;
        void performReset()
          .then(() => {
            response.statusCode = 204;
            response.end();
          })
          .catch((error: unknown) => {
            response.statusCode = 500;
            response.end(
              error instanceof Error ? error.message : "Reset failed.",
            );
          })
          .finally(() => {
            resetInFlight = false;
          });
        return;
      }
      if (request.url === "/shutdown") {
        response.statusCode = 204;
        response.end();
        resolveShutdown?.();
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    server.once("error", reject);
    server.listen(DESKTOP_CONTROL_PORT, "127.0.0.1", () => resolve(server));
  });
  const shutdownRequested = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });

  try {
    postgres = await startPersistentDemoPostgres(
      config,
      paths.postgresDataDirectory,
    );
    environment = runtimeEnvironment(postgres.config, secrets);
    secretList = [
      secrets.sessionSecret,
      secrets.bootstrapSecret,
      secrets.supportAccessSecret,
      secrets.guestAccessSecret,
      secrets.recoveryDeliverySecret,
      secrets.databasePassword,
      secrets.seedPassword,
      secrets.controlSecret,
    ];
    seedResult = await loadOrCreateSeedResult(paths.seedResultFile, runSeed);
    await startApiAndWorker();
    recoveryDelivery = await startDemoRecoveryDelivery({
      host: "127.0.0.1",
      port: 4171,
      authorizationSecret: secrets.recoveryDeliverySecret,
      staffOrigin,
    });
    for (const spec of previewSpecs(repositoryRoot, environment, secretList)) {
      previewProcesses.push(startManagedDemoProcess(spec));
    }
    await waitForHttp(`${customerOrigin}/`);
    await waitForHttp(`${staffOrigin}/`);
    await waitForHttp(`${adminOrigin}/`);
    launcher = await startDemoLauncher({
      result: seedResult,
      apiOrigin,
      adminOrigin,
      staffOrigin,
      recoveryOrigin: recoveryDelivery.origin,
      host: config.launcherHost,
      port: config.launcherPort,
      roleLinkMode: "direct-sign-in",
    });
    await waitForHttp(`${launcher.origin}/health/live`);
    process.stdout.write(
      `${encodeReadyLine({ launcherOrigin: launcher.origin })}\n`,
    );
    await shutdownRequested;
  } finally {
    await new Promise<void>((resolve) => {
      controlServer.close(() => resolve());
    });
    await launcher?.close().catch(() => undefined);
    await recoveryDelivery?.close().catch(() => undefined);
    for (const child of [...previewProcesses].reverse()) {
      await child.terminate();
    }
    await stopApiAndWorker();
    await postgres?.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown desktop demo failure.";
  process.stderr.write(`Desktop demo environment failed: ${message}\n`);
  process.exitCode = 1;
});
