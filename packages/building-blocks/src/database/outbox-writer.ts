import type { SqlExecutor } from "./sql-executor.js";

export interface OutboxMessage {
  readonly eventId: string;
  readonly eventType: string;
  readonly businessAccountId: string;
  readonly restaurantId?: string;
  readonly branchId?: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAtUtc: Date;
  readonly correlationId: string;
  readonly causationId: string;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export async function appendOutboxMessage(
  sql: SqlExecutor,
  message: OutboxMessage,
): Promise<void> {
  await sql.query(
    `
      insert into platform.outbox_messages (
        event_id,
        event_type,
        schema_version,
        business_account_id,
        restaurant_id,
        branch_id,
        aggregate_id,
        aggregate_version,
        occurred_at_utc,
        correlation_id,
        causation_id,
        actor_id,
        payload,
        next_attempt_at_utc
      )
      values ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $8)
    `,
    [
      message.eventId,
      message.eventType,
      message.businessAccountId,
      message.restaurantId ?? null,
      message.branchId ?? null,
      message.aggregateId,
      message.aggregateVersion,
      message.occurredAtUtc,
      message.correlationId,
      message.causationId,
      message.actorId ?? null,
      JSON.stringify(message.payload),
    ],
  );
}
