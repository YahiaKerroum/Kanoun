import { Client } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("platform migration", () => {
  it("creates the outbox, inbox, and idempotency foundations", async () => {
    if (!connectionString) {
      throw new Error("TEST_DATABASE_URL is required.");
    }

    const client = new Client({ connectionString });
    await client.connect();

    try {
      const result = await client.query<{ table_name: string }>(`
        select table_name
        from information_schema.tables
        where table_schema = 'platform'
          and table_name in (
            'outbox_messages',
            'inbox_checkpoints',
            'idempotency_records'
          )
        order by table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "idempotency_records",
        "inbox_checkpoints",
        "outbox_messages",
      ]);
    } finally {
      await client.end();
    }
  });
});
