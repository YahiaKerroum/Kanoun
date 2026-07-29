import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool } from "@rms/building-blocks";
import {
  IdentitySecurity,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresKitchenStore,
  PostgresMenuStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  type AuditWriter,
  type GuestRequestContext,
  type OrderRecord,
  type StaffRequestContext,
} from "@rms/modules";
import { KitchenServingService } from "./kitchen-serving-service.js";
import { MenuTablesService } from "./menu-tables-service.js";
import { OrderSubmissionService } from "./order-submission-service.js";
import { PaymentCompletionService } from "./payment-completion-service.js";
import { PostgresServiceWorkflow } from "./postgres-service-workflow.js";
import {
  TenantOwnerService,
  type CredentialTokenDelivery,
} from "./tenant-owner-service.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;
const ownerPassword = "Correct-Horse-42";
const serviceSecret = "slice-007-integration-secret-with-32-characters";

function metadata(now = new Date()) {
  const correlationId = randomUUID();
  return { correlationId, causationId: correlationId, now };
}

describeWithDatabase(
  "payment and completion service against PostgreSQL",
  () => {
    if (!connectionString) return;

    const databasePool = createDatabasePool({
      connectionString,
      applicationName: "rms-slice-007-integration-test",
      maximumConnections: 20,
    });
    const workflow = new PostgresServiceWorkflow(databasePool);
    const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
    const identityAccess = new PostgresIdentityAccessStore();
    const menu = new PostgresMenuStore();
    const tables = new PostgresTablesStore();
    const ordering = new PostgresOrderingStore();
    const kitchen = new PostgresKitchenStore();
    const payments = new PostgresPaymentsStore();
    const audit = new PostgresAuditWriter();
    const identitySecurity = new IdentitySecurity(
      "slice-007-identity-secret-with-32-characters",
    );
    const tokenDelivery: CredentialTokenDelivery = {
      deliverRecoveryToken() {
        return Promise.resolve();
      },
    };
    const tenantOwnerService = new TenantOwnerService({
      databasePool,
      workflow,
      restaurantConfiguration,
      identityAccess,
      identitySecurity,
      audit,
      credentialTokenDelivery: tokenDelivery,
    });
    const menuTablesService = new MenuTablesService({
      databasePool,
      workflow,
      menu,
      tables,
      ordering,
      restaurantConfiguration,
      audit,
      guestAccessSecret: serviceSecret,
      customerWebOrigin: "http://127.0.0.1:5174",
    });
    const orderService = new OrderSubmissionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      audit,
      idempotencySecret: serviceSecret,
    });
    const kitchenService = new KitchenServingService({
      databasePool,
      workflow,
      restaurantConfiguration,
      kitchen,
      ordering,
      audit,
      idempotencySecret: serviceSecret,
    });

    function paymentService(auditWriter: AuditWriter = audit) {
      return new PaymentCompletionService({
        databasePool,
        workflow,
        restaurantConfiguration,
        menu,
        tables,
        ordering,
        kitchen,
        payments,
        audit: auditWriter,
        idempotencySecret: serviceSecret,
      });
    }

    interface Fixture {
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId: string;
      readonly context: StaffRequestContext;
      readonly dishId: string;
      readonly menuVersion: number;
    }

    interface GuestAtTable {
      readonly tableId: string;
      readonly tableCode: string;
      readonly sessionToken: string;
      readonly context: GuestRequestContext;
    }

    async function fixture(prefix: string): Promise<Fixture> {
      const code = `${prefix}-${randomUUID().slice(0, 8)}`;
      const tenant = await tenantOwnerService.bootstrapTenant(
        {
          businessCode: code,
          businessName: `${code} Hospitality`,
          restaurantName: `${code} Kitchen`,
          branch: {
            name: "Central",
            address: {
              line1: "12 Test Street",
              city: "Algiers",
              countryCode: "DZ",
            },
            contact: { email: `${code}@example.test` },
            timeZone: "Africa/Algiers",
            currency: "DZD",
            openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              opensAt: "00:00",
              closesAt: "23:59",
            })),
          },
          owner: {
            displayName: `${code} Owner`,
            email: `owner-${code}@example.test`,
            password: ownerPassword,
          },
        },
        metadata(),
      );
      const login = await tenantOwnerService.login(
        {
          businessCode: code,
          email: `owner-${code}@example.test`,
          password: ownerPassword,
        },
        metadata(),
      );
      await tenantOwnerService.updateBranch(
        login.context,
        {
          branchId: tenant.branch.id,
          expectedVersion: tenant.branch.version,
          serviceStatus: "open",
        },
        metadata(),
      );
      const category = await menuTablesService.createCategory(
        login.context,
        {
          restaurantId: tenant.restaurant.id,
          name: "Mains",
          displayOrder: 0,
        },
        metadata(),
      );
      const dish = await menuTablesService.createDish(
        login.context,
        {
          restaurantId: tenant.restaurant.id,
          categoryId: category.id,
          name: "Couscous",
          basePrice: { amount: "1000.00", currency: "DZD" },
          displayOrder: 0,
        },
        metadata(),
      );
      const currentMenu = await menu.getMenu(
        databasePool,
        tenant.businessAccountId,
        tenant.restaurant.id,
      );
      if (!currentMenu) throw new Error("Expected the fixture menu.");
      return {
        businessAccountId: tenant.businessAccountId,
        restaurantId: tenant.restaurant.id,
        branchId: tenant.branch.id,
        context: login.context,
        dishId: dish.id,
        menuVersion: currentMenu.version,
      };
    }

    async function guestAtTable(
      setup: Fixture,
      tableCode: string,
    ): Promise<GuestAtTable> {
      const table = await menuTablesService.createTable(
        setup.context,
        setup.branchId,
        { code: tableCode },
        metadata(),
      );
      const qr = await menuTablesService.issueTableQrCode(
        setup.context,
        table.id,
        metadata(),
      );
      const exchange = await menuTablesService.exchangeTableQr(
        qr.rawToken,
        metadata(),
      );
      const context = await menuTablesService.authenticateGuestSession(
        exchange.sessionToken,
      );
      if (!context) throw new Error("Expected an authenticated guest.");
      return {
        tableId: table.id,
        tableCode: table.code,
        sessionToken: exchange.sessionToken,
        context,
      };
    }

    async function submitOrder(
      setup: Fixture,
      guest: GuestAtTable,
      quantity = 1,
    ): Promise<OrderRecord> {
      return orderService.submitGuestOrder(
        guest.context,
        {
          menuVersion: setup.menuVersion,
          items: [
            {
              dishId: setup.dishId,
              quantity,
              optionIds: [],
            },
          ],
        },
        randomUUID(),
        metadata(),
      );
    }

    async function serve(
      setup: Fixture,
      order: OrderRecord,
    ): Promise<OrderRecord> {
      const work = (
        await kitchen.listQueue(databasePool, {
          businessAccountId: setup.businessAccountId,
          branchId: setup.branchId,
        })
      ).filter((item) => item.orderId === order.id);
      for (const item of work) {
        const started = await kitchenService.startKitchenWorkItem(
          setup.context,
          item.id,
          item.version,
          undefined,
          randomUUID(),
          metadata(),
        );
        await kitchenService.markKitchenWorkItemReady(
          setup.context,
          item.id,
          started.version,
          undefined,
          randomUUID(),
          metadata(),
        );
      }
      const ready = await ordering.getOrder(
        databasePool,
        setup.businessAccountId,
        order.id,
      );
      if (!ready) throw new Error("Expected the ready order.");
      return kitchenService.markOrderServed(
        setup.context,
        ready.id,
        ready.version,
        undefined,
        randomUUID(),
        metadata(),
      );
    }

    async function tableSessionStatus(
      setup: Fixture,
      tableSessionId: string,
    ): Promise<string | undefined> {
      const result = await databasePool.query<{ readonly status: string }>(
        `
          select status
          from tables.table_sessions
          where business_account_id = $1 and id = $2
        `,
        [setup.businessAccountId, tableSessionId],
      );
      return result.rows[0]?.status;
    }

    afterAll(async () => {
      await databasePool.end();
    });

    it("records an exact payment, completes a served order, and closes its eligible session", async () => {
      const setup = await fixture("complete-paid");
      expect(
        setup.context.grants.some(
          (grant) => grant.permissionKey === "orders.complete_unpaid",
        ),
      ).toBe(true);
      const guest = await guestAtTable(setup, "P-1");
      const submitted = await submitOrder(setup, guest);
      const served = await serve(setup, submitted);
      const service = paymentService();

      await expect(
        service.recordPayment(
          setup.context,
          served.id,
          {
            amount: { amount: "999.99", currency: "DZD" },
            method: "cash",
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "payment_conflict" });
      await expect(
        service.recordPayment(
          setup.context,
          served.id,
          {
            amount: { amount: "1000.01", currency: "DZD" },
            method: "card",
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "payment_conflict" });

      const paid = await service.recordPayment(
        setup.context,
        served.id,
        { amount: served.total, method: "cash" },
        randomUUID(),
        metadata(),
      );
      const completed = await service.completeOrder(
        setup.context,
        paid.order.id,
        paid.order.version,
        {},
        randomUUID(),
        metadata(),
      );
      expect(completed).toMatchObject({
        closure: "completed",
        fulfilment: "served",
        financial: "paid",
        completedByEmployeeId: setup.context.employeeId,
      });
      expect(await tableSessionStatus(setup, completed.tableSessionId)).toBe(
        "closed",
      );
      const evidence = await databasePool.query<{ readonly action: string }>(
        `
          select action
          from audit.audit_events
          where business_account_id = $1
            and action in (
              'payments.payment_recorded',
              'ordering.order_completed',
              'tables.table_session_closed'
            )
        `,
        [setup.businessAccountId],
      );
      expect(evidence.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          "payments.payment_recorded",
          "ordering.order_completed",
          "tables.table_session_closed",
        ]),
      );
    });

    it("deduplicates bill requests concurrently and replays the original request after resolution", async () => {
      const setup = await fixture("bill");
      const guest = await guestAtTable(setup, "B-1");
      const order = await submitOrder(setup, guest);
      const service = paymentService();
      const key = randomUUID();
      const [first, concurrent] = await Promise.all([
        service.requestGuestBill(guest.context, order.id, key, metadata()),
        service.requestGuestBill(
          guest.context,
          order.id,
          randomUUID(),
          metadata(),
        ),
      ]);
      expect(concurrent.id).toBe(first.id);

      await service.recordPayment(
        setup.context,
        order.id,
        { amount: order.total, method: "card" },
        randomUUID(),
        metadata(),
      );
      const replayed = await service.requestGuestBill(
        guest.context,
        order.id,
        key,
        metadata(),
      );
      expect(replayed).toMatchObject({ id: first.id, status: "resolved" });
      const counts = await databasePool.query<{
        readonly requests: string;
        readonly events: string;
      }>(
        `
          select
            (select count(*)::text from ordering.bill_requests
             where business_account_id = $1 and order_id = $2) as requests,
            (select count(*)::text from platform.outbox_messages
             where business_account_id = $1
               and event_type = 'ordering.bill_requested.v1'
               and aggregate_id = $2) as events
        `,
        [setup.businessAccountId, order.id],
      );
      expect(counts.rows[0]).toEqual({ requests: "1", events: "1" });
    });

    it("appends a full correction revision and moves every session reference atomically", async () => {
      const setup = await fixture("correct-move");
      const guest = await guestAtTable(setup, "CM-1");
      const first = await submitOrder(setup, guest);
      const second = await submitOrder(setup, guest, 2);
      const destination = await menuTablesService.createTable(
        setup.context,
        setup.branchId,
        { code: "CM-2" },
        metadata(),
      );
      const service = paymentService();

      const corrected = await service.correctOrder(
        setup.context,
        first.id,
        first.version,
        {
          menuVersion: setup.menuVersion,
          reason: "Correct guest quantity",
          items: [
            {
              dishId: setup.dishId,
              quantity: 3,
              optionIds: [],
            },
          ],
        },
        randomUUID(),
        metadata(),
      );
      expect(corrected).toMatchObject({
        currentItemRevision: 2,
        total: { amount: "3000.00", currency: "DZD" },
      });
      expect(corrected.corrections).toHaveLength(1);
      expect(corrected.corrections[0]).toMatchObject({
        reason: "Correct guest quantity",
        revision: 2,
      });
      await expect(
        service.correctOrder(
          setup.context,
          first.id,
          first.version,
          {
            menuVersion: setup.menuVersion,
            reason: "Stale correction",
            items: [{ dishId: setup.dishId, quantity: 1, optionIds: [] }],
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({
        code: "concurrency_conflict",
        currentVersion: corrected.version,
      });

      const moved = await service.moveOrderTable(
        setup.context,
        corrected.id,
        {
          destinationTableId: destination.id,
          expectedTableSessionVersion: corrected.tableSessionVersion,
        },
        randomUUID(),
        metadata(),
      );
      expect(moved).toMatchObject({
        tableId: destination.id,
        tableCode: "CM-2",
        tableSessionVersion: 2,
      });
      const otherOrder = await ordering.getOrder(
        databasePool,
        setup.businessAccountId,
        second.id,
      );
      expect(otherOrder).toMatchObject({
        tableId: destination.id,
        tableCode: "CM-2",
      });
      const refreshedGuest = await menuTablesService.authenticateGuestSession(
        guest.sessionToken,
      );
      expect(refreshedGuest?.tableId).toBe(destination.id);
      const liveWork = await kitchen.listQueue(databasePool, {
        businessAccountId: setup.businessAccountId,
        branchId: setup.branchId,
      });
      expect(
        liveWork
          .filter((item) => [first.id, second.id].includes(item.orderId))
          .every(
            (item) =>
              item.tableId === destination.id && item.tableCode === "CM-2",
          ),
      ).toBe(true);
      expect(
        liveWork.find((item) => item.orderId === first.id)?.changeKind,
      ).toBe("corrected");
      const history = await databasePool.query<{
        readonly item_revisions: string;
        readonly movements: string;
      }>(
        `
          select
            (select count(*)::text from ordering.order_items
             where business_account_id = $1 and order_id = $2)
              as item_revisions,
            (select count(*)::text from tables.table_session_movements
             where business_account_id = $1 and table_session_id = $3)
              as movements
        `,
        [setup.businessAccountId, first.id, first.tableSessionId],
      );
      expect(history.rows[0]).toEqual({
        item_revisions: "2",
        movements: "1",
      });
      await expect(
        databasePool.query(
          `
            update ordering.order_items
            set quantity = quantity + 1
            where business_account_id = $1 and order_id = $2
          `,
          [setup.businessAccountId, first.id],
        ),
      ).rejects.toThrow("submitted order items are append-only");
      await expect(
        databasePool.query(
          `
            update tables.table_session_movements
            set moved_at_utc = moved_at_utc + interval '1 second'
            where business_account_id = $1 and table_session_id = $2
          `,
          [setup.businessAccountId, first.tableSessionId],
        ),
      ).rejects.toThrow("table-session movement history is append-only");
    });

    it("serializes competing destination moves so only one whole session can claim a table", async () => {
      const setup = await fixture("move-race");
      const leftGuest = await guestAtTable(setup, "MR-1");
      const rightGuest = await guestAtTable(setup, "MR-2");
      const left = await submitOrder(setup, leftGuest);
      const right = await submitOrder(setup, rightGuest);
      const destination = await menuTablesService.createTable(
        setup.context,
        setup.branchId,
        { code: "MR-3" },
        metadata(),
      );
      const service = paymentService();
      const results = await Promise.allSettled([
        service.moveOrderTable(
          setup.context,
          left.id,
          {
            destinationTableId: destination.id,
            expectedTableSessionVersion: left.tableSessionVersion,
          },
          randomUUID(),
          metadata(),
        ),
        service.moveOrderTable(
          setup.context,
          right.id,
          {
            destinationTableId: destination.id,
            expectedTableSessionVersion: right.tableSessionVersion,
          },
          randomUUID(),
          metadata(),
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(
        rejected && "reason" in rejected ? rejected.reason : undefined,
      ).toMatchObject({ code: "table_unavailable" });
    });

    it("returns exact idempotent financial records, rejects payload conflicts, and prevents over-refund", async () => {
      const setup = await fixture("refund");
      const guest = await guestAtTable(setup, "R-1");
      const order = await submitOrder(setup, guest);
      const service = paymentService();
      const paymentKey = randomUUID();
      const paid = await service.recordPayment(
        setup.context,
        order.id,
        { amount: order.total, method: "card", externalReference: "CARD-1" },
        paymentKey,
        metadata(),
      );
      const replayedPayment = await service.recordPayment(
        setup.context,
        order.id,
        { amount: order.total, method: "card", externalReference: "CARD-1" },
        paymentKey,
        metadata(),
      );
      expect(replayedPayment.payment.id).toBe(paid.payment.id);
      await expect(
        service.recordPayment(
          setup.context,
          order.id,
          { amount: order.total, method: "cash" },
          paymentKey,
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "idempotency_conflict" });

      const firstKey = randomUUID();
      const first = await service.recordRefund(
        setup.context,
        paid.payment.id,
        {
          amount: { amount: "200.00", currency: "DZD" },
          reason: "Partial goodwill refund",
          confirmed: true,
        },
        firstKey,
        metadata(),
      );
      await service.recordRefund(
        setup.context,
        paid.payment.id,
        {
          amount: { amount: "100.00", currency: "DZD" },
          reason: "Second partial refund",
          confirmed: true,
        },
        randomUUID(),
        metadata(),
      );
      const replayedFirst = await service.recordRefund(
        setup.context,
        paid.payment.id,
        {
          amount: { amount: "200.00", currency: "DZD" },
          reason: "Partial goodwill refund",
          confirmed: true,
        },
        firstKey,
        metadata(),
      );
      expect(replayedFirst.refund.id).toBe(first.refund.id);
      await expect(
        service.recordRefund(
          setup.context,
          paid.payment.id,
          {
            amount: { amount: "701.00", currency: "DZD" },
            reason: "Too much",
            confirmed: true,
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "payment_conflict" });
      const ledger = await payments.getOrderLedger(
        databasePool,
        setup.businessAccountId,
        order.id,
        "DZD",
      );
      expect(ledger).toMatchObject({
        refundedAmount: { amount: "300.00", currency: "DZD" },
        netPaidAmount: { amount: "700.00", currency: "DZD" },
      });
      await expect(
        databasePool.query(
          `
            update payments.payments
            set external_reference = 'MUTATED'
            where business_account_id = $1 and id = $2
          `,
          [setup.businessAccountId, paid.payment.id],
        ),
      ).rejects.toThrow("payment ledger is append-only");
      await expect(
        databasePool.query(
          `
            delete from payments.refunds
            where business_account_id = $1 and id = $2
          `,
          [setup.businessAccountId, first.refund.id],
        ),
      ).rejects.toThrow("payment ledger is append-only");
    });

    it("cancels only queued work, preserves started history, resolves requests, and records the remaining refund", async () => {
      const setup = await fixture("cancel");
      const guest = await guestAtTable(setup, "C-1");
      const order = await submitOrder(setup, guest, 2);
      const service = paymentService();
      await service.requestGuestBill(
        guest.context,
        order.id,
        randomUUID(),
        metadata(),
      );
      const paid = await service.recordPayment(
        setup.context,
        order.id,
        { amount: order.total, method: "cash" },
        randomUUID(),
        metadata(),
      );
      await service.requestGuestBill(
        guest.context,
        order.id,
        randomUUID(),
        metadata(),
      );
      const queued = (
        await kitchen.listQueue(databasePool, {
          businessAccountId: setup.businessAccountId,
          branchId: setup.branchId,
        })
      ).find((item) => item.orderId === order.id);
      if (!queued) throw new Error("Expected queued work.");
      const started = await kitchenService.startKitchenWorkItem(
        setup.context,
        queued.id,
        queued.version,
        undefined,
        randomUUID(),
        metadata(),
      );
      const current = await ordering.getOrder(
        databasePool,
        setup.businessAccountId,
        order.id,
      );
      if (!current) throw new Error("Expected the preparing order.");

      const cancelled = await service.cancelOrder(
        setup.context,
        order.id,
        current.version,
        { reason: "Customer left before service" },
        randomUUID(),
        metadata(),
      );
      expect(cancelled).toMatchObject({
        closure: "cancelled",
        financial: "refunded",
        cancellationReason: "Customer left before service",
      });
      const preserved = await kitchen.getWorkItem(
        databasePool,
        setup.businessAccountId,
        started.id,
      );
      expect(preserved?.state).toBe("preparing");
      const ledger = await payments.getOrderLedger(
        databasePool,
        setup.businessAccountId,
        order.id,
        "DZD",
      );
      expect(ledger.refunds).toHaveLength(1);
      expect(ledger.refunds[0]).toMatchObject({
        amount: paid.payment.amount,
        source: "order_cancellation",
      });
      expect(cancelled.billRequest).toBeUndefined();
      expect(await tableSessionStatus(setup, cancelled.tableSessionId)).toBe(
        "closed",
      );
      const refundAudit = await databasePool.query<{ readonly count: string }>(
        `
          select count(*)::text as count
          from audit.audit_events
          where business_account_id = $1
            and action = 'payments.payment_refunded'
            and target_id = $2
        `,
        [setup.businessAccountId, ledger.refunds[0]?.id],
      );
      expect(refundAudit.rows[0]?.count).toBe("1");
    });

    it("requires served/paid normal completion and recent, confirmed, reasoned unpaid override", async () => {
      const setup = await fixture("override");
      const guest = await guestAtTable(setup, "O-1");
      const served = await serve(setup, await submitOrder(setup, guest));
      const service = paymentService();
      await expect(
        service.completeOrder(
          setup.context,
          served.id,
          served.version,
          {},
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "invalid_state_transition" });
      await expect(
        service.completeOrder(
          setup.context,
          served.id,
          served.version,
          {
            unpaidOverrideReason: "Approved recovery",
            confirmUnpaidOverride: false,
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "validation_error" });
      const staleContext = {
        ...setup.context,
        authenticatedAtUtc: new Date(Date.now() - 16 * 60_000),
      };
      await expect(
        service.completeOrder(
          staleContext,
          served.id,
          served.version,
          {
            unpaidOverrideReason: "Approved recovery",
            confirmUnpaidOverride: true,
          },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "authentication_required" });
      const completed = await service.completeOrder(
        setup.context,
        served.id,
        served.version,
        {
          unpaidOverrideReason: "Approved recovery",
          confirmUnpaidOverride: true,
        },
        randomUUID(),
        metadata(),
      );
      expect(completed).toMatchObject({
        closure: "completed",
        financial: "unpaid",
        unpaidCompletionReason: "Approved recovery",
      });
    });

    it("keeps a shared table session open until every order is terminal", async () => {
      const setup = await fixture("session-close");
      const guest = await guestAtTable(setup, "S-1");
      const first = await serve(setup, await submitOrder(setup, guest));
      const second = await submitOrder(setup, guest);
      const service = paymentService();
      const paid = await service.recordPayment(
        setup.context,
        first.id,
        { amount: first.total, method: "cash" },
        randomUUID(),
        metadata(),
      );
      await service.completeOrder(
        setup.context,
        first.id,
        paid.order.version,
        {},
        randomUUID(),
        metadata(),
      );
      expect(await tableSessionStatus(setup, first.tableSessionId)).toBe(
        "open",
      );
      const cancelled = await service.cancelOrder(
        setup.context,
        second.id,
        second.version,
        { reason: "Second order withdrawn" },
        randomUUID(),
        metadata(),
      );
      expect(cancelled.tableSessionId).toBe(first.tableSessionId);
      expect(await tableSessionStatus(setup, first.tableSessionId)).toBe(
        "closed",
      );
    });

    it("enforces permission and tenant scope before financial writes", async () => {
      const left = await fixture("scope-left");
      const right = await fixture("scope-right");
      const rightGuest = await guestAtTable(right, "T-1");
      const rightOrder = await submitOrder(right, rightGuest);
      const service = paymentService();
      await expect(
        service.recordPayment(
          left.context,
          rightOrder.id,
          { amount: rightOrder.total, method: "cash" },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "resource_not_found" });

      const leftGuest = await guestAtTable(left, "T-2");
      const leftOrder = await submitOrder(left, leftGuest);
      const limited = {
        ...left.context,
        grants: left.context.grants.filter(
          (grant) => grant.permissionKey !== "payments.record",
        ),
      };
      await expect(
        service.recordPayment(
          limited,
          leftOrder.id,
          { amount: leftOrder.total, method: "cash" },
          randomUUID(),
          metadata(),
        ),
      ).rejects.toMatchObject({ code: "permission_denied" });
      expect(
        await payments.getPaymentForOrder(
          databasePool,
          left.businessAccountId,
          leftOrder.id,
        ),
      ).toBeUndefined();
    });

    it("rolls back payment, audit, outbox, and idempotency together and permits a same-key retry", async () => {
      const setup = await fixture("rollback");
      const guest = await guestAtTable(setup, "RB-1");
      const order = await submitOrder(setup, guest);
      const key = randomUUID();
      const failingAudit: AuditWriter = {
        appendInTransaction() {
          return Promise.reject(new Error("injected audit failure"));
        },
      };
      await expect(
        paymentService(failingAudit).recordPayment(
          setup.context,
          order.id,
          { amount: order.total, method: "cash" },
          key,
          metadata(),
        ),
      ).rejects.toThrow("injected audit failure");
      expect(
        await payments.getPaymentForOrder(
          databasePool,
          setup.businessAccountId,
          order.id,
        ),
      ).toBeUndefined();
      expect(
        await ordering.getOrder(
          databasePool,
          setup.businessAccountId,
          order.id,
        ),
      ).toMatchObject({ financial: "unpaid", version: order.version });

      const retried = await paymentService().recordPayment(
        setup.context,
        order.id,
        { amount: order.total, method: "cash" },
        key,
        metadata(),
      );
      expect(retried.order.financial).toBe("paid");
    });
  },
);
