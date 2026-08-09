import { describe, expect, it } from "vitest";
import type { BranchRecord } from "./models.js";
import {
  branchLocalDate,
  isBranchAcceptingOrders,
} from "./branch-acceptance.js";

const branch: BranchRecord = {
  id: "branch",
  businessAccountId: "tenant",
  restaurantId: "restaurant",
  name: "Central",
  address: { line1: "1 Main", city: "Algiers", countryCode: "DZ" },
  contact: {},
  timeZone: "Africa/Algiers",
  currency: "DZD",
  status: "active",
  serviceStatus: "open",
  allowOrderOverride: false,
  version: 1,
  openingHours: [{ dayOfWeek: 1, opensAt: "18:00", closesAt: "02:00" }],
};

describe("branch order acceptance", () => {
  it("uses branch-local time and supports overnight periods", () => {
    expect(
      isBranchAcceptingOrders(
        branch,
        new Date("2026-07-27T18:30:00.000Z"),
        false,
      ),
    ).toBe(true);
    expect(
      isBranchAcceptingOrders(
        branch,
        new Date("2026-07-28T00:30:00.000Z"),
        false,
      ),
    ).toBe(true);
    expect(
      isBranchAcceptingOrders(
        branch,
        new Date("2026-07-28T02:30:00.000Z"),
        false,
      ),
    ).toBe(false);
  });

  it("blocks inactive, manually closed, and dated-closure branches", () => {
    expect(
      isBranchAcceptingOrders(
        { ...branch, serviceStatus: "closed" },
        new Date("2026-07-27T18:30:00.000Z"),
        false,
      ),
    ).toBe(false);
    expect(
      isBranchAcceptingOrders(
        branch,
        new Date("2026-07-27T18:30:00.000Z"),
        true,
      ),
    ).toBe(false);
  });

  it("allows an explicit order override but never bypasses a dated closure", () => {
    expect(
      isBranchAcceptingOrders(
        { ...branch, serviceStatus: "closed", allowOrderOverride: true },
        new Date("2026-07-27T03:30:00.000Z"),
        false,
      ),
    ).toBe(true);
    expect(
      isBranchAcceptingOrders(
        {
          ...branch,
          serviceStatus: "temporarily_unavailable",
          allowOrderOverride: true,
        },
        new Date("2026-07-27T03:30:00.000Z"),
        true,
      ),
    ).toBe(false);
  });

  it("derives the local business date in the branch time zone", () => {
    expect(
      branchLocalDate(new Date("2026-07-27T23:30:00.000Z"), "Africa/Algiers"),
    ).toBe("2026-07-28");
  });
});
