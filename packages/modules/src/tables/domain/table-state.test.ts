import { describe, expect, it } from "vitest";
import { deriveTableState } from "./table-state.js";

describe("deriveTableState", () => {
  it.each([
    { outOfService: false, hasOpenSession: false },
    { outOfService: false, hasOpenSession: true },
    { outOfService: true, hasOpenSession: false },
    { outOfService: true, hasOpenSession: true },
  ])(
    "returns inactive when status is inactive, regardless of outOfService=$outOfService / hasOpenSession=$hasOpenSession",
    ({ outOfService, hasOpenSession }) => {
      expect(
        deriveTableState({ status: "inactive", outOfService, hasOpenSession }),
      ).toBe("inactive");
    },
  );

  it.each([{ hasOpenSession: false }, { hasOpenSession: true }])(
    "returns out_of_service when active and outOfService is true, regardless of hasOpenSession=$hasOpenSession",
    ({ hasOpenSession }) => {
      expect(
        deriveTableState({
          status: "active",
          outOfService: true,
          hasOpenSession,
        }),
      ).toBe("out_of_service");
    },
  );

  it("returns occupied when active, not out of service, and has an open session", () => {
    expect(
      deriveTableState({
        status: "active",
        outOfService: false,
        hasOpenSession: true,
      }),
    ).toBe("occupied");
  });

  it("returns available when active, not out of service, and has no open session", () => {
    expect(
      deriveTableState({
        status: "active",
        outOfService: false,
        hasOpenSession: false,
      }),
    ).toBe("available");
  });
});
