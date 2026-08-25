import { Pool, type PoolConfig } from "pg";

export type DatabasePool = Pool;

export interface PoolObservationHooks {
  readonly onQueryComplete?: (durationMs: number) => void;
  readonly onPoolError?: () => void;
}

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly applicationName: string;
  readonly maximumConnections?: number;
  readonly observation?: PoolObservationHooks;
}

export interface PoolSaturation {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
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

  const pool = new Pool(config);

  if (options.observation?.onPoolError) {
    const onPoolError = options.observation.onPoolError;
    pool.on("error", () => {
      onPoolError();
    });
  }

  const onQueryComplete = options.observation?.onQueryComplete;
  if (onQueryComplete) {
    type LooseQuery = (...args: unknown[]) => unknown;
    const originalQuery = pool.query.bind(pool) as unknown as LooseQuery;
    const observedQuery: LooseQuery = (...args: unknown[]) => {
      const startedAt = performance.now();
      const report = () => onQueryComplete(performance.now() - startedAt);
      const possibleCallback = args[args.length - 1];
      if (typeof possibleCallback === "function") {
        const callback = possibleCallback as (
          error: Error | null,
          result?: unknown,
        ) => void;
        return originalQuery(
          ...args.slice(0, -1),
          (error: Error | null, result?: unknown) => {
            report();
            callback(error, result);
          },
        );
      }
      const result = originalQuery(...args) as Promise<unknown>;
      void result.then(
        () => report(),
        () => report(),
      );
      return result;
    };
    pool.query = observedQuery as unknown as Pool["query"];
  }

  return pool;
}

export function readPoolSaturation(pool: DatabasePool): PoolSaturation {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export async function pingDatabase(pool: DatabasePool): Promise<void> {
  await pool.query("select 1");
}
