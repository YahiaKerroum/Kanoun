import { addMoney, subtractMoney, zeroMoney } from "@rms/building-blocks";
import type { PaymentsStore } from "../contracts/payments-store.js";
import type {
  PaymentLedger,
  PaymentMethod,
  PaymentRecord,
  RefundRecord,
  RefundSource,
} from "../domain/models.js";

interface PaymentRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string;
  readonly order_id: string;
  readonly amount: string;
  readonly currency: string;
  readonly method: PaymentMethod;
  readonly external_reference: string | null;
  readonly recorded_at_utc: Date;
  readonly recorded_by_user_id: string;
  readonly recorded_by_employee_id: string;
}

interface RefundRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string;
  readonly order_id: string;
  readonly payment_id: string;
  readonly amount: string;
  readonly currency: string;
  readonly reason: string;
  readonly source: RefundSource;
  readonly refunded_at_utc: Date;
  readonly refunded_by_user_id: string;
  readonly refunded_by_employee_id: string;
}

const paymentColumns = `
  id, business_account_id, restaurant_id, branch_id, order_id,
  amount, currency, method, external_reference, recorded_at_utc,
  recorded_by_user_id, recorded_by_employee_id
`;

const refundColumns = `
  id, business_account_id, restaurant_id, branch_id, order_id,
  payment_id, amount, currency, reason, source, refunded_at_utc,
  refunded_by_user_id, refunded_by_employee_id
`;

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    orderId: row.order_id,
    amount: { amount: row.amount, currency: row.currency },
    method: row.method,
    externalReference: row.external_reference ?? undefined,
    recordedAtUtc: row.recorded_at_utc,
    recordedByUserId: row.recorded_by_user_id,
    recordedByEmployeeId: row.recorded_by_employee_id,
  };
}

function mapRefund(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    amount: { amount: row.amount, currency: row.currency },
    reason: row.reason,
    source: row.source,
    refundedAtUtc: row.refunded_at_utc,
    refundedByUserId: row.refunded_by_user_id,
    refundedByEmployeeId: row.refunded_by_employee_id,
  };
}

export class PostgresPaymentsStore implements PaymentsStore {
  public async createPayment(
    transaction: Parameters<PaymentsStore["createPayment"]>[0],
    input: Parameters<PaymentsStore["createPayment"]>[1],
  ): Promise<PaymentRecord> {
    const result = await transaction.sql.query<PaymentRow>(
      `
        insert into payments.payments (
          id, business_account_id, restaurant_id, branch_id, order_id,
          amount, currency, method, external_reference, recorded_at_utc,
          recorded_by_user_id, recorded_by_employee_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning ${paymentColumns}
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.orderId,
        input.amount.amount,
        input.amount.currency,
        input.method,
        input.externalReference ?? null,
        input.now,
        input.actorUserId,
        input.effectiveEmployeeId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Payment insert returned no row.");
    return mapPayment(row);
  }

  public async getPaymentForOrder(
    sql: Parameters<PaymentsStore["getPaymentForOrder"]>[0],
    businessAccountId: string,
    orderId: string,
    lockForUpdate = false,
  ): Promise<PaymentRecord | undefined> {
    const result = await sql.query<PaymentRow>(
      `
        select ${paymentColumns}
        from payments.payments
        where business_account_id = $1 and order_id = $2
        ${lockForUpdate ? "for update" : ""}
      `,
      [businessAccountId, orderId],
    );
    const row = result.rows[0];
    return row ? mapPayment(row) : undefined;
  }

  public async getPayment(
    sql: Parameters<PaymentsStore["getPayment"]>[0],
    businessAccountId: string,
    paymentId: string,
    lockForUpdate = false,
  ): Promise<PaymentRecord | undefined> {
    const result = await sql.query<PaymentRow>(
      `
        select ${paymentColumns}
        from payments.payments
        where business_account_id = $1 and id = $2
        ${lockForUpdate ? "for update" : ""}
      `,
      [businessAccountId, paymentId],
    );
    const row = result.rows[0];
    return row ? mapPayment(row) : undefined;
  }

  public async getRefund(
    sql: Parameters<PaymentsStore["getRefund"]>[0],
    businessAccountId: string,
    refundId: string,
  ): Promise<RefundRecord | undefined> {
    const result = await sql.query<RefundRow>(
      `
        select ${refundColumns}
        from payments.refunds
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, refundId],
    );
    const row = result.rows[0];
    return row ? mapRefund(row) : undefined;
  }

  public async createRefund(
    transaction: Parameters<PaymentsStore["createRefund"]>[0],
    input: Parameters<PaymentsStore["createRefund"]>[1],
  ): Promise<RefundRecord> {
    const result = await transaction.sql.query<RefundRow>(
      `
        insert into payments.refunds (
          id, business_account_id, restaurant_id, branch_id, order_id,
          payment_id, amount, currency, reason, source, refunded_at_utc,
          refunded_by_user_id, refunded_by_employee_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning ${refundColumns}
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.orderId,
        input.paymentId,
        input.amount.amount,
        input.amount.currency,
        input.reason,
        input.source,
        input.now,
        input.actorUserId,
        input.effectiveEmployeeId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Refund insert returned no row.");
    return mapRefund(row);
  }

  public async getOrderLedger(
    sql: Parameters<PaymentsStore["getOrderLedger"]>[0],
    businessAccountId: string,
    orderId: string,
    currency: string,
  ): Promise<PaymentLedger> {
    const payment = await this.getPaymentForOrder(
      sql,
      businessAccountId,
      orderId,
    );
    if (!payment) {
      return {
        payment: undefined,
        refunds: [],
        refundedAmount: zeroMoney(currency),
        netPaidAmount: zeroMoney(currency),
      };
    }
    const result = await sql.query<RefundRow>(
      `
        select ${refundColumns}
        from payments.refunds
        where business_account_id = $1 and order_id = $2
        order by refunded_at_utc, id
      `,
      [businessAccountId, orderId],
    );
    const refunds = result.rows.map(mapRefund);
    const refundedAmount = refunds.reduce(
      (total, refund) => addMoney(total, refund.amount),
      zeroMoney(payment.amount.currency),
    );
    return {
      payment,
      refunds,
      refundedAmount,
      netPaidAmount: subtractMoney(payment.amount, refundedAmount),
    };
  }
}
