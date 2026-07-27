import { z } from "zod";

const workerConfigSchema = z.object({
  DATABASE_URL: z.url().startsWith("postgresql://"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly logLevel: string;
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
  };
}
