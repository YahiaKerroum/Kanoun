import { describe, expect, it } from "vitest";
import {
  guestSessionAbsoluteTimeoutMs,
  guestSessionIdleTimeoutMs,
  isGuestSessionValid,
} from "./session-policy.js";
import type { GuestSessionRecord } from "./models.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const now = new Date("2026-07-27T15:00:00.000Z");

function buildSession(
  overrides: Partial<GuestSessionRecord> = {},
): GuestSessionRecord {
  return {
    id: "session-1",
    businessAccountId: "business-1",
    restaurantId: "restaurant-1",
    branchId: "branch-1",
    tableId: "table-1",
    createdAtUtc: new Date(now.getTime() - HOUR_MS),
    lastSeenAtUtc: new Date(now.getTime() - HOUR_MS),
    expiresAtUtc: new Date(now.getTime() + 11 * HOUR_MS),
    ...overrides,
  };
}

describe("guestSessionIdleTimeoutMs / guestSessionAbsoluteTimeoutMs", () => {
  it("defines the idle timeout as 4 hours", () => {
    expect(guestSessionIdleTimeoutMs).toBe(4 * HOUR_MS);
  });

  it("defines the absolute timeout as 12 hours", () => {
    expect(guestSessionAbsoluteTimeoutMs).toBe(12 * HOUR_MS);
  });
});

describe("isGuestSessionValid", () => {
  it("is valid for a fresh, non-revoked session well within both windows", () => {
    const session = buildSession();

    expect(isGuestSessionValid(session, now)).toBe(true);
  });

  it("is invalid when revokedAtUtc is set, regardless of the other timestamps", () => {
    const session = buildSession({
      revokedAtUtc: new Date(now.getTime() - HOUR_MS),
      lastSeenAtUtc: now,
      expiresAtUtc: new Date(now.getTime() + 11 * HOUR_MS),
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });

  it("is invalid exactly at the absolute expiry boundary (now === expiresAtUtc)", () => {
    const session = buildSession({
      lastSeenAtUtc: now,
      expiresAtUtc: now,
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });

  it("is invalid one millisecond past the absolute expiry boundary", () => {
    const session = buildSession({
      lastSeenAtUtc: now,
      expiresAtUtc: new Date(now.getTime() - 1),
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });

  it("is invalid once past the idle timeout, even before the absolute cap", () => {
    const session = buildSession({
      lastSeenAtUtc: new Date(now.getTime() - 5 * HOUR_MS),
      expiresAtUtc: new Date(now.getTime() + HOUR_MS),
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });

  it("is invalid exactly at the idle deadline boundary (now === lastSeenAtUtc + 4h)", () => {
    const session = buildSession({
      lastSeenAtUtc: new Date(now.getTime() - 4 * HOUR_MS),
      expiresAtUtc: new Date(now.getTime() + HOUR_MS),
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });

  it("cannot have the absolute cap extended by idle-window refreshes (touchGuestSession)", () => {
    const session = buildSession({
      lastSeenAtUtc: new Date(now.getTime() - MINUTE_MS),
      expiresAtUtc: now,
    });

    expect(isGuestSessionValid(session, now)).toBe(false);
  });
});
