import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { resetDemoDatabase } from "./demo-database.js";
import { parseDemoConfig, type DemoConfig } from "./demo-config.js";
import { seedDemoData } from "./demo-seed-data.js";
import { generatedDemoPassword, generatedDemoSecret } from "./demo-secrets.js";
import type { DemoSeedResult } from "./demo-types.js";

const executeFile = promisify(execFile);

async function applyMigrations(connectionString: string): Promise<void> {
  await executeFile(
    process.execPath,
    ["./node_modules/drizzle-kit/bin.cjs", "migrate"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString },
    },
  );
}

function configured(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export interface DemoSeedOptions {
  readonly config: DemoConfig;
  readonly password: string;
  readonly sessionSecret: string;
  readonly guestAccessSecret: string;
  readonly customerWebOrigin: string;
}

/** Recreates the demo database, migrates it, and loads the sample restaurant. */
export async function seedDemo(
  options: DemoSeedOptions,
): Promise<DemoSeedResult> {
  await resetDemoDatabase(options.config);
  await applyMigrations(options.config.databaseUrl);
  const result = await seedDemoData({
    connectionString: options.config.databaseUrl,
    password: options.password,
    sessionSecret: options.sessionSecret,
    guestAccessSecret: options.guestAccessSecret,
    customerWebOrigin: options.customerWebOrigin,
  });
  console.log(
    `Seeded ${result.businessCode}: ${result.restaurantName} / ${result.branchName} with staff, menu, tables, orders, payments, refunds, audit, notifications, and reports.`,
  );
  return result;
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = parseDemoConfig(process.env);
  const result = await seedDemo({
    config,
    password: config.seedPassword ?? generatedDemoPassword(),
    sessionSecret: configured("SESSION_SECRET", generatedDemoSecret()),
    guestAccessSecret: configured("GUEST_ACCESS_SECRET", generatedDemoSecret()),
    customerWebOrigin: configured(
      "CUSTOMER_WEB_ORIGIN",
      "http://127.0.0.1:5174",
    ),
  });
  console.log(
    `Demo seed ready for ${result.businessCode}: ${result.roles.length} roles and ${result.customerUrls.length} table QR URL.`,
  );
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
