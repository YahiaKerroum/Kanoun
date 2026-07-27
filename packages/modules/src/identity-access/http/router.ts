import { randomUUID } from "node:crypto";
import { Router, type CookieOptions, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ApplicationError } from "../../shared/application-error.js";
import type { StaffRequestContext } from "../domain/session-context.js";
import {
  administratorChangeSchema,
  administratorTransferSchema,
  branchSwitchSchema,
  employeeDeactivationSchema,
  employeeIdParametersSchema,
  invitationAcceptanceSchema,
  loginSchema,
  recoveryCompletionSchema,
  recoveryRequestSchema,
} from "./schemas.js";
import {
  createCsrfProtection,
  csrfCookieName,
  requireStaffSession,
  staffSessionCookieName,
  type SessionMiddlewareDependencies,
  type StaffRequest,
} from "./session-middleware.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

interface LoginResult {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly context: StaffRequestContext;
}

export interface IdentityHttpUseCases {
  login(
    input: z.infer<typeof loginSchema>,
    metadata: RequestMetadata,
  ): Promise<LoginResult>;
  logout(
    context: StaffRequestContext,
    metadata: RequestMetadata,
  ): Promise<void>;
  switchBranch(context: StaffRequestContext, branchId: string): Promise<void>;
  inviteStaff(
    context: StaffRequestContext,
    employeeId: string,
    metadata: RequestMetadata,
  ): Promise<{ readonly invitationToken: string; readonly expiresAtUtc: Date }>;
  acceptInvitation(
    token: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<void>;
  requestRecovery(
    input: z.infer<typeof recoveryRequestSchema>,
    metadata: RequestMetadata,
  ): Promise<void>;
  completeRecovery(
    token: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<void>;
  removeAdministrator(
    context: StaffRequestContext,
    employeeId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void>;
  transferAdministrator(
    context: StaffRequestContext,
    replacementEmployeeId: string,
    removeCurrentAdministrator: boolean,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void>;
  deactivateEmployee(
    context: StaffRequestContext,
    employeeId: string,
    expectedVersion: number,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void>;
}

export interface IdentityRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: IdentityHttpUseCases;
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

function requireContext(request: Request): StaffRequestContext {
  const context = (request as StaffRequest).staffContext;
  if (!context) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return context;
}

function cookieOptions(
  secure: boolean,
  httpOnly: boolean,
  maxAge: number,
): CookieOptions {
  return {
    secure,
    httpOnly,
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

export function createIdentityAccessRouter(
  dependencies: IdentityRouterDependencies,
): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const recoveryLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const requireCsrf = createCsrfProtection(dependencies);

  router.post("/auth/login", loginLimiter, async (request, response) => {
    const input = parse(loginSchema, request.body);
    const result = await dependencies.useCases.login(input, metadata(request));
    const maxAge = result.context.expiresAtUtc.getTime() - Date.now();
    response.cookie(
      staffSessionCookieName,
      result.sessionToken,
      cookieOptions(dependencies.secureCookies, true, maxAge),
    );
    response.cookie(
      csrfCookieName,
      result.csrfToken,
      cookieOptions(dependencies.secureCookies, false, maxAge),
    );
    response.status(201).send({
      employeeId: result.context.employeeId,
      activeBranchId: result.context.activeBranchId ?? null,
      expiresAt: result.context.expiresAtUtc.toISOString(),
    });
  });

  router.get("/auth/session", requireStaffSession(), (request, response) => {
    const context = requireContext(request);
    response.send({
      employeeId: context.employeeId,
      activeBranchId: context.activeBranchId ?? null,
      authorizedBranchIds: context.authorizedBranchIds,
      expiresAt: context.expiresAtUtc.toISOString(),
    });
  });

  router.post(
    "/auth/logout",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      await dependencies.useCases.logout(
        requireContext(request),
        metadata(request),
      );
      response.clearCookie(
        staffSessionCookieName,
        cookieOptions(dependencies.secureCookies, true, 0),
      );
      response.clearCookie(
        csrfCookieName,
        cookieOptions(dependencies.secureCookies, false, 0),
      );
      response.status(204).send();
    },
  );

  router.post(
    "/auth/recovery-requests",
    recoveryLimiter,
    async (request, response) => {
      const input = parse(recoveryRequestSchema, request.body);
      await dependencies.useCases.requestRecovery(input, metadata(request));
      response.status(202).send({
        status: "accepted",
        message:
          "If the account is eligible, recovery instructions will be delivered.",
      });
    },
  );

  router.post(
    "/auth/recovery-completions",
    recoveryLimiter,
    async (request, response) => {
      const input = parse(recoveryCompletionSchema, request.body);
      await dependencies.useCases.completeRecovery(
        input.token,
        input.password,
        metadata(request),
      );
      response.status(204).send();
    },
  );

  router.post("/invitations/accept", async (request, response) => {
    const input = parse(invitationAcceptanceSchema, request.body);
    await dependencies.useCases.acceptInvitation(
      input.token,
      input.password,
      metadata(request),
    );
    response.status(204).send();
  });

  router.post(
    "/staff/session/branch",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      const input = parse(branchSwitchSchema, request.body);
      await dependencies.useCases.switchBranch(
        requireContext(request),
        input.branchId,
      );
      response.send({ activeBranchId: input.branchId });
    },
  );

  router.post(
    "/staff/employees/:employeeId/invitations",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      const parameters = parse(employeeIdParametersSchema, request.params);
      const invitation = await dependencies.useCases.inviteStaff(
        requireContext(request),
        parameters.employeeId,
        metadata(request),
      );
      response.status(201).send({
        invitationToken: invitation.invitationToken,
        expiresAt: invitation.expiresAtUtc.toISOString(),
      });
    },
  );

  router.post(
    "/staff/administrators/:employeeId/removal",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      const parameters = parse(employeeIdParametersSchema, request.params);
      const input = parse(administratorChangeSchema, request.body);
      await dependencies.useCases.removeAdministrator(
        requireContext(request),
        parameters.employeeId,
        input.reason,
        metadata(request),
      );
      response.status(204).send();
    },
  );

  router.post(
    "/staff/administrators/transfer",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      const input = parse(administratorTransferSchema, request.body);
      await dependencies.useCases.transferAdministrator(
        requireContext(request),
        input.replacementEmployeeId,
        input.removeCurrentAdministrator,
        input.reason,
        metadata(request),
      );
      response.status(204).send();
    },
  );

  router.post(
    "/staff/employees/:employeeId/deactivation",
    requireStaffSession(),
    requireCsrf,
    async (request, response) => {
      const parameters = parse(employeeIdParametersSchema, request.params);
      const input = parse(employeeDeactivationSchema, request.body);
      await dependencies.useCases.deactivateEmployee(
        requireContext(request),
        parameters.employeeId,
        input.expectedVersion,
        input.reason,
        metadata(request),
      );
      response.status(204).send();
    },
  );

  return router;
}
