import { z } from "zod";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];

const workerConfigSchema = z
  .object({
    DATABASE_URL: z.url().startsWith("postgresql://"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    WORKER_ID: z.string().trim().min(1).max(160).default("rms-worker-1"),
    OUTBOX_LEASE_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    OUTBOX_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3650)
      .default(90),
    WORKER_METRICS_HOST: z.string().trim().default(""),
    WORKER_METRICS_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(3001),
  })
  .superRefine((config, context) => {
    if (
      config.WORKER_METRICS_HOST &&
      !LOOPBACK_HOSTS.includes(config.WORKER_METRICS_HOST)
    ) {
      context.addIssue({
        code: "custom",
        path: ["WORKER_METRICS_HOST"],
        message:
          "Worker metrics listener must bind to a loopback host or stay empty (disabled).",
      });
    }
  });

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly logLevel: string;
  readonly workerId: string;
  readonly leaseMilliseconds: number;
  readonly maximumAttempts: number;
  readonly outboxRetentionDays: number;
  readonly metricsHost: string;
  readonly metricsPort: number;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const result = workerConfigSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .join(", ");
    throw new Error(`Invalid worker configuration fields: ${fields}`);
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    logLevel: result.data.LOG_LEVEL,
    workerId: result.data.WORKER_ID,
    leaseMilliseconds: result.data.OUTBOX_LEASE_MS,
    maximumAttempts: result.data.OUTBOX_MAX_ATTEMPTS,
    outboxRetentionDays: result.data.OUTBOX_RETENTION_DAYS,
    metricsHost: result.data.WORKER_METRICS_HOST,
    metricsPort: result.data.WORKER_METRICS_PORT,
  };
}
