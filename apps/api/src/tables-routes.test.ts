import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createStaffSessionMiddleware,
  createTablesRouter,
  IdentitySecurity,
  type IssuedQrCode,
  type StaffRequestContext,
  type Table,
  type TableQrCode,
  type TablesHttpUseCases,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const security = new IdentitySecurity(
  "tables-http-test-secret-with-at-least-32-characters",
);
const sessionToken = "tables-session-token";
const csrfToken = "tables-csrf-token";
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const tableId = randomUUID();
const qrCodeId = randomUUID();
const context: StaffRequestContext = {
  sessionId: randomUUID(),
  businessAccountId,
  userId: randomUUID(),
  employeeId: randomUUID(),
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "tables.view", restaurantId },
    { permissionKey: "tables.manage", restaurantId },
    { permissionKey: "qr.manage", restaurantId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60 * 60_000),
};

const table: Table = {
  id: tableId,
  businessAccountId,
  branchId,
  code: "T1",
  area: "Patio",
  status: "active",
  outOfService: false,
  version: 1,
  derivedState: "available",
};

const tableQrCode: TableQrCode = {
  id: qrCodeId,
  businessAccountId,
  branchId,
  tableId,
  kind: "table",
  status: "active",
  createdAtUtc: new Date(),
};

const branchQrCode: TableQrCode = {
  id: randomUUID(),
  businessAccountId,
  branchId,
  kind: "branch",
  status: "active",
  createdAtUtc: new Date(),
};

const issuedTableQrCode: IssuedQrCode = {
  qrCode: tableQrCode,
  rawToken: "raw-token-shown-once-abcdef123456",
  qrUrl: `https://example.test/qr/${tableQrCode.id}/raw-token-shown-once-abcdef123456`,
};

const issuedBranchQrCode: IssuedQrCode = {
  qrCode: branchQrCode,
  rawToken: "raw-branch-token-shown-once-654321",
  qrUrl: `https://example.test/qr/${branchQrCode.id}/raw-branch-token-shown-once-654321`,
};

