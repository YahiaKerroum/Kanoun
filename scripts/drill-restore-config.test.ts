import { describe, expect, it } from "vitest";
import { createDrillRestoreConfig } from "./drill-restore-config.js";

const validEnvironment = {
  NODE_ENV: "development",
  DRILL_RESTORE_BASE_DATABASE_URL:
    "postgresql://rms:rms_local_only@127.0.0.1:5432/rms",
};

describe("restore-drill configuration safety", () => {
  it("builds distinct, marked, loopback source and restored targets", () => {
    const config = createDrillRestoreConfig(validEnvironment);

    expect(config.source.databaseName).toMatch(/^rms_drill_[a-z0-9]+_src$/);
    expect(config.restored.databaseName).toMatch(/^rms_drill_[a-z0-9]+_dst$/);
    expect(config.source.databaseName).not.toBe(config.restored.databaseName);
    expect(config.source.databaseHost).toBe("127.0.0.1");
    expect(config.restored.databaseHost).toBe("127.0.0.1");
    expect(config.source.databaseMarker).toContain(config.source.databaseName);
    expect(config.restored.databaseMarker).toContain(
      config.restored.databaseName,
    );
    expect(config.backupFilePath).toContain(config.runId);
  });

  it("generates a fresh, distinct run each call", () => {
    const first = createDrillRestoreConfig(validEnvironment);
    const second = createDrillRestoreConfig(validEnvironment);

    expect(first.runId).not.toBe(second.runId);
    expect(first.source.databaseName).not.toBe(second.source.databaseName);
  });

  it("refuses production mode", () => {
    expect(() =>
      createDrillRestoreConfig({ ...validEnvironment, NODE_ENV: "production" }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("refuses a non-loopback base database host", () => {
    expect(() =>
      createDrillRestoreConfig({
        ...validEnvironment,
        DRILL_RESTORE_BASE_DATABASE_URL:
          "postgresql://rms:rms_local_only@example.test:5432/rms",
      }),
    ).toThrow(/loopback/);
  });

  it("refuses a non-postgresql base database URL", () => {
    expect(() =>
      createDrillRestoreConfig({
        ...validEnvironment,
        DRILL_RESTORE_BASE_DATABASE_URL: "mysql://127.0.0.1:3306/rms",
      }),
    ).toThrow(/postgresql:\/\//);
  });

  it("requires a base database URL from one of the supported variables", () => {
    expect(() => createDrillRestoreConfig({ NODE_ENV: "development" })).toThrow(
      /DRILL_RESTORE_BASE_DATABASE_URL/,
    );
  });
});
