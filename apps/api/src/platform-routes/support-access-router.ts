import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { secretsMatch } from "@rms/building-blocks";
import { ApplicationError } from "@rms/modules";
import type {
  SupportAccessInput,
  TenantOwnerService,
} from "@rms/service-workflow";

const createSupportAccessSchema = z.object({
  businessAccountId: z.uuid(),
  approvalMode: z.literal("two_person"),
  approverId: z.uuid(),
  approvalReference: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(8).max(500),
  permissionKeys: z
    .array(z.enum(["restaurant.view", "branches.view"]))
    .min(1)
    .max(2)
    .refine((keys) => new Set(keys).size === keys.length, {
      message: "Support permissions must be unique.",
    }),
  restaurantIds: z.array(z.uuid()).max(100).default([]),
  branchIds: z.array(z.uuid()).max(500).default([]),
  expiresAt: z.iso.datetime(),
});

const revokeSupportAccessSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

const grantParametersSchema = z.object({ grantId: z.uuid() });
const tenantParametersSchema = z.object({ businessAccountId: z.uuid() });

export interface SupportAccessRouterDependencies {
  readonly supportAccessSecret: string;
  readonly useCases: Pick<
    TenantOwnerService,
    | "createSupportAccess"
    | "inspectTenantWithSupportAccess"
    | "revokeSupportAccess"
  >;
}

function metadata(request: Request) {
  const correlationId =
    typeof request.id === "string" ? request.id : randomUUID();
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

function requirePlatformOperator(
  request: Request,
  expectedSecret: string,
): string {
  if (!secretsMatch(request.get("x-support-secret") ?? "", expectedSecret)) {
    throw new ApplicationError("resource_not_found", 404, "Resource not found");
  }
  const operatorId = parse(z.uuid(), request.get("x-support-operator-id"));
  const authenticatedAt = parse(
    z.iso.datetime(),
    request.get("x-support-authenticated-at"),
  );
  const age = Date.now() - new Date(authenticatedAt).getTime();
  if (age < 0 || age > 15 * 60_000) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Recent platform authentication required",
    );
  }
  return operatorId;
}

export function createSupportAccessRouter(
  dependencies: SupportAccessRouterDependencies,
): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post(
    "/platform/support-access-grants",
    limiter,
    async (request, response) => {
      const operatorId = requirePlatformOperator(
        request,
        dependencies.supportAccessSecret,
      );
      const input = parse(createSupportAccessSchema, request.body);
      const command: SupportAccessInput = {
        businessAccountId: input.businessAccountId,
        operatorId,
        approverId: input.approverId,
        approvalReference: input.approvalReference,
        reason: input.reason,
        permissionKeys: input.permissionKeys,
        restaurantIds: input.restaurantIds,
        branchIds: input.branchIds,
        expiresAtUtc: new Date(input.expiresAt),
      };
      const grant = await dependencies.useCases.createSupportAccess(
        command,
        metadata(request),
      );
      response.status(201).send({
        grantId: grant.grantId,
        accessToken: grant.accessToken,
        expiresAt: grant.expiresAtUtc.toISOString(),
      });
    },
  );

  router.delete(
    "/platform/support-access-grants/:grantId",
    limiter,
    async (request, response) => {
      const operatorId = requirePlatformOperator(
        request,
        dependencies.supportAccessSecret,
      );
      const parameters = parse(grantParametersSchema, request.params);
      const input = parse(revokeSupportAccessSchema, request.body);
      await dependencies.useCases.revokeSupportAccess(
        parameters.grantId,
        operatorId,
        input.reason,
        metadata(request),
      );
      response.status(204).send();
    },
  );

  router.get(
    "/platform/support-access/tenants/:businessAccountId",
    limiter,
    async (request, response) => {
      const parameters = parse(tenantParametersSchema, request.params);
      const authorization = request.get("authorization") ?? "";
      const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
      if (!match?.[1]) {
        throw new ApplicationError(
          "authentication_required",
          401,
          "Valid support access required",
        );
      }
      response.send(
        await dependencies.useCases.inspectTenantWithSupportAccess(
          match[1],
          parameters.businessAccountId,
          metadata(request),
        ),
      );
    },
  );

  return router;
}
