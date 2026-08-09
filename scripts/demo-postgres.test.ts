import { describe, expect, it } from "vitest";
import {
  selectDemoPostgresMode,
  type DemoPostgresCapabilities,
} from "./demo-postgres.js";

describe("selectDemoPostgresMode", () => {
  it("uses the existing service when the role can create databases", () => {
    const capabilities: DemoPostgresCapabilities = {
      canCreateDatabase: true,
    };

    expect(selectDemoPostgresMode(capabilities)).toBe("existing");
  });

  it("uses an owned cluster when the existing role is restricted", () => {
    const capabilities: DemoPostgresCapabilities = {
      canCreateDatabase: false,
    };

    expect(selectDemoPostgresMode(capabilities)).toBe("isolated");
  });
});
