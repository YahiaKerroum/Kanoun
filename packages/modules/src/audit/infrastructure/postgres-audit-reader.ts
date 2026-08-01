import type {
  AuditEventRecord,
  AuditReader,
} from "../contracts/audit-reader.js";

export class PostgresAuditReader implements AuditReader {
  public async search(
    sql: Parameters<AuditReader["search"]>[0],
    input: Parameters<AuditReader["search"]>[1],
  ): Promise<readonly AuditEventRecord[]> {
    const result = await sql.query<{
      id: string;
      business_account_id: string;
      restaurant_id: string | null;
      branch_id: string | null;
      actor_user_id: string | null;
      action: string;
      target_type: string;
      target_id: string;
      outcome: "attempted" | "succeeded" | "failed";
      reason: string | null;
      correlation_id: string;
      before_data: unknown;
      after_data: unknown;
      occurred_at_utc: Date;
    }>(
      `
        select id, business_account_id, restaurant_id, branch_id,
          actor_user_id, action, target_type, target_id, outcome, reason,
          correlation_id, before_data, after_data, occurred_at_utc
        from audit.audit_events
        where business_account_id = $1
          and ($2::uuid is null or restaurant_id = $2)
          and (
            branch_id is null
            or branch_id = any($3::uuid[])
          )
          and (
            $4::uuid is null
            or branch_id = $4
          )
          and ($5::uuid is null or actor_user_id = $5)
          and ($6::text is null or action = $6)
          and ($7::text is null or target_type = $7)
          and ($8::timestamptz is null or occurred_at_utc >= $8)
          and ($9::timestamptz is null or occurred_at_utc <= $9)
        order by occurred_at_utc desc, id desc
        limit $10 offset $11
      `,
      [
        input.businessAccountId,
        input.restaurantId ?? null,
        input.authorizedBranchIds,
        input.branchId ?? null,
        input.actorUserId ?? null,
        input.action ?? null,
        input.targetType ?? null,
        input.occurredFrom ?? null,
        input.occurredTo ?? null,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => ({
      id: row.id,
      businessAccountId: row.business_account_id,
      ...(row.restaurant_id ? { restaurantId: row.restaurant_id } : {}),
      ...(row.branch_id ? { branchId: row.branch_id } : {}),
      ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      outcome: row.outcome,
      ...(row.reason ? { reason: row.reason } : {}),
      correlationId: row.correlation_id,
      ...(row.before_data !== null ? { beforeData: row.before_data } : {}),
      ...(row.after_data !== null ? { afterData: row.after_data } : {}),
      occurredAtUtc: row.occurred_at_utc,
    }));
  }
}
