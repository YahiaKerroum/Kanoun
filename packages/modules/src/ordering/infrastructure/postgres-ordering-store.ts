import type {
  Money,
  SqlExecutor,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  BillRequestRecord,
  CancellationRequestRecord,
  GuestSessionRecord,
  OrderCorrectionRecord,
  OrderItemRecord,
  OrderOptionSnapshot,
  OrderRecord,
} from "../domain/models.js";
import type {
  CreateGuestSessionInput,
  OrderingStore,
} from "../contracts/ordering-store.js";

interface GuestSessionRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string;
  readonly table_id: string | null;
  readonly table_session_id: string | null;
  readonly display_name: string | null;
  readonly csrf_token_hash: string | null;
  readonly created_at_utc: Date;
  readonly last_seen_at_utc: Date;
  readonly expires_at_utc: Date;
  readonly revoked_at_utc: Date | null;
}

interface OrderRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly branch_id: string;
  readonly table_session_id: string;
  readonly table_session_version: number;
  readonly table_id: string;
  readonly table_code: string;
  readonly reference: string;
  readonly creator_type: "guest" | "staff";
  readonly customer_session_id: string | null;
  readonly created_by_user_id: string | null;
  readonly created_by_employee_id: string | null;
  readonly customer_display_name: string | null;
  readonly configuration_version_id: string;
  readonly configuration_version: number;
  readonly approval_state: OrderRecord["approval"];
  readonly fulfilment_state: OrderRecord["fulfilment"];
  readonly financial_state: OrderRecord["financial"];
  readonly closure_state: OrderRecord["closure"];
  readonly customer_safe_status_reason: string | null;
  readonly total_amount: string;
  readonly currency: string;
  readonly version: number;
  readonly current_item_revision: number;
  readonly submitted_at_utc: Date;
  readonly accepted_at_utc: Date;
  readonly preparing_at_utc: Date | null;
  readonly ready_at_utc: Date | null;
  readonly served_at_utc: Date | null;
  readonly served_by_user_id: string | null;
  readonly served_by_employee_id: string | null;
  readonly completed_at_utc: Date | null;
  readonly completed_by_user_id: string | null;
  readonly completed_by_employee_id: string | null;
  readonly unpaid_completion_reason: string | null;
  readonly cancelled_at_utc: Date | null;
  readonly cancelled_by_user_id: string | null;
  readonly cancelled_by_employee_id: string | null;
  readonly cancellation_reason: string | null;
  readonly bill_request_id: string | null;
  readonly bill_request_status: "open" | null;
  readonly bill_requested_at_utc: Date | null;
  readonly bill_requested_by_guest_session_id: string | null;
  readonly cancellation_requested: boolean;
}

interface OrderItemRow {
  readonly id: string;
  readonly order_id: string;
  readonly revision: number;
  readonly source_dish_id: string;
  readonly source_menu_version: number;
  readonly dish_name: string;
  readonly base_price_amount: string;
  readonly unit_price_amount: string;
  readonly currency: string;
  readonly quantity: number;
  readonly selected_options: readonly {
    readonly optionGroupId: string;
    readonly optionGroupName: string;
    readonly optionId: string;
    readonly optionName: string;
    readonly priceDelta: Money;
  }[];
  readonly note: string | null;
  readonly tax_inclusive: boolean;
  readonly line_total_amount: string;
}

interface OrderCorrectionRow {
  readonly id: string;
  readonly order_id: string;
  readonly revision: number;
  readonly reason: string;
  readonly before_total_amount: string;
  readonly after_total_amount: string;
  readonly currency: string;
  readonly before_items: readonly OrderItemRecord[];
  readonly after_items: readonly OrderItemRecord[];
  readonly corrected_at_utc: Date;
  readonly corrected_by_user_id: string;
  readonly corrected_by_employee_id: string;
}

const orderSelect = `
  select
    o.id, o.business_account_id, o.restaurant_id, o.branch_id,
    o.table_session_id, ts.version as table_session_version,
    ts.table_id, t.code as table_code, o.reference,
    o.creator_type, o.customer_session_id, o.created_by_user_id,
    o.created_by_employee_id, o.customer_display_name,
    o.configuration_version_id, o.configuration_version,
    o.approval_state, o.fulfilment_state, o.financial_state, o.closure_state,
    o.customer_safe_status_reason, o.total_amount, o.currency, o.version,
    o.current_item_revision,
    o.submitted_at_utc, o.accepted_at_utc, o.preparing_at_utc, o.ready_at_utc,
    o.served_at_utc, o.served_by_user_id, o.served_by_employee_id,
    o.completed_at_utc, o.completed_by_user_id, o.completed_by_employee_id,
    o.unpaid_completion_reason, o.cancelled_at_utc, o.cancelled_by_user_id,
    o.cancelled_by_employee_id, o.cancellation_reason,
    br.id as bill_request_id, br.status as bill_request_status,
    br.requested_at_utc as bill_requested_at_utc,
    br.requested_by_guest_session_id as bill_requested_by_guest_session_id,
    exists (
      select 1 from ordering.cancellation_requests cr
      where cr.business_account_id = o.business_account_id
        and cr.order_id = o.id and cr.status = 'open'
    ) as cancellation_requested
  from ordering.orders o
  inner join tables.table_sessions ts
    on ts.business_account_id = o.business_account_id
    and ts.id = o.table_session_id
  inner join tables.tables t
    on t.business_account_id = ts.business_account_id and t.id = ts.table_id
  left join ordering.bill_requests br
    on br.business_account_id = o.business_account_id
    and br.order_id = o.id
    and br.status = 'open'
`;

