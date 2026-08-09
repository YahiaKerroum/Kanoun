import type { Request, RequestHandler } from "express";
import { secretsMatch } from "@rms/building-blocks";
import { ApplicationError } from "../../shared/application-error.js";
import type { StaffRequestContext } from "../domain/session-context.js";

export const staffSessionCookieName = "rms_staff_session";
export const csrfCookieName = "rms_csrf";

export interface StaffRequest extends Request {
  staffContext?: StaffRequestContext & { readonly csrfTokenHash: string };
}

export function readRequestCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export interface SessionMiddlewareDependencies {
  readonly authenticateSession: (
    rawSessionToken: string,
  ) => Promise<
    (StaffRequestContext & { readonly csrfTokenHash: string }) | undefined
  >;
  readonly hashCsrfToken: (rawToken: string) => string;
  readonly webOrigin: string;
  readonly webOrigins?: readonly string[];
}

export function createStaffSessionMiddleware(
  dependencies: SessionMiddlewareDependencies,
): RequestHandler {
  return async (request, _response, next) => {
    const sessionToken = readRequestCookie(
      request.headers.cookie,
      staffSessionCookieName,
    );
    if (!sessionToken) {
      next();
      return;
    }
    const context = await dependencies.authenticateSession(sessionToken);
    if (context) {
      (request as StaffRequest).staffContext = context;
    }
    next();
  };
}

export function requireStaffSession(): RequestHandler {
  return (request, _response, next) => {
    if (!(request as StaffRequest).staffContext) {
      next(
        new ApplicationError(
          "authentication_required",
          401,
          "Authentication required",
        ),
      );
      return;
    }
    next();
  };
}

export function createCsrfProtection(
  dependencies: SessionMiddlewareDependencies,
): RequestHandler {
  return (request, _response, next) => {
    const context = (request as StaffRequest).staffContext;
    if (!context) {
      next(
        new ApplicationError(
          "authentication_required",
          401,
          "Authentication required",
        ),
      );
      return;
    }
    const origin = request.get("origin");
    const rawToken = request.get("x-csrf-token");
    const allowedOrigins = dependencies.webOrigins ?? [dependencies.webOrigin];
    if (
      !allowedOrigins.includes(origin ?? "") ||
      !rawToken ||
      !secretsMatch(dependencies.hashCsrfToken(rawToken), context.csrfTokenHash)
    ) {
      next(
        new ApplicationError(
          "permission_denied",
          403,
          "Request origin could not be verified",
        ),
      );
      return;
    }
    next();
  };
}
