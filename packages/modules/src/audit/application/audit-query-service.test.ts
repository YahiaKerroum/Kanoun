import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DatabasePool } from "@rms/building-blocks";
import type { StaffRequestContext } from "../../identity-access/index.js";
import type {
  AuditEventRecord,
  AuditReader,
} from "../contracts/audit-reader.js";
import { AuditQueryService } from "./audit-query-service.js";

const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const otherBranchId = randomUUID();

function context(grants: StaffRequestContext["grants"]): StaffRequestContext {
  return {
    sessionId: randomUUID(),
    businessAccountId,
    userId: randomUUID(),
    employeeId: randomUUID(),
    restaurantId,
    activeBranchId: branchId,
    authorizedBranchIds: [branchId, otherBranchId],
    grants,
    authenticatedAtUtc: new Date(),
    expiresAtUtc: new Date(Date.now() + 60_000),
  };
}

function record(): AuditEventRecord {
  return {
    id: randomUUID(),
    businessAccountId,
    restaurantId,
    branchId,
    actorUserId: randomUUID(),
    action: "payments.payment_refunded",
    targetType: "payment",
    targetId: randomUUID(),
    outcome: "succeeded",
    reason: "Customer refund approved",
    correlationId: randomUUID(),
    beforeData: { refundable: "100.00" },
    afterData: { refundable: "0.00" },
    occurredAtUtc: new Date("2026-07-29T12:00:00.000Z"),
  };
}

function setup(rows: readonly AuditEventRecord[] = []) {
  const reader = {
    search: vi.fn().mockResolvedValue(rows),
  } satisfies AuditReader;
  return {
    reader,
    service: new AuditQueryService({
      databasePool: {} as DatabasePool,
      reader,
    }),
  };
}

describe("AuditQueryService", () => {
  it("requires an explicit authorized restaurant for restaurant-scoped audit grants", async () => {
    const test = setup();
    const scoped = context([{ permissionKey: "audit.view", restaurantId }]);

    await expect(
      test.service.search(scoped, { page: 0, pageSize: 50 }),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    await expect(
      test.service.search(scoped, {
        restaurantId: randomUUID(),
        page: 0,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    expect(test.reader.search).not.toHaveBeenCalled();
  });

  it("forwards least-privilege restaurant, branch, time, actor, and target filters", async () => {
    const item = record();
    const test = setup([item]);
    const scoped = context([{ permissionKey: "audit.view", restaurantId }]);
    const occurredFrom = new Date("2026-07-01T00:00:00.000Z");
    const occurredTo = new Date("2026-07-31T23:59:59.000Z");
    const actorUserId = item.actorUserId;
    if (!actorUserId)
      throw new Error("Expected an actor in the audit fixture.");

    const result = await test.service.search(scoped, {
      restaurantId,
      branchId,
      actorUserId,
      action: item.action,
      targetType: item.targetType,
      occurredFrom,
      occurredTo,
      page: 2,
      pageSize: 25,
    });

    expect(result).toEqual({ items: [item], page: 2, hasMore: false });
    expect(test.reader.search).toHaveBeenCalledWith(expect.anything(), {
      businessAccountId,
      restaurantId,
      authorizedBranchIds: [branchId, otherBranchId],
      branchId,
      actorUserId,
      action: item.action,
      targetType: item.targetType,
      occurredFrom,
      occurredTo,
      limit: 26,
      offset: 50,
    });
  });

  it("allows tenant-wide support evidence and reports pagination without widening branch scope", async () => {
    const rows = [record(), record(), record()];
    const test = setup(rows);
    const tenantWide = context([{ permissionKey: "audit.view" }]);

    const result = await test.service.search(tenantWide, {
      page: 0,
      pageSize: 2,
    });

    expect(result.items).toEqual(rows.slice(0, 2));
    expect(result.hasMore).toBe(true);
    expect(test.reader.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessAccountId,
        authorizedBranchIds: [branchId, otherBranchId],
        limit: 3,
        offset: 0,
      }),
    );
  });

  it("rejects an unassigned branch before querying append-only evidence", async () => {
    const test = setup();

    await expect(
      test.service.search(context([{ permissionKey: "audit.view" }]), {
        branchId: randomUUID(),
        page: 0,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    expect(test.reader.search).not.toHaveBeenCalled();
  });
});
