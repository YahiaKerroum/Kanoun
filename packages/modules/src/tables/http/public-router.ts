import { randomUUID } from "node:crypto";
import { Router, type CookieOptions, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ApplicationError } from "../../shared/application-error.js";
import { guestSessionCookieName } from "../../ordering/index.js";
import { qrTokenParametersSchema } from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface ExchangeQrResult {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly branchId: string;
  readonly tableId?: string | undefined;
  readonly tableCode?: string | undefined;
  readonly expiresAtUtc: Date;
}

export interface PublicTablesHttpUseCases {
  exchangeTableQr(
    qrToken: string,
    metadata: RequestMetadata,
  ): Promise<ExchangeQrResult>;
}

export interface PublicTablesRouterDependencies {
  readonly useCases: PublicTablesHttpUseCases;
  readonly secureCookies: boolean;
}

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

function parse<Input>(schema: z.ZodType<Input>, value: unknown): Input {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(
      "validation_error",
      422,
      "Request validation failed",
      z.prettifyError(result.error),
    );
  }
  return result.data;
}

function guestCookieOptions(secure: boolean, maxAge: number): CookieOptions {
  return {
    secure,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

export function createPublicTablesRouter(
  dependencies: PublicTablesRouterDependencies,
): Router {
  const router = Router();
  const exchangeLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post(
    "/public/qr/:qrToken/session",
    exchangeLimiter,
    async (request, response) => {
      const parameters = parse(qrTokenParametersSchema, request.params);
      const result = await dependencies.useCases.exchangeTableQr(
        parameters.qrToken,
        metadata(request),
      );
      const maxAge = result.expiresAtUtc.getTime() - Date.now();
      response.cookie(
        guestSessionCookieName,
        result.sessionToken,
        guestCookieOptions(dependencies.secureCookies, maxAge),
      );
      response.status(201).send({
        branchId: result.branchId,
        tableId: result.tableId ?? null,
        tableCode: result.tableCode ?? null,
        expiresAt: result.expiresAtUtc.toISOString(),
        csrfToken: result.csrfToken,
      });
    },
  );

  return router;
}
