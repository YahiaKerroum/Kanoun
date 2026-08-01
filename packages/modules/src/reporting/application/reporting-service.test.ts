import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  DatabasePool,
  OutboxEvent,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  RestaurantConfigurationStore,
  StaffRequestContext,
} from "../../index.js";
import type {
  BranchDashboardData,
  ReportingBranch,
  ReportingStore,
} from "../contracts/reporting-store.js";
import { ReportingService } from "./reporting-service.js";

const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const secondBranchId = randomUUID();
const now = new Date("2026-07-29T14:00:00.000Z");

const branch: ReportingBranch = {
  restaurantId,
  branchId,
  restaurantName: "Mise",
  branchName: "Central",
  timeZone: "Africa/Algiers",
  currency: "DZD",
  status: "active",
};

const dashboard: BranchDashboardData = {
  branch,
  activeOrders: 4,
  orderStates: [{ fulfilment: "queued", financial: "unpaid", count: 4 }],
  occupiedTables: 3,
  pendingRequests: { bills: 2, cancellations: 1 },
  kitchenWaiting: [
    {
      workItemId: randomUUID(),
      orderId: randomUUID(),
      orderReference: "A-17",
      itemName: "Soup",
      state: "queued",
      waitingSinceUtc: new Date("2026-07-29T13:50:00.000Z"),
    },
  ],
  dailySales: [
    {
      currency: "DZD",
      grossAmount: "1200.00",
      paidAmount: "900.00",
      refundedAmount: "100.00",
      cancelledAmount: "200.00",
    },
  ],
};

function context(
  grants: StaffRequestContext["grants"] = [
    { permissionKey: "reports.view", restaurantId, branchId },
  ],
): StaffRequestContext {
  return {
    sessionId: randomUUID(),
    businessAccountId,
    userId: randomUUID(),
    employeeId: randomUUID(),
    restaurantId,
    activeBranchId: branchId,
    authorizedBranchIds: [branchId, secondBranchId],
    grants,
    authenticatedAtUtc: now,
    expiresAtUtc: new Date(now.getTime() + 60_000),
  };
}

function setup(input?: {
  readonly reportingState?: "enabled" | "disabled";
  readonly enabledFeatureIds?: readonly string[];
}) {
  const branches = new Map<string, ReportingBranch>([
    [branchId, branch],
    [
      secondBranchId,
      { ...branch, branchId: secondBranchId, branchName: "West" },
    ],
  ]);
  const store = {
    applyEvent: vi.fn().mockResolvedValue(undefined),
    rebuildTenant: vi.fn().mockResolvedValue(undefined),
    getBranch: vi.fn(
      (_sql: unknown, _businessAccountId: string, selectedBranchId: string) =>
        Promise.resolve(branches.get(selectedBranchId)),
    ),
    getBranchDashboard: vi.fn().mockResolvedValue(dashboard),
    listSales: vi.fn().mockResolvedValue([]),
    summarizeSales: vi.fn().mockResolvedValue([]),
  } satisfies ReportingStore;
  const enabled = new Set(
    input?.enabledFeatureIds ?? ["CFG-005", "CFG-006", "CFG-007", "CFG-011"],
  );
  const restaurantConfiguration = {
    getBranch: vi.fn().mockResolvedValue({
      id: branchId,
      businessAccountId,
      restaurantId,
    }),
    getRestaurantFeatureConfiguration: vi.fn().mockResolvedValue({
      values: { "CFG-014": input?.reportingState ?? "enabled" },
    }),
    isBranchFeatureEnabled: vi.fn(
      (
        _sql: unknown,
        _businessAccountId: string,
        _branchId: string,
        featureId: string,
      ) => Promise.resolve(enabled.has(featureId)),
    ),
  } as unknown as RestaurantConfigurationStore;
  const service = new ReportingService({
    databasePool: {} as DatabasePool,
    store,
    restaurantConfiguration,
    now: () => now,
  });
  return { service, store, restaurantConfiguration };
}

