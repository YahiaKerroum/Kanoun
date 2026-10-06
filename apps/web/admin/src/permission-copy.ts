/*
 * Plain names for permission keys (docs/security/permissions.yaml), so the
 * back office never shows identifiers such as `orders.view` (see DESIGN.md,
 * Writing). Unknown keys fall back to a readable form of the key.
 */
const permissionNames: Readonly<Record<string, string>> = {
  "restaurant.view": "See restaurant details",
  "restaurant.edit": "Change restaurant details",
  "branches.view": "See branches",
  "branches.manage": "Add and change branches",
  "features.manage": "Turn features on or off",
  "employees.view": "See the team",
  "employees.manage": "Add and change team members",
  "employees.manage_permissions": "Change what others can do",
  "menu.view": "See the menu",
  "menu.manage": "Edit the menu",
  "menu.manage_prices": "Change prices",
  "menu.manage_availability": "Mark dishes sold out",
  "qr.manage": "Issue and replace table QR codes",
  "tables.view": "See tables",
  "tables.manage": "Add and change tables",
  "tables.assign": "Move orders between tables",
  "tables.close_session": "Close a table",
  "orders.view": "See orders",
  "orders.create": "Take orders",
  "orders.accept": "Accept orders",
  "orders.reject": "Reject orders",
  "orders.modify": "Change orders",
  "orders.cancel": "Cancel orders",
  "orders.serve": "Serve orders",
  "orders.complete": "Close paid orders",
  "orders.complete_unpaid": "Close orders that are not paid",
  "kitchen.view": "See the kitchen board",
  "kitchen.update": "Start and finish dishes",
  "payments.view": "See bills and payments",
  "payments.record": "Take payments",
  "payments.refund": "Give refunds",
  "reports.view": "See reports",
  "reports.view_cross_branch": "See reports for every branch",
  "audit.view": "See the history of changes",
};

const moduleNames: Readonly<Record<string, string>> = {
  restaurant_configuration: "Restaurant and team",
  identity_access: "Access",
  menu: "Menu",
  tables: "Tables and QR codes",
  ordering: "Orders",
  kitchen: "Kitchen",
  payments: "Payments",
  reporting: "Reports",
  audit: "History",
};

function readable(key: string): string {
  const text = key.replaceAll(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function permissionName(key: string): string {
  return permissionNames[key] ?? readable(key);
}

export function permissionModuleName(module: string): string {
  return moduleNames[module] ?? readable(module);
}

/** Only high and critical permissions get a note; most rows stay quiet. */
export function permissionRiskNote(risk: string): string | null {
  if (risk === "critical") return "Sensitive: give to very few people";
  if (risk === "high") return "Sensitive";
  return null;
}
