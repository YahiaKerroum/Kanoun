import { z } from "zod";

export const DEMO_DATABASE_NAME = "rms_demo" as const;
export const DEMO_DATABASE_MARKER = "MISE_LOCAL_SYNTHETIC_DEMO_V1" as const;
export const DEFAULT_DEMO_LAUNCHER_HOST = "127.0.0.1" as const;
export const DEFAULT_DEMO_LAUNCHER_PORT = 4170 as const;

const demoEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DEMO_DATABASE_URL: z.url().startsWith("postgresql://"),
  DEMO_DATABASE_NAME: z.string().trim().min(1),
  DEMO_DATABASE_MARKER: z.string().trim().min(1),
  DEMO_LAUNCHER_HOST: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_DEMO_LAUNCHER_HOST),
  DEMO_LAUNCHER_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(DEFAULT_DEMO_LAUNCHER_PORT),
  DEMO_SEED_PASSWORD: z.string().min(12).max(128).optional(),
});

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type DemoSafetyCode =
  | "missing_safety_configuration"
  | "production_mode_refused"
  | "non_loopback_database_refused"
  | "unexpected_database_name"
  | "non_loopback_launcher_refused";

export class DemoSafetyError extends Error {
  public readonly name = "DemoSafetyError";

  public constructor(
    public readonly code: DemoSafetyCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DemoConfig {
  readonly databaseUrl: string;
  readonly databaseName: string;
  readonly databaseHost: string;
  readonly databasePort: number;
  readonly adminDatabaseUrl: string;
  readonly databaseMarker: string;
  readonly launcherHost: string;
  readonly launcherPort: number;
  readonly seedPassword?: string;
}

function requireLoopbackHost(
  host: string,
  code: DemoSafetyCode,
  message: string,
): void {
  if (!loopbackHosts.has(host.toLowerCase())) {
    throw new DemoSafetyError(code, message);
  }
}

function databaseNameFromUrl(databaseUrl: URL): string {
  return decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ""));
}

export function parseDemoConfig(environment: NodeJS.ProcessEnv): DemoConfig {
  const parsed = demoEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new DemoSafetyError(
      "missing_safety_configuration",
      "Demo safety configuration is incomplete. Set DEMO_DATABASE_URL, DEMO_DATABASE_NAME, and DEMO_DATABASE_MARKER.",
    );
  }
  if (parsed.data.NODE_ENV === "production") {
    throw new DemoSafetyError(
      "production_mode_refused",
      "The local synthetic demo is disabled when NODE_ENV=production.",
    );
  }

  const targetUrl = new URL(parsed.data.DEMO_DATABASE_URL);
  const databaseName = databaseNameFromUrl(targetUrl);
  requireLoopbackHost(
    targetUrl.hostname,
    "non_loopback_database_refused",
    "The demo database must be hosted on a loopback address.",
  );
  if (
    parsed.data.DEMO_DATABASE_NAME !== DEMO_DATABASE_NAME ||
    databaseName !== DEMO_DATABASE_NAME
  ) {
    throw new DemoSafetyError(
      "unexpected_database_name",
      `The demo database must be named ${DEMO_DATABASE_NAME}; refusing the requested target.`,
    );
  }
  if (parsed.data.DEMO_DATABASE_MARKER !== DEMO_DATABASE_MARKER) {
    throw new DemoSafetyError(
      "missing_safety_configuration",
      "The configured demo database marker is not the approved local marker.",
    );
  }
  requireLoopbackHost(
    parsed.data.DEMO_LAUNCHER_HOST,
    "non_loopback_launcher_refused",
    "The demo launcher may bind only to a loopback address.",
  );

  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";

  return {
    databaseUrl: targetUrl.toString(),
    databaseName: DEMO_DATABASE_NAME,
    databaseHost: targetUrl.hostname,
    databasePort: targetUrl.port ? Number(targetUrl.port) : 5432,
    adminDatabaseUrl: adminUrl.toString(),
    databaseMarker: DEMO_DATABASE_MARKER,
    launcherHost: parsed.data.DEMO_LAUNCHER_HOST,
    launcherPort: parsed.data.DEMO_LAUNCHER_PORT,
    ...(parsed.data.DEMO_SEED_PASSWORD
      ? { seedPassword: parsed.data.DEMO_SEED_PASSWORD }
      : {}),
  };
}

export function isLoopbackHost(host: string): boolean {
  return loopbackHosts.has(host.toLowerCase());
}
