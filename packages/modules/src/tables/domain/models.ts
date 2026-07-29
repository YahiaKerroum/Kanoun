export type EntityStatus = "active" | "inactive";
export type DerivedTableState =
  "inactive" | "out_of_service" | "occupied" | "available";
export type QrCodeKind = "table" | "branch";
export type QrCodeStatus = "active" | "revoked";

export interface Table {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly code: string;
  readonly area?: string | undefined;
  readonly status: EntityStatus;
  readonly outOfService: boolean;
  readonly version: number;
  readonly derivedState: DerivedTableState;
}

export interface TableQrCode {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly kind: QrCodeKind;
  readonly status: QrCodeStatus;
  readonly createdAtUtc: Date;
  readonly revokedAtUtc?: Date | undefined;
  readonly revokedReason?: string | undefined;
}

export interface ResolvedQrToken {
  readonly qrCodeId: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly tableCode?: string | undefined;
}

export interface TableSession {
  readonly id: string;
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly status: "open" | "closed";
  readonly configurationVersionId?: string | undefined;
  readonly configurationVersion?: number | undefined;
  readonly version: number;
  readonly openedAtUtc: Date;
  readonly closedAtUtc?: Date | undefined;
}

export interface ClaimedTableSession {
  readonly session: TableSession;
  readonly opened: boolean;
}

export interface TableSessionMovement {
  readonly id: string;
  readonly tableSessionId: string;
  readonly branchId: string;
  readonly fromTableId: string;
  readonly toTableId: string;
  readonly sessionVersion: number;
  readonly movedAtUtc: Date;
  readonly movedByUserId: string;
  readonly movedByEmployeeId: string;
}
