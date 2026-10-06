import { randomUUID } from "node:crypto";
import {
  createDatabasePool,
  PostgresOutboxProcessor,
} from "@rms/building-blocks";
import {
  IdentitySecurity,
  NotificationService,
  PostgresAuditWriter,
  PostgresIdentityAccessStore,
  PostgresKitchenStore,
  PostgresMenuStore,
  PostgresNotificationStore,
  PostgresOrderingStore,
  PostgresPaymentsStore,
  PostgresReportingStore,
  PostgresRestaurantConfigurationStore,
  PostgresTablesStore,
  ReportingService,
} from "@rms/modules";
import {
  KitchenServingService,
  MenuTablesService,
  OrderSubmissionService,
  PaymentCompletionService,
  PostgresServiceWorkflow,
  TenantOwnerService,
} from "@rms/service-workflow";
import {
  BAB_EZZOUAR_TABLES,
  CANCELLATION_REASONS,
  EXTRA_EMPLOYEES,
  GUEST_NAMES,
  HYDRA_TABLES,
  REFUND_REASONS,
  SAMPLE_MENU,
} from "./demo-seed-catalog.js";
import {
  DEMO_ROLE_DEFINITIONS,
  DEMO_SCENARIO,
  type DemoSeedResult,
} from "./demo-types.js";

const demoBusinessCode = "dar-nedjma-demo";
const currency = "DZD";
const MINUTE = 60_000;
/** Days of completed service generated before the live service. */
const HISTORY_DAYS = 10;

type StaffContext = Awaited<ReturnType<TenantOwnerService["login"]>>["context"];

/* ------------------------------------------------------------------ */
/* Time: Algiers is UTC+1 all year (no daylight saving).               */
/* ------------------------------------------------------------------ */

const ALGIERS_OFFSET_MINUTES = 60;

function algiersMinutesOfDay(at: Date): number {
  const local = new Date(at.getTime() + ALGIERS_OFFSET_MINUTES * MINUTE);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** The UTC instant for a local Algiers time `daysAgo` days before `from`. */
function algiersTime(from: Date, daysAgo: number, minutes: number): Date {
  const local = new Date(from.getTime() + ALGIERS_OFFSET_MINUTES * MINUTE);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(
    local.getTime() + (minutes - ALGIERS_OFFSET_MINUTES) * MINUTE,
  );
}

/**
 * The "live" moment the sample is built around: now, if the restaurant is
 * open; otherwise the last evening service. Everything before it is history.
 */
function liveServiceMoment(realNow: Date): Date {
  const minutes = algiersMinutesOfDay(realNow);
  if (minutes >= 12 * 60 && minutes <= 22 * 60 + 30) {
    return new Date(realNow.getTime() - 2 * MINUTE);
  }
  return algiersTime(realNow, minutes > 22 * 60 + 30 ? 0 : 1, 22 * 60);
}

/* ------------------------------------------------------------------ */
/* Deterministic randomness so every seed produces the same restaurant. */
/* ------------------------------------------------------------------ */

function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int: (min: number, max: number): number =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined)
        throw new Error("Cannot pick from an empty list.");
      return item;
    },
    weighted: <T extends { readonly weight: number }>(
      items: readonly T[],
    ): T => {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) return item;
      }
      const last = items.at(-1);
      if (!last) throw new Error("Cannot pick from an empty list.");
      return last;
    },
  };
}

function money(amount: number) {
  return { amount: amount.toFixed(2), currency };
}

export interface DemoSeedDataOptions {
  /** A migrated MISE database without the `dar-nedjma-demo` business. */
  readonly connectionString: string;
  readonly password: string;
  readonly sessionSecret: string;
  readonly guestAccessSecret: string;
  readonly customerWebOrigin: string;
  /** Wall clock for the live service; tests may pin it. */
  readonly now?: Date;
}

/**
 * Writes the Dar Nedjma sample restaurant: two branches, a full Algerian
 * menu with options and branch overrides, 29 tables, a team of thirteen in
 * different onboarding states, ten days of completed, cancelled, and
 * refunded orders, and a live service in progress (orders waiting, cooking,
 * ready, served, a bill request, and a guest cancellation request).
 *
 * Every write goes through the application services, so the data obeys the
 * same rules, audit trail, and events as real use.
 */
