import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import { deriveTableState } from "../domain/table-state.js";
import type {
  EntityStatus,
  QrCodeKind,
  QrCodeStatus,
  ResolvedQrToken,
  Table,
  TableQrCode,
  TableSession,
} from "../domain/models.js";
import type {
  CreateTableInput,
  IssueQrCodeInput,
  TablesStore,
  UpdateTableInput,
} from "../contracts/tables-store.js";

function requireReturnedRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Database insert did not return the created record.");
  }
  return row;
}

interface TableRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly branch_id: string;
  readonly code: string;
  readonly area: string | null;
  readonly status: EntityStatus;
  readonly out_of_service: boolean;
  readonly version: number;
  readonly has_open_session: boolean;
}

function mapTable(row: TableRow): Table {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    branchId: row.branch_id,
    code: row.code,
    area: row.area ?? undefined,
    status: row.status,
    outOfService: row.out_of_service,
    version: row.version,
    derivedState: deriveTableState({
      status: row.status,
      outOfService: row.out_of_service,
      hasOpenSession: row.has_open_session,
    }),
  };
}

const tableSelectColumns = `
  t.id, t.business_account_id, t.branch_id, t.code, t.area, t.status, t.out_of_service, t.version,
  exists (
    select 1 from tables.table_sessions ts
    where ts.business_account_id = t.business_account_id
      and ts.table_id = t.id
      and ts.status = 'open'
  ) as has_open_session
`;

interface QrCodeRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly branch_id: string;
  readonly table_id: string | null;
  readonly kind: QrCodeKind;
  readonly status: QrCodeStatus;
  readonly created_at_utc: Date;
  readonly revoked_at_utc: Date | null;
  readonly revoked_reason: string | null;
}

function mapQrCode(row: QrCodeRow): TableQrCode {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    branchId: row.branch_id,
    tableId: row.table_id ?? undefined,
    kind: row.kind,
    status: row.status,
    createdAtUtc: row.created_at_utc,
    revokedAtUtc: row.revoked_at_utc ?? undefined,
    revokedReason: row.revoked_reason ?? undefined,
  };
}

interface TableSessionRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly branch_id: string;
  readonly table_id: string;
  readonly status: "open" | "closed";
  readonly configuration_version_id: string | null;
  readonly configuration_version: number | null;
  readonly version: number;
  readonly opened_at_utc: Date;
  readonly closed_at_utc: Date | null;
}

function mapTableSession(row: TableSessionRow): TableSession {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    branchId: row.branch_id,
    tableId: row.table_id,
    status: row.status,
    configurationVersionId: row.configuration_version_id ?? undefined,
    configurationVersion: row.configuration_version ?? undefined,
    version: row.version,
    openedAtUtc: row.opened_at_utc,
    closedAtUtc: row.closed_at_utc ?? undefined,
  };
}

export class PostgresTablesStore implements TablesStore {
  public async createTable(
    transaction: TransactionContext,
    input: CreateTableInput,
  ): Promise<Table> {
    const result = await transaction.sql.query<TableRow>(
      `
        insert into tables.tables (
          id, business_account_id, branch_id, code, area, status, out_of_service,
          version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, $4, $5, 'active', false, 1, $6, $6)
        returning
          id, business_account_id, branch_id, code, area, status, out_of_service, version,
          false as has_open_session
      `,
      [
        input.id,
        input.businessAccountId,
        input.branchId,
        input.code,
        input.area ?? null,
        input.now,
      ],
    );
    return mapTable(requireReturnedRow(result.rows));
  }

