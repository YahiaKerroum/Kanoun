import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  DatabasePool,
  OutboxEvent,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  IdentityAccessStore,
  RestaurantConfigurationStore,
  StaffRequestContext,
} from "../../index.js";
import type {
  NotificationInboxItem,
  NotificationStore,
} from "../contracts/notification-store.js";
import { NotificationService } from "./notification-service.js";

const now = new Date("2026-07-29T12:00:00.000Z");
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const recipientUserId = randomUUID();

function event(eventType = "ordering.order_submitted.v1"): OutboxEvent {
  const eventId = randomUUID();
  return {
    eventId,
    eventType,
    schemaVersion: 1,
    businessAccountId,
    restaurantId,
    branchId,
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    occurredAtUtc: new Date("2026-07-29T11:59:00.000Z"),
    correlationId: randomUUID(),
    causationId: randomUUID(),
    payload: { orderReference: "A-104", tableCode: "T7" },
    attemptCount: 0,
  };
}

function context(): StaffRequestContext {
  return {
    sessionId: randomUUID(),
    businessAccountId,
    userId: recipientUserId,
    employeeId: randomUUID(),
    restaurantId,
    activeBranchId: branchId,
    authorizedBranchIds: [branchId],
    grants: [],
    authenticatedAtUtc: now,
    expiresAtUtc: new Date(now.getTime() + 60_000),
  };
}

function setup(input?: {
  readonly branchStatus?: "active" | "inactive";
  readonly featureEnabled?: boolean;
  readonly recipients?: readonly {
    readonly userId: string;
    readonly employeeId: string;
  }[];
}) {
  const createdItems: NotificationInboxItem[] = [];
  const store = {
    createInboxItem: vi.fn(
      (_transaction: TransactionContext, item: NotificationInboxItem) => {
        createdItems.push(item);
        return Promise.resolve(true);
      },
    ),
    recordDeliveryAttempt: vi.fn().mockResolvedValue(undefined),
    listInbox: vi.fn().mockResolvedValue([]),
    getInboxCursor: vi.fn().mockResolvedValue(undefined),
    updateInboxState: vi.fn(),
    listGapWarnings: vi.fn().mockResolvedValue([]),
    deleteExpired: vi.fn().mockResolvedValue(0),
  } satisfies NotificationStore;
  const listEligibleNotificationRecipients = vi
    .fn()
    .mockResolvedValue(
      input?.recipients ?? [
        { userId: recipientUserId, employeeId: randomUUID() },
      ],
    );
  const identityAccess = {
    listEligibleNotificationRecipients,
  } as unknown as IdentityAccessStore;
  const restaurantConfiguration = {
    getBranch: vi.fn().mockResolvedValue({
      id: branchId,
      businessAccountId,
      restaurantId,
      name: "Central",
      status: input?.branchStatus ?? "active",
    }),
    isBranchFeatureEnabled: vi
      .fn()
      .mockResolvedValue(input?.featureEnabled ?? true),
  } as unknown as RestaurantConfigurationStore;
  const service = new NotificationService({
    databasePool: {} as DatabasePool,
    store,
    identityAccess,
    restaurantConfiguration,
    now: () => now,
  });
  return {
    service,
    store,
    identityAccess,
    listEligibleNotificationRecipients,
    restaurantConfiguration,
    createdItems,
  };
}

describe("NotificationService", () => {
  it("resolves recipients by branch permission and retains one durable item for 30 days", async () => {
    const test = setup();
    const source = event();

    await test.service.handle(
      { sql: {} as TransactionContext["sql"] },
      source,
      now,
    );

    expect(test.listEligibleNotificationRecipients).toHaveBeenCalledWith(
      expect.anything(),
      {
        businessAccountId,
        restaurantId,
        branchId,
        permissionKey: "orders.view",
      },
    );
    expect(test.createdItems).toHaveLength(1);
    expect(test.createdItems[0]).toMatchObject({
      eventId: source.eventId,
      recipientUserId,
      branchId,
      requiredPermission: "orders.view",
      body: "A-104 · Table T7",
      taskState: "unhandled",
    });
    expect(test.createdItems[0]?.expiresAtUtc.toISOString()).toBe(
      "2026-08-28T12:00:00.000Z",
    );
    expect(test.store.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: "inbox_created", recipientUserId }),
    );
  });

  it("suppresses notifications when the notification or source feature is disabled", async () => {
    const test = setup({ featureEnabled: false });

    await test.service.handle(
      { sql: {} as TransactionContext["sql"] },
      event(),
      now,
    );

    expect(test.listEligibleNotificationRecipients).not.toHaveBeenCalled();
    expect(test.store.createInboxItem).not.toHaveBeenCalled();
  });

  it("warns once when a critical event has no eligible recipient", async () => {
    const test = setup({ recipients: [] });
    const source = event();

    await test.service.handle(
      { sql: {} as TransactionContext["sql"] },
      source,
      now,
    );

    expect(test.store.createInboxItem).not.toHaveBeenCalled();
    expect(test.store.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: source.eventId,
        outcome: "no_eligible_recipient",
        requiredPermission: "orders.view",
      }),
    );
  });

  it("notifies restaurant-scoped recipients when an inactive branch loses assignment eligibility", async () => {
    const test = setup({ branchStatus: "inactive", featureEnabled: false });

    await test.service.handle(
      { sql: {} as TransactionContext["sql"] },
      event("restaurant.branch_updated.v1"),
      now,
    );

    expect(test.listEligibleNotificationRecipients).toHaveBeenCalledWith(
      expect.anything(),
      {
        businessAccountId,
        restaurantId,
        permissionKey: "features.manage",
      },
    );
  });

  it("rejects another branch before reading a recipient inbox", async () => {
    const test = setup();

    await expect(
      test.service.listInbox(context(), {
        branchId: randomUUID(),
        limit: 50,
      }),
    ).rejects.toMatchObject({
      code: "permission_denied",
      status: 403,
    });
    expect(test.store.listInbox).not.toHaveBeenCalled();
  });
});
