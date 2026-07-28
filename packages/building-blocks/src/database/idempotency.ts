import { randomUUID } from "node:crypto";
import type { TransactionContext } from "./sql-executor.js";

export interface BeginIdempotentCommandInput {
  readonly businessAccountId: string;
  readonly actorScope: string;
  readonly operation: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
  readonly now: Date;
  readonly expiresAtUtc: Date;
}

export type IdempotencyStart =
  | { readonly kind: "acquired"; readonly recordId: string }
  | {
      readonly kind: "replay";
      readonly responseStatus: number;
      readonly responseBody: unknown;
    }
  | { readonly kind: "payload_conflict" }
  | { readonly kind: "in_progress" };

interface IdempotencyRow {
  readonly id: string;
  readonly request_hash: string;
  readonly status: "pending" | "completed" | "failed";
  readonly response_status: number | null;
  readonly response_body: unknown;
}

export async function beginIdempotentCommand(
  transaction: TransactionContext,
  input: BeginIdempotentCommandInput,
): Promise<IdempotencyStart> {
  await transaction.sql.query(
    `
      delete from platform.idempotency_records
      where business_account_id = $1
        and actor_scope = $2
        and operation = $3
        and idempotency_key_hash = $4
        and expires_at_utc <= $5
    `,
    [
      input.businessAccountId,
      input.actorScope,
      input.operation,
      input.idempotencyKeyHash,
      input.now,
    ],
  );

  const recordId = randomUUID();
  const inserted = await transaction.sql.query<{ readonly id: string }>(
    `
      insert into platform.idempotency_records (
        id, business_account_id, actor_scope, operation,
        idempotency_key_hash, request_hash, status,
        created_at_utc, expires_at_utc
      )
      values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      on conflict (
        business_account_id, actor_scope, operation, idempotency_key_hash
      ) do nothing
      returning id
    `,
    [
      recordId,
      input.businessAccountId,
      input.actorScope,
      input.operation,
      input.idempotencyKeyHash,
      input.requestHash,
      input.now,
      input.expiresAtUtc,
    ],
  );
  if (inserted.rows[0]) {
    return { kind: "acquired", recordId };
  }

  const existing = await transaction.sql.query<IdempotencyRow>(
    `
      select id, request_hash, status, response_status, response_body
      from platform.idempotency_records
      where business_account_id = $1
        and actor_scope = $2
        and operation = $3
        and idempotency_key_hash = $4
      for update
    `,
    [
      input.businessAccountId,
      input.actorScope,
      input.operation,
      input.idempotencyKeyHash,
    ],
  );
  const row = existing.rows[0];
  if (!row) {
    return { kind: "in_progress" };
  }
  if (row.request_hash !== input.requestHash) {
    return { kind: "payload_conflict" };
  }
  if (
    row.status === "completed" &&
    row.response_status !== null &&
    row.response_body !== null
  ) {
    return {
      kind: "replay",
      responseStatus: row.response_status,
      responseBody: row.response_body,
    };
  }
  return { kind: "in_progress" };
}

export async function completeIdempotentCommand(
  transaction: TransactionContext,
  recordId: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await transaction.sql.query(
    `
      update platform.idempotency_records
      set status = 'completed', response_status = $2, response_body = $3::jsonb
      where id = $1 and status = 'pending'
    `,
    [recordId, responseStatus, JSON.stringify(responseBody)],
  );
}
