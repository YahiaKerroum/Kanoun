import { Router, type Request } from "express";
import { z } from "zod";
import {
  requireStaffSession,
  type SessionMiddlewareDependencies,
  type StaffRequest,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  AuditQueryService,
  AuditSearchInput,
} from "../application/audit-query-service.js";
import { auditSearchSchema } from "./schemas.js";

export interface AuditRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: Pick<AuditQueryService, "search">;
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

function context(request: Request): StaffRequestContext {
  const value = (request as StaffRequest).staffContext;
  if (!value) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return value;
}

const sensitiveKey = /password|token|secret|credential|hash/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(item),
      ]),
    );
  }
  return value;
}

export function createAuditRouter(
  dependencies: AuditRouterDependencies,
): Router {
  const router = Router();
  router.get(
    "/staff/audit-events",
    requireStaffSession(),
    async (request, response) => {
      const input = parse(auditSearchSchema, request.query) as AuditSearchInput;
      const result = await dependencies.useCases.search(
        context(request),
        input,
      );
      response.send({
        ...result,
        items: result.items.map((item) => ({
          id: item.id,
          restaurantId: item.restaurantId ?? null,
          branchId: item.branchId ?? null,
          actorUserId: item.actorUserId ?? null,
          action: item.action,
          targetType: item.targetType,
          targetId: item.targetId,
          outcome: item.outcome,
          reason: item.reason ?? null,
          correlationId: item.correlationId,
          before: redact(item.beforeData ?? null),
          after: redact(item.afterData ?? null),
          occurredAt: item.occurredAtUtc.toISOString(),
        })),
      });
    },
  );
  return router;
}
