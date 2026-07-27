import {
  createDatabasePool,
  pingDatabase,
  type DatabasePool,
} from "@rms/building-blocks";
import pino, { type Logger } from "pino";
import type { WorkerConfig } from "./config.js";

export interface WorkerComposition {
  readonly databasePool: DatabasePool;
  readonly logger: Logger;
  readonly checkReadiness: () => Promise<void>;
}

export function composeWorker(config: WorkerConfig): WorkerComposition {
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-worker",
  });
  const logger = pino({
    level: config.logLevel,
    base: null,
    redact: {
      paths: ["password", "secret", "sessionToken"],
      censor: "[REDACTED]",
    },
  });

  return {
    databasePool,
    logger,
    checkReadiness: () => pingDatabase(databasePool),
  };
}
