import { createHash, randomUUID } from "node:crypto";
import {
  appendOutboxMessage,
  beginIdempotentCommand,
  completeIdempotentCommand,
  hashOpaqueToken,
  type DatabasePool,
  type TransactionContext,
} from "@rms/building-blocks";
import {
  ApplicationError,
  hasPermission,
  isGuestSessionValid,
  type AuditWriter,
  type CancellationRequestRecord,
  type GuestRequestContext,
  type KitchenStore,
  type MenuStore,
  type OrderApprovalState,
  type OrderClosureState,
  type OrderFulfilmentState,
  type OrderItemSelection,
  type OrderingStore,
  type OrderRecord,
  type RestaurantConfigurationStore,
  type StaffRequestContext,
  type TablesStore,
  type TableSession,
} from "@rms/modules";
import type { PostgresServiceWorkflow } from "./postgres-service-workflow.js";

const idempotencyRetentionMs = 24 * 60 * 60 * 1000;

export interface OrderRequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
  readonly now?: Date;
}

export interface SubmitOrderInput {
  readonly menuVersion: number;
  readonly customerName?: string | undefined;
  readonly items: readonly OrderItemSelection[];
}

export interface StaffOrderListInput {
  readonly branchId: string;
  readonly approval?: OrderApprovalState | undefined;
  readonly fulfilment?: OrderFulfilmentState | undefined;
  readonly closure?: OrderClosureState | undefined;
  readonly tableId?: string | undefined;
  readonly createdByEmployeeId?: string | undefined;
  readonly submittedFromUtc?: Date | undefined;
  readonly submittedToUtc?: Date | undefined;
  readonly cursor?: string | undefined;
  readonly pageSize: number;
}

export interface StaffOrderPage {
  readonly items: readonly OrderRecord[];
  readonly nextCursor?: string | undefined;
}

export interface OrderSubmissionServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly menu: MenuStore;
  readonly tables: TablesStore;
  readonly ordering: OrderingStore;
  readonly kitchen: KitchenStore;
  readonly audit: AuditWriter;
  readonly idempotencySecret: string;
}

interface SubmissionActorScope {
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly actorScope: string;
}

type SubmissionActor = SubmissionActorScope &
  (
    | {
        readonly kind: "guest";
        readonly guestSessionId: string;
        readonly userId?: undefined;
        readonly employeeId?: undefined;
      }
    | {
        readonly kind: "staff";
        readonly guestSessionId?: undefined;
        readonly userId: string;
        readonly employeeId: string;
      }
  );

function nowFrom(metadata: OrderRequestMetadata): Date {
  return metadata.now ?? new Date();
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedSubmission(input: SubmitOrderInput): unknown {
  return {
    menuVersion: input.menuVersion,
    customerName: input.customerName ?? null,
    items: input.items.map((item) => ({
      dishId: item.dishId,
      quantity: item.quantity,
      optionIds: [...item.optionIds].sort(),
      note: item.note ?? null,
    })),
  };
}

function replayedOrderId(responseBody: unknown): string | undefined {
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "orderId" in responseBody &&
    typeof responseBody.orderId === "string"
  ) {
    return responseBody.orderId;
  }
  return undefined;
}

function requireEnabled(
  values: Readonly<Record<string, string>>,
  featureId: string,
  featureName: string,
): void {
  const state = values[featureId];
  if (state === "disabled" || state === "unavailable") {
    throw new ApplicationError(
      "invalid_state_transition",
      409,
      `${featureName} is disabled`,
      `New orders cannot be submitted while ${featureName.toLowerCase()} is disabled.`,
    );
  }
}

function decodeCursor(
  cursor: string | undefined,
): { readonly submittedAtUtc: Date; readonly orderId: string } | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("submittedAtUtc" in parsed) ||
      typeof parsed.submittedAtUtc !== "string" ||
      !("orderId" in parsed) ||
      typeof parsed.orderId !== "string"
    ) {
      throw new Error("invalid");
    }
    const submittedAtUtc = new Date(parsed.submittedAtUtc);
    if (Number.isNaN(submittedAtUtc.getTime())) {
      throw new Error("invalid");
    }
    return { submittedAtUtc, orderId: parsed.orderId };
  } catch {
    throw new ApplicationError(
      "validation_error",
      422,
      "Request validation failed",
      "The order cursor is invalid or expired.",
    );
  }
}

