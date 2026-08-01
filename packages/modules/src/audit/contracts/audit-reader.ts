import type { SqlExecutor } from "@rms/building-blocks";

export interface AuditEventRecord {
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

export interface AuditReader {
  search(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly restaurantId?: string;
      readonly authorizedBranchIds: readonly string[];
      readonly branchId?: string;
      readonly actorUserId?: string;
      readonly action?: string;
      readonly targetType?: string;
      readonly occurredFrom?: Date;
      readonly occurredTo?: Date;
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<readonly AuditEventRecord[]>;
}
