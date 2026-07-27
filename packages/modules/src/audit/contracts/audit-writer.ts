import type { TransactionContext } from "@rms/building-blocks";

export interface AuditEventInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId?: string;
  readonly branchId?: string;
  readonly actorUserId?: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly outcome: "attempted" | "succeeded" | "failed";
  readonly reason?: string;
  readonly correlationId: string;
  readonly beforeData?: unknown;
  readonly afterData?: unknown;
  readonly occurredAtUtc: Date;
}

export interface AuditWriter {
  appendInTransaction(
    transaction: TransactionContext,
    event: AuditEventInput,
  ): Promise<void>;
}
