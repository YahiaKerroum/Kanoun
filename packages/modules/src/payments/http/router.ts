import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  createCsrfProtection,
  requireStaffSession,
  type SessionMiddlewareDependencies,
  type StaffRequest,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  PaymentLedger,
  PaymentRecord,
  RefundRecord,
} from "../domain/models.js";
import {
  branchQuerySchema,
  idempotencyKeySchema,
  orderParametersSchema,
  paymentParametersSchema,
  recordPaymentSchema,
  recordRefundSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

interface PaymentOrderView {
  readonly id: string;
  readonly reference: string;
  readonly version: number;
  readonly branchId: string;
  readonly tableId: string;
  readonly tableCode: string;
  readonly total: { readonly amount: string; readonly currency: string };
  readonly financial: "unpaid" | "paid" | "partially_refunded" | "refunded";
  readonly fulfilment: "not_started" | "preparing" | "ready" | "served";
  readonly closure: "active" | "completed" | "cancelled";
}

interface BillRequestView {
  readonly request: {
    readonly id: string;
    readonly requestedAtUtc: Date;
  };
  readonly order: PaymentOrderView;
  readonly ledger: PaymentLedger;
}

export interface PaymentsHttpUseCases {
  listOpenBillRequests(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly BillRequestView[]>;
  getOrderLedger(
    context: StaffRequestContext,
    orderId: string,
  ): Promise<{
    readonly order: PaymentOrderView;
    readonly ledger: PaymentLedger;
  }>;
  recordPayment(
    context: StaffRequestContext,
    orderId: string,
    input: {
      readonly amount: { readonly amount: string; readonly currency: string };
      readonly method: "cash" | "card";
      readonly externalReference?: string | undefined;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<{
    readonly order: PaymentOrderView;
    readonly payment: PaymentRecord;
  }>;
  recordRefund(
    context: StaffRequestContext,
    paymentId: string,
    input: {
      readonly amount: { readonly amount: string; readonly currency: string };
      readonly reason: string;
      readonly confirmed: boolean;
      readonly effectiveEmployeeId?: string | undefined;
    },
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<{
    readonly order: PaymentOrderView;
    readonly refund: RefundRecord;
  }>;
}

export interface PaymentsRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: PaymentsHttpUseCases;
}

function parse<Input>(schema: z.ZodType<Input>, value: unknown): Input {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(
      "validation_error",
      422,
      "Request validation failed",
      z.prettifyError(result.error),
    );
  }
  return result.data;
}

function context(request: Request): StaffRequestContext {
  const staffContext = (request as StaffRequest).staffContext;
  if (!staffContext) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return staffContext;
}

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

function presentPayment(payment: PaymentRecord): object {
  return {
    id: payment.id,
    orderId: payment.orderId,
    amount: payment.amount,
    method: payment.method,
    externalReference: payment.externalReference ?? null,
    recordedAt: payment.recordedAtUtc.toISOString(),
    recordedByEmployeeId: payment.recordedByEmployeeId,
  };
}

function presentRefund(refund: RefundRecord): object {
  return {
    id: refund.id,
    orderId: refund.orderId,
    paymentId: refund.paymentId,
    amount: refund.amount,
    reason: refund.reason,
    source: refund.source,
    refundedAt: refund.refundedAtUtc.toISOString(),
    refundedByEmployeeId: refund.refundedByEmployeeId,
  };
}

function presentLedger(order: PaymentOrderView, ledger: PaymentLedger): object {
  return {
    orderId: order.id,
    orderReference: order.reference,
    orderVersion: order.version,
    branchId: order.branchId,
    tableId: order.tableId,
    tableCode: order.tableCode,
    total: order.total,
    financial: order.financial,
    fulfilment: order.fulfilment,
    closure: order.closure,
    payment: ledger.payment ? presentPayment(ledger.payment) : null,
    refunds: ledger.refunds.map(presentRefund),
    refundedAmount: ledger.refundedAmount,
    netPaidAmount: ledger.netPaidAmount,
  };
}

export function createPaymentsRouter(
  dependencies: PaymentsRouterDependencies,
): Router {
  const router = Router();
  const csrf = createCsrfProtection(dependencies);
  const commandLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get(
    "/staff/payments/bill-requests",
    requireStaffSession(),
    async (request, response) => {
      const query = parse(branchQuerySchema, request.query);
      const views = await dependencies.useCases.listOpenBillRequests(
        context(request),
        query.branchId,
      );
      response.send({
        items: views.map((view) => ({
          id: view.request.id,
          requestedAt: view.request.requestedAtUtc.toISOString(),
          ...presentLedger(view.order, view.ledger),
        })),
      });
    },
  );

  router.get(
    "/staff/orders/:orderId/payment-ledger",
    requireStaffSession(),
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const result = await dependencies.useCases.getOrderLedger(
        context(request),
        parameters.orderId,
      );
      response.send(presentLedger(result.order, result.ledger));
    },
  );

  router.post(
    "/staff/orders/:orderId/payments",
    commandLimiter,
    requireStaffSession(),
    csrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(recordPaymentSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const result = await dependencies.useCases.recordPayment(
        context(request),
        parameters.orderId,
        input,
        idempotencyKey,
        metadata(request),
      );
      response.status(201).send({
        payment: presentPayment(result.payment),
        order: {
          id: result.order.id,
          version: result.order.version,
          financial: result.order.financial,
        },
      });
    },
  );

  router.post(
    "/staff/payments/:paymentId/refunds",
    commandLimiter,
    requireStaffSession(),
    csrf,
    async (request, response) => {
      const parameters = parse(paymentParametersSchema, request.params);
      const input = parse(recordRefundSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const result = await dependencies.useCases.recordRefund(
        context(request),
        parameters.paymentId,
        input,
        idempotencyKey,
        metadata(request),
      );
      response.status(201).send({
        refund: presentRefund(result.refund),
        order: {
          id: result.order.id,
          version: result.order.version,
          financial: result.order.financial,
        },
      });
    },
  );

  return router;
}
