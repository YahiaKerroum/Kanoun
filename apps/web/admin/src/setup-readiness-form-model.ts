import { dayLabels } from "./setup-readiness-types.js";
import type {
  Branch,
  BranchDraft,
  HoursDraft,
  HoursPeriodDraft,
  OpeningPeriod,
  ReadinessStatus,
  Restaurant,
} from "./setup-readiness-types.js";

export function defaultHours(): readonly HoursDraft[] {
  const period: HoursPeriodDraft = { opensAt: "09:00", closesAt: "22:00" };
  return dayLabels.map((_, dayOfWeek) => ({
    enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
    periods: [period],
  }));
}

export function draftFromBranch(branch: Branch): BranchDraft {
  const hours = defaultHours().map((fallback, dayOfWeek) => {
    const periods = branch.openingHours
      .filter((item) => item.dayOfWeek === dayOfWeek)
      .map(({ opensAt, closesAt }) => ({ opensAt, closesAt }));
    return periods.length > 0
      ? { enabled: true, periods }
      : { ...fallback, enabled: false };
  });
  return {
    name: branch.name,
    line1: branch.address?.line1 ?? "",
    line2: branch.address?.line2 ?? "",
    city: branch.address?.city ?? "",
    region: branch.address?.region ?? "",
    postalCode: branch.address?.postalCode ?? "",
    countryCode: branch.address?.countryCode ?? "DZ",
    email: branch.contact?.email ?? "",
    phone: branch.contact?.phone ?? "",
    timeZone: branch.timeZone,
    currency: branch.currency,
    status: branch.status,
    serviceStatus: branch.serviceStatus,
    allowOrderOverride: branch.allowOrderOverride ?? false,
    hours,
  };
}

export function emptyBranchDraft(): BranchDraft {
  return {
    name: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "DZ",
    email: "",
    phone: "",
    timeZone: "Africa/Algiers",
    currency: "DZD",
    status: "active",
    serviceStatus: "closed",
    allowOrderOverride: false,
    hours: defaultHours(),
  };
}

export function hoursFromDraft(hours: readonly HoursDraft[]): OpeningPeriod[] {
  return hours.flatMap((item, dayOfWeek) =>
    item.enabled
      ? item.periods.map((period) => ({ dayOfWeek, ...period }))
      : [],
  );
}

export function statusLabel(status: ReadinessStatus): string {
  return status === "ready"
    ? "Ready"
    : status === "attention"
      ? "Needs setup"
      : "Blocked";
}

export function statusIcon(status: ReadinessStatus): string {
  return status === "ready" ? "✓" : status === "attention" ? "!" : "×";
}

export function statusClass(status: ReadinessStatus): string {
  return `readiness-item readiness-item--${status}`;
}

export function restaurantStatusFrom(value: string): Restaurant["status"] {
  return value === "inactive" ? "inactive" : "active";
}

export function branchStatusFrom(value: string): BranchDraft["status"] {
  return value === "inactive" ? "inactive" : "active";
}

export function serviceStatusFrom(value: string): BranchDraft["serviceStatus"] {
  if (value === "open" || value === "temporarily_unavailable") return value;
  return "closed";
}
