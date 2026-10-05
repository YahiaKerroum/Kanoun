import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { DatabasePool } from "./pool.js";

/**
 * Applies the versioned SQL migrations in `migrationsFolder` using the same
 * bookkeeping table as `drizzle-kit migrate` (see `drizzle.config.ts`), so a
 * database migrated by either path stays compatible with the other.
 */
export async function applyDatabaseMigrations(
  pool: DatabasePool,
  migrationsFolder: string,
): Promise<void> {
  await migrate(drizzle(pool), {
    migrationsFolder,
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations",
  });
}
