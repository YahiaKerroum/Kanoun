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
  type AuditWriter,
  type KitchenStore,
  type KitchenWorkItemRecord,
  type OrderRecord,
  type OrderingStore,
  type RestaurantConfigurationStore,
  type StaffRequestContext,
} from "@rms/modules";
import type { PostgresServiceWorkflow } from "./postgres-service-workflow.js";

const idempotencyRetentionMs = 24 * 60 * 60 * 1000;

export interface KitchenRequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
  readonly now?: Date;
}

export interface KitchenQueueItem extends KitchenWorkItemRecord {
  readonly orderVersion: number;
  readonly orderFulfilment: OrderRecord["fulfilment"];
  readonly orderSubmittedAtUtc: Date;
}

export interface KitchenServingServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly workflow: PostgresServiceWorkflow;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly kitchen: KitchenStore;
  readonly ordering: OrderingStore;
  readonly audit: AuditWriter;
  readonly idempotencySecret: string;
}

function nowFrom(metadata: KitchenRequestMetadata): Date {
  return metadata.now ?? new Date();
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class KitchenServingService {
  public constructor(
    private readonly dependencies: KitchenServingServiceDependencies,
  ) {}

  public async getKitchenQueue(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly KitchenQueueItem[]> {
    const access = await this.resolveBranchAccess(
      this.dependencies.databasePool,
      context,
      branchId,
    );
    const canViewKitchen = hasPermission(
      context,
      "kitchen.view",
      access.restaurantId,
      branchId,
    );
    const canServe = hasPermission(
      context,
      "orders.serve",
      access.restaurantId,
      branchId,
    );
    if (!canViewKitchen && !canServe) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    await this.requireKitchenEnabled(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );

    const workItems = await this.dependencies.kitchen.listQueue(
      this.dependencies.databasePool,
      { businessAccountId: context.businessAccountId, branchId },
    );
    const orders = new Map<string, OrderRecord>();
    for (const orderId of new Set(workItems.map((item) => item.orderId))) {
      const order = await this.dependencies.ordering.getOrder(
        this.dependencies.databasePool,
        context.businessAccountId,
        orderId,
      );
      if (
        order?.branchId === branchId &&
        order.closure === "active" &&
        order.fulfilment !== "served"
      ) {
        orders.set(orderId, order);
      }
    }
    return workItems.flatMap((item) => {
      const order = orders.get(item.orderId);
      if (!order || (!canViewKitchen && order.fulfilment !== "ready")) {
        return [];
      }
      return [
        {
          ...item,
          orderVersion: order.version,
          orderFulfilment: order.fulfilment,
          orderSubmittedAtUtc: order.submittedAtUtc,
        },
      ];
    });
  }

  public async startKitchenWorkItem(
    context: StaffRequestContext,
    workItemId: string,
    expectedVersion: number,
    effectiveEmployeeId: string | undefined,
    idempotencyKey: string,
    metadata: KitchenRequestMetadata,
  ): Promise<KitchenWorkItemRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const current = await this.requireWorkItemAccess(
        transaction,
        context,
        workItemId,
        "kitchen.update",
      );
      const effectiveActor = await this.resolveEffectiveEmployee(
        transaction,
        context,
        current.branchId,
        effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "startKitchenWorkItem",
        idempotencyKey,
        requestHash: requestHash({
          workItemId,
          expectedVersion,
          effectiveEmployeeId: effectiveActor,
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        return current;
      }
      this.requireTransition(current, expectedVersion, "queued", "start");

      const updated = await this.dependencies.kitchen.startItem(transaction, {
        businessAccountId: context.businessAccountId,
        workItemId,
        expectedVersion,
        actorUserId: context.userId,
        effectiveEmployeeId: effectiveActor,
        now,
      });
      if (!updated) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Kitchen item changed",
          "Reload the kitchen queue before trying again.",
          current.version,
        );
      }

      const order = await this.dependencies.ordering.getOrderForUpdate(
        transaction,
        context.businessAccountId,
        updated.orderId,
      );
      if (!order) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Order not found",
        );
      }
      const projected =
        order.fulfilment === "not_started"
          ? await this.dependencies.ordering.transitionFulfilment(transaction, {
              businessAccountId: context.businessAccountId,
              orderId: order.id,
              from: "not_started",
              to: "preparing",
              now,
            })
          : undefined;

      await this.appendWorkEvent(
        transaction,
        "kitchen.item_started.v1",
        updated,
        context,
        effectiveActor,
        metadata,
        now,
      );
      if (projected) {
        await this.appendOrderEvent(
          transaction,
          "ordering.order_preparing.v1",
          projected,
          context,
          effectiveActor,
          metadata,
          now,
        );
      }
      await this.appendAudit(
        transaction,
        "kitchen.item_started",
        updated,
        context,
        effectiveActor,
        metadata,
        now,
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        workItemId: updated.id,
        version: updated.version,
      });
      return updated;
    });
  }

  public async markKitchenWorkItemReady(
    context: StaffRequestContext,
    workItemId: string,
    expectedVersion: number,
    effectiveEmployeeId: string | undefined,
    idempotencyKey: string,
    metadata: KitchenRequestMetadata,
  ): Promise<KitchenWorkItemRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const current = await this.requireWorkItemAccess(
        transaction,
        context,
        workItemId,
        "kitchen.update",
      );
      const effectiveActor = await this.resolveEffectiveEmployee(
        transaction,
        context,
        current.branchId,
        effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "markKitchenWorkItemReady",
        idempotencyKey,
        requestHash: requestHash({
          workItemId,
          expectedVersion,
          effectiveEmployeeId: effectiveActor,
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        return current;
      }
      this.requireTransition(current, expectedVersion, "preparing", "finish");

      const updated = await this.dependencies.kitchen.markItemReady(
        transaction,
        {
          businessAccountId: context.businessAccountId,
          workItemId,
          expectedVersion,
          actorUserId: context.userId,
          effectiveEmployeeId: effectiveActor,
          now,
        },
      );
      if (!updated) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Kitchen item changed",
          "Reload the kitchen queue before trying again.",
          current.version,
        );
      }

      const allReady = await this.dependencies.kitchen.isOrderReady(
        transaction.sql,
        context.businessAccountId,
        updated.orderId,
      );
      const order = await this.dependencies.ordering.getOrderForUpdate(
        transaction,
        context.businessAccountId,
        updated.orderId,
      );
      if (!order) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Order not found",
        );
      }
      const projected =
        allReady && order.fulfilment === "preparing"
          ? await this.dependencies.ordering.transitionFulfilment(transaction, {
              businessAccountId: context.businessAccountId,
              orderId: order.id,
              from: "preparing",
              to: "ready",
              now,
            })
          : undefined;

      await this.appendWorkEvent(
        transaction,
        "kitchen.item_ready.v1",
        updated,
        context,
        effectiveActor,
        metadata,
        now,
      );
      if (projected) {
        await this.appendOrderEvent(
          transaction,
          "ordering.order_ready.v1",
          projected,
          context,
          effectiveActor,
          metadata,
          now,
        );
      }
      await this.appendAudit(
        transaction,
        "kitchen.item_ready",
        updated,
        context,
        effectiveActor,
        metadata,
        now,
      );
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        workItemId: updated.id,
        version: updated.version,
      });
      return updated;
    });
  }

  public async markOrderServed(
    context: StaffRequestContext,
    orderId: string,
    expectedVersion: number,
    effectiveEmployeeId: string | undefined,
    idempotencyKey: string,
    metadata: KitchenRequestMetadata,
  ): Promise<OrderRecord> {
    const now = nowFrom(metadata);
    return this.dependencies.workflow.run(async (transaction) => {
      const order = await this.dependencies.ordering.getOrderForUpdate(
        transaction,
        context.businessAccountId,
        orderId,
      );
      if (!order) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Order not found",
        );
      }
      await this.requireOrderAccess(
        transaction,
        context,
        order,
        "orders.serve",
      );
      const effectiveActor = await this.resolveEffectiveEmployee(
        transaction,
        context,
        order.branchId,
        effectiveEmployeeId,
      );
      const idempotency = await this.beginIdempotency(transaction, {
        businessAccountId: context.businessAccountId,
        actorScope: `staff:${context.sessionId}`,
        operation: "markOrderServed",
        idempotencyKey,
        requestHash: requestHash({
          orderId,
          expectedVersion,
          effectiveEmployeeId: effectiveActor,
        }),
        now,
      });
      if (idempotency.kind === "replay") {
        return order;
      }
      if (order.version !== expectedVersion) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Order changed",
          "Reload the ready-order view before trying again.",
          order.version,
        );
      }
      if (order.fulfilment !== "ready" || order.closure !== "active") {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order cannot be served",
          "Every kitchen item must be ready and the order must remain active.",
          order.version,
        );
      }
      if (
        !(await this.dependencies.kitchen.isOrderReady(
          transaction.sql,
          context.businessAccountId,
          orderId,
        ))
      ) {
        throw new ApplicationError(
          "invalid_state_transition",
          409,
          "Order is not ready",
          "Reload the ready-order view and wait for every item.",
          order.version,
        );
      }
      const served = await this.dependencies.ordering.markServed(transaction, {
        businessAccountId: context.businessAccountId,
        orderId,
        expectedVersion,
        actorUserId: context.userId,
        effectiveEmployeeId: effectiveActor,
        now,
      });
      if (!served) {
        throw new ApplicationError(
          "concurrency_conflict",
          409,
          "Order changed",
          "Reload the ready-order view before trying again.",
          order.version,
        );
      }
      await this.appendOrderEvent(
        transaction,
        "ordering.order_served.v1",
        served,
        context,
        effectiveActor,
        metadata,
        now,
      );
      await this.dependencies.audit.appendInTransaction(transaction, {
        id: randomUUID(),
        businessAccountId: served.businessAccountId,
        restaurantId: served.restaurantId,
        branchId: served.branchId,
        actorUserId: context.userId,
        action: "ordering.order_served",
        targetType: "order",
        targetId: served.id,
        outcome: "succeeded",
        correlationId: metadata.correlationId,
        afterData: {
          fulfilment: served.fulfilment,
          servedByEmployeeId: effectiveActor,
        },
        occurredAtUtc: now,
      });
      await completeIdempotentCommand(transaction, idempotency.recordId, 200, {
        orderId: served.id,
        version: served.version,
      });
      return served;
    });
  }

  private async resolveBranchAccess(
    sql: Parameters<RestaurantConfigurationStore["getBranch"]>[0],
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{ readonly restaurantId: string }> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      sql,
      context.businessAccountId,
      branchId,
    );
    if (!branch) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return { restaurantId: branch.restaurantId };
  }

  private async requireKitchenEnabled(
    sql: Parameters<RestaurantConfigurationStore["getFeatureConfiguration"]>[0],
    businessAccountId: string,
    branchId: string,
  ): Promise<void> {
    const configuration =
      await this.dependencies.restaurantConfiguration.getFeatureConfiguration(
        sql,
        businessAccountId,
        branchId,
      );
    const state = configuration?.values["CFG-007"];
    if (!configuration || state === "disabled" || state === "unavailable") {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        "Kitchen is unavailable",
      );
    }
  }

  private async requireWorkItemAccess(
    transaction: TransactionContext,
    context: StaffRequestContext,
    workItemId: string,
    permission: "kitchen.update",
  ): Promise<KitchenWorkItemRecord> {
    const item = await this.dependencies.kitchen.getWorkItem(
      transaction.sql,
      context.businessAccountId,
      workItemId,
      true,
    );
    if (!item) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Kitchen item not found",
      );
    }
    const access = await this.resolveBranchAccess(
      transaction.sql,
      context,
      item.branchId,
    );
    if (
      !hasPermission(context, permission, access.restaurantId, item.branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    await this.requireKitchenEnabled(
      transaction.sql,
      context.businessAccountId,
      item.branchId,
    );
    return item;
  }

  private async requireOrderAccess(
    transaction: TransactionContext,
    context: StaffRequestContext,
    order: OrderRecord,
    permission: "orders.serve",
  ): Promise<void> {
    const access = await this.resolveBranchAccess(
      transaction.sql,
      context,
      order.branchId,
    );
    if (
      order.restaurantId !== access.restaurantId ||
      !hasPermission(context, permission, access.restaurantId, order.branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
  }

  private async resolveEffectiveEmployee(
    transaction: TransactionContext,
    context: StaffRequestContext,
    branchId: string,
    effectiveEmployeeId: string | undefined,
  ): Promise<string> {
    const employeeId = effectiveEmployeeId ?? context.employeeId;
    const employee =
      await this.dependencies.restaurantConfiguration.getEmployee(
        transaction.sql,
        context.businessAccountId,
        employeeId,
      );
    const activeInBranch =
      employee?.status === "active" && employee.branchIds.includes(branchId);
    if (!activeInBranch) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Effective employee is unavailable",
        "Choose an active employee assigned to this branch.",
      );
    }
    return employee.id;
  }

  private requireTransition(
    current: KitchenWorkItemRecord,
    expectedVersion: number,
    expectedState: KitchenWorkItemRecord["state"],
    action: string,
  ): void {
    if (current.version !== expectedVersion) {
      throw new ApplicationError(
        "concurrency_conflict",
        409,
        "Kitchen item changed",
        "Reload the kitchen queue before trying again.",
        current.version,
      );
    }
    if (current.state !== expectedState) {
      throw new ApplicationError(
        "invalid_state_transition",
        409,
        `Kitchen item cannot ${action}`,
        `The item is currently ${current.state}.`,
        current.version,
      );
    }
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
    if (result.kind === "payload_conflict" || result.kind === "in_progress") {
      throw new ApplicationError(
        "idempotency_conflict",
        409,
        "Idempotency key already used",
        "Retry the original action or use a new idempotency key.",
      );
    }
    return result.kind === "replay"
      ? { kind: "replay", responseBody: result.responseBody }
      : result;
  }

  private async appendWorkEvent(
    transaction: TransactionContext,
    eventType: string,
    item: KitchenWorkItemRecord,
    context: StaffRequestContext,
    effectiveEmployeeId: string,
    metadata: KitchenRequestMetadata,
    now: Date,
  ): Promise<void> {
    await appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType,
      businessAccountId: item.businessAccountId,
      restaurantId: context.restaurantId,
      branchId: item.branchId,
      aggregateId: item.id,
      aggregateVersion: item.version,
      occurredAtUtc: now,
      correlationId: metadata.correlationId,
      causationId: metadata.causationId,
      actorId: context.userId,
      payload: {
        workItemId: item.id,
        orderId: item.orderId,
        orderReference: item.orderReference,
        state: item.state,
        actorUserId: context.userId,
        effectiveEmployeeId,
      },
    });
  }

  private async appendOrderEvent(
    transaction: TransactionContext,
    eventType: string,
    order: OrderRecord,
    context: StaffRequestContext,
    effectiveEmployeeId: string,
    metadata: KitchenRequestMetadata,
    now: Date,
  ): Promise<void> {
    await appendOutboxMessage(transaction.sql, {
      eventId: randomUUID(),
      eventType,
      businessAccountId: order.businessAccountId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      aggregateId: order.id,
      aggregateVersion: order.version,
      occurredAtUtc: now,
      correlationId: metadata.correlationId,
      causationId: metadata.causationId,
      actorId: context.userId,
      payload: {
        orderId: order.id,
        orderReference: order.reference,
        tableId: order.tableId,
        tableCode: order.tableCode,
        fulfilment: order.fulfilment,
        actorUserId: context.userId,
        effectiveEmployeeId,
      },
    });
  }

  private async appendAudit(
    transaction: TransactionContext,
    action: string,
    item: KitchenWorkItemRecord,
    context: StaffRequestContext,
    effectiveEmployeeId: string,
    metadata: KitchenRequestMetadata,
    now: Date,
  ): Promise<void> {
    await this.dependencies.audit.appendInTransaction(transaction, {
      id: randomUUID(),
      businessAccountId: item.businessAccountId,
      restaurantId: context.restaurantId,
      branchId: item.branchId,
      actorUserId: context.userId,
      action,
      targetType: "kitchen_work_item",
      targetId: item.id,
      outcome: "succeeded",
      correlationId: metadata.correlationId,
      afterData: {
        state: item.state,
        version: item.version,
        effectiveEmployeeId,
      },
      occurredAtUtc: now,
    });
  }
}
