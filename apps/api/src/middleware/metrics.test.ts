import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { createRequestMetrics } from "./metrics.js";
import type {
  ApiRequestObservation,
  ServiceMetrics,
} from "@rms/building-blocks";

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

function recordingServiceMetrics(): ServiceMetrics & {
  readonly calls: readonly RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  return {
    calls,
    registry: { counter: vi.fn(), gauge: vi.fn(), histogram: vi.fn() },
    observeApiRequest: record("observeApiRequest"),
    setDatabaseReady: record("setDatabaseReady"),
    observeOrderSubmission: record("observeOrderSubmission"),
    observePaymentRecording: record("observePaymentRecording"),
    observeAuthenticationFailure: record("observeAuthenticationFailure"),
    observeQrExchangeFailure: record("observeQrExchangeFailure"),
    observeSupportAccessChange: record("observeSupportAccessChange"),
    sseConnectionOpened: record("sseConnectionOpened"),
    sseConnectionClosed: record("sseConnectionClosed"),
    sseReconnected: record("sseReconnected"),
    sseReplayGap: record("sseReplayGap"),
    sseSessionEnded: record("sseSessionEnded"),
    ssePollFailure: record("ssePollFailure"),
    sseDelivered: record("sseDelivered"),
    observePoolQuery: record("observePoolQuery"),
    countPoolError: record("countPoolError"),
    setPoolSaturation: record("setPoolSaturation"),
    countIdempotentDuplicate: record("countIdempotentDuplicate"),
    countOutboxOutcome: record("countOutboxOutcome"),
    observeOutboxEventAge: record("observeOutboxEventAge"),
    observeOutboxHandler: record("observeOutboxHandler"),
    setOutboxBacklog: record("setOutboxBacklog"),
    countSessionInvalidationFailure: record("countSessionInvalidationFailure"),
    countTenantIsolationSignal: record("countTenantIsolationSignal"),
    countPaymentReconciliationFailure: record(
      "countPaymentReconciliationFailure",
    ),
    setBackupLastSuccessAgeSeconds: record("setBackupLastSuccessAgeSeconds"),
    snapshot: vi.fn(),
  } as unknown as ServiceMetrics & { readonly calls: readonly RecordedCall[] };
}

function finishRequest(options: {
  method: string;
  routePath?: string;
  baseUrl?: string;
  statusCode: number;
}): ServiceMetrics & { readonly calls: readonly RecordedCall[] } {
  const metrics = recordingServiceMetrics();
  const middleware = createRequestMetrics(metrics);
  const request = {
    method: options.method,
    baseUrl: options.baseUrl ?? "",
    route: options.routePath ? { path: options.routePath } : undefined,
  } as unknown as Request;
  const response = new EventEmitter() as unknown as Response & {
    statusCode: number;
  };
  response.statusCode = options.statusCode;
  const next = vi.fn() as unknown as NextFunction;
  middleware(request, response, next);
  expect(next).toHaveBeenCalledOnce();
  response.statusCode = options.statusCode;
  response.emit("finish");
  return metrics;
}

function methodCalls(
  metrics: { readonly calls: readonly RecordedCall[] },
  method: string,
): RecordedCall[] {
  return metrics.calls.filter((call) => call.method === method);
}

function apiObservation(metrics: {
  readonly calls: readonly RecordedCall[];
}): ApiRequestObservation {
  const call = methodCalls(metrics, "observeApiRequest")[0];
  expect(call).toBeDefined();
  return call?.args[0] as ApiRequestObservation;
}

