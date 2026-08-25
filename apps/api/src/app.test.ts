import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createAlertEvaluator,
  createLoggingAlertSink,
  createServiceMetrics,
} from "@rms/building-blocks";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });

describe("API application factory", () => {
  it("reports liveness without identifying Express", async () => {
    const app = createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
    });

    const response = await request(app).get("/health/live").expect(200);

    expect(response.body).toEqual({ status: "ok", service: "api" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("fails readiness closed when PostgreSQL is unavailable", async () => {
    const app = createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.reject(new Error("database unavailable")),
    });

    const response = await request(app).get("/health/ready").expect(503);

    expect(response.body).toEqual({
      status: "not_ready",
      dependencies: { database: "unavailable" },
    });
  });

  it("uses the canonical problem media type for unknown resources", async () => {
    const app = createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
    });

    const response = await request(app).get("/missing").expect(404);

    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body).toMatchObject({
      code: "resource_not_found",
      status: 404,
    });
  });

  it("serves the metrics reading from /health/metrics when configured", async () => {
    const serviceMetrics = createServiceMetrics();
    serviceMetrics.setDatabaseReady(true);
    serviceMetrics.observeOrderSubmission("success");
    const alertEvaluator = createAlertEvaluator(createLoggingAlertSink(logger));
    alertEvaluator.evaluate(serviceMetrics.snapshot());
    const app = createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
      serviceMetrics,
      readHealthMetrics: () => ({
        snapshot: serviceMetrics.snapshot(),
        alerts: alertEvaluator.active,
      }),
    });

    const response = await request(app).get("/health/metrics").expect(200);
    const body = response.body as {
      snapshot: { counters: Record<string, number> };
      alerts: readonly unknown[];
    };

    expect(body.snapshot.counters).toMatchObject({
      'orders.submissions_total{outcome="success"}': 1,
    });
    expect(body.alerts).toEqual([]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(
      /["']?(password|token|secret|authorization|cookie)["']?/i,
    );
    expect(serialized).not.toMatch(
      /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i,
    );
  });

  it("fails /health/metrics closed when metrics are not configured", async () => {
    const app = createApp({
      logger,
      trustProxy: false,
      checkReadiness: () => Promise.resolve(),
    });

    const response = await request(app).get("/health/metrics").expect(404);

    expect(response.body).toEqual({ status: "not_configured" });
  });
});
