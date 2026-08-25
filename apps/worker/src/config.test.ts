import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./config.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://rms:password@127.0.0.1:5432/rms",
  LOG_LEVEL: "silent",
  WORKER_ID: "worker-test",
  OUTBOX_LEASE_MS: "30000",
  OUTBOX_MAX_ATTEMPTS: "5",
  OUTBOX_RETENTION_DAYS: "90",
} satisfies NodeJS.ProcessEnv;

describe("loadWorkerConfig", () => {
  it("disables the metrics listener when no host is set", () => {
    const config = loadWorkerConfig(validEnvironment);
    expect(config.metricsHost).toBe("");
    expect(config.metricsPort).toBe(3001);
  });

  it("accepts loopback hosts for the metrics listener", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      const config = loadWorkerConfig({
        ...validEnvironment,
        WORKER_METRICS_HOST: host,
        WORKER_METRICS_PORT: "3010",
      });
      expect(config.metricsHost).toBe(host);
      expect(config.metricsPort).toBe(3010);
    }
  });

  it("rejects non-loopback metrics hosts", () => {
    expect(() =>
      loadWorkerConfig({
        ...validEnvironment,
        WORKER_METRICS_HOST: "0.0.0.0",
      }),
    ).toThrow("Invalid worker configuration fields: WORKER_METRICS_HOST");
  });

  it("rejects out-of-range metrics ports", () => {
    expect(() =>
      loadWorkerConfig({
        ...validEnvironment,
        WORKER_METRICS_HOST: "127.0.0.1",
        WORKER_METRICS_PORT: "70000",
      }),
    ).toThrow("Invalid worker configuration fields: WORKER_METRICS_PORT");
  });
});