describe("createRequestMetrics", () => {
  it("observes every finished request with method, route pattern, status class, and duration", () => {
    const metrics = finishRequest({
      method: "GET",
      routePath: "/api/v1/staff/branches",
      statusCode: 200,
    });
    const observation = apiObservation(metrics);
    expect(observation.method).toBe("GET");
    expect(observation.route).toBe("/api/v1/staff/branches");
    expect(observation.statusClass).toBe("success");
    expect(observation.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("classifies client and server errors by status class", () => {
    const clientError = finishRequest({
      method: "GET",
      routePath: "/api/v1/staff/branches",
      statusCode: 404,
    });
    expect(apiObservation(clientError).statusClass).toBe("client_error");
    const serverError = finishRequest({
      method: "GET",
      routePath: "/api/v1/staff/branches",
      statusCode: 500,
    });
    expect(apiObservation(serverError).statusClass).toBe("server_error");
  });

  it("labels requests that never matched a route as unrouted", () => {
    const metrics = finishRequest({
      method: "GET",
      statusCode: 404,
    });
    expect(apiObservation(metrics).route).toBe("unrouted");
  });

  it("uses the route pattern, never the concrete URL, as the label", () => {
    const metrics = finishRequest({
      method: "GET",
      routePath: "/api/v1/staff/orders/:orderId",
      statusCode: 200,
    });
    expect(apiObservation(metrics).route).toBe("/api/v1/staff/orders/:orderId");
  });

  it("maps order submission outcomes for public and staff POST routes", () => {
    for (const route of ["/api/v1/public/orders", "/api/v1/staff/orders"]) {
      const success = finishRequest({
        method: "POST",
        routePath: route,
        statusCode: 201,
      });
      expect(methodCalls(success, "observeOrderSubmission")[0]?.args[0]).toBe(
        "success",
      );
      const conflict = finishRequest({
        method: "POST",
        routePath: route,
        statusCode: 409,
      });
      expect(methodCalls(conflict, "observeOrderSubmission")[0]?.args[0]).toBe(
        "conflict",
      );
      const rejected = finishRequest({
        method: "POST",
        routePath: route,
        statusCode: 403,
      });
      expect(methodCalls(rejected, "observeOrderSubmission")[0]?.args[0]).toBe(
        "rejected",
      );
      const error = finishRequest({
        method: "POST",
        routePath: route,
        statusCode: 500,
      });
      expect(methodCalls(error, "observeOrderSubmission")[0]?.args[0]).toBe(
        "error",
      );
    }
  });

  it("does not double-count order reads as submissions", () => {
    const metrics = finishRequest({
      method: "GET",
      routePath: "/api/v1/public/orders",
      statusCode: 200,
    });
    expect(methodCalls(metrics, "observeOrderSubmission")).toHaveLength(0);
  });

  it("maps payment recording outcomes for the payments sub-route", () => {
    const success = finishRequest({
      method: "POST",
      routePath: "/api/v1/staff/orders/:orderId/payments",
      statusCode: 201,
    });
    expect(methodCalls(success, "observePaymentRecording")[0]?.args[0]).toBe(
      "success",
    );
    const error = finishRequest({
      method: "POST",
      routePath: "/api/v1/staff/orders/:orderId/payments",
      statusCode: 500,
    });
    expect(methodCalls(error, "observePaymentRecording")[0]?.args[0]).toBe(
      "error",
    );
  });

  it("classifies login failures by status", () => {
    const invalid = finishRequest({
      method: "POST",
      routePath: "/api/v1/auth/login",
      statusCode: 401,
    });
    expect(
      methodCalls(invalid, "observeAuthenticationFailure")[0]?.args[0],
    ).toBe("invalid_credentials");
    const limited = finishRequest({
      method: "POST",
      routePath: "/api/v1/auth/login",
      statusCode: 429,
    });
    expect(
      methodCalls(limited, "observeAuthenticationFailure")[0]?.args[0],
    ).toBe("rate_limited");
    const unavailable = finishRequest({
      method: "POST",
      routePath: "/api/v1/auth/login",
      statusCode: 503,
    });
    expect(
      methodCalls(unavailable, "observeAuthenticationFailure")[0]?.args[0],
    ).toBe("other");
  });

  it("ignores successful logins for the failure counter", () => {
    const metrics = finishRequest({
      method: "POST",
      routePath: "/api/v1/auth/login",
      statusCode: 204,
    });
    expect(methodCalls(metrics, "observeAuthenticationFailure")).toHaveLength(
      0,
    );
  });

  it("splits QR exchange failures into rejections and errors", () => {
    const rejected = finishRequest({
      method: "POST",
      routePath: "/api/v1/public/qr/:code/exchange",
      statusCode: 400,
    });
    expect(methodCalls(rejected, "observeQrExchangeFailure")[0]?.args[0]).toBe(
      "rejected",
    );
    const error = finishRequest({
      method: "POST",
      routePath: "/api/v1/public/qr/:code/exchange",
      statusCode: 500,
    });
    expect(methodCalls(error, "observeQrExchangeFailure")[0]?.args[0]).toBe(
      "error",
    );
  });

  it("tracks support access grants and revocations", () => {
    const granted = finishRequest({
      method: "POST",
      routePath: "/api/v1/platform/support-access-grants",
      statusCode: 201,
    });
    expect(methodCalls(granted, "observeSupportAccessChange")[0]?.args[0]).toBe(
      "granted",
    );
    const revoked = finishRequest({
      method: "DELETE",
      routePath: "/api/v1/platform/support-access-grants/:grantId",
      statusCode: 204,
    });
    expect(methodCalls(revoked, "observeSupportAccessChange")[0]?.args[0]).toBe(
      "revoked",
    );
  });

  it("does not record support access changes for failures", () => {
    const metrics = finishRequest({
      method: "POST",
      routePath: "/api/v1/platform/support-access-grants",
      statusCode: 403,
    });
    expect(methodCalls(metrics, "observeSupportAccessChange")).toHaveLength(0);
  });
});
