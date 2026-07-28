import type { BranchRecord, OpeningPeriod } from "./models.js";

const weekDays = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

function minutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
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
  const dayOfWeek = weekDays.get(value("weekday"));
  if (dayOfWeek === undefined) {
    throw new RangeError(`Unable to resolve weekday for ${timeZone}.`);
  }
  return {
    dayOfWeek,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
    date: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

function periodContains(
  period: OpeningPeriod,
  dayOfWeek: number,
  localMinutes: number,
): boolean {
  const opens = minutes(period.opensAt);
  const closes = minutes(period.closesAt);
  if (opens < closes) {
    return (
      period.dayOfWeek === dayOfWeek &&
      localMinutes >= opens &&
      localMinutes < closes
    );
  }
  const previousDay = (dayOfWeek + 6) % 7;
  return (
    (period.dayOfWeek === dayOfWeek && localMinutes >= opens) ||
    (period.dayOfWeek === previousDay && localMinutes < closes)
  );
}

export function branchLocalDate(now: Date, timeZone: string): string {
  return localClock(now, timeZone).date;
}

export function isBranchAcceptingOrders(
  branch: BranchRecord,
  now: Date,
  hasDatedClosure: boolean,
): boolean {
  if (
    branch.status !== "active" ||
    branch.serviceStatus !== "open" ||
    hasDatedClosure
  ) {
    return false;
  }
  if (branch.openingHours.length === 0) {
    return true;
  }
  const clock = localClock(now, branch.timeZone);
  return branch.openingHours.some((period) =>
    periodContains(period, clock.dayOfWeek, clock.minutes),
  );
}