function mapGuestSession(row: GuestSessionRow): GuestSessionRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableId: row.table_id ?? undefined,
    tableSessionId: row.table_session_id ?? undefined,
    displayName: row.display_name ?? undefined,
    csrfTokenHash: row.csrf_token_hash ?? undefined,
    createdAtUtc: row.created_at_utc,
    lastSeenAtUtc: row.last_seen_at_utc,
    expiresAtUtc: row.expires_at_utc,
    revokedAtUtc: row.revoked_at_utc ?? undefined,
  };
}

function mapItem(row: OrderItemRow): OrderItemRecord {
  const selectedOptions: OrderOptionSnapshot[] = row.selected_options.map(
    (option) => ({
      optionGroupId: option.optionGroupId,
      optionGroupName: option.optionGroupName,
      optionId: option.optionId,
      optionName: option.optionName,
      priceDelta: option.priceDelta,
    }),
  );
  return {
    id: row.id,
    revision: row.revision,
    sourceDishId: row.source_dish_id,
    sourceMenuVersion: row.source_menu_version,
    name: row.dish_name,
    basePrice: { amount: row.base_price_amount, currency: row.currency },
    unitPrice: { amount: row.unit_price_amount, currency: row.currency },
    quantity: row.quantity,
    selectedOptions,
    note: row.note ?? undefined,
    taxInclusive: row.tax_inclusive,
    total: { amount: row.line_total_amount, currency: row.currency },
  };
}

function mapOrder(
  row: OrderRow,
  items: readonly OrderItemRecord[],
  corrections: readonly OrderCorrectionRecord[],
): OrderRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableSessionId: row.table_session_id,
    tableSessionVersion: row.table_session_version,
    tableId: row.table_id,
    tableCode: row.table_code,
    reference: row.reference,
    creatorType: row.creator_type,
    customerSessionId: row.customer_session_id ?? undefined,
    createdByUserId: row.created_by_user_id ?? undefined,
    createdByEmployeeId: row.created_by_employee_id ?? undefined,
    customerDisplayName: row.customer_display_name ?? undefined,
    configurationVersionId: row.configuration_version_id,
    configurationVersion: row.configuration_version,
    approval: row.approval_state,
    fulfilment: row.fulfilment_state,
    financial: row.financial_state,
    closure: row.closure_state,
    customerSafeStatusReason: row.customer_safe_status_reason ?? undefined,
    total: { amount: row.total_amount, currency: row.currency },
    version: row.version,
    currentItemRevision: row.current_item_revision,
    submittedAtUtc: row.submitted_at_utc,
    acceptedAtUtc: row.accepted_at_utc,
    preparingAtUtc: row.preparing_at_utc ?? undefined,
    readyAtUtc: row.ready_at_utc ?? undefined,
    servedAtUtc: row.served_at_utc ?? undefined,
    servedByUserId: row.served_by_user_id ?? undefined,
    servedByEmployeeId: row.served_by_employee_id ?? undefined,
    completedAtUtc: row.completed_at_utc ?? undefined,
    completedByUserId: row.completed_by_user_id ?? undefined,
    completedByEmployeeId: row.completed_by_employee_id ?? undefined,
    unpaidCompletionReason: row.unpaid_completion_reason ?? undefined,
    cancelledAtUtc: row.cancelled_at_utc ?? undefined,
    cancelledByUserId: row.cancelled_by_user_id ?? undefined,
    cancelledByEmployeeId: row.cancelled_by_employee_id ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    items,
    corrections,
    billRequest:
      row.bill_request_id &&
      row.bill_request_status &&
      row.bill_requested_at_utc
        ? {
            id: row.bill_request_id,
            orderId: row.id,
            branchId: row.branch_id,
            status: row.bill_request_status,
            requestedAtUtc: row.bill_requested_at_utc,
            requestedByGuestSessionId:
              row.bill_requested_by_guest_session_id ?? undefined,
          }
        : undefined,
    cancellationRequested: row.cancellation_requested,
  };
}

