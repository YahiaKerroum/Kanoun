import { randomUUID } from "node:crypto";
import { z } from "zod";
import { findFreeLoopbackPort } from "./demo-postgres.js";
import { isLoopbackHost, type DemoConfig } from "./demo-config.js";

const targetNamePattern = /^rms_load_[a-z0-9_]+$/u;
const postgresIdentifierMaximumLength = 63;

/**
 * The PD-025 load profile: 50 staff sessions, 200 guest sessions, 500
 * dishes, 100 tables, and 20 order submissions per minute per active
 * branch. Distinct staff logins and distinct guest QR exchanges are each
 * bounded by the existing per-IP anti-abuse rate limiters (10 logins and 60
 * QR exchanges per 15 minutes) when driven from one loopback source IP, so
 * this profile reuses a smaller pool of real sessions across the target
 * read concurrency rather than creating one distinct session per PD-025
 * "session" count. See docs/delivery/pr-07-pilot-operations-and-production-gates.md.
 */
export const LOAD_PROFILE = {
  dishCount: 500,
  tableCount: 100,
  staffSessionCount: 5,
  staffReadConcurrency: 50,
  guestSessionCount: 50,
  guestReadConcurrency: 200,
  orderSubmissionsPerMinute: 20,
  runDurationSeconds: 90,
} as const;

export interface LoadProfileConfig extends DemoConfig {
  readonly runId: string;
  readonly apiOrigin: string;
  readonly staffWebOrigin: string;
  readonly customerWebOrigin: string;
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly workerId: string;
}

function requireSafeTarget(databaseName: string): void {
  if (databaseName.length > postgresIdentifierMaximumLength) {
    throw new Error(
      `Load-profile database names must be at most ${postgresIdentifierMaximumLength} characters.`,
    );
  }
  if (!targetNamePattern.test(databaseName)) {
    throw new Error(
      "Load profile refuses a database outside the rms_load_ safety namespace.",
    );
  }
}

export async function createLoadProfileConfig(
  environment: NodeJS.ProcessEnv,
): Promise<LoadProfileConfig> {
  if (environment.NODE_ENV === "production") {
    throw new Error("The load profile is disabled when NODE_ENV=production.");
  }
  const baseDatabaseUrl =
    environment.LOAD_PROFILE_BASE_DATABASE_URL ??
    environment.TEST_DATABASE_URL ??
    environment.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error(
      "The load profile requires LOAD_PROFILE_BASE_DATABASE_URL, TEST_DATABASE_URL, or DATABASE_URL.",
    );
  }
  const parsed = z.url().safeParse(baseDatabaseUrl);
  if (!parsed.success || !baseDatabaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "The load-profile base database URL must be postgresql://.",
    );
  }
  const base = new URL(baseDatabaseUrl);
  if (!isLoopbackHost(base.hostname)) {
    throw new Error("The load profile must target loopback PostgreSQL.");
  }
  const runId = randomUUID().replaceAll("-", "").slice(0, 16);
  const databaseName = `rms_load_${runId}`;
  requireSafeTarget(databaseName);
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const admin = new URL(target);
  admin.pathname = "/postgres";

  const apiPort = await findFreeLoopbackPort();
  const staffOriginPort = await findFreeLoopbackPort();
  const customerOriginPort = await findFreeLoopbackPort();
  const host = "127.0.0.1";

  return {
    databaseUrl: target.toString(),
    databaseName,
    databaseHost: host,
    databasePort: base.port ? Number(base.port) : 5432,
    adminDatabaseUrl: admin.toString(),
    databaseMarker: `MISE_LOAD_PROFILE_V1:${databaseName}`,
    launcherHost: host,
    launcherPort: apiPort,
    runId,
    apiOrigin: `http://${host}:${apiPort}`,
    staffWebOrigin: `http://${host}:${staffOriginPort}`,
    customerWebOrigin: `http://${host}:${customerOriginPort}`,
    sessionSecret: randomUUID().replaceAll("-", ""),
    bootstrapSecret: randomUUID().replaceAll("-", ""),
    supportAccessSecret: randomUUID().replaceAll("-", ""),
    guestAccessSecret: randomUUID().replaceAll("-", ""),
    workerId: `rms-load-profile-${runId}`,
  };
}
