import type {
  AuditEventInput,
  AuditWriter,
} from "../contracts/audit-writer.js";

export class PostgresAuditWriter implements AuditWriter {
  public async appendInTransaction(
    transaction: Parameters<AuditWriter["appendInTransaction"]>[0],
    event: AuditEventInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into audit.audit_events (
          id,
          business_account_id,
          restaurant_id,
          branch_id,
          actor_user_id,
          action,
          target_type,
          target_id,
          outcome,
          reason,
          correlation_id,
          before_data,
          after_data,
          occurred_at_utc
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12::jsonb, $13::jsonb, $14
        )
      `,
      [
        event.id,
        event.businessAccountId,
        event.restaurantId ?? null,
        event.branchId ?? null,
        event.actorUserId ?? null,
        event.action,
        event.targetType,
        event.targetId,
        event.outcome,
        event.reason ?? null,
        event.correlationId,
        event.beforeData ? JSON.stringify(event.beforeData) : null,
        event.afterData ? JSON.stringify(event.afterData) : null,
        event.occurredAtUtc,
      ],
    );
  }
}
