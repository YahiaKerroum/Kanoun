import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type { GuestSessionRecord } from "../domain/models.js";
import type {
  CreateGuestSessionInput,
  OrderingStore,
} from "../contracts/ordering-store.js";

interface GuestSessionRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string;
  readonly table_id: string | null;
  readonly display_name: string | null;
  readonly created_at_utc: Date;
  readonly last_seen_at_utc: Date;
  readonly expires_at_utc: Date;
  readonly revoked_at_utc: Date | null;
}

function mapGuestSession(row: GuestSessionRow): GuestSessionRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableId: row.table_id ?? undefined,
    displayName: row.display_name ?? undefined,
    createdAtUtc: row.created_at_utc,
    lastSeenAtUtc: row.last_seen_at_utc,
    expiresAtUtc: row.expires_at_utc,
    revokedAtUtc: row.revoked_at_utc ?? undefined,
  };
}

export class PostgresOrderingStore implements OrderingStore {
  public async createGuestSession(
    transaction: TransactionContext,
    input: CreateGuestSessionInput,
  ): Promise<GuestSessionRecord> {
    const result = await transaction.sql.query<GuestSessionRow>(
      `
        insert into ordering.customer_sessions (
          id, business_account_id, restaurant_id, branch_id, table_id,
          token_hash, display_name, created_at_utc, last_seen_at_utc, expires_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
        returning
          id, business_account_id, restaurant_id, branch_id, table_id,
          display_name, created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.tableId ?? null,
        input.tokenHash,
        input.displayName ?? null,
        input.now,
        input.absoluteExpiresAtUtc,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Database insert did not return the created record.");
    }
    return mapGuestSession(row);
  }

  public async findGuestSessionByTokenHash(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<GuestSessionRecord | undefined> {
    const result = await sql.query<GuestSessionRow>(
      `
        select
          id, business_account_id, restaurant_id, branch_id, table_id,
          display_name, created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
        from ordering.customer_sessions
        where token_hash = $1
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? mapGuestSession(row) : undefined;
  }

  public async touchGuestSession(
    sql: SqlExecutor,
    id: string,
    now: Date,
  ): Promise<void> {
    await sql.query(
      `update ordering.customer_sessions set last_seen_at_utc = $2 where id = $1`,
      [id, now],
    );
  }
}
