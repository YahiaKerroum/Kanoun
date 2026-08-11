import { createDatabasePool, type DatabasePool } from "@rms/building-blocks";
import type { DemoConfig } from "./demo-config.js";

const demoAdvisoryLock = 1_983_042_017;

interface DatabaseMarkerRow {
  readonly datname: string;
  readonly marker: string | null;
}

export type DemoDatabaseAction = "created" | "reset";

export interface DemoDatabaseResetResult {
  readonly action: DemoDatabaseAction;
  readonly databaseName: string;
}

export type DemoDatabaseSafetyCode =
  "unmarked_database_refused" | "database_marker_mismatch";

export class DemoDatabaseSafetyError extends Error {
  public readonly name = "DemoDatabaseSafetyError";

  public constructor(
    public readonly code: DemoDatabaseSafetyCode,
    message: string,
  ) {
    super(message);
  }
}

export function assertDemoDatabaseMarker(
  marker: string | null | undefined,
  expectedMarker: string,
): void {
  if (marker !== undefined && marker !== expectedMarker) {
    throw new DemoDatabaseSafetyError(
      marker === null
        ? "unmarked_database_refused"
        : "database_marker_mismatch",
      "The named demo database is not marked as MISE-owned; no data was changed.",
    );
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier)) {
    throw new Error("Unsafe database identifier.");
  }
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function databaseMarker(
  adminPool: DatabasePool,
  databaseName: string,
): Promise<DatabaseMarkerRow | undefined> {
  const result = await adminPool.query<DatabaseMarkerRow>(
    `select datname, shobj_description(oid, 'pg_database') as marker
     from pg_catalog.pg_database
     where datname = $1`,
    [databaseName],
  );
  return result.rows[0];
}

async function acquireLock(adminPool: DatabasePool): Promise<void> {
  await adminPool.query("select pg_advisory_lock($1)", [demoAdvisoryLock]);
}

async function releaseLock(adminPool: DatabasePool): Promise<void> {
  await adminPool.query("select pg_advisory_unlock($1)", [demoAdvisoryLock]);
}

async function recreateDatabase(
  adminPool: DatabasePool,
  config: DemoConfig,
  existed: boolean,
): Promise<void> {
  const databaseIdentifier = quoteIdentifier(config.databaseName);
  if (existed) {
    await adminPool.query(`drop database ${databaseIdentifier} with (force)`);
  }
  await adminPool.query(`create database ${databaseIdentifier}`);
  await adminPool.query(
    `comment on database ${databaseIdentifier} is ${quoteLiteral(config.databaseMarker)}`,
  );
}

export async function resetDemoDatabase(
  config: DemoConfig,
): Promise<DemoDatabaseResetResult> {
  const adminPool = createDatabasePool({
    connectionString: config.adminDatabaseUrl,
    applicationName: "rms-demo-database-guard",
    maximumConnections: 1,
  });
  let lockHeld = false;
  try {
    await acquireLock(adminPool);
    lockHeld = true;
    const existing = await databaseMarker(adminPool, config.databaseName);
    assertDemoDatabaseMarker(existing?.marker, config.databaseMarker);
    await recreateDatabase(adminPool, config, existing !== undefined);
    return {
      action: existing ? "reset" : "created",
      databaseName: config.databaseName,
    };
  } finally {
    if (lockHeld) {
      await releaseLock(adminPool);
    }
    await adminPool.end();
  }
}

export async function verifyDemoDatabaseMarker(
  config: DemoConfig,
): Promise<boolean> {
  const adminPool = createDatabasePool({
    connectionString: config.adminDatabaseUrl,
    applicationName: "rms-demo-database-check",
    maximumConnections: 1,
  });
  try {
    const existing = await databaseMarker(adminPool, config.databaseName);
    return existing?.marker === config.databaseMarker;
  } finally {
    await adminPool.end();
  }
}

export async function removeMarkedDatabase(config: DemoConfig): Promise<void> {
  const adminPool = createDatabasePool({
    connectionString: config.adminDatabaseUrl,
    applicationName: "rms-real-e2e-database-cleanup",
    maximumConnections: 1,
  });
  let lockHeld = false;
  try {
    await acquireLock(adminPool);
    lockHeld = true;
    const existing = await databaseMarker(adminPool, config.databaseName);
    if (!existing) {
      return;
    }
    assertDemoDatabaseMarker(existing.marker, config.databaseMarker);
    await adminPool.query(
      `drop database ${quoteIdentifier(config.databaseName)} with (force)`,
    );
  } finally {
    if (lockHeld) {
      await releaseLock(adminPool);
    }
    await adminPool.end();
  }
}
