import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./config.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  TRUST_PROXY: "false",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://rms:password@127.0.0.1:5432/rms",
  SESSION_SECRET: "a-secure-test-secret-with-32-characters",
  BOOTSTRAP_SECRET: "a-bootstrap-test-secret-with-32-characters",
  SESSION_COOKIE_SECURE: "false",
  WEB_ORIGIN: "http://127.0.0.1:5173",
} satisfies NodeJS.ProcessEnv;

describe("loadApiConfig", () => {
  it("parses and normalizes external environment input", () => {
    expect(loadApiConfig(validEnvironment)).toMatchObject({
      nodeEnvironment: "test",
      port: 3000,
      trustProxy: false,
    });
  });

  it("reports field names without echoing secret values", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      SESSION_SECRET: "do-not-log-this",
    };

    expect(() => loadApiConfig(invalidEnvironment)).toThrow(
      "Invalid API configuration fields: SESSION_SECRET",
    );
    expect(() => loadApiConfig(invalidEnvironment)).not.toThrow(
      /do-not-log-this/,
    );
  });

  it("fails closed when production recovery delivery is not HTTPS", () => {
    expect(() =>
      loadApiConfig({
        ...validEnvironment,
        NODE_ENV: "production",
        SESSION_COOKIE_SECURE: "true",
        RECOVERY_DELIVERY_URL: "http://delivery.internal/recovery",
        RECOVERY_DELIVERY_SECRET:
          "a-production-delivery-secret-with-32-characters",
      }),
    ).toThrow("Invalid API configuration fields: NODE_ENV");
  });
});
