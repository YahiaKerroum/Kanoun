import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createIdentityAccessRouter,
  createStaffSessionMiddleware,
  IdentitySecurity,
  type IdentityHttpUseCases,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const security = new IdentitySecurity(
  "identity-http-test-secret-with-at-least-32-characters",
);
const sessionToken = "session-token";
const csrfToken = "csrf-token";
const context: StaffRequestContext = {
  sessionId: randomUUID(),
  businessAccountId: randomUUID(),
  userId: randomUUID(),
  employeeId: randomUUID(),
  restaurantId: randomUUID(),
  activeBranchId: randomUUID(),
  authorizedBranchIds: [],
  grants: [],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60 * 60_000),
};

function createTestApplication(overrides?: Partial<IdentityHttpUseCases>) {
  const useCases = {
    login: vi.fn().mockResolvedValue({
      sessionToken,
      csrfToken,
      context,
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    switchBranch: vi.fn().mockResolvedValue(undefined),
    inviteStaff: vi.fn().mockResolvedValue({
      invitationToken: "invitation-token",
      expiresAtUtc: new Date(Date.now() + 60_000),
    }),
    acceptInvitation: vi.fn().mockResolvedValue(undefined),
    requestRecovery: vi.fn().mockResolvedValue(undefined),
    completeRecovery: vi.fn().mockResolvedValue(undefined),
    removeAdministrator: vi.fn().mockResolvedValue(undefined),
    transferAdministrator: vi.fn().mockResolvedValue(undefined),
    deactivateEmployee: vi.fn().mockResolvedValue(undefined),
    getEmployeePermissions: vi.fn().mockResolvedValue({
      employeeId: context.employeeId,
      version: 1,
      grants: [],
    }),
    replaceEmployeePermissions: vi.fn().mockResolvedValue({
      employeeId: context.employeeId,
      version: 2,
      grants: [],
    }),
    listPermissionTemplates: vi.fn().mockResolvedValue([]),
    applyPermissionTemplate: vi.fn().mockResolvedValue({
      employeeId: context.employeeId,
      version: 2,
      grants: [],
    }),
    ...overrides,
  } satisfies IdentityHttpUseCases;
  const sessionDependencies = {
    authenticateSession: vi.fn((token: string) =>
      Promise.resolve(
        token === sessionToken
          ? { ...context, csrfTokenHash: security.hashToken(csrfToken) }
          : undefined,
      ),
    ),
    hashCsrfToken: (token: string) => security.hashToken(token),
    webOrigin: "http://127.0.0.1:5173",
  };
  const router = createIdentityAccessRouter({
    ...sessionDependencies,
    useCases,
    secureCookies: false,
  });
  const app = createApp({
    logger,
    trustProxy: false,
    checkReadiness: () => Promise.resolve(),
    staffSessionMiddleware: createStaffSessionMiddleware(sessionDependencies),
    apiRouters: [router],
  });
  return { app, useCases };
}

describe("identity HTTP adapter", () => {
  it("validates login input before invoking the use case", async () => {
    const { app, useCases } = createTestApplication();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ businessCode: "?", email: "invalid", password: "" })
      .expect(422);

    expect((response.body as { code?: unknown }).code).toBe("validation_error");
    expect(useCases.login).not.toHaveBeenCalled();
  });

  it("creates bounded strict cookies without exposing the session token", async () => {
    const { app } = createTestApplication();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        businessCode: "test-business",
        email: "owner@example.test",
        password: "Correct-Horse-42",
      })
      .expect(201);

    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.some((cookie) => cookie.includes("rms_staff_session=")),
    ).toBe(true);
    expect(
      cookies.some(
        (cookie) =>
          cookie.includes("rms_staff_session=") &&
          cookie.includes("HttpOnly") &&
          cookie.includes("SameSite=Strict"),
      ),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(sessionToken);
  });

  it("requires both a session and a matching origin-bound CSRF token", async () => {
    const { app, useCases } = createTestApplication();
    await request(app).get("/api/v1/auth/session").expect(401);

    await request(app)
      .post("/api/v1/staff/session/branch")
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .send({ branchId: randomUUID() })
      .expect(403);
    expect(useCases.switchBranch).not.toHaveBeenCalled();

    const branchId = randomUUID();
    await request(app)
      .post("/api/v1/staff/session/branch")
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .set("Origin", "http://127.0.0.1:5173")
      .set("X-CSRF-Token", csrfToken)
      .send({ branchId })
      .expect(200);
    expect(useCases.switchBranch).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
    );
  });

  it("rate-limits credential recovery requests", async () => {
    const { app, useCases } = createTestApplication();
    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post("/api/v1/auth/recovery-requests")
        .send({
          businessCode: "test-business",
          email: "owner@example.test",
        })
        .expect(202);
    }
    await request(app)
      .post("/api/v1/auth/recovery-requests")
      .send({
        businessCode: "test-business",
        email: "owner@example.test",
      })
      .expect(429);
    expect(useCases.requestRecovery).toHaveBeenCalledTimes(5);
  });
});
