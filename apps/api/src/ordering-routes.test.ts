import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ApplicationError,
  createGuestSessionMiddleware,
  createOrderingRouter,
  createStaffSessionMiddleware,
  type GuestRequestContext,
  type OrderingHttpUseCases,
  type OrderRecord,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const tableId = randomUUID();
const employeeId = randomUUID();
const userId = randomUUID();
const guestSessionId = randomUUID();
const orderId = randomUUID();
const guestOrigin = "https://customer.example.test";
const staffOrigin = "https://staff.example.test";

const guestContext: GuestRequestContext = {
  guestSessionId,
  businessAccountId,
  restaurantId,
  branchId,
  tableId,
  expiresAtUtc: new Date(Date.now() + 60_000),
  csrfTokenHash: "guest-csrf",
};

const staffContext: StaffRequestContext & { readonly csrfTokenHash: string } = {
  sessionId: randomUUID(),
  businessAccountId,
  userId,
  employeeId,
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "orders.view", restaurantId, branchId },
    { permissionKey: "orders.create", restaurantId, branchId },
    { permissionKey: "orders.serve", restaurantId, branchId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60_000),
  csrfTokenHash: "staff-csrf",
};

const order: OrderRecord = {
  id: orderId,
  businessAccountId,
  restaurantId,
  branchId,
  tableSessionId: randomUUID(),
  tableSessionVersion: 1,
  tableId,
  tableCode: "T-1",
  reference: "ORD-000001",
  creatorType: "guest",
  customerSessionId: guestSessionId,
  customerDisplayName: "Amina",
  configurationVersionId: randomUUID(),
  configurationVersion: 2,
  approval: "accepted",
  fulfilment: "not_started",
  financial: "unpaid",
  closure: "active",
  total: { amount: "1250.00", currency: "DZD" },
  version: 2,
  currentItemRevision: 1,
  submittedAtUtc: new Date("2026-07-28T12:00:00.000Z"),
  acceptedAtUtc: new Date("2026-07-28T12:00:00.000Z"),
  cancellationRequested: false,
  corrections: [],
  items: [
    {
      id: randomUUID(),
      revision: 1,
      sourceDishId: randomUUID(),
      sourceMenuVersion: 4,
      name: "Couscous",
      basePrice: { amount: "1000.00", currency: "DZD" },
      unitPrice: { amount: "1250.00", currency: "DZD" },
      quantity: 1,
      selectedOptions: [
        {
          optionGroupId: randomUUID(),
          optionGroupName: "Size",
          optionId: randomUUID(),
          optionName: "Large",
          priceDelta: { amount: "250.00", currency: "DZD" },
        },
      ],
      note: "No parsley",
      taxInclusive: true,
      total: { amount: "1250.00", currency: "DZD" },
    },
  ],
};

const orderItem = order.items[0];
const orderOption = orderItem?.selectedOptions[0];
if (!orderItem || !orderOption) {
  throw new Error("The ordering HTTP fixture requires one item and option.");
}

function application(overrides?: Partial<OrderingHttpUseCases>) {
  const useCases = {
    submitGuestOrder: vi.fn().mockResolvedValue(order),
    createStaffOrder: vi
      .fn()
      .mockResolvedValue({ ...order, creatorType: "staff" }),
    getGuestOrder: vi.fn().mockResolvedValue(order),
    requestGuestCancellation: vi.fn().mockResolvedValue({
      id: randomUUID(),
      orderId,
      status: "open",
      reason: "Ordered by mistake",
      createdAtUtc: new Date("2026-07-28T12:01:00.000Z"),
    }),
    listStaffOrders: vi
      .fn()
      .mockResolvedValue({ items: [order], nextCursor: "next" }),
    ...overrides,
  } satisfies OrderingHttpUseCases;
  const dependencies = {
    authenticateSession: (token: string) =>
      Promise.resolve(token === "staff-token" ? staffContext : undefined),
    authenticateGuestSession: (token: string) =>
      Promise.resolve(token === "guest-token" ? guestContext : undefined),
    hashCsrfToken: (token: string) => token,
    webOrigin: staffOrigin,
    guestWebOrigin: guestOrigin,
  };
  const servingUseCases = {
    markOrderServed: vi.fn().mockResolvedValue({
      ...order,
      version: order.version + 1,
      fulfilment: "served" as const,
      servedAtUtc: new Date("2026-07-28T12:20:00.000Z"),
      servedByUserId: userId,
      servedByEmployeeId: employeeId,
    }),
  };
  const paymentCompletionUseCases = {
    requestGuestBill: vi.fn().mockResolvedValue({
      id: randomUUID(),
      orderId,
      branchId,
      status: "open" as const,
      requestedAtUtc: new Date("2026-07-28T12:30:00.000Z"),
      requestedByGuestSessionId: guestSessionId,
    }),
    correctOrder: vi.fn().mockResolvedValue(order),
    cancelOrder: vi.fn().mockResolvedValue({
      ...order,
      closure: "cancelled" as const,
    }),
    completeOrder: vi.fn().mockResolvedValue({
      ...order,
      closure: "completed" as const,
    }),
    moveOrderTable: vi.fn().mockResolvedValue(order),
  };
  return {
    useCases,
    servingUseCases,
    paymentCompletionUseCases,
    app: createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
      staffSessionMiddleware: createStaffSessionMiddleware(dependencies),
      guestSessionMiddleware: createGuestSessionMiddleware(dependencies),
      apiRouters: [
        createOrderingRouter({
          ...dependencies,
          useCases,
          servingUseCases,
          paymentCompletionUseCases,
        }),
      ],
    }),
  };
}

