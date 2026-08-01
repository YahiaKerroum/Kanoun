import type {
  NotificationGapWarning,
  NotificationInboxItem,
  NotificationStore,
  NotificationType,
} from "../contracts/notification-store.js";

interface InboxRow {
  readonly id: string;
  readonly event_id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string | null;
  readonly recipient_user_id: string;
  readonly notification_type: NotificationType;
  readonly group_key: string;
  readonly required_permission: string;
  readonly source_event_type: string;
  readonly source_aggregate_id: string;
  readonly title: string;
  readonly body: string;
  readonly task_state: "unhandled" | "handled";
  readonly read_at_utc: Date | null;
  readonly acknowledged_at_utc: Date | null;
  readonly occurred_at_utc: Date;
  readonly created_at_utc: Date;
  readonly expires_at_utc: Date;
}

const inboxColumns = `
  id, event_id, business_account_id, restaurant_id, branch_id,
  recipient_user_id, notification_type, group_key, required_permission,
  source_event_type, source_aggregate_id, title, body, task_state,
  read_at_utc, acknowledged_at_utc, occurred_at_utc, created_at_utc,
  expires_at_utc
`;

function present(row: InboxRow): NotificationInboxItem {
  return {
    id: row.id,
    eventId: row.event_id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    ...(row.branch_id ? { branchId: row.branch_id } : {}),
    recipientUserId: row.recipient_user_id,
    notificationType: row.notification_type,
    groupKey: row.group_key,
    requiredPermission: row.required_permission,
    sourceEventType: row.source_event_type,
    sourceAggregateId: row.source_aggregate_id,
    title: row.title,
    body: row.body,
    taskState: row.task_state,
    ...(row.read_at_utc ? { readAtUtc: row.read_at_utc } : {}),
    ...(row.acknowledged_at_utc
      ? { acknowledgedAtUtc: row.acknowledged_at_utc }
      : {}),
    occurredAtUtc: row.occurred_at_utc,
    createdAtUtc: row.created_at_utc,
    expiresAtUtc: row.expires_at_utc,
  };
}

export class PostgresNotificationStore implements NotificationStore {
  public async createInboxItem(
    transaction: Parameters<NotificationStore["createInboxItem"]>[0],
    item: NotificationInboxItem,
  ): Promise<boolean> {
    const result = await transaction.sql.query(
      `
        insert into notifications.inbox_items (
          id, event_id, business_account_id, restaurant_id, branch_id,
          recipient_user_id, notification_type, group_key,
          required_permission, source_event_type, source_aggregate_id,
          title, body, task_state, read_at_utc, acknowledged_at_utc,
          occurred_at_utc, created_at_utc, expires_at_utc
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19
        )
        on conflict (
          business_account_id, event_id, recipient_user_id
        ) do nothing
      `,
      [
        item.id,
        item.eventId,
        item.businessAccountId,
        item.restaurantId,
        item.branchId ?? null,
        item.recipientUserId,
        item.notificationType,
        item.groupKey,
        item.requiredPermission,
        item.sourceEventType,
        item.sourceAggregateId,
        item.title,
        item.body,
        item.taskState,
        item.readAtUtc ?? null,
        item.acknowledgedAtUtc ?? null,
        item.occurredAtUtc,
        item.createdAtUtc,
        item.expiresAtUtc,
      ],
    );
    return result.rowCount === 1;
  }

