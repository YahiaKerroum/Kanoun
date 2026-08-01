import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";

export type NotificationType =
  | "new_order"
  | "order_change"
  | "ready_order"
  | "bill_request"
  | "payment_or_refund"
  | "configuration_or_permission_change";

export interface NotificationInboxItem {
  readonly id: string;
  readonly eventId: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly branchId?: string;
  readonly recipientUserId: string;
  readonly notificationType: NotificationType;
  readonly groupKey: string;
  readonly requiredPermission: string;
  readonly sourceEventType: string;
  readonly sourceAggregateId: string;
  readonly title: string;
  readonly body: string;
  readonly taskState: "unhandled" | "handled";
  readonly readAtUtc?: Date;
  readonly acknowledgedAtUtc?: Date;
  readonly occurredAtUtc: Date;
  readonly createdAtUtc: Date;
  readonly expiresAtUtc: Date;
}

export interface NotificationGapWarning {
  readonly eventId: string;
  readonly restaurantId: string;
  readonly branchId?: string;
  readonly notificationType: NotificationType;
  readonly requiredPermission: string;
  readonly reason: string;
  readonly attemptedAtUtc: Date;
}

export interface NotificationStore {
  createInboxItem(
    transaction: TransactionContext,
    item: NotificationInboxItem,
  ): Promise<boolean>;
  recordDeliveryAttempt(
    transaction: TransactionContext,
    input: {
      readonly id: string;
      readonly eventId: string;
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId?: string;
      readonly recipientUserId?: string;
      readonly notificationType: NotificationType;
      readonly requiredPermission: string;
      readonly outcome:
        "inbox_created" | "duplicate_suppressed" | "no_eligible_recipient";
      readonly reason?: string;
      readonly attemptedAtUtc: Date;
    },
  ): Promise<void>;
  listInbox(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly recipientUserId: string;
      readonly branchId?: string;
      readonly after?: Date;
      readonly afterId?: string;
      readonly limit: number;
      readonly now: Date;
    },
  ): Promise<readonly NotificationInboxItem[]>;
  getInboxCursor(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly recipientUserId: string;
      readonly notificationId: string;
      readonly branchId?: string;
      readonly now: Date;
    },
  ): Promise<{ readonly createdAtUtc: Date; readonly id: string } | undefined>;
  updateInboxState(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly recipientUserId: string;
      readonly notificationId: string;
      readonly action: "read" | "acknowledge";
      readonly now: Date;
    },
  ): Promise<NotificationInboxItem | undefined>;
  listGapWarnings(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly branchId?: string;
      readonly limit: number;
    },
  ): Promise<readonly NotificationGapWarning[]>;
  deleteExpired(sql: SqlExecutor, now: Date): Promise<number>;
}
