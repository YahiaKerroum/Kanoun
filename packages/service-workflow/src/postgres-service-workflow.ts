import type { DatabasePool, TransactionContext } from "@rms/building-blocks";

export class PostgresServiceWorkflow {
  public constructor(private readonly databasePool: DatabasePool) {}

  public async run<Result>(
    operation: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.databasePool.connect();

    try {
      await client.query("begin");
      const result = await operation({ sql: client });
      await client.query("commit");
      return result;
    } catch (error: unknown) {
      try {
        await client.query("rollback");
      } catch {
        // If the connection itself died (e.g. a network-level error), the
        // rollback attempt fails too. Swallow that so the original error
        // (thrown below) isn't replaced by this secondary one.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
