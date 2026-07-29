import type { KitchenStore } from "../contracts/kitchen-store.js";
import type {
  KitchenOptionSnapshot,
  KitchenWorkChangeKind,
  KitchenWorkItemRecord,
  KitchenWorkState,
} from "../domain/models.js";

interface KitchenWorkItemRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly branch_id: string;
  readonly order_id: string;
  readonly order_item_id: string;
  readonly order_reference: string;
  readonly table_id: string;
  readonly table_code: string;
  readonly item_name: string;
  readonly quantity: number;
  readonly selected_options: readonly KitchenOptionSnapshot[];
  readonly note: string | null;
  readonly change_kind: KitchenWorkChangeKind;
  readonly correction_id: string | null;
  readonly state: KitchenWorkState;
  readonly version: number;
  readonly queued_at_utc: Date;
  readonly started_at_utc: Date | null;
  readonly started_by_user_id: string | null;
  readonly started_by_employee_id: string | null;
  readonly ready_at_utc: Date | null;
  readonly ready_by_user_id: string | null;
  readonly ready_by_employee_id: string | null;
  readonly cancelled_at_utc: Date | null;
  readonly cancelled_by_user_id: string | null;
  readonly cancelled_by_employee_id: string | null;
  readonly cancellation_reason: string | null;
}

const workItemColumns = `
  id, business_account_id, branch_id, order_id, order_item_id,
  order_reference, table_id, table_code, item_name, quantity,
  selected_options, note, change_kind, correction_id, state, version, queued_at_utc,
  started_at_utc, started_by_user_id, started_by_employee_id,
  ready_at_utc, ready_by_user_id, ready_by_employee_id,
  cancelled_at_utc, cancelled_by_user_id, cancelled_by_employee_id,
  cancellation_reason
`;

function mapWorkItem(row: KitchenWorkItemRow): KitchenWorkItemRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    branchId: row.branch_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    orderReference: row.order_reference,
    tableId: row.table_id,
    tableCode: row.table_code,
    itemName: row.item_name,
    quantity: row.quantity,
    selectedOptions: row.selected_options,
    note: row.note ?? undefined,
    changeKind: row.change_kind,
    correctionId: row.correction_id ?? undefined,
    state: row.state,
    version: row.version,
    queuedAtUtc: row.queued_at_utc,
    startedAtUtc: row.started_at_utc ?? undefined,
    startedByUserId: row.started_by_user_id ?? undefined,
    startedByEmployeeId: row.started_by_employee_id ?? undefined,
    readyAtUtc: row.ready_at_utc ?? undefined,
    readyByUserId: row.ready_by_user_id ?? undefined,
    readyByEmployeeId: row.ready_by_employee_id ?? undefined,
    cancelledAtUtc: row.cancelled_at_utc ?? undefined,
    cancelledByUserId: row.cancelled_by_user_id ?? undefined,
    cancelledByEmployeeId: row.cancelled_by_employee_id ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
  };
}

