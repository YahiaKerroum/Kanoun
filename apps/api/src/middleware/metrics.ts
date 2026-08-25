import type { NextFunction, Request, Response } from "express";
import type {
  AuthenticationFailureReason,
  ServiceMetrics,
} from "@rms/building-blocks";

const ORDER_SUBMISSION_ROUTES = new Set([
  "/api/v1/public/orders",
  "/api/v1/staff/orders",
]);
const PAYMENT_RECORDING_ROUTE_PREFIX = "/api/v1/staff/orders/";
const PAYMENT_RECORDING_ROUTE_SUFFIX = "/payments";
const LOGIN_ROUTE = "/api/v1/auth/login";
const QR_EXCHANGE_ROUTE_PREFIX = "/api/v1/public/qr/";
const SUPPORT_GRANT_ROUTE = "/api/v1/platform/support-access-grants";
const SUPPORT_REVOKE_ROUTE = "/api/v1/platform/support-access-grants/:grantId";

function routePattern(request: Request): string {
  const routePath = (request.route as { path?: string } | undefined)?.path;
  if (routePath) {
    return `${request.baseUrl}${routePath}`;
  }
  return "unrouted";
}

function statusClass(
  status: number,
): "success" | "client_error" | "server_error" {
  if (status < 400) return "success";
  if (status < 500) return "client_error";
  return "server_error";
}

function commandOutcome(
  status: number,
): "success" | "conflict" | "rejected" | "error" {
  if (status < 400) return "success";
  if (status === 409) return "conflict";
  if (status < 500) return "rejected";
  return "error";
}

function loginFailureReason(status: number): AuthenticationFailureReason {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  return "other";
}

export function createRequestMetrics(serviceMetrics: ServiceMetrics) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    response.on("finish", () => {
      const pattern = routePattern(request);
      const method = request.method.toUpperCase();
      const status = response.statusCode;
      serviceMetrics.observeApiRequest({
        method,
        route: pattern,
        statusClass: statusClass(status),
        durationMs: performance.now() - startedAt,
      });

      if (ORDER_SUBMISSION_ROUTES.has(pattern) && method === "POST") {
        serviceMetrics.observeOrderSubmission(commandOutcome(status));
      }
      if (
        method === "POST" &&
        pattern.startsWith(PAYMENT_RECORDING_ROUTE_PREFIX) &&
        pattern.endsWith(PAYMENT_RECORDING_ROUTE_SUFFIX)
      ) {
        serviceMetrics.observePaymentRecording(commandOutcome(status));
      }
      if (pattern === LOGIN_ROUTE && method === "POST" && status >= 400) {
        serviceMetrics.observeAuthenticationFailure(loginFailureReason(status));
      }
      if (
        method === "POST" &&
        pattern.startsWith(QR_EXCHANGE_ROUTE_PREFIX) &&
        status >= 400
      ) {
        serviceMetrics.observeQrExchangeFailure(
          status < 500 ? "rejected" : "error",
        );
      }
      if (status < 400) {
        if (pattern === SUPPORT_GRANT_ROUTE && method === "POST") {
          serviceMetrics.observeSupportAccessChange("granted");
        }
        if (pattern === SUPPORT_REVOKE_ROUTE && method === "DELETE") {
          serviceMetrics.observeSupportAccessChange("revoked");
        }
      }
    });
    next();
  };
}
