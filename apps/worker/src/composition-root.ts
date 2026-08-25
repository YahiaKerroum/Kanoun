import {
  createAlertEvaluator,
  createDatabasePool,
  createLoggingAlertSink,
  createServiceMetrics,
  pingDatabase,
  PostgresOutboxProcessor,
  readPoolSaturation,
  type AlertEvaluator,
  type DatabasePool,
  type ServiceMetrics,
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
  readonly serviceMetrics: ServiceMetrics;
  readonly alertEvaluator: AlertEvaluator;
  readonly checkReadiness: () => Promise<void>;
  readonly sampleObservability: () => Promise<void>;
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
  const serviceMetrics = createServiceMetrics();
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "rms-worker",
    observation: {
      onQueryComplete: (durationMs) =>
        serviceMetrics.observePoolQuery(durationMs),
      onPoolError: () => serviceMetrics.countPoolError(),
    },
  });
  const logger = pino({
    level: config.logLevel,
    base: null,
    redact: {
      paths: ["password", "secret", "sessionToken"],
      censor: "[REDACTED]",
    },
  });
  const alertEvaluator = createAlertEvaluator(createLoggingAlertSink(logger));
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
    observeOutcome: (outcome, eventAgeMs) => {
      serviceMetrics.countOutboxOutcome(outcome);
      serviceMetrics.observeOutboxEventAge(eventAgeMs);
    },
    observeHandler: (handlerName, durationMs) =>
      serviceMetrics.observeOutboxHandler(handlerName, durationMs),
  });

  const sampleObservability = async (): Promise<void> => {
    serviceMetrics.setPoolSaturation(readPoolSaturation(databasePool));
    try {
      await pingDatabase(databasePool);
      serviceMetrics.setDatabaseReady(true);
    } catch {
      serviceMetrics.setDatabaseReady(false);
    }
    try {
      serviceMetrics.setOutboxBacklog(await processor.readBacklog());
    } catch {
      // Backlog sampling failures surface through database readiness
      // and pool error counters; the sampler must never crash the worker.
    }
    alertEvaluator.evaluate(serviceMetrics.snapshot());
  };

  return {
    databasePool,
    logger,
    serviceMetrics,
    alertEvaluator,
    checkReadiness: () => pingDatabase(databasePool),
    sampleObservability,
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