export class PostgresKitchenStore implements KitchenStore {
  public async createWorkForOrder(
    transaction: Parameters<KitchenStore["createWorkForOrder"]>[0],
    input: Parameters<KitchenStore["createWorkForOrder"]>[1],
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into kitchen.work_items (
          id, business_account_id, branch_id, order_id, order_item_id,
          order_reference, table_id, table_code, item_name, quantity,
          selected_options, note, change_kind, correction_id,
          state, version, queued_at_utc, updated_at_utc
        )
        select
          item.id, $1, $2, $3, item.order_item_id, $4, $5, $6,
          item.name, item.quantity, item.selected_options, item.note,
          $9, $10, 'queued', 1, $8, $8
        from jsonb_to_recordset($7::jsonb) as item(
          id uuid,
          order_item_id uuid,
          name varchar,
          quantity integer,
          selected_options jsonb,
          note varchar
        )
      `,
      [
        input.businessAccountId,
        input.branchId,
        input.orderId,
        input.orderReference,
        input.tableId,
        input.tableCode,
        JSON.stringify(
          input.items.map((item) => ({
            id: item.id,
            order_item_id: item.orderItemId,
            name: item.name,
            quantity: item.quantity,
            selected_options: item.selectedOptions,
            note: item.note ?? null,
          })),
        ),
        input.now,
        input.changeKind ?? "new",
        input.correctionId ?? null,
      ],
    );
  }

  public async listQueue(
    sql: Parameters<KitchenStore["listQueue"]>[0],
    input: Parameters<KitchenStore["listQueue"]>[1],
  ): Promise<readonly KitchenWorkItemRecord[]> {
    const result = await sql.query<KitchenWorkItemRow>(
      `
        select ${workItemColumns}
        from kitchen.work_items
        where business_account_id = $1
          and branch_id = $2
          and state <> 'cancelled'
        order by queued_at_utc, order_id, id
      `,
      [input.businessAccountId, input.branchId],
    );
    return result.rows.map(mapWorkItem);
  }

  public async getWorkItem(
    sql: Parameters<KitchenStore["getWorkItem"]>[0],
    businessAccountId: string,
    workItemId: string,
    lockForUpdate = false,
  ): Promise<KitchenWorkItemRecord | undefined> {
    const result = await sql.query<KitchenWorkItemRow>(
      `
        select ${workItemColumns}
        from kitchen.work_items
        where business_account_id = $1 and id = $2
        ${lockForUpdate ? "for update" : ""}
      `,
      [businessAccountId, workItemId],
    );
    const row = result.rows[0];
    return row ? mapWorkItem(row) : undefined;
  }

  public async startItem(
    transaction: Parameters<KitchenStore["startItem"]>[0],
    input: Parameters<KitchenStore["startItem"]>[1],
  ): Promise<KitchenWorkItemRecord | undefined> {
    const result = await transaction.sql.query<KitchenWorkItemRow>(
      `
        update kitchen.work_items
        set
          state = 'preparing',
          version = version + 1,
          started_at_utc = $5,
          started_by_user_id = $3,
          started_by_employee_id = $4,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and state = 'queued'
          and version = $6
        returning ${workItemColumns}
      `,
      [
        input.businessAccountId,
        input.workItemId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.expectedVersion,
      ],
    );
    const row = result.rows[0];
    return row ? mapWorkItem(row) : undefined;
  }

  public async markItemReady(
    transaction: Parameters<KitchenStore["markItemReady"]>[0],
    input: Parameters<KitchenStore["markItemReady"]>[1],
  ): Promise<KitchenWorkItemRecord | undefined> {
    const result = await transaction.sql.query<KitchenWorkItemRow>(
      `
        update kitchen.work_items
        set
          state = 'ready',
          version = version + 1,
          ready_at_utc = $5,
          ready_by_user_id = $3,
          ready_by_employee_id = $4,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and state = 'preparing'
          and version = $6
        returning ${workItemColumns}
      `,
      [
        input.businessAccountId,
        input.workItemId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.expectedVersion,
      ],
    );
    const row = result.rows[0];
    return row ? mapWorkItem(row) : undefined;
  }

  public async isOrderReady(
    sql: Parameters<KitchenStore["isOrderReady"]>[0],
    businessAccountId: string,
    orderId: string,
  ): Promise<boolean> {
    const result = await sql.query<{ readonly ready: boolean }>(
      `
        select
          count(*) filter (where state <> 'cancelled') > 0
          and bool_and(state in ('ready', 'cancelled')) as ready
        from kitchen.work_items
        where business_account_id = $1 and order_id = $2
      `,
      [businessAccountId, orderId],
    );
    return result.rows[0]?.ready === true;
  }

  public async cancelUnstartedForOrder(
    transaction: Parameters<KitchenStore["cancelUnstartedForOrder"]>[0],
    input: Parameters<KitchenStore["cancelUnstartedForOrder"]>[1],
  ): Promise<readonly KitchenWorkItemRecord[]> {
    const result = await transaction.sql.query<KitchenWorkItemRow>(
      `
        update kitchen.work_items
        set
          state = 'cancelled',
          version = version + 1,
          cancelled_at_utc = $5,
          cancelled_by_user_id = $3,
          cancelled_by_employee_id = $4,
          cancellation_reason = $6,
          updated_at_utc = $5
        where business_account_id = $1
          and order_id = $2
          and state = 'queued'
        returning ${workItemColumns}
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.reason,
      ],
    );
    return result.rows.map(mapWorkItem);
  }

  public async reassignOrdersToTable(
    transaction: Parameters<KitchenStore["reassignOrdersToTable"]>[0],
    input: Parameters<KitchenStore["reassignOrdersToTable"]>[1],
  ): Promise<void> {
    if (input.orderIds.length === 0) return;
    await transaction.sql.query(
      `
        update kitchen.work_items
        set
          table_id = $3,
          table_code = $4,
          updated_at_utc = $5
        where business_account_id = $1
          and order_id = any($2::uuid[])
          and state <> 'cancelled'
      `,
      [
        input.businessAccountId,
        input.orderIds,
        input.destinationTableId,
        input.destinationTableCode,
        input.now,
      ],
    );
  }
}
