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
  SUPPORT_ACCESS_SECRET: "a-support-access-secret-with-32-characters",
  GUEST_ACCESS_SECRET: "a-guest-access-test-secret-with-32-characters",
  SESSION_COOKIE_SECURE: "false",
  WEB_ORIGIN: "http://127.0.0.1:5173",
  CUSTOMER_WEB_ORIGIN: "http://127.0.0.1:5174",
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

  it("accepts a positive integer trusted-hop count", () => {
    expect(
      loadApiConfig({ ...validEnvironment, TRUST_PROXY: "1" }),
    ).toMatchObject({ trustProxy: 1 });
    expect(
      loadApiConfig({ ...validEnvironment, TRUST_PROXY: "2" }),
    ).toMatchObject({ trustProxy: 2 });
  });

  it("refuses a blanket true trust-proxy value", () => {
    expect(() =>
      loadApiConfig({ ...validEnvironment, TRUST_PROXY: "true" }),
    ).toThrow("Invalid API configuration fields: TRUST_PROXY");
  });

  it("refuses a non-positive or non-integer trusted-hop count", () => {
    expect(() =>
      loadApiConfig({ ...validEnvironment, TRUST_PROXY: "0" }),
    ).toThrow("Invalid API configuration fields: TRUST_PROXY");
    expect(() =>
      loadApiConfig({ ...validEnvironment, TRUST_PROXY: "1.5" }),
    ).toThrow("Invalid API configuration fields: TRUST_PROXY");
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
