import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { isLoopbackHost, type DemoConfig } from "./demo-config.js";

const targetNamePattern = /^rms_drill_[a-z0-9_]+$/u;
const postgresIdentifierMaximumLength = 63;

export type DrillDatabaseTarget = DemoConfig;

export interface DrillRestoreConfig {
  readonly runId: string;
  readonly adminDatabaseUrl: string;
  readonly source: DrillDatabaseTarget;
  readonly restored: DrillDatabaseTarget;
  readonly backupFilePath: string;
}

function requireSafeTarget(databaseName: string): void {
  if (databaseName.length > postgresIdentifierMaximumLength) {
    throw new Error(
      `Restore-drill database names must be at most ${postgresIdentifierMaximumLength} characters.`,
    );
  }
  if (!targetNamePattern.test(databaseName)) {
    throw new Error(
      "Restore drill refuses a database outside the rms_drill_ safety namespace.",
    );
  }
}

function target(
  base: URL,
  databaseName: string,
  marker: string,
): DrillDatabaseTarget {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const host = url.hostname;
  return {
    databaseUrl: url.toString(),
    databaseName,
    databaseHost: host,
    databasePort: url.port ? Number(url.port) : 5432,
    adminDatabaseUrl: admin.toString(),
    databaseMarker: marker,
    launcherHost: "127.0.0.1",
    launcherPort: 0,
  };
}

export function createDrillRestoreConfig(
  environment: NodeJS.ProcessEnv,
): DrillRestoreConfig {
  if (environment.NODE_ENV === "production") {
    throw new Error("The restore drill is disabled when NODE_ENV=production.");
  }
  const baseDatabaseUrl =
    environment.DRILL_RESTORE_BASE_DATABASE_URL ??
    environment.TEST_DATABASE_URL ??
    environment.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error(
      "The restore drill requires DRILL_RESTORE_BASE_DATABASE_URL, TEST_DATABASE_URL, or DATABASE_URL.",
    );
  }
  const parsed = z.url().safeParse(baseDatabaseUrl);
  if (!parsed.success || !baseDatabaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "The restore-drill base database URL must be postgresql://.",
    );
  }
  const base = new URL(baseDatabaseUrl);
  if (!isLoopbackHost(base.hostname)) {
    throw new Error("The restore drill must target loopback PostgreSQL.");
  }
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const sourceName = `rms_drill_${runId}_src`;
  const restoredName = `rms_drill_${runId}_dst`;
  requireSafeTarget(sourceName);
  requireSafeTarget(restoredName);
  const admin = new URL(base);
  admin.pathname = "/postgres";

  return {
    runId,
    adminDatabaseUrl: admin.toString(),
    source: target(base, sourceName, `MISE_DRILL_RESTORE_V1:${sourceName}`),
    restored: target(
      base,
      restoredName,
      `MISE_DRILL_RESTORE_V1:${restoredName}`,
    ),
    backupFilePath: join(tmpdir(), `rms-drill-${runId}.dump`),
  };
}
