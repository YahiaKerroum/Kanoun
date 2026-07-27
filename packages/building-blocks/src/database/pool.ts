import { Pool, type PoolConfig } from "pg";

export type DatabasePool = Pool;

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly applicationName: string;
  readonly maximumConnections?: number;
}

export function createDatabasePool(options: DatabasePoolOptions): DatabasePool {
  const config: PoolConfig = {
    application_name: options.applicationName,
    connectionString: options.connectionString,
    max: options.maximumConnections ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  };

  return new Pool(config);
}

export async function pingDatabase(pool: DatabasePool): Promise<void> {
  await pool.query("select 1");
}
