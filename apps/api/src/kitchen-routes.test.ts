import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createKitchenRouter,
  createStaffSessionMiddleware,
  type KitchenHttpUseCases,
  type KitchenQueueItemView,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const employeeId = randomUUID();
const userId = randomUUID();
const orderId = randomUUID();
const workItemId = randomUUID();
const staffOrigin = "https://staff.example.test";

const context: StaffRequestContext & { readonly csrfTokenHash: string } = {
  sessionId: randomUUID(),
  businessAccountId,
  userId,
  employeeId,
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "kitchen.view", restaurantId, branchId },
    { permissionKey: "kitchen.update", restaurantId, branchId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60_000),
  csrfTokenHash: "staff-csrf",
};

const item: KitchenQueueItemView = {
  id: workItemId,
  businessAccountId,
  branchId,
  orderId,
  orderItemId: randomUUID(),
  orderReference: "ORD-000001",
  orderVersion: 3,
  orderFulfilment: "preparing",
  orderSubmittedAtUtc: new Date("2026-07-28T12:00:00.000Z"),
  tableId: randomUUID(),
  tableCode: "T-4",
  itemName: "Couscous",
  quantity: 2,
  selectedOptions: [
    {
      optionGroupId: randomUUID(),
      optionGroupName: "Size",
      optionId: randomUUID(),
      optionName: "Large",
    },
  ],
  note: "No parsley",
  changeKind: "new",
  state: "preparing",
  version: 2,
  queuedAtUtc: new Date("2026-07-28T12:00:00.000Z"),
  startedAtUtc: new Date("2026-07-28T12:02:00.000Z"),
  startedByUserId: userId,
  startedByEmployeeId: employeeId,
};

function application(overrides?: Partial<KitchenHttpUseCases>) {
  const startKitchenWorkItem =
    vi.fn<KitchenHttpUseCases["startKitchenWorkItem"]>();
  startKitchenWorkItem.mockResolvedValue({ ...item, state: "preparing" });
  const useCases = {
    getKitchenQueue: vi.fn().mockResolvedValue([item]),
    startKitchenWorkItem,
    markKitchenWorkItemReady: vi
      .fn()
      .mockResolvedValue({ ...item, state: "ready", version: 3 }),
    ...overrides,
  } satisfies KitchenHttpUseCases;
  const dependencies = {
    authenticateSession: (token: string) =>
      Promise.resolve(token === "staff-token" ? context : undefined),
    hashCsrfToken: (token: string) => token,
    webOrigin: staffOrigin,
  };
  return {
    useCases,
    startKitchenWorkItem,
    app: createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
      staffSessionMiddleware: createStaffSessionMiddleware(dependencies),
      apiRouters: [createKitchenRouter({ ...dependencies, useCases })],
    }),
  };
}

describe("kitchen HTTP adapter", () => {
  it("returns the branch queue with immutable item and timing context", async () => {
    const { app, useCases } = application();
    const response = await request(app)
      .get(`/api/v1/staff/kitchen/queue?branchId=${branchId}`)
      .set("Cookie", "rms_staff_session=staff-token")
      .expect(200);

    expect(response.body).toMatchObject([
      {
        id: workItemId,
        orderReference: "ORD-000001",
        orderVersion: 3,
        tableCode: "T-4",
        quantity: 2,
        note: "No parsley",
        state: "preparing",
        startedByEmployeeId: employeeId,
      },
    ]);
    expect(useCases.getKitchenQueue).toHaveBeenCalledWith(context, branchId);
  });

  it("requires origin, CSRF, idempotency, and expected version for commands", async () => {
    const { app, useCases } = application();
    await request(app)
      .post(`/api/v1/staff/kitchen/items/${workItemId}/ready`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "wrong")
      .set("Idempotency-Key", "1234567890abcdef")
      .set("If-Match", '"2"')
      .send({})
      .expect(403);
    await request(app)
      .post(`/api/v1/staff/kitchen/items/${workItemId}/ready`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "1234567890abcdef")
      .set("If-Match", "2")
      .send({})
      .expect(422);
    expect(useCases.markKitchenWorkItemReady).not.toHaveBeenCalled();
  });

  it("passes the authenticated and optional effective employee separately", async () => {
    const effectiveEmployeeId = randomUUID();
    const { app, startKitchenWorkItem } = application();
    await request(app)
      .post(`/api/v1/staff/kitchen/items/${workItemId}/start`)
      .set("Cookie", "rms_staff_session=staff-token")
      .set("Origin", staffOrigin)
      .set("X-CSRF-Token", "staff-csrf")
      .set("Idempotency-Key", "1234567890abcdef")
      .set("If-Match", '"1"')
      .send({ effectiveEmployeeId })
      .expect(200);

    const call = startKitchenWorkItem.mock.calls[0];
    expect(call?.[0]).toBe(context);
    expect(call?.[1]).toBe(workItemId);
    expect(call?.[2]).toBe(1);
    expect(call?.[3]).toBe(effectiveEmployeeId);
    expect(call?.[4]).toBe("1234567890abcdef");
    expect(call?.[5].correlationId).toEqual(expect.any(String));
  });
});
