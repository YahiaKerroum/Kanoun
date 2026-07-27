import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type { GuestSessionRecord } from "../domain/models.js";

export interface CreateGuestSessionInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly tokenHash: string;
  readonly displayName?: string | undefined;
  readonly now: Date;
  readonly absoluteExpiresAtUtc: Date;
}

export interface OrderingStore {
  createGuestSession(
    transaction: TransactionContext,
    input: CreateGuestSessionInput,
  ): Promise<GuestSessionRecord>;
  findGuestSessionByTokenHash(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<GuestSessionRecord | undefined>;
  touchGuestSession(sql: SqlExecutor, id: string, now: Date): Promise<void>;
}
