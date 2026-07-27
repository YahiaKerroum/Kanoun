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
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
