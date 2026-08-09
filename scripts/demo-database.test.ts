import { describe, expect, it } from "vitest";
import {
  assertDemoDatabaseMarker,
  DemoDatabaseSafetyError,
} from "./demo-database.js";

describe("demo database safety marker", () => {
  it("allows an absent database before creation", () => {
    expect(() =>
      assertDemoDatabaseMarker(undefined, "MISE_LOCAL_SYNTHETIC_DEMO_V1"),
    ).not.toThrow();
  });

  it("refuses an existing unmarked database", () => {
    expect(() =>
      assertDemoDatabaseMarker(null, "MISE_LOCAL_SYNTHETIC_DEMO_V1"),
    ).toThrow(DemoDatabaseSafetyError);
    try {
      assertDemoDatabaseMarker(null, "MISE_LOCAL_SYNTHETIC_DEMO_V1");
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "unmarked_database_refused" });
    }
  });

  it("refuses a differently marked database", () => {
    expect(() =>
      assertDemoDatabaseMarker("another-owner", "MISE_LOCAL_SYNTHETIC_DEMO_V1"),
    ).toThrow(DemoDatabaseSafetyError);
    try {
      assertDemoDatabaseMarker("another-owner", "MISE_LOCAL_SYNTHETIC_DEMO_V1");
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "database_marker_mismatch" });
    }
  });
});
