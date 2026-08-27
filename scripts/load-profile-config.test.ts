import { describe, expect, it } from "vitest";
import {
  createLoadProfileConfig,
  resolveLoadProfile,
} from "./load-profile-config.js";

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

describe("load profile selection", () => {
  it("defaults to the short, reused-session validation profile", () => {
    const profile = resolveLoadProfile({});

    expect(profile.distinctClientIps).toBe(false);
    expect(profile.guestSessionCount).toBe(50);
    expect(profile.runDurationSeconds).toBe(90);
  });

  it("selects the sustained, distinct-client profile when requested", () => {
    const profile = resolveLoadProfile({
      LOAD_PROFILE_DISTINCT_CLIENTS: "true",
    });

    expect(profile.distinctClientIps).toBe(true);
    expect(profile.guestSessionCount).toBe(200);
    expect(profile.runDurationSeconds).toBe(960);
    expect(profile.orderSubmissionsPerMinute).toBe(
      resolveLoadProfile({}).orderSubmissionsPerMinute,
    );
  });

  it("treats any value other than the literal string true as the default profile", () => {
    expect(
      resolveLoadProfile({ LOAD_PROFILE_DISTINCT_CLIENTS: "1" })
        .distinctClientIps,
    ).toBe(false);
    expect(
      resolveLoadProfile({ LOAD_PROFILE_DISTINCT_CLIENTS: "false" })
        .distinctClientIps,
    ).toBe(false);
  });
});