  public async updateTable(
    transaction: TransactionContext,
    input: UpdateTableInput,
  ): Promise<Table | undefined> {
    const result = await transaction.sql.query<{
      id: string;
      business_account_id: string;
      branch_id: string;
      code: string;
      area: string | null;
      status: EntityStatus;
      out_of_service: boolean;
      version: number;
    }>(
      `
        update tables.tables
        set
          code = coalesce($4, code),
          area = case when $5::boolean then $6 else area end,
          status = coalesce($7, status),
          out_of_service = coalesce($8, out_of_service),
          version = version + 1,
          updated_at_utc = $9
        where business_account_id = $1 and id = $2 and version = $3
        returning id, business_account_id, branch_id, code, area, status, out_of_service, version
      `,
      [
        input.businessAccountId,
        input.tableId,
        input.expectedVersion,
        input.code ?? null,
        input.area !== undefined,
        input.area ?? null,
        input.status ?? null,
        input.outOfService ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return this.getTable(transaction.sql, input.businessAccountId, row.id);
  }

  public async listTables(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<readonly Table[]> {
    const result = await sql.query<TableRow>(
      `
        select ${tableSelectColumns}
        from tables.tables t
        where t.business_account_id = $1 and t.branch_id = $2
        order by t.code
      `,
      [businessAccountId, branchId],
    );
    return result.rows.map(mapTable);
  }

  public async getTable(
    sql: SqlExecutor,
    businessAccountId: string,
    tableId: string,
  ): Promise<Table | undefined> {
    const result = await sql.query<TableRow>(
      `
        select ${tableSelectColumns}
        from tables.tables t
        where t.business_account_id = $1 and t.id = $2
      `,
      [businessAccountId, tableId],
    );
    const row = result.rows[0];
    return row ? mapTable(row) : undefined;
  }

  public async issueQrCode(
    transaction: TransactionContext,
    input: IssueQrCodeInput,
  ): Promise<TableQrCode> {
    if (input.kind === "table") {
      await transaction.sql.query(
        `
          update tables.table_qr_codes
          set status = 'revoked', revoked_at_utc = $3, revoked_reason = 'rotated'
          where business_account_id = $1 and table_id = $2 and status = 'active'
        `,
        [input.businessAccountId, input.tableId, input.now],
      );
    } else {
      await transaction.sql.query(
        `
          update tables.table_qr_codes
          set status = 'revoked', revoked_at_utc = $3, revoked_reason = 'rotated'
          where business_account_id = $1 and branch_id = $2 and table_id is null and status = 'active'
        `,
        [input.businessAccountId, input.branchId, input.now],
      );
    }
    const result = await transaction.sql.query<QrCodeRow>(
      `
        insert into tables.table_qr_codes (
          id, business_account_id, branch_id, table_id, token_hash, kind, status, created_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, 'active', $7)
        returning id, business_account_id, branch_id, table_id, kind, status, created_at_utc, revoked_at_utc, revoked_reason
      `,
      [
        input.id,
        input.businessAccountId,
        input.branchId,
        input.tableId ?? null,
        input.tokenHash,
        input.kind,
        input.now,
      ],
    );
    return mapQrCode(requireReturnedRow(result.rows));
  }

  public async revokeQrCode(
    transaction: TransactionContext,
    businessAccountId: string,
    qrCodeId: string,
    reason: string,
    now: Date,
  ): Promise<TableQrCode | undefined> {
    const result = await transaction.sql.query<QrCodeRow>(
      `
        update tables.table_qr_codes
        set status = 'revoked', revoked_at_utc = $3, revoked_reason = $4
        where business_account_id = $1 and id = $2 and status = 'active'
        returning id, business_account_id, branch_id, table_id, kind, status, created_at_utc, revoked_at_utc, revoked_reason
      `,
      [businessAccountId, qrCodeId, now, reason],
    );
    const row = result.rows[0];
    return row ? mapQrCode(row) : undefined;
  }

  public async listQrCodes(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<readonly TableQrCode[]> {
    const result = await sql.query<QrCodeRow>(
      `
        select id, business_account_id, branch_id, table_id, kind, status, created_at_utc, revoked_at_utc, revoked_reason
        from tables.table_qr_codes
        where business_account_id = $1 and branch_id = $2
        order by created_at_utc desc
      `,
      [businessAccountId, branchId],
    );
    return result.rows.map(mapQrCode);
  }

  public async getQrCode(
    sql: SqlExecutor,
    businessAccountId: string,
    qrCodeId: string,
  ): Promise<TableQrCode | undefined> {
    const result = await sql.query<QrCodeRow>(
      `
        select id, business_account_id, branch_id, table_id, kind, status, created_at_utc, revoked_at_utc, revoked_reason
        from tables.table_qr_codes
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, qrCodeId],
    );
    const row = result.rows[0];
    return row ? mapQrCode(row) : undefined;
  }

  public async resolveQrToken(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<ResolvedQrToken | undefined> {
    const result = await sql.query<{
      id: string;
      business_account_id: string;
      restaurant_id: string;
      branch_id: string;
      table_id: string | null;
      table_code: string | null;
    }>(
      `
        select
          q.id,
          q.business_account_id,
          b.restaurant_id,
          q.branch_id,
          q.table_id,
          t.code as table_code
        from tables.table_qr_codes q
        inner join restaurant.branches b
          on b.business_account_id = q.business_account_id and b.id = q.branch_id
        left join tables.tables t
          on t.business_account_id = q.business_account_id and t.id = q.table_id
        where q.token_hash = $1 and q.status = 'active'
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          qrCodeId: row.id,
          businessAccountId: row.business_account_id,
          restaurantId: row.restaurant_id,
          branchId: row.branch_id,
          tableId: row.table_id ?? undefined,
          tableCode: row.table_code ?? undefined,
        }
      : undefined;
  }

  public async claimOrJoinTableSession(
    transaction: TransactionContext,
    input: Parameters<TablesStore["claimOrJoinTableSession"]>[1],
  ): ReturnType<TablesStore["claimOrJoinTableSession"]> {
    const table = await transaction.sql.query<{
      readonly id: string;
      readonly branch_id: string;
      readonly status: "active" | "inactive";
      readonly out_of_service: boolean;
    }>(
      `
        select id, branch_id, status, out_of_service
        from tables.tables
        where business_account_id = $1 and id = $2
        for update
      `,
      [input.businessAccountId, input.tableId],
    );
    const tableRow = table.rows[0];
    if (
      tableRow?.branch_id !== input.branchId ||
      tableRow.status !== "active" ||
      tableRow.out_of_service
    ) {
      return undefined;
    }

    const existing = await transaction.sql.query<TableSessionRow>(
      `
        select
          id, business_account_id, branch_id, table_id, status,
          configuration_version_id, configuration_version, version,
          opened_at_utc, closed_at_utc
        from tables.table_sessions
        where business_account_id = $1 and table_id = $2 and status = 'open'
      `,
      [input.businessAccountId, input.tableId],
    );
    const existingRow = existing.rows[0];
    if (existingRow) {
      return { session: mapTableSession(existingRow), opened: false };
    }

    const created = await transaction.sql.query<TableSessionRow>(
      `
        insert into tables.table_sessions (
          id, business_account_id, branch_id, table_id, status,
          configuration_version_id, configuration_version, version,
          opened_at_utc
        )
        values ($1, $2, $3, $4, 'open', $5, $6, 1, $7)
        returning
          id, business_account_id, branch_id, table_id, status,
          configuration_version_id, configuration_version, version,
          opened_at_utc, closed_at_utc
      `,
      [
        input.id,
        input.businessAccountId,
        input.branchId,
        input.tableId,
        input.configurationVersionId,
        input.configurationVersion,
        input.now,
      ],
    );
    const createdRow = requireReturnedRow(created.rows);
    return { session: mapTableSession(createdRow), opened: true };
  }

  public async getOpenTableSessionById(
    sql: SqlExecutor,
    businessAccountId: string,
    tableSessionId: string,
  ): Promise<TableSession | undefined> {
    const result = await sql.query<TableSessionRow>(
      `
        select
          id, business_account_id, branch_id, table_id, status,
          configuration_version_id, configuration_version, version,
          opened_at_utc, closed_at_utc
        from tables.table_sessions
        where business_account_id = $1 and id = $2 and status = 'open'
      `,
      [businessAccountId, tableSessionId],
    );
    const row = result.rows[0];
    return row ? mapTableSession(row) : undefined;
  }
}
