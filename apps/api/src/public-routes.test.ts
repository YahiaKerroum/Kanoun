import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ApplicationError,
  createGuestSessionMiddleware,
  createPublicMenuRouter,
  createPublicTablesRouter,
  type ExchangeQrResult,
  type GuestRequestContext,
  type PublicMenuHttpUseCases,
  type PublicTablesHttpUseCases,
} from "@rms/modules";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });
const guestSessionToken = "guest-session-token";
const businessAccountId = randomUUID();
const restaurantId = randomUUID();
const branchId = randomUUID();
const tableId = randomUUID();

const guestContext: GuestRequestContext = {
  guestSessionId: randomUUID(),
  businessAccountId,
  restaurantId,
  branchId,
  tableId,
  expiresAtUtc: new Date(Date.now() + 60 * 60_000),
  csrfTokenHash: "csrf-token-hash",
};

const customerMenu = {
  version: 1,
  currency: "USD",
  categories: [],
};

const browseOnlyExchangeResult: ExchangeQrResult = {
  sessionToken: "issued-guest-session-token-browse-only",
  csrfToken: "issued-csrf-token-browse-only",
  branchId,
  tableId: undefined,
  tableCode: undefined,
  expiresAtUtc: new Date(Date.now() + 30 * 60_000),
};

const dineInExchangeResult: ExchangeQrResult = {
  sessionToken: "issued-guest-session-token-dine-in",
  csrfToken: "issued-csrf-token-dine-in",
  branchId,
  tableId,
  tableCode: "T5",
  expiresAtUtc: new Date(Date.now() + 30 * 60_000),
};

function createTestApplication(overrides?: {
  menu?: Partial<PublicMenuHttpUseCases>;
  tables?: Partial<PublicTablesHttpUseCases>;
}) {
  const menuUseCases = {
    getGuestMenu: vi.fn().mockResolvedValue(customerMenu),
    ...overrides?.menu,
  } satisfies PublicMenuHttpUseCases;
  const tablesUseCases = {
    exchangeTableQr: vi.fn().mockResolvedValue(browseOnlyExchangeResult),
    ...overrides?.tables,
  } satisfies PublicTablesHttpUseCases;

  const authenticateGuestSession = vi.fn((token: string) =>
    Promise.resolve(token === guestSessionToken ? guestContext : undefined),
  );

  const app = createApp({
    logger,
    trustProxy: false,
    checkReadiness: () => Promise.resolve(),
    guestSessionMiddleware: createGuestSessionMiddleware({
      authenticateGuestSession,
      hashGuestCsrfToken: (token) => token,
      guestWebOrigin: "https://customer.example.test",
    }),
    apiRouters: [
      createPublicMenuRouter({ useCases: menuUseCases }),
      createPublicTablesRouter({
        useCases: tablesUseCases,
        secureCookies: false,
      }),
    ],
  });
  return { app, menuUseCases, tablesUseCases, authenticateGuestSession };
}

describe("public guest HTTP adapter", () => {
  it("exchanges a browse-only branch QR token and sets a guest session cookie", async () => {
    const { app, tablesUseCases } = createTestApplication({
      tables: {
        exchangeTableQr: vi.fn().mockResolvedValue(browseOnlyExchangeResult),
      },
    });

    const response = await request(app)
      .post("/api/v1/public/qr/valid-branch-qr-token-1234567890/session")
      .send()
      .expect(201);

    expect(response.body).toEqual({
      branchId,
      tableId: null,
      tableCode: null,
      expiresAt: browseOnlyExchangeResult.expiresAtUtc.toISOString(),
      csrfToken: browseOnlyExchangeResult.csrfToken,
    });
    expect(tablesUseCases.exchangeTableQr).toHaveBeenCalledWith(
      "valid-branch-qr-token-1234567890",
      expect.anything(),
    );

    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.some((cookie) => cookie.includes("rms_guest_session=")),
    ).toBe(true);
  });

  it("exchanges a table QR token and returns the table id and code", async () => {
    const { app } = createTestApplication({
      tables: {
        exchangeTableQr: vi.fn().mockResolvedValue(dineInExchangeResult),
      },
    });

    const response = await request(app)
      .post("/api/v1/public/qr/valid-table-qr-token-1234567890/session")
      .send()
      .expect(201);

    expect(response.body).toEqual({
      branchId,
      tableId,
      tableCode: "T5",
      expiresAt: dineInExchangeResult.expiresAtUtc.toISOString(),
      csrfToken: dineInExchangeResult.csrfToken,
    });

    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.some((cookie) => cookie.includes("rms_guest_session=")),
    ).toBe(true);
  });

  it("rejects an unknown or revoked QR token without leaking a session cookie", async () => {
    const { app, tablesUseCases } = createTestApplication({
      tables: {
        exchangeTableQr: vi
          .fn()
          .mockRejectedValue(
            new ApplicationError(
              "resource_not_found",
              404,
              "QR code not found",
            ),
          ),
      },
    });

    const response = await request(app)
      .post("/api/v1/public/qr/unknown-or-revoked-qr-token-1234/session")
      .send()
      .expect(404);

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(tablesUseCases.exchangeTableQr).toHaveBeenCalledWith(
      "unknown-or-revoked-qr-token-1234",
      expect.anything(),
    );
  });

  it("rejects a malformed qrToken path parameter without calling the use case", async () => {
    const { app, tablesUseCases } = createTestApplication();

    await request(app)
      .post("/api/v1/public/qr/too-short/session")
      .send()
      .expect(422);

    expect(tablesUseCases.exchangeTableQr).not.toHaveBeenCalled();
  });

  it("returns the guest menu for a request with a valid guest session cookie", async () => {
    const { app, menuUseCases } = createTestApplication();

    const response = await request(app)
      .get("/api/v1/public/menu")
      .set("Cookie", `rms_guest_session=${guestSessionToken}`)
      .expect(200);

    expect(response.body).toEqual({ ...customerMenu, version: "1" });
    expect(menuUseCases.getGuestMenu).toHaveBeenCalledWith(guestContext);
  });

  it("rejects requests for the guest menu without any session cookie", async () => {
    const { app, menuUseCases } = createTestApplication();

    await request(app).get("/api/v1/public/menu").expect(401);
    expect(menuUseCases.getGuestMenu).not.toHaveBeenCalled();
  });

  it("rejects requests for the guest menu with an unrecognized session cookie", async () => {
    const { app, menuUseCases } = createTestApplication();

    await request(app)
      .get("/api/v1/public/menu")
      .set("Cookie", "rms_guest_session=expired-or-garbage-token")
      .expect(401);
    expect(menuUseCases.getGuestMenu).not.toHaveBeenCalled();
  });
});
