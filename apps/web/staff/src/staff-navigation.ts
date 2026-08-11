export type StaffSection =
  | "Home"
  | "Notifications"
  | "Orders"
  | "Tables"
  | "Kitchen"
  | "Payments"
  | "Menu"
  | "Reports"
  | "Audit";

export interface StaffRoute {
  readonly section: StaffSection;
  readonly path: string;
}

export const staffRoutes: readonly StaffRoute[] = [
  { section: "Home", path: "/" },
  { section: "Notifications", path: "/notifications" },
  { section: "Orders", path: "/orders" },
  { section: "Tables", path: "/tables" },
  { section: "Kitchen", path: "/kitchen" },
  { section: "Payments", path: "/payments" },
  { section: "Menu", path: "/menu" },
  { section: "Reports", path: "/reports" },
  { section: "Audit", path: "/audit" },
];

const routeByPath = new Map(
  staffRoutes.map((route) => [route.path, route.section]),
);
const pathBySection = new Map(
  staffRoutes.map((route) => [route.section, route.path]),
);

export function staffSectionForPath(pathname: string): StaffSection | null {
  return routeByPath.get(pathname) ?? null;
}

export function staffPathForSection(section: StaffSection): string {
  return pathBySection.get(section) ?? "/";
}

export function staffRouteIsKnown(pathname: string): boolean {
  return routeByPath.has(pathname);
}

function hasPermission(
  permissions: readonly string[],
  exact: readonly string[],
  prefixes: readonly string[] = [],
): boolean {
  return permissions.some(
    (permission) =>
      exact.includes(permission) ||
      prefixes.some((prefix) => permission.startsWith(prefix)),
  );
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function chooseStaffLanding(
  permissions: readonly string[],
  enabledFeatures: readonly string[],
): StaffSection {
  const hasFeature = (feature: string) => enabledFeatures.includes(feature);
  const hasOrders =
    hasFeature("ordering") && hasPermission(permissions, [], ["orders."]);
  const hasKitchen =
    hasFeature("kitchen") &&
    hasPermission(permissions, ["orders.serve"], ["kitchen."]);
  const hasPayments =
    hasFeature("payments") && hasPermission(permissions, [], ["payments."]);
  const hasReports =
    hasFeature("reporting") && hasPermission(permissions, [], ["reports."]);
  const hasNonKitchenOperationalWork = permissions.some(
    (permission) =>
      (permission.startsWith("orders.") && permission !== "orders.view") ||
      permission.startsWith("payments.") ||
      permission.startsWith("reports."),
  );
  const hasNonPaymentOperationalWork = permissions.some(
    (permission) =>
      permission.startsWith("kitchen.") ||
      permission === "orders.serve" ||
      permission === "orders.modify" ||
      permission === "orders.cancel" ||
      permission === "orders.reject" ||
      permission === "orders.accept" ||
      permission.startsWith("reports."),
  );
  const hasNonReportingOperationalWork = permissions.some(
    (permission) =>
      permission.startsWith("kitchen.") ||
      permission.startsWith("payments.") ||
      (permission.startsWith("orders.") && permission !== "orders.view"),
  );

  if (hasKitchen && !hasNonKitchenOperationalWork) return "Kitchen";
  if (hasPayments && !hasNonPaymentOperationalWork) return "Payments";
  if (hasReports && !hasNonReportingOperationalWork) return "Reports";

  const available = [hasOrders, hasKitchen, hasPayments, hasReports].filter(
    Boolean,
  ).length;

  if (available > 1) return "Home";
  if (hasKitchen) return "Kitchen";
  if (hasPayments) return "Payments";
  if (hasOrders) return "Orders";
  if (hasReports) return "Reports";
  return "Home";
}

export function safeStaffReturnPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    hasControlCharacter(candidate)
  ) {
    return fallback;
  }
  try {
    const url = new URL(candidate, "https://staff.invalid");
    if (!staffRouteIsKnown(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
