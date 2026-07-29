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
import {
  createGuestCsrfProtection,
  requireGuestSession,
  type GuestRequest,
  type GuestRequestContext,
  type GuestSessionMiddlewareDependencies,
} from "./guest-session-middleware.js";
import type {
  BillRequestRecord,
  CancellationRequestRecord,
  OrderRecord,
} from "../domain/models.js";
import {
  cancellationRequestSchema,
  cancelOrderSchema,
  completeOrderSchema,
  correctOrderSchema,
  createStaffOrderSchema,
  expectedVersionSchema,
  idempotencyKeySchema,
  listStaffOrdersSchema,
  moveOrderTableSchema,
  orderParametersSchema,
  servingActionSchema,
  submitOrderSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface OrderingHttpUseCases {
  submitGuestOrder(
    context: GuestRequestContext,
    input: {
      readonly menuVersion: number;
      readonly customerName?: string | undefined;
      readonly items: readonly {
        readonly dishId: string;
        readonly quantity: number;
        readonly optionIds: readonly string[];
        readonly note?: string | undefined;
      }[];
    },
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<OrderRecord>;
  createStaffOrder(
    context: StaffRequestContext,
    tableId: string,
    input: {
      readonly menuVersion: number;
      readonly customerName?: string | undefined;
      readonly items: readonly {
        readonly dishId: string;
        readonly quantity: number;
        readonly optionIds: readonly string[];
        readonly note?: string | undefined;
      }[];
    },
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<OrderRecord>;
  getGuestOrder(
    context: GuestRequestContext,
    orderId: string,
  ): Promise<OrderRecord>;
  requestGuestCancellation(
    context: GuestRequestContext,
    orderId: string,
    reason: string,
    idempotencyKey: string,
    metadata: RequestMetadata,
  ): Promise<CancellationRequestRecord>;
  listStaffOrders(
    context: StaffRequestContext,
    input: {
      readonly branchId: string;
      readonly approval?: OrderRecord["approval"] | undefined;
      readonly fulfilment?: OrderRecord["fulfilment"] | undefined;
      readonly closure?: OrderRecord["closure"] | undefined;
      readonly tableId?: string | undefined;
      readonly createdByEmployeeId?: string | undefined;
      readonly submittedFromUtc?: Date | undefined;
      readonly submittedToUtc?: Date | undefined;
      readonly cursor?: string | undefined;
      readonly pageSize: number;
    },
  ): Promise<{
    readonly items: readonly OrderRecord[];
    readonly nextCursor?: string | undefined;
  }>;
}

export interface OrderingRouterDependencies
  extends SessionMiddlewareDependencies, GuestSessionMiddlewareDependencies {
  readonly useCases: OrderingHttpUseCases;
  readonly servingUseCases: {
    markOrderServed(
      context: StaffRequestContext,
      orderId: string,
      expectedVersion: number,
      effectiveEmployeeId: string | undefined,
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<OrderRecord>;
  };
  readonly paymentCompletionUseCases: {
    requestGuestBill(
      context: GuestRequestContext,
      orderId: string,
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<BillRequestRecord>;
    correctOrder(
      context: StaffRequestContext,
      orderId: string,
      expectedVersion: number,
      input: {
        readonly menuVersion: number;
        readonly items: readonly {
          readonly dishId: string;
          readonly quantity: number;
          readonly optionIds: readonly string[];
          readonly note?: string | undefined;
        }[];
        readonly reason: string;
        readonly effectiveEmployeeId?: string | undefined;
      },
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<OrderRecord>;
    cancelOrder(
      context: StaffRequestContext,
      orderId: string,
      expectedVersion: number,
      input: {
        readonly reason: string;
        readonly effectiveEmployeeId?: string | undefined;
      },
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<OrderRecord>;
    completeOrder(
      context: StaffRequestContext,
      orderId: string,
      expectedVersion: number,
      input: {
        readonly unpaidOverrideReason?: string | undefined;
        readonly confirmUnpaidOverride?: boolean | undefined;
        readonly effectiveEmployeeId?: string | undefined;
      },
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<OrderRecord>;
    moveOrderTable(
      context: StaffRequestContext,
      orderId: string,
      input: {
        readonly destinationTableId: string;
        readonly expectedTableSessionVersion: number;
        readonly effectiveEmployeeId?: string | undefined;
      },
      idempotencyKey: string,
      metadata: RequestMetadata,
    ): Promise<OrderRecord>;
  };
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

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

function guestContext(request: Request): GuestRequestContext {
  const context = (request as GuestRequest).guestContext;
  if (!context) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return context;
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

export function presentOrder(order: OrderRecord): object {
  return {
    id: order.id,
    reference: order.reference,
    version: order.version,
    branchId: order.branchId,
    tableSessionId: order.tableSessionId,
    tableSessionVersion: order.tableSessionVersion,
    tableId: order.tableId,
    tableCode: order.tableCode,
    creatorType: order.creatorType,
    createdByEmployeeId: order.createdByEmployeeId ?? null,
    customerName: order.customerDisplayName ?? null,
    approval: order.approval,
    fulfilment: order.fulfilment,
    financial: order.financial,
    closure: order.closure,
    customerSafeStatusReason: order.customerSafeStatusReason ?? null,
    total: order.total,
    submittedAt: order.submittedAtUtc.toISOString(),
    acceptedAt: order.acceptedAtUtc.toISOString(),
    preparingAt: order.preparingAtUtc?.toISOString() ?? null,
    readyAt: order.readyAtUtc?.toISOString() ?? null,
    servedAt: order.servedAtUtc?.toISOString() ?? null,
    servedByEmployeeId: order.servedByEmployeeId ?? null,
    cancellationRequested: order.cancellationRequested,
    currentItemRevision: order.currentItemRevision,
    billRequest: order.billRequest
      ? {
          id: order.billRequest.id,
          status: order.billRequest.status,
          requestedAt: order.billRequest.requestedAtUtc.toISOString(),
        }
      : null,
    completedAt: order.completedAtUtc?.toISOString() ?? null,
    completedByEmployeeId: order.completedByEmployeeId ?? null,
    unpaidCompletionReason: order.unpaidCompletionReason ?? null,
    cancelledAt: order.cancelledAtUtc?.toISOString() ?? null,
    cancelledByEmployeeId: order.cancelledByEmployeeId ?? null,
    cancellationReason: order.cancellationReason ?? null,
    corrections: order.corrections.map((correction) => ({
      id: correction.id,
      revision: correction.revision,
      reason: correction.reason,
      beforeTotal: correction.beforeTotal,
      afterTotal: correction.afterTotal,
      correctedAt: correction.correctedAtUtc.toISOString(),
      correctedByEmployeeId: correction.correctedByEmployeeId,
    })),
    items: order.items.map((item) => ({
      id: item.id,
      revision: item.revision,
      dishId: item.sourceDishId,
      menuVersion: String(item.sourceMenuVersion),
      name: item.name,
      quantity: item.quantity,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      selectedOptions: item.selectedOptions.map((option) => ({
        groupId: option.optionGroupId,
        groupName: option.optionGroupName,
        optionId: option.optionId,
        optionName: option.optionName,
        priceDelta: option.priceDelta,
      })),
      note: item.note ?? null,
      taxInclusive: item.taxInclusive,
      total: item.total,
    })),
  };
}

export function createOrderingRouter(
  dependencies: OrderingRouterDependencies,
): Router {
  const router = Router();
  const guestCsrf = createGuestCsrfProtection(dependencies);
  const staffCsrf = createCsrfProtection(dependencies);
  const commandLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post(
    "/public/orders",
    commandLimiter,
    requireGuestSession(),
    guestCsrf,
    async (request, response) => {
      const input = parse(submitOrderSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const order = await dependencies.useCases.submitGuestOrder(
        guestContext(request),
        {
          ...input,
          customerName: input.customerName ?? undefined,
          items: input.items.map((item) => ({
            ...item,
            note: item.note ?? undefined,
          })),
        },
        idempotencyKey,
        metadata(request),
      );
      response.status(201).send(presentOrder(order));
    },
  );

  router.get(
    "/public/orders/:orderId",
    requireGuestSession(),
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      response.send(
        presentOrder(
          await dependencies.useCases.getGuestOrder(
            guestContext(request),
            parameters.orderId,
          ),
        ),
      );
    },
  );

  router.post(
    "/public/orders/:orderId/cancellation-requests",
    commandLimiter,
    requireGuestSession(),
    guestCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(cancellationRequestSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const cancellation = await dependencies.useCases.requestGuestCancellation(
        guestContext(request),
        parameters.orderId,
        input.reason,
        idempotencyKey,
        metadata(request),
      );
      response.status(202).send({
        id: cancellation.id,
        orderId: cancellation.orderId,
        status: cancellation.status,
        reason: cancellation.reason,
        createdAt: cancellation.createdAtUtc.toISOString(),
      });
    },
  );

  router.post(
    "/public/orders/:orderId/bill-requests",
    commandLimiter,
    requireGuestSession(),
    guestCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const bill =
        await dependencies.paymentCompletionUseCases.requestGuestBill(
          guestContext(request),
          parameters.orderId,
          idempotencyKey,
          metadata(request),
        );
      response.status(202).send({
        id: bill.id,
        orderId: bill.orderId,
        status: bill.status,
        requestedAt: bill.requestedAtUtc.toISOString(),
      });
    },
  );

  router.get(
    "/staff/orders",
    requireStaffSession(),
    async (request, response) => {
      const query = parse(listStaffOrdersSchema, request.query);
      const page = await dependencies.useCases.listStaffOrders(
        staffContext(request),
        {
          branchId: query.branchId,
          ...(query.approval ? { approval: query.approval } : {}),
          ...(query.fulfilment ? { fulfilment: query.fulfilment } : {}),
          closure: query.closure,
          ...(query.tableId ? { tableId: query.tableId } : {}),
          ...(query.createdByEmployeeId
            ? { createdByEmployeeId: query.createdByEmployeeId }
            : {}),
          ...(query.submittedFrom
            ? { submittedFromUtc: query.submittedFrom }
            : {}),
          ...(query.submittedTo ? { submittedToUtc: query.submittedTo } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          pageSize: query.pageSize,
        },
      );
      response.send({
        items: page.items.map(presentOrder),
        nextCursor: page.nextCursor ?? null,
      });
    },
  );

  router.post(
    "/staff/orders",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const input = parse(createStaffOrderSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      const order = await dependencies.useCases.createStaffOrder(
        staffContext(request),
        input.tableId,
        {
          menuVersion: input.menuVersion,
          customerName: input.customerName ?? undefined,
          items: input.items.map((item) => ({
            ...item,
            note: item.note ?? undefined,
          })),
        },
        idempotencyKey,
        metadata(request),
      );
      response.status(201).send(presentOrder(order));
    },
  );

  router.post(
    "/staff/orders/:orderId/served",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(servingActionSchema, request.body ?? {});
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      response.send(
        presentOrder(
          await dependencies.servingUseCases.markOrderServed(
            staffContext(request),
            parameters.orderId,
            expectedVersion,
            input.effectiveEmployeeId,
            idempotencyKey,
            metadata(request),
          ),
        ),
      );
    },
  );

  router.post(
    "/staff/orders/:orderId/corrections",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(correctOrderSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      response.send(
        presentOrder(
          await dependencies.paymentCompletionUseCases.correctOrder(
            staffContext(request),
            parameters.orderId,
            expectedVersion,
            {
              ...input,
              items: input.items.map((item) => ({
                ...item,
                note: item.note ?? undefined,
              })),
            },
            idempotencyKey,
            metadata(request),
          ),
        ),
      );
    },
  );

  router.post(
    "/staff/orders/:orderId/cancellation",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(cancelOrderSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      response.send(
        presentOrder(
          await dependencies.paymentCompletionUseCases.cancelOrder(
            staffContext(request),
            parameters.orderId,
            expectedVersion,
            input,
            idempotencyKey,
            metadata(request),
          ),
        ),
      );
    },
  );

  router.post(
    "/staff/orders/:orderId/completion",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(completeOrderSchema, request.body ?? {});
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      response.send(
        presentOrder(
          await dependencies.paymentCompletionUseCases.completeOrder(
            staffContext(request),
            parameters.orderId,
            expectedVersion,
            input,
            idempotencyKey,
            metadata(request),
          ),
        ),
      );
    },
  );

  router.post(
    "/staff/orders/:orderId/table-assignment",
    commandLimiter,
    requireStaffSession(),
    staffCsrf,
    async (request, response) => {
      const parameters = parse(orderParametersSchema, request.params);
      const input = parse(moveOrderTableSchema, request.body);
      const idempotencyKey = parse(
        idempotencyKeySchema,
        request.get("idempotency-key"),
      );
      response.send(
        presentOrder(
          await dependencies.paymentCompletionUseCases.moveOrderTable(
            staffContext(request),
            parameters.orderId,
            input,
            idempotencyKey,
            metadata(request),
          ),
        ),
      );
    },
  );

  return router;
}
