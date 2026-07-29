import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  createCsrfProtection,
  requireStaffSession,
  type SessionMiddlewareDependencies,
  type StaffRequest,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type { KitchenWorkItemRecord } from "../domain/models.js";
import {
  expectedVersionSchema,
  idempotencyKeySchema,
  kitchenActionSchema,
  kitchenQueueQuerySchema,
  kitchenWorkItemParametersSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface KitchenQueueItemView extends KitchenWorkItemRecord {
  readonly orderVersion: number;
  readonly orderFulfilment: "not_started" | "preparing" | "ready" | "served";
  readonly orderSubmittedAtUtc: Date;
}

export interface KitchenHttpUseCases {
  getKitchenQueue(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly KitchenQueueItemView[]>;
  startKitchenWorkItem(
    context: StaffRequestContext,
    workItemId: string,
    expectedVersion: number,
    effectiveEmployeeId: string | undefined,
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<KitchenWorkItemRecord>;
  markKitchenWorkItemReady(
    context: StaffRequestContext,
    workItemId: string,
    expectedVersion: number,
    effectiveEmployeeId: string | undefined,
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<KitchenWorkItemRecord>;
}

export interface KitchenRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: KitchenHttpUseCases;
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

function staffContext(request: Request): StaffRequestContext {
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

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

export function presentKitchenWorkItem(
  item: KitchenWorkItemRecord,
  queueContext?: {
    readonly orderVersion: number;
    readonly orderFulfilment: KitchenQueueItemView["orderFulfilment"];
    readonly orderSubmittedAtUtc: Date;
  },
): object {
  return {
    id: item.id,
    version: item.version,
    orderId: item.orderId,
    orderReference: item.orderReference,
    ...(queueContext
      ? {
          orderVersion: queueContext.orderVersion,
          orderFulfilment: queueContext.orderFulfilment,
          orderSubmittedAt: queueContext.orderSubmittedAtUtc.toISOString(),
        }
      : {}),
    tableId: item.tableId,
    tableCode: item.tableCode,
    itemName: item.itemName,
    quantity: item.quantity,
    selectedOptions: item.selectedOptions.map((option) => ({
      groupId: option.optionGroupId,
      groupName: option.optionGroupName,
      optionId: option.optionId,
      optionName: option.optionName,
    })),
    note: item.note ?? null,
    changeKind: item.changeKind,
    correctionId: item.correctionId ?? null,
    state: item.state,
    queuedAt: item.queuedAtUtc.toISOString(),
    startedAt: item.startedAtUtc?.toISOString() ?? null,
    startedByEmployeeId: item.startedByEmployeeId ?? null,
    readyAt: item.readyAtUtc?.toISOString() ?? null,
    readyByEmployeeId: item.readyByEmployeeId ?? null,
  };
}

export function createKitchenRouter(
  dependencies: KitchenRouterDependencies,
): Router {
  const router = Router();
  const csrf = createCsrfProtection(dependencies);
  const commandLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.get(
    "/staff/kitchen/queue",
    requireStaffSession(),
    async (request, response) => {
      const query = parse(kitchenQueueQuerySchema, request.query);
      const items = await dependencies.useCases.getKitchenQueue(
        staffContext(request),
        query.branchId,
      );
      response.send(
        items.map((item) =>
          presentKitchenWorkItem(item, {
            orderVersion: item.orderVersion,
            orderFulfilment: item.orderFulfilment,
            orderSubmittedAtUtc: item.orderSubmittedAtUtc,
          }),
        ),
      );
    },
  );

  const command = (action: "start" | "ready") => {
    router.post(
      `/staff/kitchen/items/:workItemId/${action}`,
      commandLimiter,
      requireStaffSession(),
      csrf,
      async (request, response) => {
        const parameters = parse(
          kitchenWorkItemParametersSchema,
          request.params,
        );
        const input = parse(kitchenActionSchema, request.body ?? {});
        const expectedVersion = parse(
          expectedVersionSchema,
          request.get("if-match"),
        );
        const idempotencyKey = parse(
          idempotencyKeySchema,
          request.get("idempotency-key"),
        );
        const item =
          action === "start"
            ? await dependencies.useCases.startKitchenWorkItem(
                staffContext(request),
                parameters.workItemId,
                expectedVersion,
                input.effectiveEmployeeId,
                idempotencyKey,
                metadata(request),
              )
            : await dependencies.useCases.markKitchenWorkItemReady(
                staffContext(request),
                parameters.workItemId,
                expectedVersion,
                input.effectiveEmployeeId,
                idempotencyKey,
                metadata(request),
              );
        response.send(presentKitchenWorkItem(item));
      },
    );
  };

  command("start");
  command("ready");

  return router;
}
