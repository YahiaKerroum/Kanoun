import type { DemoConfig } from "../../../../scripts/demo-config.js";

export const DESKTOP_POSTGRES_PORT = 5433;
export const DESKTOP_POSTGRES_USERNAME = "mise_desktop";
export const DESKTOP_CONTROL_PORT = 4172;

// These two literals must stay equal to scripts/demo-config.ts's exported
// DEMO_DATABASE_NAME and DEMO_DATABASE_MARKER. They cannot be imported as
// values here without pulling scripts/demo-config.ts into this package's
// tsc build (see the "Why new shared modules..." note in the plan's Global
// Constraints).
const databaseName = "rms_demo";
const databaseMarker = "MISE_LOCAL_SYNTHETIC_DEMO_V1";

export function buildDesktopDemoConfig(
  postgresPassword: string,
  seedPassword: string,
): DemoConfig {
  const databaseUrl = new URL(
    `postgresql://${DESKTOP_POSTGRES_USERNAME}:${encodeURIComponent(postgresPassword)}@127.0.0.1:${String(DESKTOP_POSTGRES_PORT)}/${databaseName}`,
  );
  const adminDatabaseUrl = new URL(databaseUrl);
  adminDatabaseUrl.pathname = "/postgres";
  return {
    databaseUrl: databaseUrl.toString(),
    databaseName,
    databaseHost: "127.0.0.1",
    databasePort: DESKTOP_POSTGRES_PORT,
    adminDatabaseUrl: adminDatabaseUrl.toString(),
    databaseMarker,
    launcherHost: "127.0.0.1",
    launcherPort: 4170,
    seedPassword,
  };
}
