import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ApplicationError,
  createMenuRouter,
  createStaffSessionMiddleware,
  IdentitySecurity,
  type MenuHttpUseCases,
  type StaffRequestContext,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const security = new IdentitySecurity(
  "menu-http-test-secret-with-at-least-32-characters",
);
const sessionToken = "menu-session-token";
const csrfToken = "menu-csrf-token";
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const categoryId = randomUUID();
const dishId = randomUUID();
const optionGroupId = randomUUID();
const context: StaffRequestContext = {
  sessionId: randomUUID(),
  businessAccountId,
  userId: randomUUID(),
  employeeId: randomUUID(),
  restaurantId,
  activeBranchId: branchId,
  authorizedBranchIds: [branchId],
  grants: [
    { permissionKey: "menu.view", restaurantId },
    { permissionKey: "menu.manage", restaurantId },
    { permissionKey: "menu.manage_prices", restaurantId },
    { permissionKey: "menu.manage_availability", restaurantId },
  ],
  authenticatedAtUtc: new Date(),
  expiresAtUtc: new Date(Date.now() + 60 * 60_000),
};

const money = { amount: "12.50", currency: "USD" };

const category = {
  id: categoryId,
  businessAccountId,
  restaurantId,
  name: "Starters",
  displayOrder: 0,
  status: "active" as const,
  version: 1,
};

const dish = {
  id: dishId,
  businessAccountId,
  restaurantId,
  categoryId,
  name: "Soup",
  basePrice: money,
  status: "active" as const,
  available: true,
  displayOrder: 0,
  version: 1,
};

const option = {
  id: randomUUID(),
  businessAccountId,
  optionGroupId,
  name: "Extra cheese",
  priceDelta: money,
  displayOrder: 0,
  status: "active" as const,
  version: 1,
};

const optionGroup = {
  id: optionGroupId,
  businessAccountId,
  dishId,
  name: "Toppings",
  selectionType: "single" as const,
  isRequired: false,
  minimumSelections: 0,
  maximumSelections: 1,
  displayOrder: 0,
  version: 1,
  options: [option],
};

const branchDishOverride = {
  businessAccountId,
  branchId,
  dishId,
  visible: true,
  version: 1,
};

