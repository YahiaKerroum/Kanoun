import { Client } from "pg";

export interface RealE2eInvariants {
  readonly businessAccountId: string;
  readonly restaurantCount: number;
  readonly branchCount: number;
  readonly categoryCount: number;
  readonly dishCount: number;
  readonly tableCount: number;
  readonly activeQrCount: number;
  readonly orderCount: number;
  readonly orderItemCount: number;
  readonly correctionCount: number;
  readonly paymentCount: number;
  readonly refundCount: number;
  readonly auditEventCount: number;
  readonly outboxCount: number;
  readonly processedOutboxCount: number;
  readonly inboxCheckpointCount: number;
  readonly idempotencyRecordCount: number;
  readonly openTableSessionCount: number;
}

export interface RealE2eOrderInvariant {
  readonly orderId: string;
  readonly closureState: string;
  readonly financialState: string;
  readonly fulfilmentState: string;
  readonly version: number;
  readonly itemCount: number;
  readonly correctionCount: number;
  readonly paymentCount: number;
  readonly refundCount: number;
}

function numberValue(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function readRealE2eInvariants(
  connectionString: string,
  businessCode: string,
): Promise<RealE2eInvariants> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tenant = await client.query<{ id: string }>(
      "select id from restaurant.business_accounts where code = $1",
      [businessCode],
    );
    const businessAccountId = tenant.rows[0]?.id;
    if (!businessAccountId) throw new Error("Real E2E tenant was not found.");
    const result = await client.query<{
      restaurant_count: string;
      branch_count: string;
      category_count: string;
      dish_count: string;
      table_count: string;
      active_qr_count: string;
      order_count: string;
      order_item_count: string;
      correction_count: string;
      payment_count: string;
      refund_count: string;
      audit_event_count: string;
      outbox_count: string;
      processed_outbox_count: string;
      inbox_checkpoint_count: string;
      idempotency_record_count: string;
      open_table_session_count: string;
    }>(
      `select
         (select count(*) from restaurant.restaurants where business_account_id = $1) as restaurant_count,
         (select count(*) from restaurant.branches where business_account_id = $1) as branch_count,
         (select count(*) from menu.categories where business_account_id = $1) as category_count,
         (select count(*) from menu.dishes where business_account_id = $1) as dish_count,
         (select count(*) from tables.tables where business_account_id = $1) as table_count,
         (select count(*) from tables.table_qr_codes where business_account_id = $1 and status = 'active') as active_qr_count,
         (select count(*) from ordering.orders where business_account_id = $1) as order_count,
         (select count(*) from ordering.order_items where business_account_id = $1) as order_item_count,
         (select count(*) from ordering.order_corrections where business_account_id = $1) as correction_count,
         (select count(*) from payments.payments where business_account_id = $1) as payment_count,
         (select count(*) from payments.refunds where business_account_id = $1) as refund_count,
         (select count(*) from audit.audit_events where business_account_id = $1) as audit_event_count,
         (select count(*) from platform.outbox_messages where business_account_id = $1) as outbox_count,
         (select count(*) from platform.outbox_messages where business_account_id = $1 and processed_at_utc is not null) as processed_outbox_count,
         (select count(*) from platform.inbox_checkpoints where event_id in (select event_id from platform.outbox_messages where business_account_id = $1)) as inbox_checkpoint_count,
         (select count(*) from platform.idempotency_records where business_account_id = $1) as idempotency_record_count,
         (select count(*) from tables.table_sessions where business_account_id = $1 and status = 'open') as open_table_session_count`,
      [businessAccountId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Real E2E invariant query returned no row.");
    return {
      businessAccountId,
      restaurantCount: numberValue(row.restaurant_count),
      branchCount: numberValue(row.branch_count),
      categoryCount: numberValue(row.category_count),
      dishCount: numberValue(row.dish_count),
      tableCount: numberValue(row.table_count),
      activeQrCount: numberValue(row.active_qr_count),
      orderCount: numberValue(row.order_count),
      orderItemCount: numberValue(row.order_item_count),
      correctionCount: numberValue(row.correction_count),
      paymentCount: numberValue(row.payment_count),
      refundCount: numberValue(row.refund_count),
      auditEventCount: numberValue(row.audit_event_count),
      outboxCount: numberValue(row.outbox_count),
      processedOutboxCount: numberValue(row.processed_outbox_count),
      inboxCheckpointCount: numberValue(row.inbox_checkpoint_count),
      idempotencyRecordCount: numberValue(row.idempotency_record_count),
      openTableSessionCount: numberValue(row.open_table_session_count),
    };
  } finally {
    await client.end();
  }
}

export async function readLatestRealE2eOrder(
  connectionString: string,
  businessCode: string,
): Promise<RealE2eOrderInvariant | undefined> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{
      order_id: string;
      closure_state: string;
      financial_state: string;
      fulfilment_state: string;
      version: number;
      item_count: string;
      correction_count: string;
      payment_count: string;
      refund_count: string;
    }>(
      `select o.id as order_id, o.closure_state, o.financial_state, o.fulfilment_state, o.version,
        (select count(*) from ordering.order_items i where i.business_account_id = o.business_account_id and i.order_id = o.id) as item_count,
        (select count(*) from ordering.order_corrections c where c.business_account_id = o.business_account_id and c.order_id = o.id) as correction_count,
        (select count(*) from payments.payments p where p.business_account_id = o.business_account_id and p.order_id = o.id) as payment_count,
        (select count(*) from payments.refunds r where r.business_account_id = o.business_account_id and r.order_id = o.id) as refund_count
       from ordering.orders o
       join restaurant.business_accounts b on b.id = o.business_account_id
       where b.code = $1
       order by o.submitted_at_utc desc
       limit 1`,
      [businessCode],
    );
    const row = result.rows[0];
    return row
      ? {
          orderId: row.order_id,
          closureState: row.closure_state,
          financialState: row.financial_state,
          fulfilmentState: row.fulfilment_state,
          version: row.version,
          itemCount: numberValue(row.item_count),
          correctionCount: numberValue(row.correction_count),
          paymentCount: numberValue(row.payment_count),
          refundCount: numberValue(row.refund_count),
        }
      : undefined;
  } finally {
    await client.end();
  }
}
