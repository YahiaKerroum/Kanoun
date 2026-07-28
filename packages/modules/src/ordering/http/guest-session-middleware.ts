import type { Request, RequestHandler } from "express";
import { secretsMatch } from "@rms/building-blocks";
import { ApplicationError } from "../../shared/application-error.js";

export const guestSessionCookieName = "rms_guest_session";

export interface GuestRequestContext {
  readonly guestSessionId: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly expiresAtUtc: Date;
  readonly csrfTokenHash: string;
}

export interface GuestRequest extends Request {
  guestContext?: GuestRequestContext;
}

function readCookie(
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

export interface GuestSessionMiddlewareDependencies {
  readonly authenticateGuestSession: (
    rawSessionToken: string,
  ) => Promise<GuestRequestContext | undefined>;
  readonly hashCsrfToken: (rawToken: string) => string;
  readonly guestWebOrigin: string;
}

export function createGuestCsrfProtection(
  dependencies: GuestSessionMiddlewareDependencies,
): RequestHandler {
  return (request, _response, next) => {
    const context = (request as GuestRequest).guestContext;
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
    if (
      origin !== dependencies.guestWebOrigin ||
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

export function createGuestSessionMiddleware(
  dependencies: GuestSessionMiddlewareDependencies,
): RequestHandler {
  return async (request, _response, next) => {
    const sessionToken = readCookie(
      request.headers.cookie,
      guestSessionCookieName,
    );
    if (!sessionToken) {
      next();
      return;
    }
    const context = await dependencies.authenticateGuestSession(sessionToken);
    if (context) {
      (request as GuestRequest).guestContext = context;
    }
    next();
  };
}

export function requireGuestSession(): RequestHandler {
  return (request, _response, next) => {
    if (!(request as GuestRequest).guestContext) {
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
