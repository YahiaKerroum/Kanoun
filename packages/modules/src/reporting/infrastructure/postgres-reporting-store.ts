import type {
  BranchDashboardData,
  ReportingBranch,
  ReportingStore,
  SalesReportRow,
} from "../contracts/reporting-store.js";

export class PostgresReportingStore implements ReportingStore {
  public async applyEvent(
    transaction: Parameters<ReportingStore["applyEvent"]>[0],
    input: Parameters<ReportingStore["applyEvent"]>[1],
  ): Promise<void> {
    if (
      input.eventType === "restaurant.branch_created.v1" ||
      input.eventType === "restaurant.branch_updated.v1"
    ) {
      await this.refreshBranch(
        transaction.sql,
        input.businessAccountId,
        input.aggregateId,
      );
    } else if (
      (input.eventType === "restaurant.restaurant_created.v1" ||
        input.eventType === "restaurant.restaurant_updated.v1") &&
      input.restaurantId
    ) {
      await this.refreshRestaurantBranches(
        transaction.sql,
        input.businessAccountId,
        input.restaurantId,
      );
    }

    const payloadOrderId =
      typeof input.payload.orderId === "string"
        ? input.payload.orderId
        : undefined;
    const orderId = input.eventType.startsWith("ordering.")
      ? (payloadOrderId ?? input.aggregateId)
      : payloadOrderId;
    if (orderId) {
      await this.refreshOrder(
        transaction.sql,
        input.businessAccountId,
        orderId,
      );
    }
    if (input.eventType.startsWith("kitchen.")) {
      await this.refreshKitchenItem(
        transaction.sql,
        input.businessAccountId,
        input.aggregateId,
      );
    }
    if (input.eventType.startsWith("tables.")) {
      await this.refreshTableSession(
        transaction.sql,
        input.businessAccountId,
        input.aggregateId,
      );
      await this.refreshOrderTablesForSession(
        transaction.sql,
        input.businessAccountId,
        input.aggregateId,
        input.now,
      );
    }

    await transaction.sql.query(
      `
        insert into reporting.projection_checkpoints (
          handler_name, business_account_id, last_event_id,
          last_occurred_at_utc, processed_count, status, updated_at_utc
        )
        values ($1, $2, $3, $4, 1, 'current', $5)
        on conflict (handler_name, business_account_id)
        do update set
          last_event_id = excluded.last_event_id,
          last_occurred_at_utc = excluded.last_occurred_at_utc,
          processed_count =
            reporting.projection_checkpoints.processed_count + 1,
          status = 'current',
          updated_at_utc = excluded.updated_at_utc
      `,
      [
        input.handlerName,
        input.businessAccountId,
        input.eventId,
        input.occurredAtUtc,
        input.now,
      ],
    );
  }

