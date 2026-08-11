import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findFreeLoopbackPort } from "./demo-postgres.js";
import { isLoopbackHost, type DemoConfig } from "./demo-config.js";

const targetNamePattern = /^rms_e2e_[a-z0-9_]+$/u;
const postgresIdentifierMaximumLength = 63;

export interface RealE2eConfig extends DemoConfig {
  readonly runId: string;
  readonly apiOrigin: string;
  readonly staffOrigin: string;
  readonly customerOrigin: string;
  readonly adminOrigin: string;
  readonly controlOrigin: string;
  readonly controlSecret: string;
  readonly recoveryOrigin: string;
  readonly recoverySecret: string;
  readonly workerId: string;
}

function databaseNameFromUrl(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//u, ""));
}

function targetUrl(baseUrl: URL, databaseName: string): URL {
  const target = new URL(baseUrl);
  target.pathname = `/${databaseName}`;
  return target;
}

function adminUrl(target: URL): URL {
  const result = new URL(target);
  result.pathname = "/postgres";
  return result;
}

function requireSafeTarget(
  databaseName: string,
  configuredName?: string,
): void {
  if (databaseName.length > postgresIdentifierMaximumLength) {
    throw new Error(
      `Real E2E database names must be at most ${postgresIdentifierMaximumLength} characters.`,
    );
  }
  if (!targetNamePattern.test(databaseName)) {
    throw new Error(
      "Real E2E refuses a database outside the rms_e2e_ safety namespace.",
    );
  }
  if (configuredName !== undefined && configuredName !== databaseName) {
    throw new Error(
      "REAL_E2E_DATABASE_NAME must match the database name in REAL_E2E_BASE_DATABASE_URL.",
    );
  }
}

export async function createRealE2eConfig(
  environment: NodeJS.ProcessEnv,
): Promise<RealE2eConfig> {
  if (environment.NODE_ENV === "production") {
    throw new Error("Real E2E is disabled when NODE_ENV=production.");
  }
  const baseDatabaseUrl =
    environment.REAL_E2E_BASE_DATABASE_URL ??
    environment.TEST_DATABASE_URL ??
    environment.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error(
      "Real E2E requires REAL_E2E_BASE_DATABASE_URL, TEST_DATABASE_URL, or DATABASE_URL.",
    );
  }
  const parsed = z.url().safeParse(baseDatabaseUrl);
  if (!parsed.success || !baseDatabaseUrl.startsWith("postgresql://")) {
    throw new Error("The real E2E base database URL must be postgresql://.");
  }
  const base = new URL(baseDatabaseUrl);
  if (!isLoopbackHost(base.hostname)) {
    throw new Error("Real E2E database targets must be loopback PostgreSQL.");
  }
  const runId =
    environment.REAL_E2E_RUN_ID?.trim() ?? randomUUID().replaceAll("-", "");
  const generatedName = `rms_e2e_${runId.toLowerCase()}`;
  const databaseName =
    environment.REAL_E2E_DATABASE_NAME?.trim() ?? generatedName;
  requireSafeTarget(databaseName, environment.REAL_E2E_DATABASE_NAME?.trim());
  const target = targetUrl(base, databaseName);
  const apiPort = await findFreeLoopbackPort();
  const workerControlPort = await findFreeLoopbackPort();
  const staffPort = await findFreeLoopbackPort();
  const customerPort = await findFreeLoopbackPort();
  const adminPort = await findFreeLoopbackPort();
  const recoveryPort = await findFreeLoopbackPort();
  const host = "127.0.0.1";
  return {
    databaseUrl: target.toString(),
    databaseName,
    databaseHost: host,
    databasePort: base.port ? Number(base.port) : 5432,
    adminDatabaseUrl: adminUrl(target).toString(),
    databaseMarker: `MISE_REAL_E2E_V1:${databaseName}`,
    launcherHost: host,
    launcherPort: workerControlPort,
    runId,
    apiOrigin: `http://${host}:${apiPort}`,
    staffOrigin: `http://${host}:${staffPort}`,
    customerOrigin: `http://${host}:${customerPort}`,
    adminOrigin: `http://${host}:${adminPort}`,
    controlOrigin: `http://${host}:${workerControlPort}`,
    controlSecret: randomUUID().replaceAll("-", ""),
    recoveryOrigin: `http://${host}:${recoveryPort}`,
    recoverySecret: randomUUID().replaceAll("-", ""),
    workerId: `rms-real-e2e-${runId}`,
  };
}

export function baseDatabaseNameFromUrl(value: string): string {
  return databaseNameFromUrl(new URL(value));
}
