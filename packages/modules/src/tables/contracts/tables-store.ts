import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type {
  ClaimedTableSession,
  EntityStatus,
  QrCodeKind,
  ResolvedQrToken,
  Table,
  TableQrCode,
  TableSession,
  TableSessionMovement,
} from "../domain/models.js";

export interface CreateTableInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly code: string;
  readonly area?: string | undefined;
  readonly now: Date;
}

export interface UpdateTableInput {
  readonly businessAccountId: string;
  readonly tableId: string;
  readonly expectedVersion: number;
  readonly code?: string;
  readonly area?: string | null;
  readonly status?: EntityStatus;
  readonly outOfService?: boolean;
  readonly now: Date;
}

export interface IssueQrCodeInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly kind: QrCodeKind;
  readonly tokenHash: string;
  readonly now: Date;
}

export interface TablesStore {
  branchHasOpenTableSessions(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<boolean>;
  createTable(
    transaction: TransactionContext,
    input: CreateTableInput,
  ): Promise<Table>;
  updateTable(
    transaction: TransactionContext,
    input: UpdateTableInput,
  ): Promise<Table | undefined>;
  listTables(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<readonly Table[]>;
  getTable(
    sql: SqlExecutor,
    businessAccountId: string,
    tableId: string,
  ): Promise<Table | undefined>;

  /**
   * Revokes any existing active QR code for the same table (or the same
   * branch-only slot) and inserts a fresh one, in the same transaction —
   * this is both "issue" and "rotate."
   */
  issueQrCode(
    transaction: TransactionContext,
    input: IssueQrCodeInput,
  ): Promise<TableQrCode>;
  revokeQrCode(
    transaction: TransactionContext,
    businessAccountId: string,
    qrCodeId: string,
    reason: string,
    now: Date,
  ): Promise<TableQrCode | undefined>;
  listQrCodes(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<readonly TableQrCode[]>;
  getQrCode(
    sql: SqlExecutor,
    businessAccountId: string,
    qrCodeId: string,
  ): Promise<TableQrCode | undefined>;

  /** Resolves an active QR token only; unknown or revoked tokens resolve to `undefined`. */
  resolveQrToken(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<ResolvedQrToken | undefined>;
  claimOrJoinTableSession(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly tableId: string;
      readonly configurationVersionId: string;
      readonly configurationVersion: number;
      readonly now: Date;
    },
  ): Promise<ClaimedTableSession | undefined>;
  getOpenTableSessionById(
    sql: SqlExecutor,
    businessAccountId: string,
    tableSessionId: string,
  ): Promise<TableSession | undefined>;
  getOpenTableSessionForUpdate(
    transaction: TransactionContext,
    businessAccountId: string,
    tableSessionId: string,
  ): Promise<TableSession | undefined>;
  moveTableSession(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly tableSessionId: string;
      readonly destinationTableId: string;
      readonly expectedVersion: number;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<
    | {
        readonly session: TableSession;
        readonly movement: TableSessionMovement;
      }
    | undefined
  >;
  closeTableSession(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly tableSessionId: string;
      readonly expectedVersion: number;
      readonly now: Date;
    },
  ): Promise<TableSession | undefined>;
}
