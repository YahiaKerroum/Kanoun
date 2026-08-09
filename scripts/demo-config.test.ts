import { describe, expect, it } from "vitest";
import {
  DEMO_DATABASE_MARKER,
  DEMO_DATABASE_NAME,
  DemoSafetyError,
  parseDemoConfig,
} from "./demo-config.js";

const validEnvironment = {
  NODE_ENV: "development",
  DEMO_DATABASE_URL: "postgresql://rms:rms_local_only@127.0.0.1:5432/rms_demo",
  DEMO_DATABASE_NAME,
  DEMO_DATABASE_MARKER,
};

function expectSafetyFailure(
  environment: NodeJS.ProcessEnv,
  code: DemoSafetyError["code"],
): void {
  try {
    parseDemoConfig(environment);
    throw new Error("Expected demo safety validation to fail.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DemoSafetyError);
    if (error instanceof DemoSafetyError) {
      expect(error.code).toBe(code);
    }
  }
}

describe("demo configuration safety", () => {
  it("accepts the explicitly marked loopback demo target", () => {
    const config = parseDemoConfig(validEnvironment);

    expect(config.databaseName).toBe(DEMO_DATABASE_NAME);
    expect(config.databaseHost).toBe("127.0.0.1");
    expect(config.databasePort).toBe(5432);
  });

  it("refuses production mode", () => {
    expectSafetyFailure(
      { ...validEnvironment, NODE_ENV: "production" },
      "production_mode_refused",
    );
  });

  it("refuses a non-loopback database host", () => {
    expectSafetyFailure(
      {
        ...validEnvironment,
        DEMO_DATABASE_URL:
          "postgresql://rms:rms_local_only@example.test:5432/rms_demo",
      },
      "non_loopback_database_refused",
    );
  });

  it("refuses a broad or unexpected database name", () => {
    expectSafetyFailure(
      {
        ...validEnvironment,
        DEMO_DATABASE_URL: "postgresql://rms:rms_local_only@127.0.0.1:5432/rms",
      },
      "unexpected_database_name",
    );
  });

  it("refuses missing marker configuration", () => {
    const withoutMarker: NodeJS.ProcessEnv = { ...validEnvironment };
    delete withoutMarker.DEMO_DATABASE_MARKER;

    expectSafetyFailure(withoutMarker, "missing_safety_configuration");
  });
});
