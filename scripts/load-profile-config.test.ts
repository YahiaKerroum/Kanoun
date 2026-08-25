import { describe, expect, it } from "vitest";
import { createLoadProfileConfig } from "./load-profile-config.js";

const validEnvironment = {
  NODE_ENV: "development",
  LOAD_PROFILE_BASE_DATABASE_URL:
    "postgresql://rms:rms_local_only@127.0.0.1:5432/rms",
};

describe("load-profile configuration safety", () => {
  it("builds a run-scoped, marked, loopback-only target from a loopback base URL", async () => {
    const config = await createLoadProfileConfig(validEnvironment);

    expect(config.databaseHost).toBe("127.0.0.1");
    expect(config.databaseName).toMatch(/^rms_load_[a-z0-9]+$/);
    expect(config.databaseUrl).toContain(config.databaseName);
    expect(config.databaseMarker).toContain(config.databaseName);
    expect(config.adminDatabaseUrl).toContain("/postgres");
    expect(config.apiOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("generates a fresh, distinct run each call", async () => {
    const first = await createLoadProfileConfig(validEnvironment);
    const second = await createLoadProfileConfig(validEnvironment);

    expect(first.databaseName).not.toBe(second.databaseName);
    expect(first.runId).not.toBe(second.runId);
  });

  it("refuses production mode", async () => {
    await expect(
      createLoadProfileConfig({ ...validEnvironment, NODE_ENV: "production" }),
    ).rejects.toThrow(/NODE_ENV=production/);
  });

  it("refuses a non-loopback base database host", async () => {
    await expect(
      createLoadProfileConfig({
        ...validEnvironment,
        LOAD_PROFILE_BASE_DATABASE_URL:
          "postgresql://rms:rms_local_only@example.test:5432/rms",
      }),
    ).rejects.toThrow(/loopback/);
  });

  it("refuses a non-postgresql base database URL", async () => {
    await expect(
      createLoadProfileConfig({
        ...validEnvironment,
        LOAD_PROFILE_BASE_DATABASE_URL: "mysql://127.0.0.1:3306/rms",
      }),
    ).rejects.toThrow(/postgresql:\/\//);
  });

  it("requires a base database URL from one of the supported variables", async () => {
    await expect(
      createLoadProfileConfig({ NODE_ENV: "development" }),
    ).rejects.toThrow(/LOAD_PROFILE_BASE_DATABASE_URL/);
  });

  it("falls back to TEST_DATABASE_URL and DATABASE_URL when unset", async () => {
    const viaTestDatabaseUrl = await createLoadProfileConfig({
      NODE_ENV: "development",
      TEST_DATABASE_URL: "postgresql://rms:rms_local_only@127.0.0.1:5432/rms",
    });
    expect(viaTestDatabaseUrl.databaseHost).toBe("127.0.0.1");

    const viaDatabaseUrl = await createLoadProfileConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://rms:rms_local_only@127.0.0.1:5432/rms",
    });
    expect(viaDatabaseUrl.databaseHost).toBe("127.0.0.1");
  });
});
