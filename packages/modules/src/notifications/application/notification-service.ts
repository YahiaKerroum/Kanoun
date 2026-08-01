import { randomUUID } from "node:crypto";
import type {
  DatabasePool,
  OutboxEvent,
  OutboxEventHandler,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  IdentityAccessStore,
  PermissionKey,
  StaffRequestContext,
} from "../../identity-access/index.js";
import { hasPermission } from "../../identity-access/index.js";
import type { RestaurantConfigurationStore } from "../../restaurant-configuration/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  NotificationGapWarning,
  NotificationInboxItem,
  NotificationStore,
  NotificationType,
} from "../contracts/notification-store.js";

interface NotificationRule {
  readonly notificationType: NotificationType;
  readonly permission: PermissionKey;
  readonly featureId?: string;
  readonly critical: boolean;
  readonly title: string;
}

const rules = new Map<string, NotificationRule>([
  [
    "ordering.order_submitted.v1",
    {
      notificationType: "new_order",
      permission: "orders.view",
      featureId: "CFG-005",
      critical: true,
      title: "New order",
    },
  ],
  [
    "ordering.cancellation_requested.v1",
    {
      notificationType: "order_change",
      permission: "orders.cancel",
      featureId: "CFG-005",
      critical: true,
      title: "Cancellation requested",
    },
  ],
  ...[
    "ordering.order_corrected.v1",
    "ordering.order_cancelled.v1",
    "tables.session_moved.v1",
  ].map(
    (eventType) =>
      [
        eventType,
        {
          notificationType: "order_change",
          permission: "orders.view",
          featureId: "CFG-005",
          critical: false,
          title: "Order changed",
        },
      ] as const,
  ),
  [
    "ordering.order_ready.v1",
    {
      notificationType: "ready_order",
      permission: "orders.serve",
      featureId: "CFG-007",
      critical: true,
      title: "Order ready",
    },
  ],
  [
    "ordering.bill_requested.v1",
    {
      notificationType: "bill_request",
      permission: "payments.view",
      featureId: "CFG-011",
      critical: true,
      title: "Bill requested",
    },
  ],
  ...[
    "payments.payment_recorded.v1",
    "payments.payment_refunded.v1",
    "payments.order_paid.v1",
  ].map(
    (eventType) =>
      [
        eventType,
        {
          notificationType: "payment_or_refund",
          permission: "payments.view",
          featureId: "CFG-011",
          critical: false,
          title: "Payment activity",
        },
      ] as const,
  ),
  [
    "restaurant.feature_configuration_changed.v1",
    {
      notificationType: "configuration_or_permission_change",
      permission: "features.manage",
      critical: false,
      title: "Configuration changed",
    },
  ],
  [
    "identity.permissions_changed.v1",
    {
      notificationType: "configuration_or_permission_change",
      permission: "employees.manage_permissions",
      critical: false,
      title: "Permissions changed",
    },
  ],
  [
    "identity.permission_template_deactivated.v1",
    {
      notificationType: "configuration_or_permission_change",
      permission: "employees.manage_permissions",
      critical: false,
      title: "Permission template deactivated",
    },
  ],
  ...[
    "identity.administrator_removed.v1",
    "identity.administrator_transferred.v1",
    "identity.employee_deactivated.v1",
    "restaurant.employee_branch_scope_changed.v1",
  ].map(
    (eventType) =>
      [
        eventType,
        {
          notificationType: "configuration_or_permission_change",
          permission: "employees.manage_permissions",
          critical: false,
          title: "Access configuration changed",
        },
      ] as const,
  ),
  ...[
    "restaurant.branch_created.v1",
    "restaurant.branch_updated.v1",
    "restaurant.employee_created.v1",
    "restaurant.employee_updated.v1",
  ].map(
    (eventType) =>
      [
        eventType,
        {
          notificationType: "configuration_or_permission_change",
          permission: "features.manage",
          critical: false,
          title: "Restaurant configuration changed",
        },
      ] as const,
  ),
]);

export interface NotificationServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly store: NotificationStore;
  readonly identityAccess: IdentityAccessStore;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly now?: () => Date;
}

function payloadText(payload: Readonly<Record<string, unknown>>): string {
  const reference =
    typeof payload.orderReference === "string"
      ? payload.orderReference
      : undefined;
  const table =
    typeof payload.tableCode === "string" ? payload.tableCode : undefined;
  return [reference, table ? `Table ${table}` : undefined]
    .filter((value): value is string => Boolean(value))
    .join(" · ")
    .slice(0, 500);
}

export class NotificationService implements OutboxEventHandler {
  public readonly name = "notifications.inbox.v1";
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: NotificationServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public supports(eventType: string): boolean {
    return rules.has(eventType);
  }

