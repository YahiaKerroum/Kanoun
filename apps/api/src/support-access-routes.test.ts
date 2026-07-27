import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createSupportAccessRouter } from "./platform-routes/support-access-router.js";

const supportSecret = "support-route-test-secret-with-32-characters";
const operatorId = randomUUID();
const approverId = randomUUID();
const businessAccountId = randomUUID();

function createTestApplication() {
  const useCases = {
    createSupportAccess: vi.fn().mockResolvedValue({
      grantId: randomUUID(),
      accessToken: "opaque-support-access-token-with-enough-length",
      expiresAtUtc: new Date("2026-07-27T16:00:00.000Z"),
    }),
    inspectTenantWithSupportAccess: vi.fn().mockResolvedValue({
      businessAccountId,
      businessName: "Tenant",
      restaurants: [],
      branches: [],
    }),
    revokeSupportAccess: vi.fn().mockResolvedValue(undefined),
  };
  return {
    app: createApp({
      logger: pino({ level: "silent" }),
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
      apiRouters: [
        createSupportAccessRouter({
          supportAccessSecret: supportSecret,
          useCases,
        }),
      ],
    }),
    useCases,
  };
}

describe("platform support access HTTP adapter", () => {
  it("hides grant issuance without the private platform credential", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .post("/api/v1/platform/support-access-grants")
      .set("x-support-secret", "wrong-secret")
      .send({})
      .expect(404);
    expect(useCases.createSupportAccess).not.toHaveBeenCalled();
  });

  it("requires recent platform authentication before issuing a grant", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .post("/api/v1/platform/support-access-grants")
      .set("x-support-secret", supportSecret)
      .set("x-support-operator-id", operatorId)
      .set("x-support-authenticated-at", "2020-01-01T00:00:00.000Z")
      .send({})
      .expect(401);
    expect(useCases.createSupportAccess).not.toHaveBeenCalled();
  });

  it("validates and forwards an approved grant request", async () => {
    const { app, useCases } = createTestApplication();
    const response = await request(app)
      .post("/api/v1/platform/support-access-grants")
      .set("x-support-secret", supportSecret)
      .set("x-support-operator-id", operatorId)
      .set("x-support-authenticated-at", new Date().toISOString())
      .send({
        businessAccountId,
        approvalMode: "two_person",
        approverId,
        approvalReference: "approval-ticket-1042",
        reason: "Investigate configuration incident",
        permissionKeys: ["restaurant.view"],
        restaurantIds: [],
        branchIds: [],
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: "opaque-support-access-token-with-enough-length",
    });
    expect(useCases.createSupportAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId,
        approverId,
        approvalReference: "approval-ticket-1042",
      }),
      expect.anything(),
    );
  });

  it("does not expose an unimplemented emergency-policy bypass", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .post("/api/v1/platform/support-access-grants")
      .set("x-support-secret", supportSecret)
      .set("x-support-operator-id", operatorId)
      .set("x-support-authenticated-at", new Date().toISOString())
      .send({
        businessAccountId,
        approvalMode: "emergency_policy",
        approverId,
        approvalReference: "emergency-policy-1",
        reason: "Investigate configuration incident",
        permissionKeys: ["restaurant.view"],
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .expect(422);
    expect(useCases.createSupportAccess).not.toHaveBeenCalled();
  });

  it("does not allow tenant inspection without a live grant token", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .get(`/api/v1/platform/support-access/tenants/${businessAccountId}`)
      .expect(401);
    expect(useCases.inspectTenantWithSupportAccess).not.toHaveBeenCalled();
  });
});