function createTestApplication(overrides?: Partial<MenuHttpUseCases>) {
  const useCases = {
    listCategories: vi.fn().mockResolvedValue([category]),
    createCategory: vi.fn().mockResolvedValue(category),
    updateCategory: vi.fn().mockResolvedValue(category),
    listDishes: vi.fn().mockResolvedValue([dish]),
    getMenuVersion: vi.fn().mockResolvedValue(7),
    createDish: vi.fn().mockResolvedValue(dish),
    updateDish: vi.fn().mockResolvedValue(dish),
    listOptionGroups: vi.fn().mockResolvedValue([optionGroup]),
    createOptionGroup: vi.fn().mockResolvedValue(optionGroup),
    updateOptionGroup: vi.fn().mockResolvedValue(optionGroup),
    replaceOptions: vi.fn().mockResolvedValue(optionGroup),
    getBranchOverride: vi.fn().mockResolvedValue(branchDishOverride),
    upsertBranchOverride: vi.fn().mockResolvedValue(branchDishOverride),
    ...overrides,
  } satisfies MenuHttpUseCases;
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
  const router = createMenuRouter({
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

describe("menu HTTP adapter", () => {
  it("creates a category and forwards the restaurant id from the route", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).post(
        `/api/v1/staff/restaurants/${restaurantId}/menu/categories`,
      ),
    )
      .send({ name: "Starters", displayOrder: 1 })
      .expect(201);

    expect(useCases.createCategory).toHaveBeenCalledWith(
      expect.objectContaining(context),
      { name: "Starters", displayOrder: 1, restaurantId },
      expect.anything(),
    );
  });

  it("parses a valid If-Match header into the expected version for category updates", async () => {
    const { app, useCases } = createTestApplication();
    await authenticated(
      request(app).patch(`/api/v1/staff/menu/categories/${categoryId}`),
    )
      .set("If-Match", '"3"')
      .send({ name: "Renamed" })
      .expect(200);

    expect(useCases.updateCategory).toHaveBeenCalledWith(
      expect.objectContaining(context),
      { name: "Renamed", categoryId, expectedVersion: 3 },
      expect.anything(),
    );
  });

  it("rejects malformed If-Match headers on PATCH routes without calling the use case", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).patch(`/api/v1/staff/menu/categories/${categoryId}`),
    )
      .set("If-Match", "3")
      .send({ name: "Renamed" })
      .expect(422);

    await authenticated(
      request(app).patch(`/api/v1/staff/menu/categories/${categoryId}`),
    )
      .set("If-Match", '"abc"')
      .send({ name: "Renamed" })
      .expect(422);

    await authenticated(
      request(app).patch(`/api/v1/staff/menu/categories/${categoryId}`),
    )
      .send({ name: "Renamed" })
      .expect(422);

    expect(useCases.updateCategory).not.toHaveBeenCalled();
  });

  it("rejects malformed dish creation bodies without calling the use case", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).post(
        `/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
      ),
    )
      .send({
        categoryId,
        name: "Soup",
        basePrice: { amount: "-12.5.0", currency: "USD" },
        displayOrder: 0,
      })
      .expect(422);

    await authenticated(
      request(app).post(
        `/api/v1/staff/restaurants/${restaurantId}/menu/dishes`,
      ),
    )
      .send({ name: "Soup" })
      .expect(422);

    expect(useCases.createDish).not.toHaveBeenCalled();
  });

  it("rejects requests without a session cookie", async () => {
    const { app, useCases } = createTestApplication();
    await request(app)
      .get(`/api/v1/staff/restaurants/${restaurantId}/menu/categories`)
      .expect(401);
    expect(useCases.listCategories).not.toHaveBeenCalled();
  });

  it("rejects mutating requests missing a valid CSRF token", async () => {
    const { app, useCases } = createTestApplication();

    await request(app)
      .post(`/api/v1/staff/restaurants/${restaurantId}/menu/categories`)
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .send({ name: "Starters", displayOrder: 1 })
      .expect(403);
    expect(useCases.createCategory).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/v1/staff/restaurants/${restaurantId}/menu/categories`)
      .set("Cookie", `rms_staff_session=${sessionToken}`)
      .set("Origin", "http://127.0.0.1:5173")
      .set("X-CSRF-Token", "wrong-token")
      .send({ name: "Starters", displayOrder: 1 })
      .expect(403);
    expect(useCases.createCategory).not.toHaveBeenCalled();
  });

  it("wires the option replacement and branch override PUT routes", async () => {
    const { app, useCases } = createTestApplication();

    await authenticated(
      request(app).put(
        `/api/v1/staff/menu/option-groups/${optionGroupId}/options`,
      ),
    )
      .send({
        options: [{ name: "Extra cheese", priceDelta: money, displayOrder: 0 }],
      })
      .expect(200);
    expect(useCases.replaceOptions).toHaveBeenCalledWith(
      expect.objectContaining(context),
      optionGroupId,
      {
        options: [
          {
            name: "Extra cheese",
            priceDelta: money,
            displayOrder: 0,
            status: "active",
          },
        ],
      },
      expect.anything(),
    );

    await authenticated(
      request(app).put(
        `/api/v1/staff/branches/${branchId}/menu/dishes/${dishId}/override`,
      ),
    )
      .send({ expectedVersion: 1, visible: false })
      .expect(200);
    expect(useCases.upsertBranchOverride).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
      dishId,
      { expectedVersion: 1, visible: false },
      expect.anything(),
    );
  });

  it("returns option groups and the current branch override for administration", async () => {
    const { app, useCases } = createTestApplication();

    const groupsResponse = await authenticated(
      request(app).get(`/api/v1/staff/menu/dishes/${dishId}/option-groups`),
    ).expect(200);
    expect(groupsResponse.body).toEqual({ items: [optionGroup] });
    expect(useCases.listOptionGroups).toHaveBeenCalledWith(
      expect.objectContaining(context),
      dishId,
    );

    const overrideResponse = await authenticated(
      request(app).get(
        `/api/v1/staff/branches/${branchId}/menu/dishes/${dishId}/override`,
      ),
    ).expect(200);
    expect(overrideResponse.body).toEqual(branchDishOverride);
    expect(useCases.getBranchOverride).toHaveBeenCalledWith(
      expect.objectContaining(context),
      branchId,
      dishId,
    );
  });

  it("maps a concurrency conflict from the use case to an actionable HTTP response", async () => {
    const { app } = createTestApplication({
      updateDish: vi
        .fn()
        .mockRejectedValue(
          new ApplicationError(
            "concurrency_conflict",
            409,
            "The dish has changed since you last loaded it",
            "Reload the dish and retry your change.",
            4,
          ),
        ),
    });

    const response = await authenticated(
      request(app).patch(`/api/v1/staff/menu/dishes/${dishId}`),
    )
      .set("If-Match", '"3"')
      .send({ name: "Updated Soup" })
      .expect(409);

    expect(response.body).toMatchObject({
      code: "concurrency_conflict",
      title: "The dish has changed since you last loaded it",
      detail: "Reload the dish and retry your change.",
      currentVersion: 4,
    });
  });
});
