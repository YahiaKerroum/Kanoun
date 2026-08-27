import { Client } from "pg";

interface OpeningPeriod {
  readonly dayOfWeek: number;
  readonly opensAt: string;
  readonly closesAt: string;
}

interface BranchRow {
  readonly status: "active" | "inactive";
  readonly service_status: "open" | "closed" | "temporarily_unavailable";
  readonly allow_order_override: boolean;
  readonly time_zone: string;
}

export interface Pd025GuestOrderDiagnosticInput {
  readonly connectionString: string;
  readonly businessCode: string;
  readonly restaurantId: string;
  readonly branchId: string;
  readonly now?: Date;
}

export interface Pd025GuestOrderDiagnostic {
  readonly scope: "available" | "not_found";
  readonly branch?: {
    readonly status: "active" | "inactive";
    readonly serviceStatus: "open" | "closed" | "temporarily_unavailable";
    readonly openingHoursConfigured: boolean;
    readonly hasDatedClosure: boolean;
    readonly acceptsOrders: boolean;
  };
}

function localClock(
  now: Date,
  timeZone: string,
): {
  readonly dayOfWeek: number;
  readonly minutes: number;
  readonly date: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const days: Readonly<Record<string, number>> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = days[value("weekday")];
  if (dayOfWeek === undefined) {
    throw new RangeError("The branch time zone did not resolve a weekday.");
  }
  return {
    dayOfWeek,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
    date: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

function minutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isWithinHours(
  periods: readonly OpeningPeriod[],
  dayOfWeek: number,
  localMinutes: number,
): boolean {
  return periods.some((period) => {
    const opensAt = minutes(period.opensAt);
    const closesAt = minutes(period.closesAt);
    if (opensAt < closesAt) {
      return (
        period.dayOfWeek === dayOfWeek &&
        localMinutes >= opensAt &&
        localMinutes < closesAt
      );
    }
    return (
      (period.dayOfWeek === dayOfWeek && localMinutes >= opensAt) ||
      (period.dayOfWeek === (dayOfWeek + 6) % 7 && localMinutes < closesAt)
    );
  });
}

export async function inspectPd025GuestOrderReadiness(
  input: Pd025GuestOrderDiagnosticInput,
): Promise<Pd025GuestOrderDiagnostic> {
  const client = new Client({ connectionString: input.connectionString });
  await client.connect();
  try {
    const tenant = await client.query<{ id: string }>(
      "select id from restaurant.business_accounts where code = $1",
      [input.businessCode],
    );
    const businessAccountId = tenant.rows[0]?.id;
    if (!businessAccountId) return { scope: "not_found" };
    const branch = await client.query<BranchRow>(
      `select status, service_status, allow_order_override, time_zone
       from restaurant.branches
       where business_account_id = $1 and restaurant_id = $2 and id = $3`,
      [businessAccountId, input.restaurantId, input.branchId],
    );
    const branchRow = branch.rows[0];
    if (!branchRow) return { scope: "not_found" };
    const now = input.now ?? new Date();
    const clock = localClock(now, branchRow.time_zone);
    const [hours, closures] = await Promise.all([
      client.query<{
        day_of_week: number;
        opens_at_local: string;
        closes_at_local: string;
      }>(
        `select day_of_week, opens_at_local::text, closes_at_local::text
         from restaurant.branch_hours
         where business_account_id = $1 and branch_id = $2`,
        [businessAccountId, input.branchId],
      ),
      client.query(
        `select 1 from restaurant.branch_closures
         where business_account_id = $1 and branch_id = $2 and closure_date = $3::date`,
        [businessAccountId, input.branchId, clock.date],
      ),
    ]);
    const periods = hours.rows.map((period) => ({
      dayOfWeek: period.day_of_week,
      opensAt: period.opens_at_local.slice(0, 5),
      closesAt: period.closes_at_local.slice(0, 5),
    }));
    const hasDatedClosure = (closures.rowCount ?? 0) > 0;
    const acceptsOrders =
      branchRow.status === "active" &&
      !hasDatedClosure &&
      (branchRow.allow_order_override ||
        (branchRow.service_status === "open" &&
          (periods.length === 0 ||
            isWithinHours(periods, clock.dayOfWeek, clock.minutes))));
    return {
      scope: "available",
      branch: {
        status: branchRow.status,
        serviceStatus: branchRow.service_status,
        openingHoursConfigured: periods.length > 0,
        hasDatedClosure,
        acceptsOrders,
      },
    };
  } finally {
    await client.end();
  }
}
