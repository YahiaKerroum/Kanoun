import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import process from "node:process";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/building-blocks/src/database/platform-schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