  public async handle(
    transaction: TransactionContext,
    event: OutboxEvent,
    now: Date,
  ): Promise<void> {
    const rule = rules.get(event.eventType);
    if (!rule || !event.restaurantId) return;
    let recipientBranchId = event.branchId;
    if (event.branchId) {
      const branch = await this.dependencies.restaurantConfiguration.getBranch(
        transaction.sql,
        event.businessAccountId,
        event.branchId,
      );
      const inactiveBranchConfigurationEvent =
        event.eventType === "restaurant.branch_updated.v1" &&
        branch?.status === "inactive";
      const notificationsEnabled =
        inactiveBranchConfigurationEvent ||
        (await this.dependencies.restaurantConfiguration.isBranchFeatureEnabled(
          transaction.sql,
          event.businessAccountId,
          event.branchId,
          "CFG-013",
        ));
      const sourceEnabled = rule.featureId
        ? await this.dependencies.restaurantConfiguration.isBranchFeatureEnabled(
            transaction.sql,
            event.businessAccountId,
            event.branchId,
            rule.featureId,
          )
        : true;
      if (!notificationsEnabled || !sourceEnabled) return;
      if (inactiveBranchConfigurationEvent) {
        recipientBranchId = undefined;
      }
    }

    const recipients =
      await this.dependencies.identityAccess.listEligibleNotificationRecipients(
        transaction.sql,
        {
          businessAccountId: event.businessAccountId,
          restaurantId: event.restaurantId,
          ...(recipientBranchId ? { branchId: recipientBranchId } : {}),
          permissionKey: rule.permission,
        },
      );
    if (recipients.length === 0) {
      if (rule.critical) {
        await this.dependencies.store.recordDeliveryAttempt(transaction, {
          id: randomUUID(),
          eventId: event.eventId,
          businessAccountId: event.businessAccountId,
          restaurantId: event.restaurantId,
          ...(event.branchId ? { branchId: event.branchId } : {}),
          notificationType: rule.notificationType,
          requiredPermission: rule.permission,
          outcome: "no_eligible_recipient",
          reason:
            "No active assigned employee has the required effective permission.",
          attemptedAtUtc: now,
        });
      }
      return;
    }

    for (const recipient of recipients) {
      const item: NotificationInboxItem = {
        id: randomUUID(),
        eventId: event.eventId,
        businessAccountId: event.businessAccountId,
        restaurantId: event.restaurantId,
        ...(event.branchId ? { branchId: event.branchId } : {}),
        recipientUserId: recipient.userId,
        notificationType: rule.notificationType,
        groupKey: `${rule.notificationType}:${event.aggregateId}`,
        requiredPermission: rule.permission,
        sourceEventType: event.eventType,
        sourceAggregateId: event.aggregateId,
        title: rule.title,
        body: payloadText(event.payload) || "Open the authoritative workspace.",
        taskState: "unhandled",
        occurredAtUtc: event.occurredAtUtc,
        createdAtUtc: now,
        expiresAtUtc: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      };
      const created = await this.dependencies.store.createInboxItem(
        transaction,
        item,
      );
      await this.dependencies.store.recordDeliveryAttempt(transaction, {
        id: randomUUID(),
        eventId: event.eventId,
        businessAccountId: event.businessAccountId,
        restaurantId: event.restaurantId,
        ...(event.branchId ? { branchId: event.branchId } : {}),
        recipientUserId: recipient.userId,
        notificationType: rule.notificationType,
        requiredPermission: rule.permission,
        outcome: created ? "inbox_created" : "duplicate_suppressed",
        attemptedAtUtc: now,
      });
    }
  }

  public async listInbox(
    context: StaffRequestContext,
    input: {
      readonly branchId?: string;
      readonly after?: Date;
      readonly afterId?: string;
      readonly limit: number;
    },
  ): Promise<readonly NotificationInboxItem[]> {
    if (
      input.branchId &&
      !context.authorizedBranchIds.includes(input.branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return this.dependencies.store.listInbox(this.dependencies.databasePool, {
      businessAccountId: context.businessAccountId,
      recipientUserId: context.userId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.after ? { after: input.after } : {}),
      ...(input.afterId ? { afterId: input.afterId } : {}),
      limit: input.limit,
      now: this.now(),
    });
  }

  public resolveCursor(
    context: StaffRequestContext,
    notificationId: string,
    branchId?: string,
  ): Promise<{ readonly createdAtUtc: Date; readonly id: string } | undefined> {
    return this.dependencies.store.getInboxCursor(
      this.dependencies.databasePool,
      {
        businessAccountId: context.businessAccountId,
        recipientUserId: context.userId,
        notificationId,
        ...(branchId ? { branchId } : {}),
        now: this.now(),
      },
    );
  }

  public async updateState(
    context: StaffRequestContext,
    notificationId: string,
    action: "read" | "acknowledge",
  ): Promise<NotificationInboxItem> {
    const client = await this.dependencies.databasePool.connect();
    try {
      await client.query("begin");
      const updated = await this.dependencies.store.updateInboxState(
        { sql: client },
        {
          businessAccountId: context.businessAccountId,
          recipientUserId: context.userId,
          notificationId,
          action,
          now: this.now(),
        },
      );
      if (!updated) {
        throw new ApplicationError(
          "resource_not_found",
          404,
          "Notification not found",
        );
      }
      await client.query("commit");
      return updated;
    } catch (error: unknown) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async listGapWarnings(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<readonly NotificationGapWarning[]> {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (
      !branch ||
      !hasPermission(context, "features.manage", branch.restaurantId, branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return this.dependencies.store.listGapWarnings(
      this.dependencies.databasePool,
      { businessAccountId: context.businessAccountId, branchId, limit: 50 },
    );
  }

  public deleteExpired(): Promise<number> {
    return this.dependencies.store.deleteExpired(
      this.dependencies.databasePool,
      this.now(),
    );
  }
}
