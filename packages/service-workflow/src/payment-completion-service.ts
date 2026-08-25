import { createHash, randomUUID } from "node:crypto";
import {
  addMoney,
  appendOutboxMessage,
  beginIdempotentCommand,
  compareMoney,
  completeIdempotentCommand,
  hashOpaqueToken,
  subtractMoney,
  type DatabasePool,
  type Money,
  type TransactionContext,
} from "@rms/building-blocks";
import {
  ApplicationError,
  hasPermission,
  type AuditWriter,
  type BillRequestRecord,
  type GuestRequestContext,
  type KitchenStore,
  type MenuStore,
  type OrderRecord,
  type OrderingStore,
  type PaymentLedger,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentsStore,
  type RefundRecord,
  type RestaurantConfigurationStore,
  type StaffRequestContext,
  type TablesStore,
} from "@rms/modules";
import type { PostgresServiceWorkflow } from "./postgres-service-workflow.js";

const idempotencyRetentionMs = 24 * 60 * 60 * 1000;
const recentAuthenticationMs = 15 * 60 * 1000;

export interface PaymentCompletionMetadata {
  readonly correlationId: string;
  readonly causationId: string;
  readonly now?: Date;
}

export interface CorrectionItemInput {
  readonly dishId: string;
  readonly quantity: number;
  readonly optionIds: readonly string[];
  readonly note?: string | undefined;
}

export interface BillRequestView {
  readonly request: BillRequestRecord;
  readonly order: OrderRecord;
  readonly ledger: PaymentLedger;
}

export interface PaymentCompletionServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly menu: MenuStore;
  readonly tables: TablesStore;
  readonly ordering: OrderingStore;
  readonly kitchen: KitchenStore;
  readonly payments: PaymentsStore;
  readonly audit: AuditWriter;
  readonly idempotencySecret: string;
  readonly onIdempotentReplay?: () => void;
}

function nowFrom(metadata: PaymentCompletionMetadata): Date {
  return metadata.now ?? new Date();
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function replayId(responseBody: unknown, key: string): string | undefined {
  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    !(key in responseBody)
  ) {
    return undefined;
  }
  const value = (responseBody as Readonly<Record<string, unknown>>)[key];
  return typeof value === "string" ? value : undefined;
}

export class PaymentCompletionService {
  public constructor(
    private readonly dependencies: PaymentCompletionServiceDependencies,
  ) {}

