export const permissionKeys = [
  "restaurant.view",
  "restaurant.edit",
  "branches.view",
  "branches.manage",
  "features.manage",
  "employees.view",
  "employees.manage",
  "employees.manage_permissions",
  "menu.view",
  "menu.manage",
  "menu.manage_prices",
  "menu.manage_availability",
  "qr.manage",
  "tables.view",
  "tables.manage",
  "tables.assign",
  "tables.close_session",
  "orders.view",
  "orders.create",
  "orders.accept",
  "orders.reject",
  "orders.modify",
  "orders.cancel",
  "orders.serve",
  "orders.complete",
  "orders.complete_unpaid",
  "kitchen.view",
  "kitchen.update",
  "payments.view",
  "payments.record",
  "payments.refund",
  "reports.view",
  "reports.view_cross_branch",
  "audit.view",
  "support.break_glass",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export type PermissionScope = "platform" | "restaurant" | "branch";
export type PermissionRisk = "low" | "medium" | "high" | "critical";

export interface PermissionDefinition {
  readonly key: PermissionKey;
  readonly id: string;
  readonly module: string;
  readonly scope: PermissionScope;
  readonly risk: PermissionRisk;
  readonly delegableSubsetOnly?: boolean;
}

const definition = (
  key: PermissionKey,
  id: string,
  module: string,
  scope: PermissionScope,
  risk: PermissionRisk,
  delegableSubsetOnly = false,
): PermissionDefinition => ({
  key,
  id,
  module,
  scope,
  risk,
  ...(delegableSubsetOnly ? { delegableSubsetOnly: true } : {}),
});

export const permissionDefinitions = [
  definition(
    "restaurant.view",
    "PERM-001",
    "restaurant_configuration",
    "restaurant",
    "low",
  ),
  definition(
    "restaurant.edit",
    "PERM-002",
    "restaurant_configuration",
    "restaurant",
    "high",
  ),
  definition(
    "branches.view",
    "PERM-003",
    "restaurant_configuration",
    "restaurant",
    "low",
  ),
  definition(
    "branches.manage",
    "PERM-004",
    "restaurant_configuration",
    "restaurant",
    "high",
  ),
  definition(
    "features.manage",
    "PERM-005",
    "restaurant_configuration",
    "restaurant",
    "high",
  ),
  definition(
    "employees.view",
    "PERM-006",
    "restaurant_configuration",
    "restaurant",
    "medium",
  ),
  definition(
    "employees.manage",
    "PERM-007",
    "restaurant_configuration",
    "restaurant",
    "high",
  ),
  definition(
    "employees.manage_permissions",
    "PERM-008",
    "identity_access",
    "restaurant",
    "critical",
    true,
  ),
  definition("menu.view", "PERM-009", "menu", "branch", "low"),
  definition("menu.manage", "PERM-010", "menu", "restaurant", "medium"),
  definition("menu.manage_prices", "PERM-011", "menu", "branch", "high"),
  definition(
    "menu.manage_availability",
    "PERM-012",
    "menu",
    "branch",
    "medium",
  ),
  definition("qr.manage", "PERM-013", "tables", "branch", "high"),
  definition("tables.view", "PERM-014", "tables", "branch", "low"),
  definition("tables.manage", "PERM-015", "tables", "branch", "medium"),
  definition("tables.assign", "PERM-016", "tables", "branch", "medium"),
  definition("tables.close_session", "PERM-017", "tables", "branch", "high"),
  definition("orders.view", "PERM-018", "ordering", "branch", "low"),
  definition("orders.create", "PERM-019", "ordering", "branch", "medium"),
  definition("orders.accept", "PERM-020", "ordering", "branch", "medium"),
  definition("orders.reject", "PERM-021", "ordering", "branch", "medium"),
  definition("orders.modify", "PERM-022", "ordering", "branch", "high"),
  definition("orders.cancel", "PERM-023", "ordering", "branch", "high"),
  definition("orders.serve", "PERM-024", "ordering", "branch", "medium"),
  definition("orders.complete", "PERM-025", "ordering", "branch", "high"),
  definition(
    "orders.complete_unpaid",
    "PERM-026",
    "ordering",
    "branch",
    "critical",
  ),
  definition("kitchen.view", "PERM-027", "kitchen", "branch", "low"),
  definition("kitchen.update", "PERM-028", "kitchen", "branch", "medium"),
  definition("payments.view", "PERM-029", "payments", "branch", "high"),
  definition("payments.record", "PERM-030", "payments", "branch", "high"),
  definition("payments.refund", "PERM-031", "payments", "branch", "critical"),
  definition("reports.view", "PERM-032", "reporting", "branch", "medium"),
  definition(
    "reports.view_cross_branch",
    "PERM-033",
    "reporting",
    "restaurant",
    "high",
  ),
  definition("audit.view", "PERM-034", "audit", "restaurant", "critical"),
  definition(
    "support.break_glass",
    "PERM-035",
    "identity_access",
    "platform",
    "critical",
  ),
] as const satisfies readonly PermissionDefinition[];

export const permissionDefinitionByKey = new Map(
  permissionDefinitions.map((item) => [item.key, item]),
);

export const administratorPermissionKeys = [
  "restaurant.view",
  "restaurant.edit",
  "branches.view",
  "branches.manage",
  "features.manage",
  "employees.view",
  "employees.manage",
  "employees.manage_permissions",
  "menu.view",
  "menu.manage",
  "menu.manage_prices",
  "menu.manage_availability",
  "qr.manage",
  "tables.view",
  "tables.manage",
  "tables.assign",
  "tables.close_session",
  "orders.view",
  "orders.create",
  "orders.accept",
  "orders.reject",
  "orders.modify",
  "orders.cancel",
  "orders.serve",
  "orders.complete",
  "kitchen.view",
  "kitchen.update",
  "payments.view",
  "payments.record",
  "payments.refund",
  "reports.view",
  "reports.view_cross_branch",
  "audit.view",
] as const satisfies readonly PermissionKey[];

export const permissionTemplateCatalog = {
  administrator: {
    displayName: "Administrator",
    permissionKeys: administratorPermissionKeys,
  },
  general_staff: {
    displayName: "General Staff",
    permissionKeys: [
      "menu.view",
      "tables.view",
      "tables.assign",
      "orders.view",
      "orders.create",
      "orders.serve",
      "kitchen.view",
      "kitchen.update",
    ],
  },
  cashier: {
    displayName: "Cashier",
    permissionKeys: [
      "tables.view",
      "orders.view",
      "orders.create",
      "orders.complete",
      "payments.view",
      "payments.record",
    ],
  },
  kitchen_staff: {
    displayName: "Kitchen Staff",
    permissionKeys: ["orders.view", "kitchen.view", "kitchen.update"],
  },
} as const satisfies Record<
  string,
  {
    readonly displayName: string;
    readonly permissionKeys: readonly PermissionKey[];
  }
>;

export type PermissionTemplateKey = keyof typeof permissionTemplateCatalog;