const submission = {
  menuVersion: "4",
  customerName: "Amina",
  items: [
    {
      dishId: orderItem.sourceDishId,
      quantity: 1,
      optionIds: [orderOption.optionId],
      note: "No parsley",
    },
  ],
};

describe("ordering HTTP adapter", () => {
  it("requires a guest session and verified origin/CSRF token", async () => {
    const { app } = application();
    await request(app)
      .post("/api/v1/public/orders")
      .set("Origin", guestOrigin)
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "1234567890abcdef")
      .send(submission)
      .expect(401);
    await request(app)
      .post("/api/v1/public/orders")
      .set("Cookie", "rms_guest_session=guest-token")
      .set("Origin", "https://evil.example.test")
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "1234567890abcdef")
      .send(submission)
      .expect(403);
  });

  it("validates transport input before invoking the use case", async () => {
    const { app, useCases } = application();
    await request(app)
      .post("/api/v1/public/orders")
      .set("Cookie", "rms_guest_session=guest-token")
      .set("Origin", guestOrigin)
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "short")
      .send({ menuVersion: "0", items: [] })
      .expect(422);
    expect(useCases.submitGuestOrder).not.toHaveBeenCalled();
  });

  it("submits a guest order and presents immutable option snapshots", async () => {
    const { app, useCases } = application();
    const response = await request(app)
      .post("/api/v1/public/orders")
      .set("Cookie", "rms_guest_session=guest-token")
      .set("Origin", guestOrigin)
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "1234567890abcdef")
      .send(submission)
      .expect(201);
    expect(response.body).toMatchObject({
      id: orderId,
      reference: "ORD-000001",
      approval: "accepted",
      tableCode: "T-1",
      items: [
        {
          name: "Couscous",
          menuVersion: "4",
          selectedOptions: [{ optionName: "Large" }],
          taxInclusive: true,
        },
      ],
    });
    expect(useCases.submitGuestOrder).toHaveBeenCalledWith(
      guestContext,
      expect.objectContaining({ menuVersion: 4 }),
      "1234567890abcdef",
      expect.any(Object),
    );
  });

  it("does not expose another guest order when the use case denies scope", async () => {
    const { app } = application({
      getGuestOrder: vi
        .fn()
        .mockRejectedValue(
          new ApplicationError("resource_not_found", 404, "Order not found"),
        ),
    });
    await request(app)
      .get(`/api/v1/public/orders/${randomUUID()}`)
      .set("Cookie", "rms_guest_session=guest-token")
      .expect(404);
  });

  it("records an idempotent cancellation request", async () => {
    const { app, useCases } = application();
    const response = await request(app)
      .post(`/api/v1/public/orders/${orderId}/cancellation-requests`)
      .set("Cookie", "rms_guest_session=guest-token")
      .set("Origin", guestOrigin)
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "cancel-1234567890")
      .send({ reason: "Ordered by mistake" })
      .expect(202);
    expect(response.body).toMatchObject({
      orderId,
      status: "open",
      reason: "Ordered by mistake",
    });
    expect(useCases.requestGuestCancellation).toHaveBeenCalledOnce();
  });

  it("lists filtered staff orders and creates a staff order with staff CSRF", async () => {
    const { app, useCases } = application();
    const list = await request(app)
      .get("/api/v1/staff/orders")
      .query({
        branchId,
        closure: "active",
        tableId,
        createdByEmployeeId: employeeId,
        pageSize: 20,
      })
      .set("Cookie", "rms_staff_session=staff-token")
      .expect(200);
    expect(list.body).toMatchObject({
      items: [{ id: orderId }],
      nextCursor: "next",
    });
    expect(useCases.listStaffOrders).toHaveBeenCalledWith(
      staffContext,
      expect.objectContaining({
        branchId,
        closure: "active",
        tableId,
        createdByEmployeeId: employeeId,
        pageSize: 20,
      }),
    );

    await request(app)
      .post("/api/v1/staff/orders")
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "staff-1234567890")
      .send({ ...submission, tableId })
      .expect(201);
    expect(useCases.createStaffOrder).toHaveBeenCalledOnce();
  });

  it("marks a ready order served with CSRF, idempotency, and version guards", async () => {
    const { app, servingUseCases } = application();
    const response = await request(app)
      .post(`/api/v1/staff/orders/${orderId}/served`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "serve-1234567890")
      .set("If-Match", '"4"')
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      id: orderId,
      fulfilment: "served",
      servedByEmployeeId: employeeId,
    });
    expect(servingUseCases.markOrderServed).toHaveBeenCalledWith(
      staffContext,
      orderId,
      4,
      undefined,
      "serve-1234567890",
      expect.any(Object),
    );
  });

  it("creates an idempotent guest bill request with guest CSRF", async () => {
    const { app, paymentCompletionUseCases } = application();
    const response = await request(app)
      .post(`/api/v1/public/orders/${orderId}/bill-requests`)
      .set("Cookie", "rms_guest_session=guest-token")
      .set("Origin", guestOrigin)
      .set("X-CSRF-Token", "guest-csrf")
      .set("Idempotency-Key", "bill-12345678901")
      .send({})
      .expect(202);
    expect(response.body).toMatchObject({
      orderId,
      status: "open",
    });
    expect(paymentCompletionUseCases.requestGuestBill).toHaveBeenCalledWith(
      guestContext,
      orderId,
      "bill-12345678901",
      expect.any(Object),
    );
  });

  it("validates and composes correction, cancellation, completion, and whole-session move commands", async () => {
    const { app, paymentCompletionUseCases } = application();
    const headers = {
      Cookie: "rms_staff_session=staff-token",
      Origin: staffOrigin,
      "X-CSRF-Token": "staff-csrf",
      "Idempotency-Key": "operation-1234567",
      "If-Match": '"2"',
    };

    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/corrections`)
      .set(headers)
      .send({
        menuVersion: "4",
        items: submission.items,
        reason: "Correct quantity",
      })
      .expect(200);
    expect(paymentCompletionUseCases.correctOrder).toHaveBeenCalledWith(
      staffContext,
      orderId,
      2,
      expect.objectContaining({
        menuVersion: 4,
        reason: "Correct quantity",
      }),
      "operation-1234567",
      expect.any(Object),
    );

    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/cancellation`)
      .set(headers)
      .send({ reason: "Customer left" })
      .expect(200);
    expect(paymentCompletionUseCases.cancelOrder).toHaveBeenCalledWith(
      staffContext,
      orderId,
      2,
      { reason: "Customer left" },
      "operation-1234567",
      expect.any(Object),
    );

    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/completion`)
      .set(headers)
      .send({ confirmUnpaidOverride: true })
      .expect(422);
    expect(paymentCompletionUseCases.completeOrder).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/completion`)
      .set(headers)
      .send({
        unpaidOverrideReason: "Approved recovery",
        confirmUnpaidOverride: true,
      })
      .expect(200);
    expect(paymentCompletionUseCases.completeOrder).toHaveBeenCalledWith(
      staffContext,
      orderId,
      2,
      {
        unpaidOverrideReason: "Approved recovery",
        confirmUnpaidOverride: true,
      },
      "operation-1234567",
      expect.any(Object),
    );

    const destinationTableId = randomUUID();
    await request(app)
      .post(`/api/v1/staff/orders/${orderId}/table-assignment`)
      .set({
        Cookie: headers.Cookie,
        Origin: headers.Origin,
        "X-CSRF-Token": headers["X-CSRF-Token"],
        "Idempotency-Key": headers["Idempotency-Key"],
      })
      .send({
        destinationTableId,
        expectedTableSessionVersion: 3,
      })
      .expect(200);
    expect(paymentCompletionUseCases.moveOrderTable).toHaveBeenCalledWith(
      staffContext,
      orderId,
      {
        destinationTableId,
        expectedTableSessionVersion: 3,
      },
      "operation-1234567",
      expect.any(Object),
    );
  });
});
