import { describe, expect, it } from "vitest";
import {
  assertOpeningHoursDoNotOverlap,
  assertServiceStatusChangeHasReason,
} from "./tenant-owner-service.js";

describe("opening hours validation", () => {
  it("rejects an overnight period that overlaps the following day", () => {
    expect(() =>
      assertOpeningHoursDoNotOverlap([
        { dayOfWeek: 0, opensAt: "23:00", closesAt: "02:00" },
        { dayOfWeek: 1, opensAt: "01:00", closesAt: "03:00" },
      ]),
    ).toThrow("Opening hours overlap");
  });

  it("accepts a separate period on the following day", () => {
    expect(() =>
      assertOpeningHoursDoNotOverlap([
        { dayOfWeek: 0, opensAt: "18:00", closesAt: "02:00" },
        { dayOfWeek: 1, opensAt: "18:00", closesAt: "23:00" },
      ]),
    ).not.toThrow();
  });

  it("rejects overlapping periods on the same day", () => {
    expect(() =>
      assertOpeningHoursDoNotOverlap([
        { dayOfWeek: 3, opensAt: "09:00", closesAt: "15:00" },
        { dayOfWeek: 3, opensAt: "14:00", closesAt: "18:00" },
      ]),
    ).toThrow("Opening hours overlap");
  });
});

describe("service status transition validation", () => {
  it("requires an explanation when service is closed or unavailable", () => {
    expect(() =>
      assertServiceStatusChangeHasReason("open", "closed", undefined),
    ).toThrow("Service status explanation required");
    expect(() =>
      assertServiceStatusChangeHasReason(
        "open",
        "temporarily_unavailable",
        "short",
      ),
    ).toThrow("Service status explanation required");
  });

  it("allows reopening and unchanged service status without an explanation", () => {
    expect(() =>
      assertServiceStatusChangeHasReason("closed", "open", undefined),
    ).not.toThrow();
    expect(() =>
      assertServiceStatusChangeHasReason("closed", "closed", undefined),
    ).not.toThrow();
  });

  it("accepts a reasoned closure", () => {
    expect(() =>
      assertServiceStatusChangeHasReason(
        "open",
        "closed",
        "Temporary service pause for maintenance",
      ),
    ).not.toThrow();
  });
});