export async function seedDemoData(
  options: DemoSeedDataOptions,
): Promise<DemoSeedResult> {
  const demoPassword = options.password;
  const realNow = options.now ?? new Date();
  const live = liveServiceMoment(realNow);
  const setupAt = algiersTime(live, HISTORY_DAYS + 3, 9 * 60);
  const random = createRandom(20_260_806);
  const customerImageUrl = (filename: string): string =>
    new URL(`/images/${filename}`, options.customerWebOrigin).toString();
  const metadata = (now: Date) => {
    const correlationId = randomUUID();
    return { correlationId, causationId: correlationId, now };
  };
  const databasePool = createDatabasePool({
    connectionString: options.connectionString,
    applicationName: "rms-demo-seed",
  });

  try {
    const workflow = new PostgresServiceWorkflow(databasePool);
    const restaurantConfiguration = new PostgresRestaurantConfigurationStore();
    const identityAccess = new PostgresIdentityAccessStore();
    const menu = new PostgresMenuStore();
    const tables = new PostgresTablesStore();
    const ordering = new PostgresOrderingStore();
    const kitchen = new PostgresKitchenStore();
    const payments = new PostgresPaymentsStore();
    const audit = new PostgresAuditWriter();
    const tenantOwner = new TenantOwnerService({
      databasePool,
      workflow,
      restaurantConfiguration,
      identityAccess,
      identitySecurity: new IdentitySecurity(options.sessionSecret),
      audit,
      credentialTokenDelivery: {
        deliverRecoveryToken: () => Promise.resolve(),
      },
      ordering,
      tables,
    });
    const menuTables = new MenuTablesService({
      databasePool,
      workflow,
      menu,
      tables,
      ordering,
      restaurantConfiguration,
      audit,
      guestAccessSecret: options.guestAccessSecret,
      customerWebOrigin: options.customerWebOrigin,
    });
    const orders = new OrderSubmissionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      audit,
      idempotencySecret: options.guestAccessSecret,
    });
    const kitchenService = new KitchenServingService({
      databasePool,
      workflow,
      restaurantConfiguration,
      kitchen,
      ordering,
      audit,
      idempotencySecret: options.guestAccessSecret,
    });
    const paymentsService = new PaymentCompletionService({
      databasePool,
      workflow,
      restaurantConfiguration,
      menu,
      tables,
      ordering,
      kitchen,
      payments,
      audit,
      idempotencySecret: options.guestAccessSecret,
    });

    const login = async (email: string, at: Date): Promise<StaffContext> =>
      (
        await tenantOwner.login(
          { businessCode: demoBusinessCode, email, password: demoPassword },
          metadata(at),
        )
      ).context;
    const ownerEmail = "nadia.cheriet@dar-nedjma.demo";

    /* ---- Restaurant and branches ------------------------------------ */

    const weekHours = (closesWeekend: string) =>
      [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        opensAt: "11:30",
        // Friday and Saturday are the Algerian weekend.
        closesAt: dayOfWeek === 5 || dayOfWeek === 6 ? closesWeekend : "23:00",
      }));
    const bootstrapped = await tenantOwner.bootstrapTenant(
      {
        businessCode: demoBusinessCode,
        businessName: "Dar Nedjma Hospitality",
        restaurantName: "Dar Nedjma",
        branch: {
          name: "Hydra",
          address: {
            line1: "18 Chemin Sidi Yahia",
            city: "Algiers",
            countryCode: "DZ",
          },
          contact: {
            email: "hydra@dar-nedjma.demo",
            phone: "+213 560 00 12 12",
          },
          timeZone: "Africa/Algiers",
          currency,
          openingHours: weekHours("23:30"),
        },
        owner: {
          displayName: "Nadia Cheriet",
          email: ownerEmail,
          password: demoPassword,
        },
      },
      metadata(setupAt),
    );
    const restaurantId = bootstrapped.restaurant.id;
    let owner = await login(ownerEmail, setupAt);
    const hydra = await tenantOwner.updateBranch(
      owner,
      {
        branchId: bootstrapped.branch.id,
        expectedVersion: bootstrapped.branch.version,
        serviceStatus: "open",
      },
      metadata(setupAt),
    );
    const createdBabEzzouar = await tenantOwner.createBranch(
      owner,
      {
        restaurantId,
        name: "Bab Ezzouar",
        address: {
          line1: "Centre commercial Bab Ezzouar, niveau 2",
          city: "Algiers",
          countryCode: "DZ",
        },
        contact: {
          email: "babezzouar@dar-nedjma.demo",
          phone: "+213 560 00 34 34",
        },
        timeZone: "Africa/Algiers",
        currency,
        openingHours: weekHours("23:00"),
      },
      metadata(setupAt),
    );
    // Creating a branch grants the creator access; sign in again to use it.
    owner = await login(ownerEmail, setupAt);
    const babEzzouar = await tenantOwner.updateBranch(
      owner,
      {
        branchId: createdBabEzzouar.id,
        expectedVersion: createdBabEzzouar.version,
        serviceStatus: "open",
      },
      metadata(setupAt),
    );

    /* ---- Team -------------------------------------------------------- */

    const team = [
      ...DEMO_ROLE_DEFINITIONS.slice(1).map((role) => ({
        displayName: role.displayName,
        email: role.email,
        template: role.templateKey,
        branch: "hydra" as const,
        state: "active" as const,
      })),
      ...EXTRA_EMPLOYEES,
    ];
    for (const person of team) {
      const employee = await tenantOwner.createEmployee(
        owner,
        {
          restaurantId,
          displayName: person.displayName,
          email: person.email,
          branchIds: [person.branch === "hydra" ? hydra.id : babEzzouar.id],
        },
        metadata(setupAt),
      );
      const permissionSet = await tenantOwner.getEmployeePermissions(
        owner,
        employee.id,
      );
      await tenantOwner.applyPermissionTemplate(
        owner,
        employee.id,
        person.template,
        permissionSet.version,
        "Apply the sample staff role.",
        metadata(setupAt),
      );
      const invitation = await tenantOwner.inviteStaff(
        owner,
        employee.id,
        metadata(setupAt),
      );
      if (person.state === "invited") continue;
      await tenantOwner.acceptInvitation(
        invitation.invitationToken,
        demoPassword,
        metadata(setupAt),
      );
      if (person.state === "deactivated") {
        const leftAt = algiersTime(live, 4, 10 * 60);
        const fresh = await login(ownerEmail, leftAt);
        const current = await tenantOwner.getEmployee(fresh, employee.id);
        await tenantOwner.deactivateEmployee(
          fresh,
          employee.id,
          current.version,
          "Left the restaurant at the end of the season.",
          metadata(leftAt),
        );
      }
    }

    /* ---- Menu -------------------------------------------------------- */

    interface SeededDish {
      readonly key: string;
      readonly id: string;
      readonly price: number;
      readonly weight: number;
      readonly groups: readonly {
        readonly required: boolean;
        readonly multiple: boolean;
        readonly maximum: number;
        readonly optionIds: readonly string[];
      }[];
    }
    const dishes: SeededDish[] = [];
    let categoryOrder = 0;
    for (const category of SAMPLE_MENU) {
      categoryOrder += 1;
      const createdCategory = await menuTables.createCategory(
        owner,
        { restaurantId, name: category.name, displayOrder: categoryOrder },
        metadata(setupAt),
      );
      let dishOrder = 0;
      for (const dish of category.dishes) {
        dishOrder += 1;
        const created = await menuTables.createDish(
          owner,
          {
            restaurantId,
            categoryId: createdCategory.id,
            name: dish.name,
            description: dish.description,
            ...(dish.image ? { imageUrl: customerImageUrl(dish.image) } : {}),
            basePrice: money(Number(dish.price)),
            displayOrder: dishOrder,
          },
          metadata(setupAt),
        );
        const groups = [];
        let groupOrder = 0;
        for (const group of dish.optionGroups ?? []) {
          groupOrder += 1;
          const createdGroup = await menuTables.createOptionGroup(
            owner,
            {
              dishId: created.id,
              name: group.name,
              selectionType: group.selectionType,
              isRequired: group.isRequired,
              minimumSelections: group.minimumSelections,
              maximumSelections: group.maximumSelections,
              displayOrder: groupOrder,
              options: group.options.map((option, index) => ({
                name: option.name,
                priceDelta: money(Number(option.priceDelta)),
                displayOrder: index + 1,
              })),
            },
            metadata(setupAt),
          );
          groups.push({
            required: group.isRequired,
            multiple: group.selectionType === "multiple",
            maximum: group.maximumSelections,
            optionIds: createdGroup.options.map((option) => option.id),
          });
        }
        dishes.push({
          key: dish.key,
          id: created.id,
          price: Number(dish.price),
          weight: dish.weight,
          groups,
        });
      }
    }
    const dishByKey = (key: string): SeededDish => {
      const dish = dishes.find((item) => item.key === key);
      if (!dish) throw new Error(`Sample dish ${key} is missing.`);
      return dish;
    };

    // Branch differences: Hydra has sold out of chakhchoukha; Bab Ezzouar
    // charges more for fish and does not serve mhalbi.
    const override = async (
      branchId: string,
      dishKey: string,
      change: {
        readonly price?: { amount: string; currency: string };
        readonly available?: boolean;
        readonly visible?: boolean;
      },
    ) => {
      const dishId = dishByKey(dishKey).id;
      // A dish without an override yet starts at version 0, as in the back office.
      await menuTables.upsertBranchOverride(
        owner,
        branchId,
        dishId,
        { expectedVersion: 0, ...change },
        metadata(setupAt),
      );
    };
    await override(hydra.id, "chakhchoukha", { available: false });
    await override(babEzzouar.id, "poisson", { price: money(3200) });
    await override(babEzzouar.id, "mhalbi", { visible: false });
    const unavailable: Record<string, readonly string[]> = {
      [hydra.id]: ["chakhchoukha"],
      [babEzzouar.id]: ["mhalbi"],
    };

    /* ---- Tables and QR codes ---------------------------------------- */

    const createTables = async (
      branchId: string,
      list: readonly { code: string; area: string }[],
    ) => {
      const created = [];
      for (const table of list) {
        created.push(
          await menuTables.createTable(
            owner,
            branchId,
            table,
            metadata(setupAt),
          ),
        );
      }
      return created;
    };
    const hydraTables = await createTables(hydra.id, HYDRA_TABLES);
    const babTables = await createTables(babEzzouar.id, BAB_EZZOUAR_TABLES);
    const tableByCode = (code: string) => {
      const table = [...hydraTables, ...babTables].find(
        (item) => item.code === code,
      );
      if (!table) throw new Error(`Sample table ${code} is missing.`);
      return table;
    };
    const qrFor = async (code: string) =>
      menuTables.issueTableQrCode(
        owner,
        tableByCode(code).id,
        metadata(setupAt),
      );
    const mainTableQr = await qrFor("T-12");
    const terraceQr = await qrFor("T-21");
    const lateQr = await qrFor("T-07");
    for (const code of ["T-01", "T-02", "T-20", "B-01", "B-02"]) {
      await qrFor(code);
    }
    await menuTables.issueBranchQrCode(owner, hydra.id, metadata(setupAt));
    const menuVersion = await menuTables.getMenuVersion(owner, restaurantId);

    /* ---- Crews that run each branch --------------------------------- */

    interface Crew {
      readonly branchId: string;
      readonly server: StaffContext;
      readonly cook: StaffContext;
      readonly cashier: StaffContext;
      readonly tables: readonly {
        readonly id: string;
        readonly code: string;
      }[];
    }
    const hydraCrew: Crew = {
      branchId: hydra.id,
      server: await login("imane.khellaf@dar-nedjma.demo", setupAt),
      cook: await login("yacine.bensaid@dar-nedjma.demo", setupAt),
      cashier: await login("samira.bouzid@dar-nedjma.demo", setupAt),
      tables: hydraTables,
    };
    const babCrew: Crew = {
      branchId: babEzzouar.id,
      server: await login("sofiane.amrani@dar-nedjma.demo", setupAt),
      cook: await login("meriem.saadi@dar-nedjma.demo", setupAt),
      cashier: await login("hichem.belaid@dar-nedjma.demo", setupAt),
      tables: babTables,
    };

    /* ---- Order lifecycle helpers ------------------------------------ */

    let sequence = 0;
    const key = (step: string) => `sample-${String(sequence)}-${step}`;

    const basket = (branchId: string) => {
      const blocked = unavailable[branchId] ?? [];
      const choices = dishes.filter((dish) => !blocked.includes(dish.key));
      const lines = new Map<
        string,
        { quantity: number; optionIds: string[] }
      >();
      const count = random.int(1, 4);
      for (let index = 0; index < count; index += 1) {
        const dish = random.weighted(choices);
        const existing = lines.get(dish.id);
        if (existing) {
          existing.quantity += 1;
          continue;
        }
        const optionIds: string[] = [];
        for (const group of dish.groups) {
          if (group.required || random.next() < 0.3) {
            optionIds.push(random.pick(group.optionIds));
          }
        }
        lines.set(dish.id, {
          quantity: random.next() < 0.25 ? 2 : 1,
          optionIds,
        });
      }
      return [...lines].map(([dishId, line]) => ({ dishId, ...line }));
    };

    const orderVersion = async (crew: Crew, orderId: string) => {
      const list = await orders.listStaffOrders(crew.server, {
        branchId: crew.branchId,
        closure: "active",
        pageSize: 50,
      });
      const order = list.items.find((item) => item.id === orderId);
      if (!order) throw new Error("A sample order disappeared mid-seed.");
      return order.version;
    };

    const cook = async (
      crew: Crew,
      orderId: string,
      startAt: Date,
      readyAt: Date | undefined,
    ) => {
      const queue = await kitchenService.getKitchenQueue(
        crew.cook,
        crew.branchId,
      );
      for (const item of queue.filter((entry) => entry.orderId === orderId)) {
        const started = await kitchenService.startKitchenWorkItem(
          crew.cook,
          item.id,
          item.version,
          undefined,
          key(`start-${item.id}`),
          metadata(startAt),
        );
        if (readyAt) {
          await kitchenService.markKitchenWorkItemReady(
            crew.cook,
            started.id,
            started.version,
            undefined,
            key(`ready-${started.id}`),
            metadata(readyAt),
          );
        }
      }
    };

    const serve = async (crew: Crew, orderId: string, at: Date) =>
      kitchenService.markOrderServed(
        crew.server,
        orderId,
        await orderVersion(crew, orderId),
        undefined,
        key("serve"),
        metadata(at),
      );

    type Outcome = "paid" | "refunded" | "cancelled";

    /** One order from submission to its final state, in the past. */
    const historicOrder = async (
      crew: Crew,
      table: { readonly id: string },
      at: Date,
      outcome: Outcome,
    ) => {
      sequence += 1;
      const order = await orders.createStaffOrder(
        crew.server,
        table.id,
        {
          menuVersion,
          customerName: random.pick(GUEST_NAMES),
          items: basket(crew.branchId),
        },
        key("create"),
        metadata(at),
      );
      const later = (minutes: number) =>
        new Date(at.getTime() + minutes * MINUTE);
      if (outcome === "cancelled") {
        await paymentsService.cancelOrder(
          await login(ownerEmail, later(6)),
          order.id,
          order.version,
          { reason: random.pick(CANCELLATION_REASONS) },
          key("cancel"),
          metadata(later(6)),
        );
        return;
      }
      const startMinute = random.int(2, 8);
      const readyMinute = startMinute + random.int(10, 24);
      await cook(crew, order.id, later(startMinute), later(readyMinute));
      const served = await serve(
        crew,
        order.id,
        later(readyMinute + random.int(1, 5)),
      );
      const paidMinute = readyMinute + random.int(25, 55);
      const method = random.next() < 0.58 ? "cash" : "card";
      const paid = await paymentsService.recordPayment(
        crew.cashier,
        order.id,
        {
          amount: served.total,
          method,
          ...(method === "card"
            ? { externalReference: `CIB-${String(100_000 + sequence)}` }
            : {}),
        },
        key("pay"),
        metadata(later(paidMinute)),
      );
      await paymentsService.completeOrder(
        crew.cashier,
        order.id,
        paid.order.version,
        {},
        key("complete"),
        metadata(later(paidMinute + 2)),
      );
      if (outcome === "refunded") {
        // A complaint after the table has closed: refund part of the bill.
        const total = Number(served.total.amount);
        const refund = Math.max(150, Math.round((total * 0.25) / 50) * 50);
        await paymentsService.recordRefund(
          await login(ownerEmail, later(paidMinute + 8)),
          paid.payment.id,
          {
            amount: money(Math.min(refund, total)),
            reason: random.pick(REFUND_REASONS),
            confirmed: true,
          },
          key("refund"),
          metadata(later(paidMinute + 9)),
        );
      }
    };

    const outcomeFor = (): Outcome => {
      const roll = random.next();
      return roll < 0.07 ? "cancelled" : roll < 0.13 ? "refunded" : "paid";
    };

    /* ---- Ten days of history ---------------------------------------- */

    // Tables used by the live service stay free of history on the live day.
    const liveTableCodes = new Set([
      "T-03",
      "T-05",
      "T-07",
      "T-09",
      "T-12",
      "T-21",
      "S-02",
      "B-02",
      "B-05",
      "B-07",
    ]);
    const liveMinute = algiersMinutesOfDay(live);
    const serviceSlots = (
      crew: Crew,
      daysAgo: number,
      from: number,
      to: number,
      count: number,
    ) => {
      const slots: { at: Date; table: { id: string; code: string } }[] = [];
      for (let index = 0; index < count; index += 1) {
        const minute =
          from + Math.floor(((to - from) * (index + random.next())) / count);
        if (daysAgo === 0 && minute >= liveMinute - 90) continue;
        const candidates = crew.tables.filter(
          (table) => daysAgo > 0 || !liveTableCodes.has(table.code),
        );
        slots.push({
          at: algiersTime(live, daysAgo, minute),
          table: random.pick(candidates),
        });
      }
      return slots;
    };
    for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
      const busy = daysAgo % 7 === 2 || daysAgo % 7 === 3 ? 2 : 0;
      const slots = [
        ...serviceSlots(
          hydraCrew,
          daysAgo,
          12 * 60 + 10,
          14 * 60 + 30,
          random.int(3, 5) + busy,
        ).map((slot) => ({ ...slot, crew: hydraCrew })),
        ...serviceSlots(
          hydraCrew,
          daysAgo,
          19 * 60 + 15,
          21 * 60 + 45,
          random.int(4, 7) + busy,
        ).map((slot) => ({ ...slot, crew: hydraCrew })),
        ...serviceSlots(
          babCrew,
          daysAgo,
          12 * 60 + 20,
          21 * 60 + 30,
          random.int(2, 4),
        ).map((slot) => ({ ...slot, crew: babCrew })),
      ].sort((left, right) => left.at.getTime() - right.at.getTime());
      for (const slot of slots) {
        await historicOrder(slot.crew, slot.table, slot.at, outcomeFor());
      }
    }

    /* ---- The live service ------------------------------------------- */

    const ago = (minutes: number) =>
      new Date(live.getTime() - minutes * MINUTE);
    const liveStaffOrder = async (
      crew: Crew,
      code: string,
      minutesAgo: number,
      customerName: string,
    ) => {
      sequence += 1;
      return orders.createStaffOrder(
        crew.server,
        tableByCode(code).id,
        { menuVersion, customerName, items: basket(crew.branchId) },
        key("create"),
        metadata(ago(minutesAgo)),
      );
    };

    // Hydra: something at every stage of service.
    const readyToServe = await liveStaffOrder(
      hydraCrew,
      "T-03",
      40,
      "Sarah Meziane",
    );
    await cook(hydraCrew, readyToServe.id, ago(33), ago(8));
    const cooking = await liveStaffOrder(hydraCrew, "T-05", 22, "Mehdi Larbi");
    await cook(hydraCrew, cooking.id, ago(14), undefined);
    await liveStaffOrder(hydraCrew, "T-09", 6, "Nour Hamidi");
    const servedUnpaid = await liveStaffOrder(
      hydraCrew,
      "S-02",
      75,
      "Rachid Mebarki",
    );
    await cook(hydraCrew, servedUnpaid.id, ago(70), ago(48));
    await serve(hydraCrew, servedUnpaid.id, ago(44));

    // Guests ordering from their phones through the table QR codes.
    const guestAt = async (qrUrl: string) => {
      const token = new URL(qrUrl).pathname.split("/").at(-1) ?? "";
      const exchanged = await menuTables.exchangeTableQr(
        token,
        metadata(realNow),
      );
      const context = await menuTables.authenticateGuestSession(
        exchanged.sessionToken,
      );
      if (!context) throw new Error("The sample guest session was refused.");
      return context;
    };
    const guestOrder = async (
      qrUrl: string,
      minutesAgo: number,
      customerName: string,
    ) => {
      sequence += 1;
      const guest = await guestAt(qrUrl);
      const order = await orders.submitGuestOrder(
        guest,
        { menuVersion, customerName, items: basket(hydra.id) },
        key("guest-create"),
        metadata(ago(minutesAgo)),
      );
      return { guest, order };
    };

    await guestOrder(mainTableQr.qrUrl, 12, "Amel Benkhaled");
    const billTable = await guestOrder(terraceQr.qrUrl, 58, "Karim Bouzid");
    await cook(hydraCrew, billTable.order.id, ago(52), ago(30));
    await serve(hydraCrew, billTable.order.id, ago(26));
    await paymentsService.requestGuestBill(
      billTable.guest,
      billTable.order.id,
      key("guest-bill"),
      metadata(ago(3)),
    );
    const changedMind = await guestOrder(lateQr.qrUrl, 5, "Inès Rahmani");
    await orders.requestGuestCancellation(
      changedMind.guest,
      changedMind.order.id,
      "We ordered the wrong dish for our son, sorry.",
      key("guest-cancel"),
      metadata(ago(2)),
    );

    // Bab Ezzouar: a quieter service.
    await liveStaffOrder(babCrew, "B-02", 9, "Adel Chabane");
    const babCooking = await liveStaffOrder(babCrew, "B-05", 25, "Rania Ouali");
    await cook(babCrew, babCooking.id, ago(16), undefined);
    const babServed = await liveStaffOrder(
      babCrew,
      "B-07",
      64,
      "Bilal Djebbar",
    );
    await cook(babCrew, babServed.id, ago(58), ago(36));
    await serve(babCrew, babServed.id, ago(31));

    // So the sample can be tried at any hour, both branches keep accepting
    // orders outside their opening hours (Setup > Branches turns this off).
    const latestOwner = await login(ownerEmail, live);
    for (const branchId of [hydra.id, babEzzouar.id]) {
      const current = await tenantOwner.getBranch(latestOwner, branchId);
      await tenantOwner.updateBranch(
        latestOwner,
        {
          branchId,
          expectedVersion: current.version,
          allowOrderOverride: true,
        },
        metadata(live),
      );
    }

    /* ---- Notifications and reports from the recorded events --------- */

    const notificationService = new NotificationService({
      databasePool,
      store: new PostgresNotificationStore(),
      identityAccess,
      restaurantConfiguration,
    });
    const reportingService = new ReportingService({
      databasePool,
      store: new PostgresReportingStore(),
      restaurantConfiguration,
    });
    const outbox = new PostgresOutboxProcessor(databasePool, {
      workerId: "rms-demo-seed",
      handlers: [notificationService, reportingService],
      leaseMilliseconds: 30_000,
      maximumAttempts: 5,
      now: () => live,
    });
    let outboxResult = await outbox.processNext();
    while (outboxResult === "processed") {
      outboxResult = await outbox.processNext();
    }

    return {
      businessCode: demoBusinessCode,
      businessName: "Dar Nedjma Hospitality",
      restaurantName: bootstrapped.restaurant.name,
      branchName: hydra.name,
      roles: DEMO_ROLE_DEFINITIONS.map((role) => ({
        key: role.key,
        label: role.label,
        displayName: role.displayName,
        email: role.email,
        target: role.target,
        password: demoPassword,
      })),
      customerUrls: [{ tableCode: "T-12", url: mainTableQr.qrUrl }],
      scenario: DEMO_SCENARIO,
    };
  } finally {
    await databasePool.end();
  }
}