describe("ReportingService", () => {
  it("masks disabled module widgets without changing the stored projection", async () => {
    const test = setup({ enabledFeatureIds: ["CFG-005", "CFG-006"] });

    const result = await test.service.getBranchDashboard(context(), branchId);

    expect(result).toMatchObject({
      activeOrders: 4,
      occupiedTables: 3,
      pendingRequests: { bills: 0, cancellations: 1 },
      kitchenWaiting: [],
      dailySales: [],
      enabledWidgets: ["orders", "tables"],
    });
    expect(dashboard.pendingRequests.bills).toBe(2);
  });

  it("fails closed when reporting is disabled for the restaurant", async () => {
    const test = setup({ reportingState: "disabled" });

    await expect(
      test.service.getBranchDashboard(context(), branchId),
    ).rejects.toMatchObject({
      code: "feature_disabled",
      status: 409,
    });
    expect(test.store.getBranchDashboard).not.toHaveBeenCalled();
  });

  it("requires cross-branch permission before combining branch rows", async () => {
    const test = setup();
    const branchGrants: StaffRequestContext["grants"] = [
      { permissionKey: "reports.view", restaurantId, branchId },
      {
        permissionKey: "reports.view",
        restaurantId,
        branchId: secondBranchId,
      },
    ];

    await expect(
      test.service.getSalesReport(context(branchGrants), {
        branchIds: [branchId, secondBranchId],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-29",
        page: 0,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({
      code: "permission_denied",
      status: 403,
    });
    expect(test.store.listSales).not.toHaveBeenCalled();
  });

  it("passes only authorized branches and preserves row-to-order pagination", async () => {
    const test = setup();
    test.store.listSales.mockResolvedValue([
      {
        restaurantId,
        branchId,
        restaurantName: "Mise",
        branchName: "Central",
        orderId: randomUUID(),
        orderReference: "A-1",
        businessDate: "2026-07-29",
        currency: "DZD",
        grossAmount: "100.00",
        cancelledAmount: "0.00",
        paidAmount: "100.00",
        refundedAmount: "0.00",
        paymentMethod: "cash",
        orderState: "completed",
        submittedAtUtc: now,
      },
      {
        restaurantId,
        branchId,
        restaurantName: "Mise",
        branchName: "Central",
        orderId: randomUUID(),
        orderReference: "A-2",
        businessDate: "2026-07-29",
        currency: "DZD",
        grossAmount: "50.00",
        cancelledAmount: "50.00",
        paidAmount: "0.00",
        refundedAmount: "0.00",
        orderState: "cancelled",
        submittedAtUtc: now,
      },
    ]);

    const result = await test.service.getSalesReport(context(), {
      branchIds: [branchId],
      dateFrom: "2026-07-29",
      dateTo: "2026-07-29",
      page: 0,
      pageSize: 1,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(test.store.listSales).toHaveBeenCalledWith(expect.anything(), {
      businessAccountId,
      authorizedBranchIds: [branchId],
      branchIds: [branchId],
      dateFrom: "2026-07-29",
      dateTo: "2026-07-29",
      limit: 2,
      offset: 0,
    });
  });

  it("forwards one supported event with its tenant and aggregate scope", async () => {
    const test = setup();
    const source: OutboxEvent = {
      eventId: randomUUID(),
      eventType: "payments.payment_refunded.v1",
      schemaVersion: 1,
      businessAccountId,
      restaurantId,
      branchId,
      aggregateId: randomUUID(),
      aggregateVersion: 2,
      occurredAtUtc: now,
      correlationId: randomUUID(),
      causationId: randomUUID(),
      payload: { orderId: randomUUID() },
      attemptCount: 0,
    };

    await test.service.handle(
      { sql: {} as TransactionContext["sql"] },
      source,
      now,
    );

    expect(test.store.applyEvent).toHaveBeenCalledWith(expect.anything(), {
      handlerName: "reporting.projections.v1",
      eventId: source.eventId,
      eventType: source.eventType,
      businessAccountId,
      restaurantId,
      branchId,
      aggregateId: source.aggregateId,
      payload: source.payload,
      occurredAtUtc: now,
      now,
    });
  });
});
