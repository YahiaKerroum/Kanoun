import type {
  Money,
  SqlExecutor,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  PaymentLedger,
  PaymentMethod,
  PaymentRecord,
  RefundRecord,
  RefundSource,
} from "../domain/models.js";

export interface PaymentsStore {
  createPayment(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId: string;
      readonly orderId: string;
      readonly amount: Money;
      readonly method: PaymentMethod;
      readonly externalReference?: string | undefined;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<PaymentRecord>;
  getPaymentForOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
    lockForUpdate?: boolean,
  ): Promise<PaymentRecord | undefined>;
  getPayment(
    sql: SqlExecutor,
    businessAccountId: string,
    paymentId: string,
    lockForUpdate?: boolean,
  ): Promise<PaymentRecord | undefined>;
  getRefund(
    sql: SqlExecutor,
    businessAccountId: string,
    refundId: string,
  ): Promise<RefundRecord | undefined>;
  createRefund(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId: string;
      readonly orderId: string;
      readonly paymentId: string;
      readonly amount: Money;
      readonly reason: string;
      readonly source: RefundSource;
      readonly actorUserId: string;
      readonly effectiveEmployeeId: string;
      readonly now: Date;
    },
  ): Promise<RefundRecord>;
  getOrderLedger(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
    currency: string,
  ): Promise<PaymentLedger>;
}