  public async rebuildTenant(
    transaction: Parameters<ReportingStore["rebuildTenant"]>[0],
    input: Parameters<ReportingStore["rebuildTenant"]>[1],
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into reporting.projection_checkpoints (
          handler_name, business_account_id, last_event_id,
          last_occurred_at_utc, processed_count, status, updated_at_utc
        )
        values ($1, $2, $3, $4, 0, 'rebuilding', $5)
        on conflict (handler_name, business_account_id)
        do update set status = 'rebuilding', updated_at_utc = excluded.updated_at_utc
      `,
      [
        input.handlerName,
        input.businessAccountId,
        input.eventId,
        input.occurredAtUtc,
        input.now,
      ],
    );
    for (const table of [
      "kitchen_item_projections",
      "table_session_projections",
      "sales_order_projections",
      "order_projections",
      "branch_catalog",
    ]) {
      await transaction.sql.query(
        `delete from reporting.${table} where business_account_id = $1`,
        [input.businessAccountId],
      );
    }
    await transaction.sql.query(
      `
        insert into reporting.branch_catalog (
          business_account_id, restaurant_id, branch_id, restaurant_name,
          branch_name, time_zone, currency, branch_status, updated_at_utc
        )
        select b.business_account_id, b.restaurant_id, b.id, r.name, b.name,
          b.time_zone, b.currency, b.status, b.updated_at_utc
        from restaurant.branches b
        join restaurant.restaurants r
          on r.business_account_id = b.business_account_id
         and r.id = b.restaurant_id
        where b.business_account_id = $1
      `,
      [input.businessAccountId],
    );
    await transaction.sql.query(
      `
        insert into reporting.order_projections (
          business_account_id, restaurant_id, branch_id, order_id,
          order_reference, table_id, approval_state, fulfilment_state,
          financial_state, closure_state, total_amount, currency,
          created_by_employee_id, submitted_at_utc, updated_at_utc,
          open_bill_request, open_cancellation_request
        )
        select o.business_account_id, o.restaurant_id, o.branch_id, o.id,
          o.reference, ts.table_id, o.approval_state, o.fulfilment_state,
          o.financial_state, o.closure_state, o.total_amount, o.currency,
          o.created_by_employee_id, o.submitted_at_utc, o.updated_at_utc,
          exists (
            select 1 from ordering.bill_requests br
            where br.business_account_id = o.business_account_id
              and br.order_id = o.id and br.status = 'open'
          ),
          exists (
            select 1 from ordering.cancellation_requests cr
            where cr.business_account_id = o.business_account_id
              and cr.order_id = o.id and cr.status = 'open'
          )
        from ordering.orders o
        join tables.table_sessions ts
          on ts.business_account_id = o.business_account_id
         and ts.id = o.table_session_id
        where o.business_account_id = $1
      `,
      [input.businessAccountId],
    );
    await transaction.sql.query(
      `
        insert into reporting.table_session_projections (
          business_account_id, restaurant_id, branch_id, table_session_id,
          table_id, state, opened_at_utc, closed_at_utc, updated_at_utc
        )
        select ts.business_account_id, b.restaurant_id, ts.branch_id, ts.id,
          ts.table_id, ts.status, ts.opened_at_utc, ts.closed_at_utc,
          coalesce(ts.closed_at_utc, ts.opened_at_utc)
        from tables.table_sessions ts
        join restaurant.branches b
          on b.business_account_id = ts.business_account_id
         and b.id = ts.branch_id
        where ts.business_account_id = $1
      `,
      [input.businessAccountId],
    );
    await transaction.sql.query(
      `
        insert into reporting.kitchen_item_projections (
          business_account_id, restaurant_id, branch_id, work_item_id,
          order_id, order_reference, item_name, state, queued_at_utc,
          started_at_utc, ready_at_utc, updated_at_utc
        )
        select wi.business_account_id, o.restaurant_id, wi.branch_id, wi.id,
          wi.order_id, wi.order_reference, wi.item_name, wi.state,
          wi.queued_at_utc, wi.started_at_utc, wi.ready_at_utc,
          coalesce(wi.ready_at_utc, wi.started_at_utc, wi.updated_at_utc)
        from kitchen.work_items wi
        join ordering.orders o
          on o.business_account_id = wi.business_account_id
         and o.id = wi.order_id
        where wi.business_account_id = $1
      `,
      [input.businessAccountId],
    );
    await transaction.sql.query(
      `
        insert into reporting.sales_order_projections (
          business_account_id, restaurant_id, branch_id, order_id,
          order_reference, business_date, currency, gross_amount,
          cancelled_amount, paid_amount, refunded_amount, payment_method,
          order_state, submitted_at_utc, updated_at_utc
        )
        select o.business_account_id, o.restaurant_id, o.branch_id, o.id,
          o.reference, (o.submitted_at_utc at time zone b.time_zone)::date,
          o.currency, o.total_amount,
          case when o.closure_state = 'cancelled' then o.total_amount else 0 end,
          coalesce(p.amount, 0),
          coalesce((
            select sum(rf.amount) from payments.refunds rf
            where rf.business_account_id = o.business_account_id
              and rf.order_id = o.id
          ), 0),
          p.method, o.closure_state, o.submitted_at_utc, o.updated_at_utc
        from ordering.orders o
        join restaurant.branches b
          on b.business_account_id = o.business_account_id
         and b.id = o.branch_id
        left join payments.payments p
          on p.business_account_id = o.business_account_id
         and p.order_id = o.id
        where o.business_account_id = $1
      `,
      [input.businessAccountId],
    );
    await transaction.sql.query(
      `
        update reporting.projection_checkpoints
        set last_event_id = $3,
            last_occurred_at_utc = $4,
            processed_count = processed_count + 1,
            status = 'current',
            updated_at_utc = $5
        where handler_name = $1 and business_account_id = $2
      `,
      [
        input.handlerName,
        input.businessAccountId,
        input.eventId,
        input.occurredAtUtc,
        input.now,
      ],
    );
  }

  public async getBranch(
    sql: Parameters<ReportingStore["getBranch"]>[0],
    businessAccountId: string,
    branchId: string,
  ): Promise<ReportingBranch | undefined> {
    const result = await sql.query<{
      restaurant_id: string;
      branch_id: string;
      restaurant_name: string;
      branch_name: string;
      time_zone: string;
      currency: string;
      branch_status: "active" | "inactive";
    }>(
      `
        select restaurant_id, branch_id, restaurant_name, branch_name,
          time_zone, currency, branch_status
        from reporting.branch_catalog
        where business_account_id = $1 and branch_id = $2
      `,
      [businessAccountId, branchId],
    );
    const row = result.rows[0];
    return row
      ? {
          restaurantId: row.restaurant_id,
          branchId: row.branch_id,
          restaurantName: row.restaurant_name,
          branchName: row.branch_name,
          timeZone: row.time_zone,
          currency: row.currency,
          status: row.branch_status,
        }
      : undefined;
  }

  private async refreshBranch(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    branchId: string,
  ): Promise<void> {
    await sql.query(
      `
        insert into reporting.branch_catalog (
          business_account_id, restaurant_id, branch_id, restaurant_name,
          branch_name, time_zone, currency, branch_status, updated_at_utc
        )
        select b.business_account_id, b.restaurant_id, b.id, r.name, b.name,
          b.time_zone, b.currency, b.status, b.updated_at_utc
        from restaurant.branches b
        join restaurant.restaurants r
          on r.business_account_id = b.business_account_id
         and r.id = b.restaurant_id
        where b.business_account_id = $1 and b.id = $2
        on conflict (business_account_id, branch_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          restaurant_name = excluded.restaurant_name,
          branch_name = excluded.branch_name,
          time_zone = excluded.time_zone,
          currency = excluded.currency,
          branch_status = excluded.branch_status,
          updated_at_utc = excluded.updated_at_utc
      `,
      [businessAccountId, branchId],
    );
  }

  private async refreshRestaurantBranches(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    restaurantId: string,
  ): Promise<void> {
    await sql.query(
      `
        insert into reporting.branch_catalog (
          business_account_id, restaurant_id, branch_id, restaurant_name,
          branch_name, time_zone, currency, branch_status, updated_at_utc
        )
        select b.business_account_id, b.restaurant_id, b.id, r.name, b.name,
          b.time_zone, b.currency, b.status, greatest(b.updated_at_utc, r.updated_at_utc)
        from restaurant.branches b
        join restaurant.restaurants r
          on r.business_account_id = b.business_account_id
         and r.id = b.restaurant_id
        where b.business_account_id = $1 and b.restaurant_id = $2
        on conflict (business_account_id, branch_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          restaurant_name = excluded.restaurant_name,
          branch_name = excluded.branch_name,
          time_zone = excluded.time_zone,
          currency = excluded.currency,
          branch_status = excluded.branch_status,
          updated_at_utc = excluded.updated_at_utc
      `,
      [businessAccountId, restaurantId],
    );
  }

  private async refreshOrder(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    orderId: string,
  ): Promise<void> {
    await sql.query(
      `
        insert into reporting.order_projections (
          business_account_id, restaurant_id, branch_id, order_id,
          order_reference, table_id, approval_state, fulfilment_state,
          financial_state, closure_state, total_amount, currency,
          created_by_employee_id, submitted_at_utc, updated_at_utc,
          open_bill_request, open_cancellation_request
        )
        select o.business_account_id, o.restaurant_id, o.branch_id, o.id,
          o.reference, ts.table_id, o.approval_state, o.fulfilment_state,
          o.financial_state, o.closure_state, o.total_amount, o.currency,
          o.created_by_employee_id, o.submitted_at_utc, o.updated_at_utc,
          exists (
            select 1 from ordering.bill_requests br
            where br.business_account_id = o.business_account_id
              and br.order_id = o.id and br.status = 'open'
          ),
          exists (
            select 1 from ordering.cancellation_requests cr
            where cr.business_account_id = o.business_account_id
              and cr.order_id = o.id and cr.status = 'open'
          )
        from ordering.orders o
        join tables.table_sessions ts
          on ts.business_account_id = o.business_account_id
         and ts.id = o.table_session_id
        where o.business_account_id = $1 and o.id = $2
        on conflict (business_account_id, order_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          branch_id = excluded.branch_id,
          order_reference = excluded.order_reference,
          table_id = excluded.table_id,
          approval_state = excluded.approval_state,
          fulfilment_state = excluded.fulfilment_state,
          financial_state = excluded.financial_state,
          closure_state = excluded.closure_state,
          total_amount = excluded.total_amount,
          currency = excluded.currency,
          created_by_employee_id = excluded.created_by_employee_id,
          submitted_at_utc = excluded.submitted_at_utc,
          updated_at_utc = excluded.updated_at_utc,
          open_bill_request = excluded.open_bill_request,
          open_cancellation_request = excluded.open_cancellation_request
      `,
      [businessAccountId, orderId],
    );
    await sql.query(
      `
        insert into reporting.sales_order_projections (
          business_account_id, restaurant_id, branch_id, order_id,
          order_reference, business_date, currency, gross_amount,
          cancelled_amount, paid_amount, refunded_amount, payment_method,
          order_state, submitted_at_utc, updated_at_utc
        )
        select o.business_account_id, o.restaurant_id, o.branch_id, o.id,
          o.reference, (o.submitted_at_utc at time zone b.time_zone)::date,
          o.currency, o.total_amount,
          case when o.closure_state = 'cancelled' then o.total_amount else 0 end,
          coalesce(p.amount, 0),
          coalesce((
            select sum(rf.amount) from payments.refunds rf
            where rf.business_account_id = o.business_account_id
              and rf.order_id = o.id
          ), 0),
          p.method, o.closure_state, o.submitted_at_utc, o.updated_at_utc
        from ordering.orders o
        join restaurant.branches b
          on b.business_account_id = o.business_account_id
         and b.id = o.branch_id
        left join payments.payments p
          on p.business_account_id = o.business_account_id
         and p.order_id = o.id
        where o.business_account_id = $1 and o.id = $2
        on conflict (business_account_id, order_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          branch_id = excluded.branch_id,
          order_reference = excluded.order_reference,
          business_date = excluded.business_date,
          currency = excluded.currency,
          gross_amount = excluded.gross_amount,
          cancelled_amount = excluded.cancelled_amount,
          paid_amount = excluded.paid_amount,
          refunded_amount = excluded.refunded_amount,
          payment_method = excluded.payment_method,
          order_state = excluded.order_state,
          submitted_at_utc = excluded.submitted_at_utc,
          updated_at_utc = excluded.updated_at_utc
      `,
      [businessAccountId, orderId],
    );
  }

  private async refreshKitchenItem(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    workItemId: string,
  ): Promise<void> {
    await sql.query(
      `
        insert into reporting.kitchen_item_projections (
          business_account_id, restaurant_id, branch_id, work_item_id,
          order_id, order_reference, item_name, state, queued_at_utc,
          started_at_utc, ready_at_utc, updated_at_utc
        )
        select wi.business_account_id, o.restaurant_id, wi.branch_id, wi.id,
          wi.order_id, wi.order_reference, wi.item_name, wi.state,
          wi.queued_at_utc, wi.started_at_utc, wi.ready_at_utc,
          coalesce(wi.ready_at_utc, wi.started_at_utc, wi.updated_at_utc)
        from kitchen.work_items wi
        join ordering.orders o
          on o.business_account_id = wi.business_account_id
         and o.id = wi.order_id
        where wi.business_account_id = $1 and wi.id = $2
        on conflict (business_account_id, work_item_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          branch_id = excluded.branch_id,
          order_id = excluded.order_id,
          order_reference = excluded.order_reference,
          item_name = excluded.item_name,
          state = excluded.state,
          queued_at_utc = excluded.queued_at_utc,
          started_at_utc = excluded.started_at_utc,
          ready_at_utc = excluded.ready_at_utc,
          updated_at_utc = excluded.updated_at_utc
      `,
      [businessAccountId, workItemId],
    );
  }

  private async refreshTableSession(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    tableSessionId: string,
  ): Promise<void> {
    await sql.query(
      `
        insert into reporting.table_session_projections (
          business_account_id, restaurant_id, branch_id, table_session_id,
          table_id, state, opened_at_utc, closed_at_utc, updated_at_utc
        )
        select ts.business_account_id, b.restaurant_id, ts.branch_id, ts.id,
          ts.table_id, ts.status, ts.opened_at_utc, ts.closed_at_utc,
          coalesce(ts.closed_at_utc, ts.opened_at_utc)
        from tables.table_sessions ts
        join restaurant.branches b
          on b.business_account_id = ts.business_account_id
         and b.id = ts.branch_id
        where ts.business_account_id = $1 and ts.id = $2
        on conflict (business_account_id, table_session_id)
        do update set
          restaurant_id = excluded.restaurant_id,
          branch_id = excluded.branch_id,
          table_id = excluded.table_id,
          state = excluded.state,
          opened_at_utc = excluded.opened_at_utc,
          closed_at_utc = excluded.closed_at_utc,
          updated_at_utc = excluded.updated_at_utc
      `,
      [businessAccountId, tableSessionId],
    );
  }

  private async refreshOrderTablesForSession(
    sql: Parameters<ReportingStore["applyEvent"]>[0]["sql"],
    businessAccountId: string,
    tableSessionId: string,
    now: Date,
  ): Promise<void> {
    await sql.query(
      `
        update reporting.order_projections projection
        set table_id = session.table_id,
            updated_at_utc = greatest(projection.updated_at_utc, $3)
        from ordering.orders source_order
        join tables.table_sessions session
          on session.business_account_id = source_order.business_account_id
         and session.id = source_order.table_session_id
        where projection.business_account_id = $1
          and source_order.business_account_id = $1
          and session.id = $2
          and projection.order_id = source_order.id
      `,
      [businessAccountId, tableSessionId, now],
    );
  }

  public async getBranchDashboard(
    sql: Parameters<ReportingStore["getBranchDashboard"]>[0],
    input: Parameters<ReportingStore["getBranchDashboard"]>[1],
  ): Promise<BranchDashboardData | undefined> {
    const branchResult = await sql.query<{
      restaurant_id: string;
      branch_id: string;
      restaurant_name: string;
      branch_name: string;
      time_zone: string;
      currency: string;
      branch_status: "active" | "inactive";
    }>(
      `
        select restaurant_id, branch_id, restaurant_name, branch_name,
          time_zone, currency, branch_status
        from reporting.branch_catalog
        where business_account_id = $1 and branch_id = $2
      `,
      [input.businessAccountId, input.branchId],
    );
    const branchRow = branchResult.rows[0];
    if (!branchRow) return undefined;
    const branch: ReportingBranch = {
      restaurantId: branchRow.restaurant_id,
      branchId: branchRow.branch_id,
      restaurantName: branchRow.restaurant_name,
      branchName: branchRow.branch_name,
      timeZone: branchRow.time_zone,
      currency: branchRow.currency,
      status: branchRow.branch_status,
    };
    const [summary, states, kitchen, sales] = await Promise.all([
      sql.query<{
        active_orders: number;
        occupied_tables: number;
        pending_bills: number;
        pending_cancellations: number;
      }>(
        `
          select
            (select count(*)::integer
             from reporting.order_projections
             where business_account_id = $1 and branch_id = $2
               and closure_state = 'active') as active_orders,
            (select count(*)::integer
             from reporting.table_session_projections
             where business_account_id = $1 and branch_id = $2
               and state = 'open') as occupied_tables,
            (select count(*)::integer
             from reporting.order_projections
             where business_account_id = $1 and branch_id = $2
               and open_bill_request) as pending_bills,
            (select count(*)::integer
             from reporting.order_projections
             where business_account_id = $1 and branch_id = $2
               and open_cancellation_request) as pending_cancellations
        `,
        [input.businessAccountId, input.branchId],
      ),
      sql.query<{
        fulfilment_state: string;
        financial_state: string;
        count: number;
      }>(
        `
          select fulfilment_state, financial_state, count(*)::integer as count
          from reporting.order_projections
          where business_account_id = $1 and branch_id = $2
            and closure_state = 'active'
          group by fulfilment_state, financial_state
          order by fulfilment_state, financial_state
        `,
        [input.businessAccountId, input.branchId],
      ),
      sql.query<{
        work_item_id: string;
        order_id: string;
        order_reference: string;
        item_name: string;
        state: "queued" | "preparing";
        waiting_since_utc: Date;
      }>(
        `
          select work_item_id, order_id, order_reference, item_name, state,
            coalesce(started_at_utc, queued_at_utc) as waiting_since_utc
          from reporting.kitchen_item_projections
          where business_account_id = $1 and branch_id = $2
            and state in ('queued', 'preparing')
          order by queued_at_utc, work_item_id
          limit 100
        `,
        [input.businessAccountId, input.branchId],
      ),
      sql.query<{
        currency: string;
        gross_amount: string;
        paid_amount: string;
        refunded_amount: string;
        cancelled_amount: string;
      }>(
        `
          select s.currency,
            sum(s.gross_amount)::text as gross_amount,
            sum(s.paid_amount)::text as paid_amount,
            sum(s.refunded_amount)::text as refunded_amount,
            sum(s.cancelled_amount)::text as cancelled_amount
          from reporting.sales_order_projections s
          join reporting.branch_catalog b
            on b.business_account_id = s.business_account_id
           and b.branch_id = s.branch_id
          where s.business_account_id = $1 and s.branch_id = $2
            and s.business_date = ($3::timestamptz at time zone b.time_zone)::date
          group by s.currency
          order by s.currency
        `,
        [input.businessAccountId, input.branchId, input.now],
      ),
    ]);
    const totals = summary.rows[0] ?? {
      active_orders: 0,
      occupied_tables: 0,
      pending_bills: 0,
      pending_cancellations: 0,
    };
    return {
      branch,
      activeOrders: totals.active_orders,
      orderStates: states.rows.map((row) => ({
        fulfilment: row.fulfilment_state,
        financial: row.financial_state,
        count: row.count,
      })),
      occupiedTables: totals.occupied_tables,
      pendingRequests: {
        bills: totals.pending_bills,
        cancellations: totals.pending_cancellations,
      },
      kitchenWaiting: kitchen.rows.map((row) => ({
        workItemId: row.work_item_id,
        orderId: row.order_id,
        orderReference: row.order_reference,
        itemName: row.item_name,
        state: row.state,
        waitingSinceUtc: row.waiting_since_utc,
      })),
      dailySales: sales.rows.map((row) => ({
        currency: row.currency,
        grossAmount: row.gross_amount,
        paidAmount: row.paid_amount,
        refundedAmount: row.refunded_amount,
        cancelledAmount: row.cancelled_amount,
      })),
    };
  }

  public async listSales(
    sql: Parameters<ReportingStore["listSales"]>[0],
    input: Parameters<ReportingStore["listSales"]>[1],
  ): Promise<readonly SalesReportRow[]> {
    const result = await sql.query<{
      restaurant_id: string;
      branch_id: string;
      restaurant_name: string;
      branch_name: string;
      order_id: string;
      order_reference: string;
      business_date: string;
      currency: string;
      gross_amount: string;
      cancelled_amount: string;
      paid_amount: string;
      refunded_amount: string;
      payment_method: "cash" | "card" | null;
      order_state: "active" | "completed" | "cancelled";
      submitted_at_utc: Date;
    }>(
      `
        select s.restaurant_id, s.branch_id, b.restaurant_name, b.branch_name,
          s.order_id, s.order_reference, s.business_date::text,
          s.currency, s.gross_amount::text, s.cancelled_amount::text,
          s.paid_amount::text, s.refunded_amount::text, s.payment_method,
          s.order_state, s.submitted_at_utc
        from reporting.sales_order_projections s
        join reporting.branch_catalog b
          on b.business_account_id = s.business_account_id
         and b.branch_id = s.branch_id
        where s.business_account_id = $1
          and s.branch_id = any($2::uuid[])
          and ($3::uuid[] is null or s.restaurant_id = any($3::uuid[]))
          and ($4::uuid[] is null or s.branch_id = any($4::uuid[]))
          and s.business_date between $5::date and $6::date
          and ($7::text is null or s.payment_method = $7)
          and ($8::text is null or s.order_state = $8)
        order by s.business_date desc, s.submitted_at_utc desc, s.order_id
        limit $9 offset $10
      `,
      [
        input.businessAccountId,
        input.authorizedBranchIds,
        input.restaurantIds ?? null,
        input.branchIds ?? null,
        input.dateFrom,
        input.dateTo,
        input.paymentMethod ?? null,
        input.orderState ?? null,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => ({
      restaurantId: row.restaurant_id,
      branchId: row.branch_id,
      restaurantName: row.restaurant_name,
      branchName: row.branch_name,
      orderId: row.order_id,
      orderReference: row.order_reference,
      businessDate: row.business_date,
      currency: row.currency,
      grossAmount: row.gross_amount,
      cancelledAmount: row.cancelled_amount,
      paidAmount: row.paid_amount,
      refundedAmount: row.refunded_amount,
      ...(row.payment_method ? { paymentMethod: row.payment_method } : {}),
      orderState: row.order_state,
      submittedAtUtc: row.submitted_at_utc,
    }));
  }

  public async summarizeSales(
    sql: Parameters<ReportingStore["summarizeSales"]>[0],
    input: Parameters<ReportingStore["summarizeSales"]>[1],
  ): Promise<
    readonly {
      readonly currency: string;
      readonly grossAmount: string;
      readonly cancelledAmount: string;
      readonly paidAmount: string;
      readonly refundedAmount: string;
    }[]
  > {
    const result = await sql.query<{
      currency: string;
      gross_amount: string;
      cancelled_amount: string;
      paid_amount: string;
      refunded_amount: string;
    }>(
      `
        select s.currency,
          sum(s.gross_amount)::text as gross_amount,
          sum(s.cancelled_amount)::text as cancelled_amount,
          sum(s.paid_amount)::text as paid_amount,
          sum(s.refunded_amount)::text as refunded_amount
        from reporting.sales_order_projections s
        where s.business_account_id = $1
          and s.branch_id = any($2::uuid[])
          and ($3::uuid[] is null or s.restaurant_id = any($3::uuid[]))
          and ($4::uuid[] is null or s.branch_id = any($4::uuid[]))
          and s.business_date between $5::date and $6::date
          and ($7::text is null or s.payment_method = $7)
          and ($8::text is null or s.order_state = $8)
        group by s.currency
        order by s.currency
      `,
      [
        input.businessAccountId,
        input.authorizedBranchIds,
        input.restaurantIds ?? null,
        input.branchIds ?? null,
        input.dateFrom,
        input.dateTo,
        input.paymentMethod ?? null,
        input.orderState ?? null,
      ],
    );
    return result.rows.map((row) => ({
      currency: row.currency,
      grossAmount: row.gross_amount,
      cancelledAmount: row.cancelled_amount,
      paidAmount: row.paid_amount,
      refundedAmount: row.refunded_amount,
    }));
  }
}
