import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ApplicationError,
  createPaymentsRouter,
  createStaffSessionMiddleware,
  type PaymentRecord,
  type PaymentsHttpUseCases,
  type RefundRecord,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const tableId = randomUUID();
const orderId = randomUUID();
const paymentId = randomUUID();
const refundId = randomUUID();
const employeeId = randomUUID();
const staffOrigin = "https://staff.example.test";

const staffContext: StaffRequestContext & { readonly csrfTokenHash: string } = {
  sessionId: randomUUID(),
  businessAccountId,
  userId: randomUUID(),
  employeeId,
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "payments.view", restaurantId, branchId },
    { permissionKey: "payments.record", restaurantId, branchId },
    { permissionKey: "payments.refund", restaurantId, branchId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60_000),
  csrfTokenHash: "staff-csrf",
};

const payment: PaymentRecord = {
  id: paymentId,
  businessAccountId,
  restaurantId,
  branchId,
  orderId,
  amount: { amount: "1250.00", currency: "DZD" },
  method: "card",
  externalReference: "CARD-42",
  recordedAtUtc: new Date("2026-07-29T10:00:00.000Z"),
  recordedByUserId: staffContext.userId,
  recordedByEmployeeId: employeeId,
};

const refund: RefundRecord = {
  id: refundId,
  businessAccountId,
  restaurantId,
  branchId,
  orderId,
  paymentId,
  amount: { amount: "250.00", currency: "DZD" },
  reason: "Guest goodwill",
  source: "manual",
  refundedAtUtc: new Date("2026-07-29T10:30:00.000Z"),
  refundedByUserId: staffContext.userId,
  refundedByEmployeeId: employeeId,
};

const order = {
  id: orderId,
  reference: "ORD-000042",
  version: 8,
  branchId,
  tableId,
  tableCode: "T-4",
  total: { amount: "1250.00", currency: "DZD" },
  financial: "partially_refunded" as const,
  fulfilment: "served" as const,
  closure: "completed" as const,
};

const ledger = {
  payment,
  refunds: [refund],
  refundedAmount: { amount: "250.00", currency: "DZD" },
  netPaidAmount: { amount: "1000.00", currency: "DZD" },
};

function application(overrides?: Partial<PaymentsHttpUseCases>) {
  const useCases = {
    listOpenBillRequests: vi.fn().mockResolvedValue([
      {
        request: {
          id: randomUUID(),
          requestedAtUtc: new Date("2026-07-29T09:55:00.000Z"),
        },
        order,
        ledger,
      },
    ]),
    getOrderLedger: vi.fn().mockResolvedValue({ order, ledger }),
    recordPayment: vi.fn().mockResolvedValue({
      order: { ...order, financial: "paid" as const },
      payment,
    }),
    recordRefund: vi.fn().mockResolvedValue({ order, refund }),
    ...overrides,
  } satisfies PaymentsHttpUseCases;
  const dependencies = {
    authenticateSession: (token: string) =>
      Promise.resolve(token === "staff-token" ? staffContext : undefined),
    hashCsrfToken: (token: string) => token,
    webOrigin: staffOrigin,
  };
  return {
    useCases,
    app: createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
      staffSessionMiddleware: createStaffSessionMiddleware(dependencies),
      apiRouters: [
        createPaymentsRouter({
          ...dependencies,
          useCases,
        }),
      ],
    }),
  };
}

describe("payments HTTP adapter", () => {
  it("validates branch scope input and presents the authoritative bill queue", async () => {
    const { app, useCases } = application();
    await request(app)
      .get("/api/v1/staff/payments/bill-requests")
      .query({ branchId: "not-a-uuid" })
      .set("Cookie", "rms_staff_session=staff-token")
      .expect(422);
    expect(useCases.listOpenBillRequests).not.toHaveBeenCalled();

    const response = await request(app)
      .get("/api/v1/staff/payments/bill-requests")
      .query({ branchId })
      .set("Cookie", "rms_staff_session=staff-token")
      .expect(200);
    expect(response.body).toMatchObject({
      items: [
        {
          orderId,
          orderReference: "ORD-000042",
          tableCode: "T-4",
          payment: {
            id: paymentId,
            externalReference: "CARD-42",
          },
          refunds: [{ id: refundId, source: "manual" }],
          refundedAmount: { amount: "250.00", currency: "DZD" },
        },
      ],
    });
    expect(useCases.listOpenBillRequests).toHaveBeenCalledWith(
      staffContext,
      branchId,
    );
  });

  it("requires authentication for payment history and preserves append-only ledger fields", async () => {
    const { app } = application();
    await request(app)
      .get(`/api/v1/staff/orders/${orderId}/payment-ledger`)
      .expect(401);
    const response = await request(app)
      .get(`/api/v1/staff/orders/${orderId}/payment-ledger`)
      .set("Cookie", "rms_staff_session=staff-token")
      .expect(200);
    expect(response.body).toMatchObject({
      orderId,
      financial: "partially_refunded",
      payment: { id: paymentId, amount: payment.amount },
      refunds: [
        {
          id: refundId,
          paymentId,
          reason: "Guest goodwill",
          amount: refund.amount,
        },
      ],
    });
  });

  it("enforces CSRF, money bounds, and idempotency before recording payment", async () => {
    const { app, useCases } = application();
    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/payments`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "short")
      .send({
        amount: { amount: "10000000000.00", currency: "DZD" },
        method: "cash",
      })
      .expect(422);
    expect(useCases.recordPayment).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/payments`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", "https://evil.example.test")
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "payment-123456789")
      .send({ amount: payment.amount, method: "card" })
      .expect(403);

    const response = await request(app)
      .post(`/api/v1/staff/orders/${orderId}/payments`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "payment-123456789")
      .send({
        amount: payment.amount,
        method: "card",
        externalReference: "CARD-42",
      })
      .expect(201);
    expect(response.body).toMatchObject({
      payment: { id: paymentId, method: "card" },
      order: { id: orderId, financial: "paid" },
    });
    expect(useCases.recordPayment).toHaveBeenCalledWith(
      staffContext,
      orderId,
      {
        amount: payment.amount,
        method: "card",
        externalReference: "CARD-42",
      },
      "payment-123456789",
      expect.any(Object),
    );
  });

  it("requires explicit refund confirmation and presents canonical problems", async () => {
    const denied = application({
      recordRefund: vi
        .fn()
        .mockRejectedValue(
          new ApplicationError(
            "authentication_required",
            401,
            "Recent authentication required",
            "Sign in again before you refund a payment.",
          ),
        ),
    });
    await request(denied.app)
      .post(`/api/v1/staff/payments/${paymentId}/refunds`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "refund-1234567890")
      .send({
        amount: refund.amount,
        reason: refund.reason,
        confirmed: false,
      })
      .expect(422);
    expect(denied.useCases.recordRefund).not.toHaveBeenCalled();

    const response = await request(denied.app)
      .post(`/api/v1/staff/payments/${paymentId}/refunds`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "refund-1234567890")
      .send({
        amount: refund.amount,
        reason: refund.reason,
        confirmed: true,
      })
      .expect(401);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body).toMatchObject({
      code: "authentication_required",
      title: "Recent authentication required",
    });
  });
});
