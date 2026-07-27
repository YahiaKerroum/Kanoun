import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  TRUST_PROXY: booleanFromString.default(false),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  SESSION_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url(),
});

export interface ApiConfig {
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly trustProxy: boolean;
  readonly logLevel:
    "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly sessionSecret: string;
  readonly webOrigin: string;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .join(", ");
    throw new Error(`Invalid API configuration fields: ${fields}`);
  }

  return {
    nodeEnvironment: result.data.NODE_ENV,
    host: result.data.API_HOST,
    port: result.data.API_PORT,
    trustProxy: result.data.TRUST_PROXY,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.DATABASE_URL,
    sessionSecret: result.data.SESSION_SECRET,
    webOrigin: result.data.WEB_ORIGIN,
  };
}
