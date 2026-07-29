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
  readonly revision: number;
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

export interface OrderCorrectionRecord {
  readonly id: string;
  readonly orderId: string;
  readonly revision: number;
  readonly reason: string;
  readonly beforeTotal: Money;
  readonly afterTotal: Money;
  readonly beforeItems: readonly OrderItemRecord[];
  readonly afterItems: readonly OrderItemRecord[];
  readonly correctedAtUtc: Date;
  readonly correctedByUserId: string;
  readonly correctedByEmployeeId: string;
}

export interface BillRequestRecord {
  readonly id: string;
  readonly orderId: string;
  readonly branchId: string;
  readonly status: "open" | "resolved";
  readonly requestedAtUtc: Date;
  readonly requestedByGuestSessionId?: string | undefined;
  readonly resolvedAtUtc?: Date | undefined;
}

export interface OrderRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableSessionId: string;
  readonly tableSessionVersion: number;
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
  readonly currentItemRevision: number;
  readonly submittedAtUtc: Date;
  readonly acceptedAtUtc: Date;
  readonly preparingAtUtc?: Date | undefined;
  readonly readyAtUtc?: Date | undefined;
  readonly servedAtUtc?: Date | undefined;
  readonly servedByUserId?: string | undefined;
  readonly servedByEmployeeId?: string | undefined;
  readonly completedAtUtc?: Date | undefined;
  readonly completedByUserId?: string | undefined;
  readonly completedByEmployeeId?: string | undefined;
  readonly unpaidCompletionReason?: string | undefined;
  readonly cancelledAtUtc?: Date | undefined;
  readonly cancelledByUserId?: string | undefined;
  readonly cancelledByEmployeeId?: string | undefined;
  readonly cancellationReason?: string | undefined;
  readonly items: readonly OrderItemRecord[];
  readonly corrections: readonly OrderCorrectionRecord[];
  readonly billRequest?: BillRequestRecord | undefined;
  readonly cancellationRequested: boolean;
}

export interface CancellationRequestRecord {
  readonly id: string;
  readonly orderId: string;
  readonly status: "open" | "resolved";
  readonly reason: string;
  readonly createdAtUtc: Date;
}
