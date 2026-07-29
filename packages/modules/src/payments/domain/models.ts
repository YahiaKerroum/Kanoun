import type { Money } from "@rms/building-blocks";

export type PaymentMethod = "cash" | "card";
export type RefundSource = "manual" | "order_cancellation";

export interface PaymentRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly externalReference?: string | undefined;
  readonly recordedAtUtc: Date;
  readonly recordedByUserId: string;
  readonly recordedByEmployeeId: string;
}

export interface RefundRecord {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly amount: Money;
  readonly reason: string;
  readonly source: RefundSource;
  readonly refundedAtUtc: Date;
  readonly refundedByUserId: string;
  readonly refundedByEmployeeId: string;
}

export interface PaymentLedger {
  readonly payment?: PaymentRecord | undefined;
  readonly refunds: readonly RefundRecord[];
  readonly refundedAmount: Money;
  readonly netPaidAmount: Money;
}
