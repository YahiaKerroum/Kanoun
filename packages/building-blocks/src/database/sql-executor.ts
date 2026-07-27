import type { QueryResult, QueryResultRow } from "pg";

export interface SqlExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface TransactionContext {
  readonly sql: SqlExecutor;
}