async function readItems(
  sql: SqlExecutor,
  businessAccountId: string,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, readonly OrderItemRecord[]>> {
  const byOrder = new Map<string, OrderItemRecord[]>();
  if (orderIds.length === 0) {
    return byOrder;
  }
  const result = await sql.query<OrderItemRow>(
    `
      select
        oi.id, oi.order_id, oi.revision, oi.source_dish_id,
        oi.source_menu_version, oi.dish_name,
        oi.base_price_amount, oi.unit_price_amount, oi.currency, oi.quantity,
        oi.selected_options, oi.note, oi.tax_inclusive, oi.line_total_amount
      from ordering.order_items oi
      inner join ordering.orders o
        on o.business_account_id = oi.business_account_id
        and o.id = oi.order_id
        and o.current_item_revision = oi.revision
      where oi.business_account_id = $1 and oi.order_id = any($2::uuid[])
      order by oi.order_id, oi.position
    `,
    [businessAccountId, orderIds],
  );
  for (const row of result.rows) {
    const items = byOrder.get(row.order_id) ?? [];
    items.push(mapItem(row));
    byOrder.set(row.order_id, items);
  }
  return byOrder;
}

async function readCorrections(
  sql: SqlExecutor,
  businessAccountId: string,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, readonly OrderCorrectionRecord[]>> {
  const byOrder = new Map<string, OrderCorrectionRecord[]>();
  if (orderIds.length === 0) return byOrder;
  const result = await sql.query<OrderCorrectionRow>(
    `
      select
        id, order_id, revision, reason, before_total_amount,
        after_total_amount, currency, before_items, after_items,
        corrected_at_utc, corrected_by_user_id, corrected_by_employee_id
      from ordering.order_corrections
      where business_account_id = $1 and order_id = any($2::uuid[])
      order by order_id, revision
    `,
    [businessAccountId, orderIds],
  );
  for (const row of result.rows) {
    const corrections = byOrder.get(row.order_id) ?? [];
    corrections.push({
      id: row.id,
      orderId: row.order_id,
      revision: row.revision,
      reason: row.reason,
      beforeTotal: {
        amount: row.before_total_amount,
        currency: row.currency,
      },
      afterTotal: {
        amount: row.after_total_amount,
        currency: row.currency,
      },
      beforeItems: row.before_items,
      afterItems: row.after_items,
      correctedAtUtc: row.corrected_at_utc,
      correctedByUserId: row.corrected_by_user_id,
      correctedByEmployeeId: row.corrected_by_employee_id,
    });
    byOrder.set(row.order_id, corrections);
  }
  return byOrder;
}

export class PostgresOrderingStore implements OrderingStore {
  public async branchHasActiveOrders(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<boolean> {
    const result = await sql.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from ordering.orders
          where business_account_id = $1
            and branch_id = $2
            and closure_state = 'active'
        ) as exists
      `,
      [businessAccountId, branchId],
    );
    return result.rows[0]?.exists ?? false;
  }

  public async createGuestSession(
    transaction: TransactionContext,
    input: CreateGuestSessionInput,
  ): Promise<GuestSessionRecord> {
    const result = await transaction.sql.query<GuestSessionRow>(
      `
        insert into ordering.customer_sessions (
          id, business_account_id, restaurant_id, branch_id, table_id,
          token_hash, csrf_token_hash, display_name,
          created_at_utc, last_seen_at_utc, expires_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
        returning
          id, business_account_id, restaurant_id, branch_id, table_id,
          table_session_id, display_name, csrf_token_hash,
          created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.tableId ?? null,
        input.tokenHash,
        input.csrfTokenHash,
        input.displayName ?? null,
        input.now,
        input.absoluteExpiresAtUtc,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Database insert did not return the created record.");
    }
    return mapGuestSession(row);
  }

  public async findGuestSessionByTokenHash(
    sql: SqlExecutor,
    tokenHash: string,
  ): Promise<GuestSessionRecord | undefined> {
    const result = await sql.query<GuestSessionRow>(
      `
        select
          id, business_account_id, restaurant_id, branch_id, table_id,
          table_session_id, display_name, csrf_token_hash,
          created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
        from ordering.customer_sessions
        where token_hash = $1
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? mapGuestSession(row) : undefined;
  }

  public async getGuestSession(
    sql: SqlExecutor,
    businessAccountId: string,
    guestSessionId: string,
  ): Promise<GuestSessionRecord | undefined> {
    const result = await sql.query<GuestSessionRow>(
      `
        select
          id, business_account_id, restaurant_id, branch_id, table_id,
          table_session_id, display_name, csrf_token_hash,
          created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
        from ordering.customer_sessions
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, guestSessionId],
    );
    const row = result.rows[0];
    return row ? mapGuestSession(row) : undefined;
  }

  public async touchGuestSession(
    sql: SqlExecutor,
    id: string,
    now: Date,
  ): Promise<void> {
    await sql.query(
      `update ordering.customer_sessions set last_seen_at_utc = $2 where id = $1`,
      [id, now],
    );
  }

  public async bindGuestSessionToTableSession(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["bindGuestSessionToTableSession"]>[1],
  ): Promise<boolean> {
    const result = await transaction.sql.query(
      `
        update ordering.customer_sessions
        set
          table_session_id = $3,
          display_name = coalesce($4, display_name)
        where business_account_id = $1
          and id = $2
          and (table_session_id is null or table_session_id = $3)
        returning id
      `,
      [
        input.businessAccountId,
        input.guestSessionId,
        input.tableSessionId,
        input.displayName ?? null,
      ],
    );
    return result.rowCount === 1;
  }

  public async createOrder(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["createOrder"]>[1],
  ): Promise<OrderRecord> {
    const sequence = await transaction.sql.query<{
      readonly last_value: string;
    }>(
      `
        insert into ordering.branch_order_sequences (
          business_account_id, branch_id, last_value
        )
        values ($1, $2, 1)
        on conflict (business_account_id, branch_id)
        do update set last_value = ordering.branch_order_sequences.last_value + 1
        returning last_value
      `,
      [input.businessAccountId, input.branchId],
    );
    const sequenceValue = sequence.rows[0]?.last_value;
    if (!sequenceValue) {
      throw new Error("Database did not return an order sequence value.");
    }
    const reference = `ORD-${sequenceValue.padStart(6, "0")}`;

    await transaction.sql.query(
      `
        insert into ordering.orders (
          id, business_account_id, restaurant_id, branch_id, table_session_id,
          reference, creator_type, customer_session_id, created_by_user_id,
          created_by_employee_id, customer_display_name,
          configuration_version_id, configuration_version,
          approval_state, fulfilment_state, financial_state, closure_state,
          total_amount, currency, version,
          submitted_at_utc, accepted_at_utc, updated_at_utc
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          'accepted', 'not_started', 'unpaid', 'active',
          $14, $15, 2, $16, $16, $16
        )
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.tableSessionId,
        reference,
        input.creatorType,
        input.customerSessionId ?? null,
        input.createdByUserId ?? null,
        input.createdByEmployeeId ?? null,
        input.customerDisplayName ?? null,
        input.configurationVersionId,
        input.configurationVersion,
        input.total.amount,
        input.total.currency,
        input.now,
      ],
    );

    const itemPayload = input.items.map((item, position) => ({
      id: item.id,
      position,
      sourceDishId: item.sourceDishId,
      sourceMenuVersion: item.sourceMenuVersion,
      dishName: item.dishName,
      basePriceAmount: item.basePrice.amount,
      unitPriceAmount: item.unitPrice.amount,
      currency: item.unitPrice.currency,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions,
      note: item.note ?? null,
      taxInclusive: item.taxInclusive,
      lineTotalAmount: item.lineTotal.amount,
    }));
    await transaction.sql.query(
      `
        insert into ordering.order_items (
          id, business_account_id, branch_id, order_id, position,
          source_dish_id, source_menu_version, dish_name,
          base_price_amount, unit_price_amount, currency, quantity,
          selected_options, note, tax_inclusive, line_total_amount, created_at_utc
        )
        select
          item.id, $2, $3, $1, item.position,
          item.source_dish_id, item.source_menu_version, item.dish_name,
          item.base_price_amount, item.unit_price_amount, item.currency,
          item.quantity, item.selected_options, item.note,
          item.tax_inclusive, item.line_total_amount, $5
        from jsonb_to_recordset($4::jsonb) as item(
          id uuid,
          position integer,
          source_dish_id uuid,
          source_menu_version integer,
          dish_name varchar,
          base_price_amount numeric,
          unit_price_amount numeric,
          currency char(3),
          quantity integer,
          selected_options jsonb,
          note varchar,
          tax_inclusive boolean,
          line_total_amount numeric
        )
      `,
      [
        input.id,
        input.businessAccountId,
        input.branchId,
        JSON.stringify(
          itemPayload.map((item) => ({
            id: item.id,
            position: item.position,
            source_dish_id: item.sourceDishId,
            source_menu_version: item.sourceMenuVersion,
            dish_name: item.dishName,
            base_price_amount: item.basePriceAmount,
            unit_price_amount: item.unitPriceAmount,
            currency: item.currency,
            quantity: item.quantity,
            selected_options: item.selectedOptions,
            note: item.note,
            tax_inclusive: item.taxInclusive,
            line_total_amount: item.lineTotalAmount,
          })),
        ),
        input.now,
      ],
    );

    const created = await this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.id,
    );
    if (!created) {
      throw new Error("Database insert did not return the created order.");
    }
    return created;
  }

  public async getGuestOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    guestSessionId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined> {
    const result = await sql.query<OrderRow>(
      `${orderSelect}
       where o.business_account_id = $1
         and o.customer_session_id = $2
         and o.id = $3`,
      [businessAccountId, guestSessionId, orderId],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    const items = await readItems(sql, businessAccountId, [row.id]);
    const corrections = await readCorrections(sql, businessAccountId, [row.id]);
    return mapOrder(
      row,
      items.get(row.id) ?? [],
      corrections.get(row.id) ?? [],
    );
  }

  public async getOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined> {
    return this.readOrder(sql, businessAccountId, orderId);
  }

  public async getOrderForUpdate(
    transaction: TransactionContext,
    businessAccountId: string,
    orderId: string,
  ): Promise<OrderRecord | undefined> {
    return this.readOrder(transaction.sql, businessAccountId, orderId, true);
  }

  public async transitionFulfilment(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["transitionFulfilment"]>[1],
  ): Promise<OrderRecord | undefined> {
    const timestampColumn =
      input.to === "preparing" ? "preparing_at_utc" : "ready_at_utc";
    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set
          fulfilment_state = $4,
          version = version + 1,
          ${timestampColumn} = $5,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and fulfilment_state = $3
          and closure_state = 'active'
        returning id
      `,
      [input.businessAccountId, input.orderId, input.from, input.to, input.now],
    );
    if (updated.rowCount !== 1) {
      return undefined;
    }
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async markServed(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["markServed"]>[1],
  ): Promise<OrderRecord | undefined> {
    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set
          fulfilment_state = 'served',
          version = version + 1,
          served_at_utc = $5,
          served_by_user_id = $3,
          served_by_employee_id = $4,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and fulfilment_state = 'ready'
          and closure_state = 'active'
          and version = $6
        returning id
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.expectedVersion,
      ],
    );
    if (updated.rowCount !== 1) {
      return undefined;
    }
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async listStaffOrders(
    sql: SqlExecutor,
    input: Parameters<OrderingStore["listStaffOrders"]>[1],
  ): Promise<readonly OrderRecord[]> {
    const result = await sql.query<OrderRow>(
      `${orderSelect}
       where o.business_account_id = $1
         and o.branch_id = $2
         and ($3::varchar is null or o.approval_state = $3)
         and ($4::varchar is null or o.fulfilment_state = $4)
         and ($5::varchar is null or o.closure_state = $5)
         and ($6::uuid is null or ts.table_id = $6)
         and ($7::uuid is null or o.created_by_employee_id = $7)
         and ($8::timestamptz is null or o.submitted_at_utc >= $8)
         and ($9::timestamptz is null or o.submitted_at_utc <= $9)
         and (
           $10::timestamptz is null
           or (o.submitted_at_utc, o.id) < ($10, $11::uuid)
         )
       order by o.submitted_at_utc desc, o.id desc
       limit $12`,
      [
        input.businessAccountId,
        input.branchId,
        input.approval ?? null,
        input.fulfilment ?? null,
        input.closure ?? null,
        input.tableId ?? null,
        input.createdByEmployeeId ?? null,
        input.submittedFromUtc ?? null,
        input.submittedToUtc ?? null,
        input.beforeSubmittedAtUtc ?? null,
        input.beforeOrderId ?? null,
        input.pageSize,
      ],
    );
    const items = await readItems(
      sql,
      input.businessAccountId,
      result.rows.map((row) => row.id),
    );
    const corrections = await readCorrections(
      sql,
      input.businessAccountId,
      result.rows.map((row) => row.id),
    );
    return result.rows.map((row) =>
      mapOrder(row, items.get(row.id) ?? [], corrections.get(row.id) ?? []),
    );
  }

  public async createCancellationRequest(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["createCancellationRequest"]>[1],
  ): Promise<CancellationRequestRecord> {
    const inserted = await transaction.sql.query<{
      readonly id: string;
      readonly order_id: string;
      readonly status: "open" | "resolved";
      readonly reason: string;
      readonly created_at_utc: Date;
    }>(
      `
        insert into ordering.cancellation_requests (
          id, business_account_id, branch_id, order_id,
          customer_session_id, reason, status, created_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, 'open', $7)
        on conflict (business_account_id, order_id) where status = 'open'
        do nothing
        returning id, order_id, status, reason, created_at_utc
      `,
      [
        input.id,
        input.businessAccountId,
        input.branchId,
        input.orderId,
        input.customerSessionId,
        input.reason,
        input.now,
      ],
    );
    const row =
      inserted.rows[0] ??
      (
        await transaction.sql.query<{
          readonly id: string;
          readonly order_id: string;
          readonly status: "open" | "resolved";
          readonly reason: string;
          readonly created_at_utc: Date;
        }>(
          `
            select id, order_id, status, reason, created_at_utc
            from ordering.cancellation_requests
            where business_account_id = $1 and order_id = $2 and status = 'open'
          `,
          [input.businessAccountId, input.orderId],
        )
      ).rows[0];
    if (!row) {
      throw new Error("Database did not return the cancellation request.");
    }
    return {
      id: row.id,
      orderId: row.order_id,
      status: row.status,
      reason: row.reason,
      createdAtUtc: row.created_at_utc,
    };
  }

  public async createOrGetBillRequest(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["createOrGetBillRequest"]>[1],
  ): Promise<BillRequestRecord> {
    const inserted = await transaction.sql.query<{
      readonly id: string;
      readonly order_id: string;
      readonly branch_id: string;
      readonly status: "open" | "resolved";
      readonly requested_at_utc: Date;
      readonly requested_by_guest_session_id: string | null;
      readonly resolved_at_utc: Date | null;
    }>(
      `
        insert into ordering.bill_requests (
          id, business_account_id, restaurant_id, branch_id, order_id,
          requested_by_guest_session_id, status, requested_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, 'open', $7)
        on conflict (business_account_id, order_id) where status = 'open'
        do nothing
        returning
          id, order_id, branch_id, status, requested_at_utc,
          requested_by_guest_session_id, resolved_at_utc
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.orderId,
        input.guestSessionId,
        input.now,
      ],
    );
    const row =
      inserted.rows[0] ??
      (
        await transaction.sql.query<{
          readonly id: string;
          readonly order_id: string;
          readonly branch_id: string;
          readonly status: "open" | "resolved";
          readonly requested_at_utc: Date;
          readonly requested_by_guest_session_id: string | null;
          readonly resolved_at_utc: Date | null;
        }>(
          `
            select
              id, order_id, branch_id, status, requested_at_utc,
              requested_by_guest_session_id, resolved_at_utc
            from ordering.bill_requests
            where business_account_id = $1
              and order_id = $2
              and status = 'open'
          `,
          [input.businessAccountId, input.orderId],
        )
      ).rows[0];
    if (!row) throw new Error("Database did not return the bill request.");
    return {
      id: row.id,
      orderId: row.order_id,
      branchId: row.branch_id,
      status: row.status,
      requestedAtUtc: row.requested_at_utc,
      requestedByGuestSessionId: row.requested_by_guest_session_id ?? undefined,
      resolvedAtUtc: row.resolved_at_utc ?? undefined,
    };
  }

  public async getBillRequest(
    sql: SqlExecutor,
    businessAccountId: string,
    billRequestId: string,
  ): Promise<BillRequestRecord | undefined> {
    const result = await sql.query<{
      readonly id: string;
      readonly order_id: string;
      readonly branch_id: string;
      readonly status: "open" | "resolved";
      readonly requested_at_utc: Date;
      readonly requested_by_guest_session_id: string | null;
      readonly resolved_at_utc: Date | null;
    }>(
      `
        select
          id, order_id, branch_id, status, requested_at_utc,
          requested_by_guest_session_id, resolved_at_utc
        from ordering.bill_requests
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, billRequestId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          orderId: row.order_id,
          branchId: row.branch_id,
          status: row.status,
          requestedAtUtc: row.requested_at_utc,
          requestedByGuestSessionId:
            row.requested_by_guest_session_id ?? undefined,
          resolvedAtUtc: row.resolved_at_utc ?? undefined,
        }
      : undefined;
  }

  public async listOpenBillRequests(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<readonly BillRequestRecord[]> {
    const result = await sql.query<{
      readonly id: string;
      readonly order_id: string;
      readonly branch_id: string;
      readonly requested_at_utc: Date;
      readonly requested_by_guest_session_id: string | null;
    }>(
      `
        select
          id, order_id, branch_id, requested_at_utc,
          requested_by_guest_session_id
        from ordering.bill_requests
        where business_account_id = $1
          and branch_id = $2
          and status = 'open'
        order by requested_at_utc, id
      `,
      [businessAccountId, branchId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      branchId: row.branch_id,
      status: "open",
      requestedAtUtc: row.requested_at_utc,
      requestedByGuestSessionId: row.requested_by_guest_session_id ?? undefined,
    }));
  }

  public async resolveOpenBillRequest(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["resolveOpenBillRequest"]>[1],
  ): Promise<BillRequestRecord | undefined> {
    const result = await transaction.sql.query<{
      readonly id: string;
      readonly order_id: string;
      readonly branch_id: string;
      readonly requested_at_utc: Date;
      readonly requested_by_guest_session_id: string | null;
      readonly resolved_at_utc: Date;
    }>(
      `
        update ordering.bill_requests
        set
          status = 'resolved',
          resolved_at_utc = $3,
          resolved_by_user_id = $4
        where business_account_id = $1
          and order_id = $2
          and status = 'open'
        returning
          id, order_id, branch_id, requested_at_utc,
          requested_by_guest_session_id, resolved_at_utc
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.now,
        input.actorUserId ?? null,
      ],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          orderId: row.order_id,
          branchId: row.branch_id,
          status: "resolved",
          requestedAtUtc: row.requested_at_utc,
          requestedByGuestSessionId:
            row.requested_by_guest_session_id ?? undefined,
          resolvedAtUtc: row.resolved_at_utc,
        }
      : undefined;
  }

  public async appendCorrection(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["appendCorrection"]>[1],
  ): Promise<OrderRecord | undefined> {
    const current = await this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
      true,
    );
    if (
      current?.version !== input.expectedVersion ||
      current.currentItemRevision !== input.expectedRevision ||
      current.closure !== "active" ||
      current.fulfilment !== "not_started" ||
      current.financial !== "unpaid"
    ) {
      return undefined;
    }
    const revision = current.currentItemRevision + 1;
    const afterItems: OrderItemRecord[] = input.items.map((item) => ({
      id: item.id,
      revision,
      sourceDishId: item.sourceDishId,
      sourceMenuVersion: item.sourceMenuVersion,
      name: item.dishName,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions.map((option) => ({
        optionGroupId: option.optionGroupId,
        optionGroupName: option.optionGroupName,
        optionId: option.optionId,
        optionName: option.optionName,
        priceDelta: option.priceDelta,
      })),
      note: item.note,
      taxInclusive: item.taxInclusive,
      total: item.lineTotal,
    }));

    await transaction.sql.query(
      `
        insert into ordering.order_corrections (
          id, business_account_id, restaurant_id, branch_id, order_id,
          revision, reason, before_total_amount, after_total_amount, currency,
          before_items, after_items, corrected_at_utc,
          corrected_by_user_id, corrected_by_employee_id
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11::jsonb, $12::jsonb, $13, $14, $15
        )
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        input.orderId,
        revision,
        input.reason,
        current.total.amount,
        input.total.amount,
        input.total.currency,
        JSON.stringify(current.items),
        JSON.stringify(afterItems),
        input.now,
        input.actorUserId,
        input.effectiveEmployeeId,
      ],
    );

    await transaction.sql.query(
      `
        insert into ordering.order_items (
          id, business_account_id, branch_id, order_id, revision, position,
          source_dish_id, source_menu_version, dish_name,
          base_price_amount, unit_price_amount, currency, quantity,
          selected_options, note, tax_inclusive, line_total_amount,
          created_at_utc
        )
        select
          item.id, $2, $3, $1, $4, item.position,
          item.source_dish_id, item.source_menu_version, item.dish_name,
          item.base_price_amount, item.unit_price_amount, item.currency,
          item.quantity, item.selected_options, item.note,
          item.tax_inclusive, item.line_total_amount, $6
        from jsonb_to_recordset($5::jsonb) as item(
          id uuid,
          position integer,
          source_dish_id uuid,
          source_menu_version integer,
          dish_name varchar,
          base_price_amount numeric,
          unit_price_amount numeric,
          currency char(3),
          quantity integer,
          selected_options jsonb,
          note varchar,
          tax_inclusive boolean,
          line_total_amount numeric
        )
      `,
      [
        input.orderId,
        input.businessAccountId,
        input.branchId,
        revision,
        JSON.stringify(
          input.items.map((item, position) => ({
            id: item.id,
            position,
            source_dish_id: item.sourceDishId,
            source_menu_version: item.sourceMenuVersion,
            dish_name: item.dishName,
            base_price_amount: item.basePrice.amount,
            unit_price_amount: item.unitPrice.amount,
            currency: item.unitPrice.currency,
            quantity: item.quantity,
            selected_options: item.selectedOptions,
            note: item.note ?? null,
            tax_inclusive: item.taxInclusive,
            line_total_amount: item.lineTotal.amount,
          })),
        ),
        input.now,
      ],
    );

    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set
          current_item_revision = $4,
          total_amount = $5,
          currency = $6,
          version = version + 1,
          updated_at_utc = $7
        where business_account_id = $1
          and id = $2
          and version = $3
          and current_item_revision = $4 - 1
          and closure_state = 'active'
          and fulfilment_state = 'not_started'
          and financial_state = 'unpaid'
        returning id
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.expectedVersion,
        revision,
        input.total.amount,
        input.total.currency,
        input.now,
      ],
    );
    if (updated.rowCount !== 1) return undefined;
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async updateFinancialState(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["updateFinancialState"]>[1],
  ): Promise<OrderRecord | undefined> {
    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set financial_state = $4, version = version + 1, updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and version = $3
          and financial_state = $6
        returning id
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.expectedVersion,
        input.to,
        input.now,
        input.from,
      ],
    );
    if (updated.rowCount !== 1) return undefined;
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async completeOrder(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["completeOrder"]>[1],
  ): Promise<OrderRecord | undefined> {
    const override = input.unpaidOverrideReason !== undefined;
    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set
          closure_state = 'completed',
          version = version + 1,
          completed_at_utc = $5,
          completed_by_user_id = $3,
          completed_by_employee_id = $4,
          unpaid_completion_reason = $6,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and version = $7
          and closure_state = 'active'
          and fulfilment_state = 'served'
          and ($8::boolean or financial_state = 'paid')
        returning id
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.unpaidOverrideReason ?? null,
        input.expectedVersion,
        override,
      ],
    );
    if (updated.rowCount !== 1) return undefined;
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async cancelOrder(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["cancelOrder"]>[1],
  ): Promise<OrderRecord | undefined> {
    const updated = await transaction.sql.query(
      `
        update ordering.orders
        set
          closure_state = 'cancelled',
          version = version + 1,
          customer_safe_status_reason = $6,
          cancelled_at_utc = $5,
          cancelled_by_user_id = $3,
          cancelled_by_employee_id = $4,
          cancellation_reason = $6,
          updated_at_utc = $5
        where business_account_id = $1
          and id = $2
          and version = $7
          and closure_state = 'active'
          and fulfilment_state <> 'served'
        returning id
      `,
      [
        input.businessAccountId,
        input.orderId,
        input.actorUserId,
        input.effectiveEmployeeId,
        input.now,
        input.reason,
        input.expectedVersion,
      ],
    );
    if (updated.rowCount !== 1) return undefined;
    return this.readOrder(
      transaction.sql,
      input.businessAccountId,
      input.orderId,
    );
  }

  public async resolveCancellationRequests(
    transaction: TransactionContext,
    businessAccountId: string,
    orderId: string,
    now: Date,
  ): Promise<void> {
    await transaction.sql.query(
      `
        update ordering.cancellation_requests
        set status = 'resolved', resolved_at_utc = $3
        where business_account_id = $1
          and order_id = $2
          and status = 'open'
      `,
      [businessAccountId, orderId, now],
    );
  }

  public async reassignTableSessionReferences(
    transaction: TransactionContext,
    input: Parameters<OrderingStore["reassignTableSessionReferences"]>[1],
  ): Promise<readonly string[]> {
    await transaction.sql.query(
      `
        update ordering.customer_sessions
        set table_id = $3
        where business_account_id = $1 and table_session_id = $2
      `,
      [input.businessAccountId, input.tableSessionId, input.destinationTableId],
    );
    const result = await transaction.sql.query<{ readonly id: string }>(
      `
        select id
        from ordering.orders
        where business_account_id = $1 and table_session_id = $2
        order by submitted_at_utc, id
      `,
      [input.businessAccountId, input.tableSessionId],
    );
    return result.rows.map((row) => row.id);
  }

  public async tableSessionHasUnresolvedWork(
    sql: SqlExecutor,
    businessAccountId: string,
    tableSessionId: string,
  ): Promise<boolean> {
    const result = await sql.query<{ readonly unresolved: boolean }>(
      `
        select
          exists (
            select 1
            from ordering.orders o
            where o.business_account_id = $1
              and o.table_session_id = $2
              and o.closure_state = 'active'
          )
          or exists (
            select 1
            from ordering.bill_requests br
            inner join ordering.orders o
              on o.business_account_id = br.business_account_id
              and o.id = br.order_id
            where br.business_account_id = $1
              and o.table_session_id = $2
              and br.status = 'open'
          ) as unresolved
      `,
      [businessAccountId, tableSessionId],
    );
    return result.rows[0]?.unresolved === true;
  }

  private async readOrder(
    sql: SqlExecutor,
    businessAccountId: string,
    orderId: string,
    lockForUpdate = false,
  ): Promise<OrderRecord | undefined> {
    const result = await sql.query<OrderRow>(
      `${orderSelect}
       where o.business_account_id = $1 and o.id = $2
       ${lockForUpdate ? "for update of o" : ""}`,
      [businessAccountId, orderId],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    const items = await readItems(sql, businessAccountId, [row.id]);
    const corrections = await readCorrections(sql, businessAccountId, [row.id]);
    return mapOrder(
      row,
      items.get(row.id) ?? [],
      corrections.get(row.id) ?? [],
    );
  }
}
