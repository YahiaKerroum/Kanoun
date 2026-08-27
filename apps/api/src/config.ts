import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/**
 * `false` disables proxy trust. A positive integer is the exact number of
 * trusted hops in front of this process (typically `1` for a single load
 * balancer) and is passed straight through to Express's own hop-counting
 * trust-proxy mode. `true` is deliberately not accepted: express-rate-limit
 * refuses it at request time (ERR_ERL_PERMISSIVE_TRUST_PROXY) because
 * blanket-trusting every hop lets a real client spoof its own IP address in
 * X-Forwarded-For and bypass per-IP rate limiting entirely.
 */
const trustProxySchema = z
  .string()
  .default("false")
  .transform((value, ctx) => {
    if (value === "false") return false as const;
    const hops = Number(value);
    if (!Number.isInteger(hops) || hops < 1) {
      ctx.addIssue({
        code: "custom",
        message:
          'TRUST_PROXY must be "false" or a positive integer trusted-hop count.',
      });
      return z.NEVER;
    }
    return hops;
  });

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    TRUST_PROXY: trustProxySchema,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url().startsWith("postgresql://"),
    SESSION_SECRET: z.string().min(32),
    BOOTSTRAP_SECRET: z.string().min(32),
    SUPPORT_ACCESS_SECRET: z.string().min(32),
    GUEST_ACCESS_SECRET: z.string().min(32),
    SESSION_COOKIE_SECURE: booleanFromString.default(false),
    WEB_ORIGIN: z.url(),
    STAFF_WEB_ORIGIN: z.url().optional(),
    CUSTOMER_WEB_ORIGIN: z.url(),
    RECOVERY_DELIVERY_URL: z.url().optional(),
    RECOVERY_DELIVERY_SECRET: z.string().min(32).optional(),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      (!config.SESSION_COOKIE_SECURE ||
        !config.RECOVERY_DELIVERY_URL ||
        !config.RECOVERY_DELIVERY_SECRET ||
        (config.RECOVERY_DELIVERY_URL &&
          new URL(config.RECOVERY_DELIVERY_URL).protocol !== "https:"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["NODE_ENV"],
        message:
          "Production requires secure cookies and recovery delivery configuration.",
      });
    }
  });

export interface ApiConfig {
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly trustProxy: false | number;
  readonly logLevel:
    "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly sessionSecret: string;
  readonly bootstrapSecret: string;
  readonly supportAccessSecret: string;
  readonly guestAccessSecret: string;
  readonly sessionCookieSecure: boolean;
  readonly webOrigin: string;
  readonly staffWebOrigin?: string;
  readonly customerWebOrigin: string;
  readonly recoveryDeliveryUrl?: string;
  readonly recoveryDeliverySecret?: string;
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
    bootstrapSecret: result.data.BOOTSTRAP_SECRET,
    supportAccessSecret: result.data.SUPPORT_ACCESS_SECRET,
    guestAccessSecret: result.data.GUEST_ACCESS_SECRET,
    sessionCookieSecure: result.data.SESSION_COOKIE_SECURE,
    webOrigin: result.data.WEB_ORIGIN,
    ...(result.data.STAFF_WEB_ORIGIN
      ? { staffWebOrigin: result.data.STAFF_WEB_ORIGIN }
      : {}),
    customerWebOrigin: result.data.CUSTOMER_WEB_ORIGIN,
    ...(result.data.RECOVERY_DELIVERY_URL
      ? { recoveryDeliveryUrl: result.data.RECOVERY_DELIVERY_URL }
      : {}),
    ...(result.data.RECOVERY_DELIVERY_SECRET
      ? { recoveryDeliverySecret: result.data.RECOVERY_DELIVERY_SECRET }
      : {}),
  };
}