  public async requestGuestBill(
    context: GuestRequestContext,
    orderId: string,
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<BillRequestRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.dependencies.ordering.getOrderForUpdate(
        transaction,
        context.businessAccountId,
        orderId,
      );
      if (
        order?.customerSessionId !== context.guestSessionId ||
        order.branchId !== context.branchId
      ) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Order not found",
        );
      }
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-011",
        "Payments are unavailable",
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `guest:${context.guestSessionId}`,
        operation: "requestGuestOrderBill",
        idempotencyKey,
        requestHash: requestHash({ orderId }),
        now,
      });
      if (idempotency.kind === "replay") {
        const billRequestId = replayId(
          idempotency.responseBody,
          "billRequestId",
        );
        const replayed = billRequestId
          ? await this.dependencies.ordering.getBillRequest(
              transaction.sql,
              context.businessAccountId,
              billRequestId,
            )
          : undefined;
        if (
          replayed?.orderId === order.id &&
          replayed.branchId === order.branchId
        ) {
          return replayed;
        }
        throw new ApplicationError(
          "service_unavailable",
          503,
          "The previous response could not be replayed",
        );
      }
      if (order.closure !== "active") {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Bill cannot be requested",
          "This order is no longer active.",
          order.version,
        );
      }
      const requestedId = randomUUID();
      const billRequest =
        await this.dependencies.ordering.createOrGetBillRequest(transaction, {
          id: requestedId,
          businessAccountId: order.businessAccountId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          guestSessionId: context.guestSessionId,
          now,
        });
      if (billRequest.id === requestedId) {
        await this.appendEvent(
          transaction,
          "ordering.bill_requested.v1",
          order,
          metadata,
          now,
          {
            billRequestId: billRequest.id,
            orderId: order.id,
            orderReference: order.reference,
            tableId: order.tableId,
            tableCode: order.tableCode,
          },
        );
      }
      await completeIdempotentCommand(transaction, idempotency.recordId, 202, {
        billRequestId: billRequest.id,
      });
      return billRequest;
    });
  }

  public async listOpenBillRequests(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly BillRequestView[]> {
    const access = await this.requireBranchPermission(
      this.dependencies.databasePool,
      context,
      branchId,
      "payments.view",
    );
    await this.requireFeature(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
      "CFG-011",
      "Payments are unavailable",
    );
    const requests = await this.dependencies.ordering.listOpenBillRequests(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    const views: BillRequestView[] = [];
    for (const request of requests) {
      const order = await this.dependencies.ordering.getOrder(
        this.dependencies.databasePool,
        context.businessAccountId,
        request.orderId,
      );
      if (
        order?.branchId !== branchId ||
        order.restaurantId !== access.restaurantId
      ) {
        continue;
      }
      views.push({
        request,
        order,
        ledger: await this.dependencies.payments.getOrderLedger(
          this.dependencies.databasePool,
          context.businessAccountId,
          order.id,
          order.total.currency,
        ),
      });
    }
    return views;
  }

  public async getOrderLedger(
    context: StaffRequestContext,
    orderId: string,
  ): Promise<{ readonly order: OrderRecord; readonly ledger: PaymentLedger }> {
    const order = await this.requireReadableOrder(
      this.dependencies.databasePool,
      context,
      orderId,
      "payments.view",
    );
    return {
      order,
      ledger: await this.dependencies.payments.getOrderLedger(
        this.dependencies.databasePool,
        context.businessAccountId,
        order.id,
        order.total.currency,
      ),
    };
  }

  public async recordPayment(
    context: StaffRequestContext,
    orderId: string,
    input: {
      readonly amount: Money;
      readonly method: PaymentMethod;
      readonly externalReference?: string | undefined;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<{ readonly order: OrderRecord; readonly payment: PaymentRecord }> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.requireLockedOrder(
        transaction,
        context,
        orderId,
        "payments.record",
      );
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-011",
        "Payments are unavailable",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "recordOrderPayment",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          amount: input.amount,
          method: input.method,
          externalReference: input.externalReference ?? null,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        const paymentId = replayId(idempotency.responseBody, "paymentId");
        const payment = paymentId
          ? await this.dependencies.payments.getPayment(
              transaction.sql,
              context.businessAccountId,
              paymentId,
            )
          : undefined;
        if (payment?.orderId === order.id) return { order, payment };
        throw new ApplicationError(
          "service_unavailable",
          503,
          "The previous response could not be replayed",
        );
      }
      if (order.closure !== "active" || order.financial !== "unpaid") {
        throw new ApplicationError(
          "payment_conflict",
          409,
          "Payment cannot be recorded",
          "Reload the order and review its financial state.",
          order.version,
        );
      }
      if (
        compareMoney(input.amount, order.total) !== 0 ||
        compareMoney(input.amount, {
          amount: "0.00",
          currency: order.total.currency,
        }) <= 0
      ) {
        throw new ApplicationError(
          "payment_conflict",
          409,
          "Payment must equal the outstanding balance",
          `Record exactly ${order.total.amount} ${order.total.currency}.`,
          order.version,
        );
      }
      if (
        await this.dependencies.payments.getPaymentForOrder(
          transaction.sql,
          context.businessAccountId,
          order.id,
          true,
        )
      ) {
        throw new ApplicationError(
          "payment_conflict",
          409,
          "Payment already recorded",
        );
      }
      const payment = await this.dependencies.payments.createPayment(
        transaction,
        {
          id: randomUUID(),
          businessAccountId: order.businessAccountId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          amount: input.amount,
          method: input.method,
          externalReference: input.externalReference,
          actorUserId: context.userId,
          effectiveEmployeeId,
          now,
        },
      );
      const paidOrder = await this.dependencies.ordering.updateFinancialState(
        transaction,
        {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          expectedVersion: order.version,
          from: "unpaid",
          to: "paid",
          now,
        },
      );
      if (!paidOrder) this.changedOrder();
      const resolvedBill =
        await this.dependencies.ordering.resolveOpenBillRequest(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          actorUserId: context.userId,
          now,
        });
      await this.appendPaymentEvent(
        transaction,
        "payments.payment_recorded.v1",
        payment,
        metadata,
        now,
      );
      await this.appendEvent(
        transaction,
        "payments.order_paid.v1",
        paidOrder,
        metadata,
        now,
        {
          orderId: paidOrder.id,
          paymentId: payment.id,
          amount: payment.amount,
        },
      );
      if (resolvedBill) {
        await this.appendEvent(
          transaction,
          "ordering.bill_request_resolved.v1",
          paidOrder,
          metadata,
          now,
          {
            billRequestId: resolvedBill.id,
            orderId: paidOrder.id,
          },
        );
      }
      await this.appendAudit(
        transaction,
        context,
        paidOrder,
        "payments.payment_recorded",
        "payment",
        payment.id,
        metadata,
        now,
        undefined,
        {
          orderId: order.id,
          amount: payment.amount,
          method: payment.method,
          effectiveEmployeeId,
        },
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 201, {
        paymentId: payment.id,
        orderId: order.id,
      });
      return { order: paidOrder, payment };
    });
  }

  public async recordRefund(
    context: StaffRequestContext,
    paymentId: string,
    input: {
      readonly amount: Money;
      readonly reason: string;
      readonly confirmed: boolean;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<{ readonly order: OrderRecord; readonly refund: RefundRecord }> {
    const now = nowFrom(metadata);
    this.requireRecentAuthentication(context, now, "refund a payment");
    if (!input.confirmed) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Refund confirmation required",
      );
    }
    return this.dependencies.workflow.run(async (transaction) => {
      const preliminaryPayment = await this.dependencies.payments.getPayment(
        transaction.sql,
        context.businessAccountId,
        paymentId,
      );
      if (!preliminaryPayment) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Payment not found",
        );
      }
      const order = await this.requireLockedOrder(
        transaction,
        context,
        preliminaryPayment.orderId,
        "payments.refund",
      );
      const payment = await this.dependencies.payments.getPayment(
        transaction.sql,
        context.businessAccountId,
        paymentId,
        true,
      );
      if (
        payment?.orderId !== order.id ||
        payment.restaurantId !== order.restaurantId ||
        payment.branchId !== order.branchId
      ) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Payment not found",
        );
      }
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-011",
        "Payments are unavailable",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "recordPaymentRefund",
        idempotencyKey,
        requestHash: requestHash({
          paymentId,
          amount: input.amount,
          reason: input.reason,
          confirmed: input.confirmed,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        const refundId = replayId(idempotency.responseBody, "refundId");
        const refund = refundId
          ? await this.dependencies.payments.getRefund(
              transaction.sql,
              context.businessAccountId,
              refundId,
            )
          : undefined;
        if (refund?.paymentId === payment.id && refund.orderId === order.id) {
          return { order, refund };
        }
        throw new ApplicationError(
          "service_unavailable",
          503,
          "The previous response could not be replayed",
        );
      }
      if (
        order.financial !== "paid" &&
        order.financial !== "partially_refunded"
      ) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Payment cannot be refunded",
          "Only a paid or partially refunded order can be refunded.",
          order.version,
        );
      }
      const ledger = await this.dependencies.payments.getOrderLedger(
        transaction.sql,
        context.businessAccountId,
        order.id,
        order.total.currency,
      );
      const remaining = subtractMoney(payment.amount, ledger.refundedAmount);
      if (
        input.amount.currency !== payment.amount.currency ||
        compareMoney(input.amount, { ...input.amount, amount: "0.00" }) <= 0 ||
        compareMoney(input.amount, remaining) > 0
      ) {
        throw new ApplicationError(
          "payment_conflict",
          409,
          "Refund exceeds the refundable amount",
          `Refund no more than ${remaining.amount} ${remaining.currency}.`,
          order.version,
        );
      }
      const refund = await this.dependencies.payments.createRefund(
        transaction,
        {
          id: randomUUID(),
          businessAccountId: order.businessAccountId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          paymentId: payment.id,
          amount: input.amount,
          reason: input.reason,
          source: "manual",
          actorUserId: context.userId,
          effectiveEmployeeId,
          now,
        },
      );
      const totalRefunded = addMoney(ledger.refundedAmount, refund.amount);
      const financial =
        compareMoney(totalRefunded, payment.amount) === 0
          ? "refunded"
          : "partially_refunded";
      const updatedOrder =
        await this.dependencies.ordering.updateFinancialState(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          expectedVersion: order.version,
          from: order.financial,
          to: financial,
          now,
        });
      if (!updatedOrder) this.changedOrder();
      await this.appendRefundEvent(
        transaction,
        refund,
        updatedOrder,
        metadata,
        now,
      );
      await this.appendAudit(
        transaction,
        context,
        updatedOrder,
        "payments.payment_refunded",
        "refund",
        refund.id,
        metadata,
        now,
        input.reason,
        {
          paymentId: payment.id,
          amount: refund.amount,
          financial,
          effectiveEmployeeId,
        },
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 201, {
        refundId: refund.id,
        orderId: order.id,
      });
      return { order: updatedOrder, refund };
    });
  }

  public async completeOrder(
    context: StaffRequestContext,
    orderId: string,
    expectedVersion: number,
    input: {
      readonly unpaidOverrideReason?: string | undefined;
      readonly confirmUnpaidOverride?: boolean | undefined;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    const override = input.unpaidOverrideReason !== undefined;
    if (override) {
      this.requireRecentAuthentication(
        context,
        now,
        "complete an unpaid order",
      );
      if (!input.confirmUnpaidOverride) {
        throw new ApplicationError(
          "validation_error",
          422,
          "Unpaid completion confirmation required",
        );
      }
    }
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.requireLockedOrder(
        transaction,
        context,
        orderId,
        override ? "orders.complete_unpaid" : "orders.complete",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "completeOrder",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          expectedVersion,
          unpaidOverrideReason: input.unpaidOverrideReason ?? null,
          confirmUnpaidOverride: input.confirmUnpaidOverride ?? false,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") return order;
      if (order.version !== expectedVersion) this.changedOrder(order.version);
      if (
        order.closure !== "active" ||
        order.fulfilment !== "served" ||
        (!override && order.financial !== "paid")
      ) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order cannot be completed",
          override
            ? "The order must be active and served."
            : "The order must be active, served, and paid.",
          order.version,
        );
      }
      if (!override) {
        const ledger = await this.dependencies.payments.getOrderLedger(
          transaction.sql,
          order.businessAccountId,
          order.id,
          order.total.currency,
        );
        if (
          !ledger.payment ||
          compareMoney(ledger.netPaidAmount, order.total) !== 0
        ) {
          throw new ApplicationError(
            "payment_conflict",
            409,
            "Order balance is not settled",
            "Reload payment history before completing this order.",
            order.version,
          );
        }
      }
      const completed = await this.dependencies.ordering.completeOrder(
        transaction,
        {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          expectedVersion: order.version,
          actorUserId: context.userId,
          effectiveEmployeeId,
          unpaidOverrideReason: input.unpaidOverrideReason,
          now,
        },
      );
      if (!completed) this.changedOrder(order.version);
      const resolvedBill =
        await this.dependencies.ordering.resolveOpenBillRequest(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          actorUserId: context.userId,
          now,
        });
      await this.appendEvent(
        transaction,
        override
          ? "ordering.order_completed_with_override.v1"
          : "ordering.order_completed.v1",
        completed,
        metadata,
        now,
        {
          orderId: completed.id,
          orderReference: completed.reference,
          financial: completed.financial,
          finalTotal: completed.total,
          effectiveEmployeeId,
          overrideReason: input.unpaidOverrideReason ?? null,
        },
      );
      await this.appendAudit(
        transaction,
        context,
        completed,
        override
          ? "ordering.order_completed_with_unpaid_override"
          : "ordering.order_completed",
        "order",
        completed.id,
        metadata,
        now,
        input.unpaidOverrideReason,
        {
          closure: completed.closure,
          financial: completed.financial,
          finalTotal: completed.total,
          effectiveEmployeeId,
        },
      );
      if (resolvedBill) {
        await this.appendEvent(
          transaction,
          "ordering.bill_request_resolved.v1",
          completed,
          metadata,
          now,
          {
            billRequestId: resolvedBill.id,
            orderId: completed.id,
          },
        );
      }
      await this.closeTableSessionIfEligible(
        transaction,
        completed,
        context,
        metadata,
        now,
      );
      const finalized = await this.dependencies.ordering.getOrder(
        transaction.sql,
        completed.businessAccountId,
        completed.id,
      );
      if (!finalized) this.changedOrder(completed.version);
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        orderId: finalized.id,
        version: finalized.version,
      });
      return finalized;
    });
  }

  public async cancelOrder(
    context: StaffRequestContext,
    orderId: string,
    expectedVersion: number,
    input: {
      readonly reason: string;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      let order = await this.requireLockedOrder(
        transaction,
        context,
        orderId,
        "orders.cancel",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "cancelOrder",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          expectedVersion,
          reason: input.reason,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") return order;
      if (order.version !== expectedVersion) this.changedOrder(order.version);
      if (order.closure !== "active" || order.fulfilment === "served") {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order cannot be cancelled",
          "Served or terminal orders cannot be cancelled.",
          order.version,
        );
      }
      const payment = await this.dependencies.payments.getPaymentForOrder(
        transaction.sql,
        order.businessAccountId,
        order.id,
        true,
      );
      if (payment) {
        const ledger = await this.dependencies.payments.getOrderLedger(
          transaction.sql,
          order.businessAccountId,
          order.id,
          order.total.currency,
        );
        const remaining = subtractMoney(payment.amount, ledger.refundedAmount);
        if (
          compareMoney(remaining, {
            amount: "0.00",
            currency: remaining.currency,
          }) > 0
        ) {
          const refund = await this.dependencies.payments.createRefund(
            transaction,
            {
              id: randomUUID(),
              businessAccountId: order.businessAccountId,
              restaurantId: order.restaurantId,
              branchId: order.branchId,
              orderId: order.id,
              paymentId: payment.id,
              amount: remaining,
              reason: `Order cancelled: ${input.reason}`,
              source: "order_cancellation",
              actorUserId: context.userId,
              effectiveEmployeeId,
              now,
            },
          );
          const refundedOrder =
            await this.dependencies.ordering.updateFinancialState(transaction, {
              businessAccountId: order.businessAccountId,
              orderId: order.id,
              expectedVersion: order.version,
              from:
                order.financial === "partially_refunded"
                  ? "partially_refunded"
                  : "paid",
              to: "refunded",
              now,
            });
          if (!refundedOrder) this.changedOrder(order.version);
          order = refundedOrder;
          await this.appendRefundEvent(
            transaction,
            refund,
            order,
            metadata,
            now,
          );
          await this.appendAudit(
            transaction,
            context,
            order,
            "payments.payment_refunded",
            "refund",
            refund.id,
            metadata,
            now,
            refund.reason,
            {
              paymentId: payment.id,
              amount: refund.amount,
              source: refund.source,
              financial: order.financial,
              effectiveEmployeeId,
            },
          );
        }
      }
      const cancelledWork =
        await this.dependencies.kitchen.cancelUnstartedForOrder(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          actorUserId: context.userId,
          effectiveEmployeeId,
          reason: input.reason,
          now,
        });
      const cancelled = await this.dependencies.ordering.cancelOrder(
        transaction,
        {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          expectedVersion: order.version,
          actorUserId: context.userId,
          effectiveEmployeeId,
          reason: input.reason,
          now,
        },
      );
      if (!cancelled) this.changedOrder(order.version);
      await this.dependencies.ordering.resolveCancellationRequests(
        transaction,
        order.businessAccountId,
        order.id,
        now,
      );
      const resolvedBill =
        await this.dependencies.ordering.resolveOpenBillRequest(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          actorUserId: context.userId,
          now,
        });
      for (const item of cancelledWork) {
        await this.appendRawEvent(
          transaction,
          "kitchen.item_cancelled.v1",
          item.businessAccountId,
          order.restaurantId,
          item.branchId,
          item.id,
          item.version,
          context.userId,
          metadata,
          now,
          {
            workItemId: item.id,
            orderId: order.id,
            reason: input.reason,
            effectiveEmployeeId,
          },
        );
      }
      await this.appendEvent(
        transaction,
        "ordering.order_cancelled.v1",
        cancelled,
        metadata,
        now,
        {
          orderId: cancelled.id,
          orderReference: cancelled.reference,
          reason: input.reason,
          effectiveEmployeeId,
        },
      );
      if (resolvedBill) {
        await this.appendEvent(
          transaction,
          "ordering.bill_request_resolved.v1",
          cancelled,
          metadata,
          now,
          {
            billRequestId: resolvedBill.id,
            orderId: cancelled.id,
          },
        );
      }
      await this.appendAudit(
        transaction,
        context,
        cancelled,
        "ordering.order_cancelled",
        "order",
        cancelled.id,
        metadata,
        now,
        input.reason,
        {
          closure: cancelled.closure,
          financial: cancelled.financial,
          cancelledKitchenItemIds: cancelledWork.map((item) => item.id),
          effectiveEmployeeId,
        },
      );
      await this.closeTableSessionIfEligible(
        transaction,
        cancelled,
        context,
        metadata,
        now,
      );
      const finalized = await this.dependencies.ordering.getOrder(
        transaction.sql,
        cancelled.businessAccountId,
        cancelled.id,
      );
      if (!finalized) this.changedOrder(cancelled.version);
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        orderId: finalized.id,
        version: finalized.version,
      });
      return finalized;
    });
  }

  public async correctOrder(
    context: StaffRequestContext,
    orderId: string,
    expectedVersion: number,
    input: {
      readonly menuVersion: number;
      readonly items: readonly CorrectionItemInput[];
      readonly reason: string;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.requireLockedOrder(
        transaction,
        context,
        orderId,
        "orders.modify",
      );
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-005",
        "Ordering is unavailable",
      );
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-007",
        "Kitchen is unavailable",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "correctOrder",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          expectedVersion,
          menuVersion: input.menuVersion,
          items: input.items,
          reason: input.reason,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") return order;
      if (order.version !== expectedVersion) {
        this.changedOrder(order.version);
      }
      if (
        order.closure !== "active" ||
        order.fulfilment !== "not_started" ||
        order.financial !== "unpaid"
      ) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order cannot be corrected",
          "Only active, unpaid orders whose preparation has not started can be corrected.",
          order.version,
        );
      }
      if (
        await this.dependencies.payments.getPaymentForOrder(
          transaction.sql,
          order.businessAccountId,
          order.id,
          true,
        )
      ) {
        throw new ApplicationError(
          "payment_conflict",
          409,
          "Paid orders cannot be corrected",
        );
      }
      const branch = await this.dependencies.restaurantConfiguration.getBranch(
        transaction.sql,
        order.businessAccountId,
        order.branchId,
      );
      if (branch?.restaurantId !== order.restaurantId) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Branch not found",
        );
      }
      const resolved = await this.dependencies.menu.resolveOrderItemSnapshots(
        transaction,
        {
          businessAccountId: order.businessAccountId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          branchCurrency: branch.currency,
          expectedMenuVersion: input.menuVersion,
          items: input.items,
        },
      );
      if (resolved.kind === "menu_changed") {
        throw new ApplicationError(
          "menu_changed",
          409,
          "The menu changed",
          "Review current prices and availability before correcting the order.",
          resolved.currentVersion,
        );
      }
      if (resolved.kind === "dish_unavailable") {
        throw new ApplicationError(
          "dish_unavailable",
          409,
          "A selected dish is unavailable",
        );
      }
      if (resolved.kind === "invalid_options") {
        throw new ApplicationError(
          "validation_error",
          422,
          "Invalid dish options",
          resolved.detail,
        );
      }
      const correctionId = randomUUID();
      const corrected = await this.dependencies.ordering.appendCorrection(
        transaction,
        {
          id: correctionId,
          businessAccountId: order.businessAccountId,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          expectedVersion,
          expectedRevision: order.currentItemRevision,
          reason: input.reason,
          total: resolved.total,
          items: resolved.items.map((item) => ({
            ...item,
            id: randomUUID(),
          })),
          actorUserId: context.userId,
          effectiveEmployeeId,
          now,
        },
      );
      if (!corrected) this.changedOrder(order.version);
      const cancelledWork =
        await this.dependencies.kitchen.cancelUnstartedForOrder(transaction, {
          businessAccountId: order.businessAccountId,
          orderId: order.id,
          actorUserId: context.userId,
          effectiveEmployeeId,
          reason: `Replaced by correction ${correctionId}`,
          now,
        });
      await this.dependencies.kitchen.createWorkForOrder(transaction, {
        businessAccountId: corrected.businessAccountId,
        branchId: corrected.branchId,
        orderId: corrected.id,
        orderReference: corrected.reference,
        tableId: corrected.tableId,
        tableCode: corrected.tableCode,
        changeKind: "corrected",
        correctionId,
        items: corrected.items.map((item) => ({
          id: randomUUID(),
          orderItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions.map((option) => ({
            optionGroupId: option.optionGroupId,
            optionGroupName: option.optionGroupName,
            optionId: option.optionId,
            optionName: option.optionName,
          })),
          note: item.note,
        })),
        now,
      });
      for (const item of cancelledWork) {
        await this.appendRawEvent(
          transaction,
          "kitchen.item_cancelled.v1",
          item.businessAccountId,
          order.restaurantId,
          item.branchId,
          item.id,
          item.version,
          context.userId,
          metadata,
          now,
          {
            workItemId: item.id,
            orderId: order.id,
            correctionId,
            effectiveEmployeeId,
          },
        );
      }
      await this.appendEvent(
        transaction,
        "ordering.order_corrected.v1",
        corrected,
        metadata,
        now,
        {
          orderId: corrected.id,
          orderReference: corrected.reference,
          correctionId,
          revision: corrected.currentItemRevision,
          beforeTotal: order.total,
          afterTotal: corrected.total,
          effectiveEmployeeId,
        },
      );
      await this.appendAudit(
        transaction,
        context,
        corrected,
        "ordering.order_corrected",
        "order_correction",
        correctionId,
        metadata,
        now,
        input.reason,
        {
          orderId: corrected.id,
          revision: corrected.currentItemRevision,
          beforeItems: order.items,
          afterItems: corrected.items,
          beforeTotal: order.total,
          afterTotal: corrected.total,
          effectiveEmployeeId,
        },
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        orderId: corrected.id,
        version: corrected.version,
        correctionId,
      });
      return corrected;
    });
  }

  public async moveOrderTable(
    context: StaffRequestContext,
    orderId: string,
    input: {
      readonly destinationTableId: string;
      readonly expectedTableSessionVersion: number;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: PaymentCompletionMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.requireLockedOrder(
        transaction,
        context,
        orderId,
        "tables.assign",
      );
      await this.requireFeature(
        transaction.sql,
        context.businessAccountId,
        order.branchId,
        "CFG-006",
        "Tables are unavailable",
      );
      const effectiveEmployeeId = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        input.effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "moveOrderTable",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          destinationTableId: input.destinationTableId,
          expectedTableSessionVersion: input.expectedTableSessionVersion,
          effectiveEmployeeId,
        }),
        now,
      });
      if (idempotency.kind === "replay") return order;
      if (
        order.closure !== "active" ||
        order.tableSessionVersion !== input.expectedTableSessionVersion
      ) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Table assignment changed",
          "Reload current table states before moving the session.",
          order.tableSessionVersion,
        );
      }
      const moved = await this.dependencies.tables.moveTableSession(
        transaction,
        {
          id: randomUUID(),
          businessAccountId: order.businessAccountId,
          branchId: order.branchId,
          tableSessionId: order.tableSessionId,
          destinationTableId: input.destinationTableId,
          expectedVersion: input.expectedTableSessionVersion,
          actorUserId: context.userId,
          effectiveEmployeeId,
          now,
        },
      );
      if (!moved) {
        throw new ApplicationError(
          "table_unavailable",
          409,
          "Destination table is unavailable",
          "Choose an active, available table in the same branch.",
        );
      }
      const destinationTable = await this.dependencies.tables.getTable(
        transaction.sql,
        order.businessAccountId,
        moved.session.tableId,
      );
      if (destinationTable?.branchId !== order.branchId) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Destination table changed",
          "Reload current table states before moving the session.",
        );
      }
      const sessionOrderIds =
        await this.dependencies.ordering.reassignTableSessionReferences(
          transaction,
          {
            businessAccountId: order.businessAccountId,
            tableSessionId: moved.session.id,
            destinationTableId: destinationTable.id,
          },
        );
      await this.dependencies.kitchen.reassignOrdersToTable(transaction, {
        businessAccountId: order.businessAccountId,
        orderIds: sessionOrderIds,
        destinationTableId: destinationTable.id,
        destinationTableCode: destinationTable.code,
        now,
      });
      const updated = await this.dependencies.ordering.getOrder(
        transaction.sql,
        order.businessAccountId,
        order.id,
      );
      if (!updated) this.changedOrder(order.version);
      await this.appendRawEvent(
        transaction,
        "tables.session_moved.v1",
        order.businessAccountId,
        order.restaurantId,
        order.branchId,
        moved.session.id,
        moved.session.version,
        context.userId,
        metadata,
        now,
        {
          tableSessionId: moved.session.id,
          fromTableId: moved.movement.fromTableId,
          toTableId: moved.movement.toTableId,
          effectiveEmployeeId,
        },
      );
      await this.appendAudit(
        transaction,
        context,
        updated,
        "tables.table_session_moved",
        "table_session",
        moved.session.id,
        metadata,
        now,
        undefined,
        {
          fromTableId: moved.movement.fromTableId,
          toTableId: moved.movement.toTableId,
          sessionVersion: moved.session.version,
          effectiveEmployeeId,
        },
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        orderId: updated.id,
        tableSessionId: moved.session.id,
        tableSessionVersion: moved.session.version,
      });
      return updated;
    });
  }

  private async requireLockedOrder(
    transaction: TransactionContext,
    context: StaffRequestContext,
    orderId: string,
    permission:
      | "orders.modify"
      | "orders.cancel"
      | "orders.complete"
      | "orders.complete_unpaid"
      | "payments.record"
      | "payments.refund"
      | "tables.assign",
  ): Promise<OrderRecord> {
    const order = await this.dependencies.ordering.getOrderForUpdate(
      transaction,
      context.businessAccountId,
      orderId,
    );
    if (!order) {
      throw new ApplicationError("resource_not_found", 404, "Order not found");
    }
    await this.requireBranchPermission(
      transaction.sql,
      context,
      order.branchId,
      permission,
      order.restaurantId,
    );
    return order;
  }

  private async requireReadableOrder(
    sql: DatabasePool,
    context: StaffRequestContext,
    orderId: string,
    permission: "payments.view",
  ): Promise<OrderRecord> {
    const order = await this.dependencies.ordering.getOrder(
      sql,
      context.businessAccountId,
      orderId,
    );
    if (!order) {
      throw new ApplicationError("resource_not_found", 404, "Order not found");
    }
    await this.requireBranchPermission(
      sql,
      context,
      order.branchId,
      permission,
      order.restaurantId,
    );
    return order;
  }

  private async requireBranchPermission(
    sql: Parameters<RestaurantConfigurationStore["getBranch"]>[0],
    context: StaffRequestContext,
    branchId: string,
    permission:
      | "orders.modify"
      | "orders.cancel"
      | "orders.complete"
      | "orders.complete_unpaid"
      | "payments.view"
      | "payments.record"
      | "payments.refund"
      | "tables.assign",
    expectedRestaurantId?: string,
  ): Promise<{ readonly restaurantId: string }> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      sql,
      context.businessAccountId,
      branchId,
    );
    if (
      !branch ||
      (expectedRestaurantId && branch.restaurantId !== expectedRestaurantId) ||
      !hasPermission(context, permission, branch.restaurantId, branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return { restaurantId: branch.restaurantId };
  }

  private async requireFeature(
    sql: Parameters<RestaurantConfigurationStore["getFeatureConfiguration"]>[0],
    businessAccountId: string,
    branchId: string,
    featureId: "CFG-005" | "CFG-006" | "CFG-007" | "CFG-011",
    title: string,
  ): Promise<void> {
    const configuration =
      await this.dependencies.restaurantConfiguration.getFeatureConfiguration(
        sql,
        businessAccountId,
        branchId,
      );
    const state = configuration?.values[featureId];
    if (!configuration || state === "disabled" || state === "unavailable") {
      throw new ApplicationError("feature_disabled", 409, title);
    }
  }

  private async resolveEffectiveEmployee(
    transaction: TransactionContext,
    context: StaffRequestContext,
    branchId: string,
    effectiveEmployeeId: string | undefined,
  ): Promise<string> {
    const employeeId = effectiveEmployeeId ?? context.employeeId;
    const employee =
      await this.dependencies.restaurantConfiguration.getEmployee(
        transaction.sql,
        context.businessAccountId,
        employeeId,
      );
    if (
      employee?.status !== "active" ||
      !employee.branchIds.includes(branchId)
    ) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Effective employee is unavailable",
        "Choose an active employee assigned to this branch.",
      );
    }
    return employee.id;
  }

  private requireRecentAuthentication(
    context: StaffRequestContext,
    now: Date,
    action: string,
  ): void {
    if (
      now.getTime() - context.authenticatedAtUtc.getTime() >
      recentAuthenticationMs
    ) {
      throw new ApplicationError(
        "authentication_required",
        401,
        "Recent authentication required",
        `Sign in again before you ${action}.`,
      );
    }
  }

  private async closeTableSessionIfEligible(
    transaction: TransactionContext,
    order: OrderRecord,
    context: StaffRequestContext,
    metadata: PaymentCompletionMetadata,
    now: Date,
  ): Promise<void> {
    if (
      await this.dependencies.ordering.tableSessionHasUnresolvedWork(
        transaction.sql,
        order.businessAccountId,
        order.tableSessionId,
      )
    ) {
      return;
    }
    const session = await this.dependencies.tables.getOpenTableSessionForUpdate(
      transaction,
      order.businessAccountId,
      order.tableSessionId,
    );
    if (!session) return;
    const closed = await this.dependencies.tables.closeTableSession(
      transaction,
      {
        businessAccountId: order.businessAccountId,
        tableSessionId: session.id,
        expectedVersion: session.version,
        now,
      },
    );
    if (!closed) return;
    await this.appendRawEvent(
      transaction,
      "tables.session_closed.v1",
      order.businessAccountId,
      order.restaurantId,
      order.branchId,
      closed.id,
      closed.version,
      context.userId,
      metadata,
      now,
      {
        tableSessionId: closed.id,
        tableId: closed.tableId,
      },
    );
    await this.appendAudit(
      transaction,
      context,
      order,
      "tables.table_session_closed",
      "table_session",
      closed.id,
      metadata,
      now,
      undefined,
      {
        tableId: closed.tableId,
        sessionVersion: closed.version,
      },
    );
  }

  private changedOrder(currentVersion?: number): never {
    throw new ApplicationError(
      "concurrency_conflict",
      409,
      "Order changed",
      "Reload the order before trying again.",
      currentVersion,
    );
  }

  private async beginIdempotency(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly actorScope: string;
      readonly operation: string;
      readonly idempotencyKey: string;
      readonly requestHash: string;
      readonly now: Date;
    },
  ): Promise<
    | { readonly kind: "acquired"; readonly recordId: string }
    | { readonly kind: "replay"; readonly responseBody: unknown }
  > {
    const result = await beginIdempotentCommand(transaction, {
      businessAccountId: input.businessAccountId,
      actorScope: input.actorScope,
      operation: input.operation,
      idempotencyKeyHash: hashOpaqueToken(
        input.idempotencyKey,
        this.dependencies.idempotencySecret,
      ),
      requestHash: input.requestHash,
      now: input.now,
      expiresAtUtc: new Date(input.now.getTime() + idempotencyRetentionMs),
    });
    if (result.kind === "payload_conflict" || result.kind === "in_progress") {
      throw new ApplicationError(
        "idempotency_conflict",
        409,
        "Idempotency key already used",
        "Retry the original action or use a new idempotency key.",
      );
    }
    if (result.kind === "replay") {
      this.dependencies.onIdempotentReplay?.();
      return { kind: "replay", responseBody: result.responseBody };
    }
    return result;
  }

  private async appendPaymentEvent(
    transaction: TransactionContext,
    eventType: string,
    payment: PaymentRecord,
    metadata: PaymentCompletionMetadata,
    now: Date,
  ): Promise<void> {
    await this.appendRawEvent(
      transaction,
      eventType,
      payment.businessAccountId,
      payment.restaurantId,
      payment.branchId,
      payment.id,
      1,
      payment.recordedByUserId,
      metadata,
      now,
      {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        method: payment.method,
        effectiveEmployeeId: payment.recordedByEmployeeId,
      },
    );
  }

  private async appendRefundEvent(
    transaction: TransactionContext,
    refund: RefundRecord,
    order: OrderRecord,
    metadata: PaymentCompletionMetadata,
    now: Date,
  ): Promise<void> {
    await this.appendRawEvent(
      transaction,
      "payments.payment_refunded.v1",
      refund.businessAccountId,
      refund.restaurantId,
      refund.branchId,
      refund.id,
      1,
      refund.refundedByUserId,
      metadata,
      now,
      {
        refundId: refund.id,
        paymentId: refund.paymentId,
        orderId: refund.orderId,
        amount: refund.amount,
        source: refund.source,
        financial: order.financial,
        effectiveEmployeeId: refund.refundedByEmployeeId,
      },
    );
  }

  private async appendEvent(
    transaction: TransactionContext,
    eventType: string,
    order: OrderRecord,
    metadata: PaymentCompletionMetadata,
    now: Date,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.appendRawEvent(
      transaction,
      eventType,
      order.businessAccountId,
      order.restaurantId,
      order.branchId,
      order.id,
      order.version,
      order.completedByUserId ??
        order.cancelledByUserId ??
        order.servedByUserId,
      metadata,
      now,
      payload,
    );
  }

  private async appendRawEvent(
    transaction: TransactionContext,
    eventType: string,
    businessAccountId: string,
    restaurantId: string,
    branchId: string,
    aggregateId: string,
    aggregateVersion: number,
    actorId: string | undefined,
    metadata: PaymentCompletionMetadata,
    now: Date,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType,
      businessAccountId,
      restaurantId,
      branchId,
      aggregateId,
      aggregateVersion,
      occurredAtUtc: now,
      correlationId: metadata.correlationId,
      causationId: metadata.causationId,
      ...(actorId ? { actorId } : {}),
      payload,
    });
  }

  private async appendAudit(
    transaction: TransactionContext,
    context: StaffRequestContext,
    order: OrderRecord,
    action: string,
    targetType: string,
    targetId: string,
    metadata: PaymentCompletionMetadata,
    now: Date,
    reason: string | undefined,
    afterData: unknown,
  ): Promise<void> {
    await this.dependencies.audit.appendInTransaction(transaction, {
      id: randomUUID(),
      businessAccountId: order.businessAccountId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      actorUserId: context.userId,
      action,
      targetType,
      targetId,
      outcome: "succeeded",
      ...(reason ? { reason } : {}),
      correlationId: metadata.correlationId,
      afterData,
      occurredAtUtc: now,
    });
  }
}
