import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createRestaurantConfigurationRouter,
  createStaffSessionMiddleware,
  IdentitySecurity,
  type RestaurantConfigurationHttpUseCases,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const security = new IdentitySecurity(
  "restaurant-http-test-secret-with-at-least-32-characters",
);
const sessionToken = "restaurant-session-token";
const csrfToken = "restaurant-csrf-token";
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const employeeId = randomUUID();
const context: StaffRequestContext = {
  sessionId: randomUUID(),
  businessAccountId,
  userId: randomUUID(),
  employeeId: randomUUID(),
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "restaurant.view", restaurantId },
    { permissionKey: "branches.view", restaurantId },
    { permissionKey: "features.manage", restaurantId },
    { permissionKey: "employees.view", restaurantId },
    { permissionKey: "employees.manage", restaurantId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60 * 60_000),
};

const restaurant = {
  id: restaurantId,
  businessAccountId,
  name: "Test Restaurant",
  status: "active" as const,
  branding: {},
  settings: {},
  version: 1,
};
const branch = {
  id: branchId,
  businessAccountId,
  restaurantId,
  name: "Test Branch",
  address: {
    line1: "1 Test Street",
    city: "Algiers",
    countryCode: "DZ",
  },
  contact: {},
  timeZone: "Africa/Algiers",
  currency: "DZD",
  status: "active" as const,
  serviceStatus: "open" as const,
  allowOrderOverride: false,
  version: 1,
  openingHours: [],
};
const employee = {
  id: employeeId,
  businessAccountId,
  restaurantId,
  displayName: "Test Employee",
  email: "employee@example.test",
  status: "active" as const,
  version: 1,
  branchIds: [branchId],
};
const featureConfiguration = {
  id: randomUUID(),
  businessAccountId,
  restaurantId,
  branchId,
  version: 2,
  values: { "CFG-013": "disabled" as const },
  createdAtUtc: new Date(),
};

function createTestApplication(
  overrides?: Partial<RestaurantConfigurationHttpUseCases>,
) {
  const useCases = {
    listRestaurants: vi.fn().mockResolvedValue([restaurant]),
    getRestaurant: vi.fn().mockResolvedValue(restaurant),
    createRestaurant: vi.fn().mockResolvedValue(restaurant),
    updateRestaurant: vi.fn().mockResolvedValue(restaurant),
    listBranches: vi.fn().mockResolvedValue([branch]),
    getBranch: vi.fn().mockResolvedValue(branch),
    createBranch: vi.fn().mockResolvedValue(branch),
    updateBranch: vi.fn().mockResolvedValue(branch),
    listEmployees: vi.fn().mockResolvedValue([employee]),
    getEmployee: vi.fn().mockResolvedValue(employee),
    createEmployee: vi.fn().mockResolvedValue(employee),
    updateEmployeeProfile: vi.fn().mockResolvedValue(employee),
    replaceEmployeeBranches: vi.fn().mockResolvedValue(employee),
    getFeatureConfiguration: vi.fn().mockResolvedValue({
      configuration: featureConfiguration,
      catalog: [],
    }),
    updateFeatureConfiguration: vi.fn().mockResolvedValue(featureConfiguration),
    getRestaurantFeatureConfiguration: vi.fn().mockResolvedValue({
      configuration: { ...featureConfiguration, branchId: undefined },
      catalog: [],
    }),
    updateRestaurantFeatureConfiguration: vi
      .fn()
      .mockResolvedValue({ ...featureConfiguration, branchId: undefined }),
    getPortalCapabilities: vi.fn().mockResolvedValue({
      branchId,
      restaurantId,
      timeZone: "Africa/Algiers",
      currency: "DZD",
      permissions: ["orders.view"],
      enabledFeatures: ["ordering"],
      configurationVersion: 2,
    }),
    ...overrides,
  } satisfies RestaurantConfigurationHttpUseCases;
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
  const router = createRestaurantConfigurationRouter({
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

describe("restaurant configuration HTTP adapter", () => {
  it("normalizes employee email and rejects duplicate branch assignments", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(request(app).post("/api/v1/staff/employees"))
      .send({
        restaurantId,
        displayName: "  New Employee  ",
        email: "  NEW.EMPLOYEE@EXAMPLE.TEST  ",
        branchIds: [branchId],
      })
      .expect(201);

    expect(useCases.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining(context),
      {
        restaurantId,
        displayName: "New Employee",
        email: "new.employee@example.test",
        branchIds: [branchId],
      },
      expect.anything(),
    );

    await authenticated(request(app).post("/api/v1/staff/employees"))
      .send({
        restaurantId,
        displayName: "Duplicate Branches",
        email: "duplicate@example.test",
        branchIds: [branchId, branchId],
      })
      .expect(422);
    expect(useCases.createEmployee).toHaveBeenCalledTimes(1);
  });

  it("maps the employee email unique constraint to an actionable conflict", async () => {
    const databaseError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "employees_restaurant_email_uidx",
    });
    const { app } = createTestApplication({
      createEmployee: vi.fn().mockRejectedValue(databaseError),
    });

    const response = await authenticated(
      request(app).post("/api/v1/staff/employees"),
    )
      .send({
        restaurantId,
        displayName: "Duplicate Email",
        email: "employee@example.test",
        branchIds: [branchId],
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: "validation_error",
      title: "An employee with this email already exists",
      detail: "Use a different email or update the existing employee profile.",
    });
  });

  it("validates and forwards optimistic branch feature changes", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).patch(`/api/v1/staff/branches/${branchId}/features`),
    )
      .set("If-Match", '"1"')
      .send({
        changes: { "CFG-013": "disabled" },
        confirmAffectedWorkflows: true,
        reason: "Pause branch notifications",
      })
      .expect(200);

    expect(useCases.updateFeatureConfiguration).toHaveBeenCalledWith(
      expect.objectContaining(context),
      {
        branchId,
        expectedVersion: 1,
        changes: { "CFG-013": "disabled" },
        confirmAffectedWorkflows: true,
        reason: "Pause branch notifications",
      },
      expect.anything(),
    );
  });

  it("rejects malformed feature changes and stale-version headers at the boundary", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).patch(`/api/v1/staff/branches/${branchId}/features`),
    )
      .set("If-Match", "1")
      .send({
        changes: { ordering: "disabled" },
        confirmAffectedWorkflows: true,
        reason: "Malformed feature request",
      })
      .expect(422);
    expect(useCases.updateFeatureConfiguration).not.toHaveBeenCalled();
  });

  it("forwards the authenticated branch capability query", async () => {
    const { app, useCases } = createTestApplication();
    const response = await request(app)
      .get(`/api/v1/staff/branches/${branchId}/capabilities`)
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .expect(200);

    expect(response.body).toEqual({
      branchId,
      restaurantId,
      timeZone: "Africa/Algiers",
      currency: "DZD",
      permissions: ["orders.view"],
      enabledFeatures: ["ordering"],
      configurationVersion: 2,
    });
    expect(useCases.getPortalCapabilities).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
    );
  });
});
