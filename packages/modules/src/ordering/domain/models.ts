import type { Money } from "@rms/building-blocks";

export interface GuestSessionRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly csrfTokenHash?: string | undefined;
  readonly tableSessionId?: string | undefined;
  readonly createdAtUtc: Date;
  readonly lastSeenAtUtc: Date;
  readonly expiresAtUtc: Date;
  readonly revokedAtUtc?: Date | undefined;
}

export type OrderApprovalState = "submitted" | "accepted" | "rejected";
export type OrderFulfilmentState =
  "not_started" | "preparing" | "ready" | "served";
export type OrderFinancialState =
  "unpaid" | "paid" | "partially_refunded" | "refunded";
export type OrderClosureState = "active" | "completed" | "cancelled";

export interface OrderOptionSnapshot {
  readonly optionGroupId: string;
  readonly optionGroupName: string;
  readonly optionId: string;
  readonly optionName: string;
  readonly priceDelta: Money;
}

export interface OrderItemRecord {
  readonly id: string;
  readonly sourceDishId: string;
  readonly sourceMenuVersion: number;
  readonly name: string;
  readonly basePrice: Money;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly selectedOptions: readonly OrderOptionSnapshot[];
  readonly note?: string | undefined;
  readonly taxInclusive: boolean;
  readonly total: Money;
}

export interface OrderRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableSessionId: string;
  readonly tableId: string;
  readonly tableCode: string;
  readonly reference: string;
  readonly creatorType: "guest" | "staff";
  readonly customerSessionId?: string | undefined;
  readonly createdByUserId?: string | undefined;
  readonly createdByEmployeeId?: string | undefined;
  readonly customerDisplayName?: string | undefined;
  readonly configurationVersionId: string;
  readonly configurationVersion: number;
  readonly approval: OrderApprovalState;
  readonly fulfilment: OrderFulfilmentState;
  readonly financial: OrderFinancialState;
  readonly closure: OrderClosureState;
  readonly customerSafeStatusReason?: string | undefined;
  readonly total: Money;
  readonly version: number;
  readonly submittedAtUtc: Date;
  readonly acceptedAtUtc: Date;
  readonly preparingAtUtc?: Date | undefined;
  readonly readyAtUtc?: Date | undefined;
  readonly servedAtUtc?: Date | undefined;
  readonly servedByUserId?: string | undefined;
  readonly servedByEmployeeId?: string | undefined;
  readonly items: readonly OrderItemRecord[];
  readonly cancellationRequested: boolean;
}

export interface CancellationRequestRecord {
  readonly id: string;
  readonly orderId: string;
  readonly status: "open" | "resolved";
  readonly reason: string;
  readonly createdAtUtc: Date;
}