  public async recordDeliveryAttempt(
    transaction: Parameters<NotificationStore["recordDeliveryAttempt"]>[0],
    input: Parameters<NotificationStore["recordDeliveryAttempt"]>[1],
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into notifications.delivery_attempts (
          id, event_id, business_account_id, restaurant_id, branch_id,
          recipient_user_id, notification_type, required_permission,
          outcome, reason, attempted_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict do nothing
      `,
      [
        input.id,
        input.eventId,
        input.businessAccountId,
        input.restaurantId,
        input.branchId ?? null,
        input.recipientUserId ?? null,
        input.notificationType,
        input.requiredPermission,
        input.outcome,
        input.reason ?? null,
        input.attemptedAtUtc,
      ],
    );
  }

  public async listInbox(
    sql: Parameters<NotificationStore["listInbox"]>[0],
    input: Parameters<NotificationStore["listInbox"]>[1],
  ): Promise<readonly NotificationInboxItem[]> {
    const result = await sql.query<InboxRow>(
      `
        select ${inboxColumns}
        from notifications.inbox_items
        where business_account_id = $1
          and recipient_user_id = $2
          and expires_at_utc > $3
          and ($4::uuid is null or branch_id = $4)
          and (
            $5::timestamptz is null
            or ($6::uuid is null and created_at_utc > $5)
            or (
              $6::uuid is not null
              and (created_at_utc, id) > ($5, $6)
            )
          )
        order by
          case when $5::timestamptz is null then created_at_utc end desc,
          case when $5::timestamptz is not null then created_at_utc end asc,
          case when $5::timestamptz is null then id end desc,
          case when $5::timestamptz is not null then id end asc
        limit $7
      `,
      [
        input.businessAccountId,
        input.recipientUserId,
        input.now,
        input.branchId ?? null,
        input.after ?? null,
        input.afterId ?? null,
        input.limit,
      ],
    );
    return result.rows.map(present);
  }

  public async getInboxCursor(
    sql: Parameters<NotificationStore["getInboxCursor"]>[0],
    input: Parameters<NotificationStore["getInboxCursor"]>[1],
  ): Promise<{ readonly createdAtUtc: Date; readonly id: string } | undefined> {
    const result = await sql.query<{ id: string; created_at_utc: Date }>(
      `
        select id, created_at_utc
        from notifications.inbox_items
        where business_account_id = $1
          and recipient_user_id = $2
          and id = $3
          and expires_at_utc > $4
          and ($5::uuid is null or branch_id = $5)
      `,
      [
        input.businessAccountId,
        input.recipientUserId,
        input.notificationId,
        input.now,
        input.branchId ?? null,
      ],
    );
    const row = result.rows[0];
    return row ? { id: row.id, createdAtUtc: row.created_at_utc } : undefined;
  }

  public async updateInboxState(
    transaction: Parameters<NotificationStore["updateInboxState"]>[0],
    input: Parameters<NotificationStore["updateInboxState"]>[1],
  ): Promise<NotificationInboxItem | undefined> {
    const result = await transaction.sql.query<InboxRow>(
      `
        update notifications.inbox_items
        set read_at_utc = coalesce(read_at_utc, $4),
            acknowledged_at_utc = case
              when $5 = 'acknowledge'
                then coalesce(acknowledged_at_utc, $4)
              else acknowledged_at_utc
            end,
            task_state = case
              when $5 = 'acknowledge' then 'handled'
              else task_state
            end
        where business_account_id = $1
          and recipient_user_id = $2
          and id = $3
          and expires_at_utc > $4
        returning ${inboxColumns}
      `,
      [
        input.businessAccountId,
        input.recipientUserId,
        input.notificationId,
        input.now,
        input.action,
      ],
    );
    const row = result.rows[0];
    return row ? present(row) : undefined;
  }

  public async listGapWarnings(
    sql: Parameters<NotificationStore["listGapWarnings"]>[0],
    input: Parameters<NotificationStore["listGapWarnings"]>[1],
  ): Promise<readonly NotificationGapWarning[]> {
    const result = await sql.query<{
      event_id: string;
      restaurant_id: string;
      branch_id: string | null;
      notification_type: NotificationType;
      required_permission: string;
      reason: string;
      attempted_at_utc: Date;
    }>(
      `
        select event_id, restaurant_id, branch_id, notification_type,
          required_permission, reason, attempted_at_utc
        from notifications.delivery_attempts
        where business_account_id = $1
          and outcome = 'no_eligible_recipient'
          and ($2::uuid is null or branch_id = $2)
        order by attempted_at_utc desc, event_id desc
        limit $3
      `,
      [input.businessAccountId, input.branchId ?? null, input.limit],
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      restaurantId: row.restaurant_id,
      ...(row.branch_id ? { branchId: row.branch_id } : {}),
      notificationType: row.notification_type,
      requiredPermission: row.required_permission,
      reason: row.reason,
      attemptedAtUtc: row.attempted_at_utc,
    }));
  }

  public async deleteExpired(
    sql: Parameters<NotificationStore["deleteExpired"]>[0],
    now: Date,
  ): Promise<number> {
    const result = await sql.query<{
      removed_inbox: string;
      removed_attempts: string;
    }>(
      `
        with expired_inbox as (
          delete from notifications.inbox_items
          where expires_at_utc <= $1
          returning id
        ),
        expired_attempts as (
          delete from notifications.delivery_attempts
          where attempted_at_utc <= $1 - interval '30 days'
          returning id
        )
        select
          (select count(*)::text from expired_inbox) as removed_inbox,
          (select count(*)::text from expired_attempts) as removed_attempts
      `,
      [now],
    );
    return (
      Number(result.rows[0]?.removed_inbox ?? "0") +
      Number(result.rows[0]?.removed_attempts ?? "0")
    );
  }
}
