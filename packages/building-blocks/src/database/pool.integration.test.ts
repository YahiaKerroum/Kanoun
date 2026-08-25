import { describe, expect, it } from "vitest";
import {
  createDatabasePool,
  pingDatabase,
  readPoolSaturation,
} from "./pool.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("PostgreSQL pool observation", () => {
  if (!connectionString) return;

  it("reports query completion duration for a successful query", async () => {
    const durations: number[] = [];
    const pool = createDatabasePool({
      connectionString,
      applicationName: "rms-pr07-pool-test",
      observation: {
        onQueryComplete: (durationMs) => durations.push(durationMs),
      },
    });
    try {
      await pingDatabase(pool);
      expect(durations).toHaveLength(1);
      expect(durations[0]).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.end();
    }
  });

  it("reports query completion duration even when the query rejects", async () => {
    const durations: number[] = [];
    const pool = createDatabasePool({
      connectionString,
      applicationName: "rms-pr07-pool-test",
      observation: {
        onQueryComplete: (durationMs) => durations.push(durationMs),
      },
    });
    try {
      await expect(
        pool.query("select * from platform.no_such_table_pr07"),
      ).rejects.toThrow();
      expect(durations).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  it("leaves query behavior unobserved and unaffected when no hooks are configured", async () => {
    const pool = createDatabasePool({
      connectionString,
      applicationName: "rms-pr07-pool-test",
    });
    try {
      const result = await pool.query<{ value: number }>("select 1 as value");
      expect(result.rows[0]?.value).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("reads current total, idle, and waiting connection counts", async () => {
    const pool = createDatabasePool({
      connectionString,
      applicationName: "rms-pr07-pool-test",
      maximumConnections: 4,
    });
    try {
      await pingDatabase(pool);
      const saturation = readPoolSaturation(pool);
      expect(saturation.total).toBeGreaterThanOrEqual(1);
      expect(saturation.idle).toBeGreaterThanOrEqual(0);
      expect(saturation.waiting).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.end();
    }
  });
});
