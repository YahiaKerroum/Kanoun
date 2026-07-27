import {
  createDatabasePool,
  pingDatabase,
  type DatabasePool,
} from "@rms/building-blocks";
import { createApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { createLogger } from "./logging.js";

export interface ApiComposition {
  readonly app: ReturnType<typeof createApp>;
  readonly databasePool: DatabasePool;
}

export function composeApi(config: ApiConfig): ApiComposition {
  const logger = createLogger(config.logLevel);
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-api",
  });

  const app = createApp({
    logger,
    trustProxy: config.trustProxy,
    checkReadiness: () => pingDatabase(databasePool),
  });

  return {
    app,
    databasePool,
  };
}
