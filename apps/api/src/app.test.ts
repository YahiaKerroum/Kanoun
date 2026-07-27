import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
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
});