function encodeCursor(order: OrderRecord): string {
  return Buffer.from(
    JSON.stringify({
      submittedAtUtc: order.submittedAtUtc.toISOString(),
      orderId: order.id,
    }),
  ).toString("base64url");
}

export class OrderSubmissionService {
  public constructor(
    private readonly dependencies: OrderSubmissionServiceDependencies,
  ) {}

  public async submitGuestOrder(
    context: GuestRequestContext,
    input: SubmitOrderInput,
    idempotencyKey: string,
    metadata: OrderRequestMetadata,
  ): Promise<OrderRecord> {
    if (!context.tableId) {
      throw new ApplicationError(
        "table_unavailable",
        409,
        "A table-specific session is required",
        "Scan the QR code at your table before submitting an order.",
      );
    }
    const actor: SubmissionActor = {
      kind: "guest",
      businessAccountId: context.businessAccountId,
      restaurantId: context.restaurantId,
      branchId: context.branchId,
      tableId: context.tableId,
      actorScope: `guest:${context.guestSessionId}`,
      guestSessionId: context.guestSessionId,
    };
    return this.submitOrder(actor, input, idempotencyKey, metadata);
  }

  public async createStaffOrder(
    context: StaffRequestContext,
    tableId: string,
    input: SubmitOrderInput,
    idempotencyKey: string,
    metadata: OrderRequestMetadata,
  ): Promise<OrderRecord> {
    const branchId = context.activeBranchId;
    if (!branchId || !context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (
      !branch ||
      !hasPermission(context, "orders.create", branch.restaurantId, branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const actor: SubmissionActor = {
      kind: "staff",
      businessAccountId: context.businessAccountId,
      restaurantId: branch.restaurantId,
      branchId,
      tableId,
      actorScope: `staff:${context.sessionId}`,
      userId: context.userId,
      employeeId: context.employeeId,
    };
    return this.submitOrder(actor, input, idempotencyKey, metadata);
  }

  public async getGuestOrder(
    context: GuestRequestContext,
    orderId: string,
  ): Promise<OrderRecord> {
    const order = await this.dependencies.ordering.getGuestOrder(
      this.dependencies.databasePool,
      context.businessAccountId,
      context.guestSessionId,
      orderId,
    );
    if (!order) {
      throw new ApplicationError("resource_not_found", 404, "Order not found");
    }
    return order;
  }

  public async listStaffOrders(
    context: StaffRequestContext,
    input: StaffOrderListInput,
  ): Promise<StaffOrderPage> {
    if (!context.authorizedBranchIds.includes(input.branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      input.branchId,
    );
    if (
      !branch ||
      !hasPermission(
        context,
        "orders.view",
        branch.restaurantId,
        input.branchId,
      )
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const cursor = decodeCursor(input.cursor);
    const items = await this.dependencies.ordering.listStaffOrders(
      this.dependencies.databasePool,
      {
        businessAccountId: context.businessAccountId,
        branchId: input.branchId,
        ...(input.approval ? { approval: input.approval } : {}),
        ...(input.fulfilment ? { fulfilment: input.fulfilment } : {}),
        ...(input.closure ? { closure: input.closure } : {}),
        ...(input.tableId ? { tableId: input.tableId } : {}),
        ...(input.createdByEmployeeId
          ? { createdByEmployeeId: input.createdByEmployeeId }
          : {}),
        ...(input.submittedFromUtc
          ? { submittedFromUtc: input.submittedFromUtc }
          : {}),
        ...(input.submittedToUtc
          ? { submittedToUtc: input.submittedToUtc }
          : {}),
        ...(cursor
          ? {
              beforeSubmittedAtUtc: cursor.submittedAtUtc,
              beforeOrderId: cursor.orderId,
            }
          : {}),
        pageSize: input.pageSize,
      },
    );
    const last = items.at(-1);
    return {
      items,
      ...(items.length === input.pageSize && last
        ? { nextCursor: encodeCursor(last) }
        : {}),
    };
  }

  public async requestGuestCancellation(
    context: GuestRequestContext,
    orderId: string,
    reason: string,
    idempotencyKey: string,
    metadata: OrderRequestMetadata,
  ): Promise<CancellationRequestRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.dependencies.ordering.getGuestOrder(
        transaction.sql,
        context.businessAccountId,
        context.guestSessionId,
        orderId,
      );
      if (!order) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Order not found",
        );
      }
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `guest:${context.guestSessionId}`,
        operation: "requestGuestOrderCancellation",
        idempotencyKey,
        requestHash: requestHash({ orderId, reason }),
        now,
      });
      if (idempotency.kind === "replay") {
        const requestId =
          typeof idempotency.responseBody === "object" &&
          idempotency.responseBody !== null &&
          "cancellationRequestId" in idempotency.responseBody &&
          typeof idempotency.responseBody.cancellationRequestId === "string"
            ? idempotency.responseBody.cancellationRequestId
            : undefined;
        if (requestId) {
          return {
            id: requestId,
            orderId,
            status: "open",
            reason,
            createdAtUtc: now,
          };
        }
        throw new ApplicationError(
          "service_unavailable",
          503,
          "The previous response could not be replayed",
        );
      }
      if (order.closure !== "active" || order.approval === "rejected") {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Cancellation cannot be requested",
          "This order is no longer active.",
        );
      }
      const cancellation =
        await this.dependencies.ordering.createCancellationRequest(
          transaction,
          {
            id: randomUUID(),
            businessAccountId: context.businessAccountId,
            branchId: order.branchId,
            orderId,
            customerSessionId: context.guestSessionId,
            reason,
            now,
          },
        );
      await this.dependencies.audit.appendInTransaction(transaction, {
        id: randomUUID(),
        businessAccountId: context.businessAccountId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        action: "ordering.cancellation_requested",
        targetType: "order",
        targetId: order.id,
        outcome: "succeeded",
        reason,
        correlationId: metadata.correlationId,
        afterData: { cancellationRequestId: cancellation.id, status: "open" },
        occurredAtUtc: now,
      });
      await appendOutboxMessage(transaction.sql, {
        eventId: randomUUID(),
        eventType: "ordering.cancellation_requested.v1",
        businessAccountId: context.businessAccountId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        aggregateId: order.id,
        aggregateVersion: order.version,
        occurredAtUtc: now,
        correlationId: metadata.correlationId,
        causationId: metadata.causationId,
        payload: {
          orderId: order.id,
          orderReference: order.reference,
          cancellationRequestId: cancellation.id,
        },
      });
      await completeIdempotentCommand(transaction, idempotency.recordId, 202, {
        cancellationRequestId: cancellation.id,
      });
      return cancellation;
    });
  }

  private async submitOrder(
    actor: SubmissionActor,
    input: SubmitOrderInput,
    idempotencyKey: string,
    metadata: OrderRequestMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      if (actor.kind === "guest") {
        const session = await this.dependencies.ordering.getGuestSession(
          transaction.sql,
          actor.businessAccountId,
          actor.guestSessionId,
        );
        if (
          !session ||
          !isGuestSessionValid(session, now) ||
          session.restaurantId !== actor.restaurantId ||
          session.branchId !== actor.branchId ||
          session.tableId !== actor.tableId
        ) {
          throw new ApplicationError(
            "authentication_required",
            401,
            "Authentication required",
          );
        }
      }

      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: actor.businessAccountId,
        actorScope: actor.actorScope,
        operation:
          actor.kind === "guest" ? "submitGuestOrder" : "createStaffOrder",
        idempotencyKey,
        requestHash: requestHash({
          tableId: actor.tableId,
          submission: normalizedSubmission(input),
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        const orderId = replayedOrderId(idempotency.responseBody);
        const order = orderId
          ? await this.dependencies.ordering.getOrder(
              transaction.sql,
              actor.businessAccountId,
              orderId,
            )
          : undefined;
        if (!order) {
          throw new ApplicationError(
            "service_unavailable",
            503,
            "The previous response could not be replayed",
          );
        }
        return order;
      }

      const branch = await this.dependencies.restaurantConfiguration.getBranch(
        transaction.sql,
        actor.businessAccountId,
        actor.branchId,
      );
      if (branch?.restaurantId !== actor.restaurantId) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Branch not found",
        );
      }
      const acceptsOrders =
        await this.dependencies.restaurantConfiguration.canBranchAcceptOrders(
          transaction.sql,
          actor.businessAccountId,
          actor.branchId,
          now,
        );
      if (!acceptsOrders) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "The branch is not accepting new orders",
          "Review the order and try again when the branch is open.",
        );
      }

      const restaurantConfiguration =
        await this.dependencies.restaurantConfiguration.getRestaurantFeatureConfiguration(
          transaction.sql,
          actor.businessAccountId,
          actor.restaurantId,
        );
      requireEnabled(restaurantConfiguration?.values ?? {}, "CFG-003", "Menu");
      const configuration =
        await this.dependencies.restaurantConfiguration.getFeatureConfiguration(
          transaction.sql,
          actor.businessAccountId,
          actor.branchId,
        );
      if (!configuration) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Branch configuration is unavailable",
        );
      }
      requireEnabled(configuration.values, "CFG-005", "Ordering");
      requireEnabled(configuration.values, "CFG-006", "Tables");
      requireEnabled(configuration.values, "CFG-007", "Kitchen");
      const acceptance = configuration.values["CFG-008"];
      if (acceptance !== undefined && acceptance !== "automatic") {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order acceptance strategy is unsupported",
        );
      }

      let tableSession: TableSession | undefined;
      let tableSessionOpened = false;
      if (actor.kind === "guest") {
        const session = await this.dependencies.ordering.getGuestSession(
          transaction.sql,
          actor.businessAccountId,
          actor.guestSessionId,
        );
        if (session?.tableSessionId) {
          tableSession = await this.dependencies.tables.getOpenTableSessionById(
            transaction.sql,
            actor.businessAccountId,
            session.tableSessionId,
          );
          if (
            tableSession?.branchId !== actor.branchId ||
            tableSession.tableId !== actor.tableId
          ) {
            throw new ApplicationError(
              "table_unavailable",
              409,
              "The table session is no longer open",
              "Scan the current QR code at the table to start a new session.",
            );
          }
        }
      }
      if (!tableSession) {
        const claim = await this.dependencies.tables.claimOrJoinTableSession(
          transaction,
          {
            id: randomUUID(),
            businessAccountId: actor.businessAccountId,
            branchId: actor.branchId,
            tableId: actor.tableId,
            configurationVersionId: configuration.id,
            configurationVersion: configuration.version,
            now,
          },
        );
        if (!claim) {
          throw new ApplicationError(
            "table_unavailable",
            409,
            "Table unavailable",
            "Choose an active table in this branch or ask a staff member for help.",
          );
        }
        tableSession = claim.session;
        tableSessionOpened = claim.opened;
      }

      if (actor.kind === "guest") {
        const bound =
          await this.dependencies.ordering.bindGuestSessionToTableSession(
            transaction,
            {
              businessAccountId: actor.businessAccountId,
              guestSessionId: actor.guestSessionId,
              tableSessionId: tableSession.id,
              ...(input.customerName
                ? { displayName: input.customerName }
                : {}),
            },
          );
        if (!bound) {
          throw new ApplicationError(
            "table_unavailable",
            409,
            "The guest session belongs to another table session",
          );
        }
      }

      const snapshots = await this.dependencies.menu.resolveOrderItemSnapshots(
        transaction,
        {
          businessAccountId: actor.businessAccountId,
          restaurantId: actor.restaurantId,
          branchId: actor.branchId,
          branchCurrency: branch.currency,
          expectedMenuVersion: input.menuVersion,
          items: input.items,
        },
      );
      if (snapshots.kind === "menu_changed") {
        throw new ApplicationError(
          "menu_changed",
          409,
          "The menu changed",
          "Review current prices and availability before submitting again.",
          snapshots.currentVersion,
        );
      }
      if (snapshots.kind === "dish_unavailable") {
        throw new ApplicationError(
          "dish_unavailable",
          409,
          "A selected dish is unavailable",
          "Remove the unavailable dish and review the order again.",
        );
      }
      if (snapshots.kind === "invalid_options") {
        throw new ApplicationError(
          "validation_error",
          422,
          "The selected options are invalid",
          snapshots.detail,
        );
      }

      const order = await this.dependencies.ordering.createOrder(transaction, {
        id: randomUUID(),
        businessAccountId: actor.businessAccountId,
        restaurantId: actor.restaurantId,
        branchId: actor.branchId,
        tableSessionId: tableSession.id,
        creatorType: actor.kind,
        ...(actor.guestSessionId
          ? { customerSessionId: actor.guestSessionId }
          : {}),
        ...(actor.userId ? { createdByUserId: actor.userId } : {}),
        ...(actor.employeeId ? { createdByEmployeeId: actor.employeeId } : {}),
        ...(input.customerName
          ? { customerDisplayName: input.customerName }
          : {}),
        configurationVersionId: configuration.id,
        configurationVersion: configuration.version,
        total: snapshots.total,
        items: snapshots.items.map((item) => ({ ...item, id: randomUUID() })),
        now,
      });

      await this.dependencies.kitchen.createWorkForOrder(transaction, {
        businessAccountId: actor.businessAccountId,
        branchId: actor.branchId,
        orderId: order.id,
        orderReference: order.reference,
        items: order.items.map((item) => ({
          id: randomUUID(),
          orderItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          ...(item.note ? { note: item.note } : {}),
        })),
        now,
      });

      if (tableSessionOpened) {
        await appendOutboxMessage(transaction.sql, {
          eventId: randomUUID(),
          eventType: "tables.session_opened.v1",
          businessAccountId: actor.businessAccountId,
          restaurantId: actor.restaurantId,
          branchId: actor.branchId,
          aggregateId: tableSession.id,
          aggregateVersion: tableSession.version,
          occurredAtUtc: now,
          correlationId: metadata.correlationId,
          causationId: metadata.causationId,
          ...(actor.userId ? { actorId: actor.userId } : {}),
          payload: {
            tableSessionId: tableSession.id,
            tableId: tableSession.tableId,
          },
        });
      }
      await this.appendOrderEvent(
        transaction,
        "ordering.order_submitted.v1",
        order,
        1,
        actor,
        metadata,
        now,
      );
      await this.appendOrderEvent(
        transaction,
        "ordering.order_accepted.v1",
        order,
        2,
        actor,
        metadata,
        now,
      );
      await this.dependencies.audit.appendInTransaction(transaction, {
        id: randomUUID(),
        businessAccountId: actor.businessAccountId,
        restaurantId: actor.restaurantId,
        branchId: actor.branchId,
        ...(actor.userId ? { actorUserId: actor.userId } : {}),
        action: "ordering.order_submitted",
        targetType: "order",
        targetId: order.id,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        afterData: {
          reference: order.reference,
          tableSessionId: order.tableSessionId,
          creatorType: order.creatorType,
          total: order.total,
          itemCount: order.items.length,
        },
        occurredAtUtc: now,
      });
      await completeIdempotentCommand(transaction, idempotency.recordId, 201, {
        orderId: order.id,
      });
      return order;
    });
  }

  private async beginIdempotency(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly actorScope: string;
      readonly operation: string;
      readonly idempotencyKey: string;
      readonly requestHash: string;
      readonly now: Date;
    },
  ): Promise<
    | { readonly kind: "acquired"; readonly recordId: string }
    | { readonly kind: "replay"; readonly responseBody: unknown }
  > {
    const result = await beginIdempotentCommand(transaction, {
      businessAccountId: input.businessAccountId,
      actorScope: input.actorScope,
      operation: input.operation,
      idempotencyKeyHash: hashOpaqueToken(
        input.idempotencyKey,
        this.dependencies.idempotencySecret,
      ),
      requestHash: input.requestHash,
      now: input.now,
      expiresAtUtc: new Date(input.now.getTime() + idempotencyRetentionMs),
    });
    if (result.kind === "payload_conflict") {
      throw new ApplicationError(
        "idempotency_conflict",
        409,
        "Idempotency key already used",
        "Use the original request payload or submit with a new idempotency key.",
      );
    }
    if (result.kind === "in_progress") {
      throw new ApplicationError(
        "idempotency_conflict",
        409,
        "A matching request is still being processed",
        "Wait briefly and retry with the same idempotency key.",
      );
    }
    return result.kind === "replay"
      ? { kind: "replay", responseBody: result.responseBody }
      : result;
  }

  private async appendOrderEvent(
    transaction: TransactionContext,
    eventType: string,
    order: OrderRecord,
    aggregateVersion: number,
    actor: SubmissionActor,
    metadata: OrderRequestMetadata,
    now: Date,
  ): Promise<void> {
    await appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType,
      businessAccountId: order.businessAccountId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      aggregateId: order.id,
      aggregateVersion,
      occurredAtUtc: now,
      correlationId: metadata.correlationId,
      causationId: metadata.causationId,
      ...(actor.userId ? { actorId: actor.userId } : {}),
      payload: {
        orderId: order.id,
        orderReference: order.reference,
        tableId: order.tableId,
        tableSessionId: order.tableSessionId,
        creatorType: order.creatorType,
        total: order.total,
      },
    });
  }
}
