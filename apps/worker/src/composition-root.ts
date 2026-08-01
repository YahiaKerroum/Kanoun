import {
  createDatabasePool,
  PostgresOutboxProcessor,
  pingDatabase,
  type DatabasePool,
} from "@rms/building-blocks";
import {
  NotificationService,
  PostgresIdentityAccessStore,
  PostgresNotificationStore,
  PostgresReportingStore,
  PostgresRestaurantConfigurationStore,
  ReportingService,
} from "@rms/modules";
import pino, { type Logger } from "pino";
import type { WorkerConfig } from "./config.js";

export interface WorkerComposition {
  readonly databasePool: DatabasePool;
  readonly logger: Logger;
  readonly checkReadiness: () => Promise<void>;
  readonly processNext: () => Promise<
    "processed" | "idle" | "retry_scheduled" | "quarantined"
  >;
  readonly replayQuarantined: (eventId: string) => Promise<boolean>;
  readonly runRetention: () => Promise<{
    readonly notifications: number;
    readonly outbox: number;
  }>;
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
  const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
  const identityAccess = new PostgresIdentityAccessStore();
  const notificationService = new NotificationService({
    databasePool,
    store: new PostgresNotificationStore(),
    identityAccess,
    restaurantConfiguration,
  });
  const reportingService = new ReportingService({
    databasePool,
    store: new PostgresReportingStore(),
    restaurantConfiguration,
  });
  const processor = new PostgresOutboxProcessor(databasePool, {
    workerId: config.workerId,
    handlers: [notificationService, reportingService],
    leaseMilliseconds: config.leaseMilliseconds,
    maximumAttempts: config.maximumAttempts,
    onQuarantined: (event) => {
      logger.error(event, "Outbox event entered quarantine");
    },
  });

  return {
    databasePool,
    logger,
    checkReadiness: () => pingDatabase(databasePool),
    processNext: () => processor.processNext(),
    replayQuarantined: (eventId) => processor.replayQuarantined(eventId),
    runRetention: async () => ({
      notifications: await notificationService.deleteExpired(),
      outbox: await processor.pruneProcessed(
        new Date(Date.now() - config.outboxRetentionDays * 86_400_000),
      ),
    }),
  };
}