function createTestApplication(overrides?: Partial<TablesHttpUseCases>) {
  const useCases = {
    listTables: vi.fn().mockResolvedValue([table]),
    createTable: vi.fn().mockResolvedValue(table),
    updateTable: vi.fn().mockResolvedValue(table),
    issueTableQrCode: vi.fn().mockResolvedValue(issuedTableQrCode),
    issueBranchQrCode: vi.fn().mockResolvedValue(issuedBranchQrCode),
    revokeQrCode: vi.fn().mockResolvedValue({
      ...tableQrCode,
      status: "revoked",
      revokedAtUtc: new Date(),
      revokedReason: "No longer in service",
    }),
    listQrCodes: vi.fn().mockResolvedValue([tableQrCode]),
    ...overrides,
  } satisfies TablesHttpUseCases;
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
  const router = createTablesRouter({
    ...sessionDependencies,
    useCases,
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

function authenticated(requestBuilder: request.Test): request.Test {
  return requestBuilder
    .set("Cookie", `rms_staff_session=${sessionToken}`)
    .set("Origin", "http://127.0.0.1:5173")
    .set("X-CSRF-Token", csrfToken);
}

describe("tables HTTP adapter", () => {
  it("creates a table and forwards the branch id from the route", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).post(`/api/v1/staff/branches/${branchId}/tables`),
    )
      .send({ code: "T5", area: "Patio" })
      .expect(201);

    expect(useCases.createTable).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
      { code: "T5", area: "Patio" },
      expect.anything(),
    );
  });

  it("parses a valid If-Match header into the expected version for table updates", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).patch(`/api/v1/staff/tables/${tableId}`),
    )
      .set("If-Match", '"2"')
      .send({ code: "T5-renamed" })
      .expect(200);

    expect(useCases.updateTable).toHaveBeenCalledWith(
      expect.objectContaining(context),
      tableId,
      { code: "T5-renamed", expectedVersion: 2 },
      expect.anything(),
    );
  });

  it("rejects malformed or missing If-Match headers on the table PATCH route without calling the use case", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).patch(`/api/v1/staff/tables/${tableId}`),
    )
      .set("If-Match", "2")
      .send({ code: "T5-renamed" })
      .expect(422);

    await authenticated(
      request(app).patch(`/api/v1/staff/tables/${tableId}`),
    )
      .set("If-Match", '"abc"')
      .send({ code: "T5-renamed" })
      .expect(422);

    await authenticated(
      request(app).patch(`/api/v1/staff/tables/${tableId}`),
    )
      .send({ code: "T5-renamed" })
      .expect(422);

    expect(useCases.updateTable).not.toHaveBeenCalled();
  });

  it("rejects malformed table creation bodies without calling the use case", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).post(`/api/v1/staff/branches/${branchId}/tables`),
    )
      .send({ code: "" })
      .expect(422);

    await authenticated(
      request(app).post(`/api/v1/staff/branches/${branchId}/tables`),
    )
      .send({ area: "Patio" })
      .expect(422);

    expect(useCases.createTable).not.toHaveBeenCalled();
  });

  it("issues a table QR code and round-trips the raw token shown once", async () => {
    const { app, useCases } = createTestApplication();
    const response = await authenticated(
      request(app).post(`/api/v1/staff/tables/${tableId}/qr-codes`),
    )
      .send({})
      .expect(201);

    expect(response.body).toMatchObject({
      qrCode: {
        id: tableQrCode.id,
        tableId,
        kind: "table",
        status: "active",
      },
      rawToken: issuedTableQrCode.rawToken,
      qrUrl: issuedTableQrCode.qrUrl,
    });
    expect(useCases.issueTableQrCode).toHaveBeenCalledWith(
      expect.objectContaining(context),
      tableId,
      expect.anything(),
    );
  });

  it("issues a branch-only QR code without a table id anywhere in the call", async () => {
    const { app, useCases } = createTestApplication();
    const response = await authenticated(
      request(app).post(`/api/v1/staff/branches/${branchId}/qr-codes`),
    )
      .send({})
      .expect(201);

    expect(response.body).toMatchObject({
      qrCode: { id: branchQrCode.id, kind: "branch", status: "active" },
      rawToken: issuedBranchQrCode.rawToken,
      qrUrl: issuedBranchQrCode.qrUrl,
    });
    expect(response.body).not.toHaveProperty("qrCode.tableId");
    expect(useCases.issueBranchQrCode).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
      expect.anything(),
    );
  });

  it("revokes a QR code and forwards the reason", async () => {
    const { app, useCases } = createTestApplication();
    const reason = "No longer in service";
    await authenticated(
      request(app).post(`/api/v1/staff/qr-codes/${qrCodeId}/revocations`),
    )
      .send({ reason })
      .expect(200);

    expect(useCases.revokeQrCode).toHaveBeenCalledWith(
      expect.objectContaining(context),
      qrCodeId,
      reason,
      expect.anything(),
    );
  });

  it("rejects a revocation with a missing or too-short reason without calling the use case", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).post(`/api/v1/staff/qr-codes/${qrCodeId}/revocations`),
    )
      .send({ reason: "" })
      .expect(422);

    await authenticated(
      request(app).post(`/api/v1/staff/qr-codes/${qrCodeId}/revocations`),
    )
      .send({ reason: "short" })
      .expect(422);

    await authenticated(
      request(app).post(`/api/v1/staff/qr-codes/${qrCodeId}/revocations`),
    )
      .send({})
      .expect(422);

    expect(useCases.revokeQrCode).not.toHaveBeenCalled();
  });

  it("rejects requests without a session cookie", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .get(`/api/v1/staff/branches/${branchId}/tables`)
      .expect(401);
    expect(useCases.listTables).not.toHaveBeenCalled();
  });

  it("rejects mutating requests missing a valid CSRF token", async () => {
    const { app, useCases } = createTestApplication();

    await request(app)
      .post(`/api/v1/staff/branches/${branchId}/tables`)
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .send({ code: "T5" })
      .expect(403);
    expect(useCases.createTable).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/v1/staff/branches/${branchId}/tables`)
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .set("Origin", "http://127.0.0.1:5173")
      .set("X-CSRF-Token", "wrong-token")
      .send({ code: "T5" })
      .expect(403);
    expect(useCases.createTable).not.toHaveBeenCalled();
  });
});
