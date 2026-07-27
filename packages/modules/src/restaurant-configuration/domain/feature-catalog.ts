export type FeatureState = "enabled" | "disabled" | "automatic" | "unavailable";

export interface FeatureDefinition {
  readonly id: string;
  readonly key: string;
  readonly kind:
    | "core_module"
    | "optional_module"
    | "capability"
    | "strategy"
    | "integration";
  readonly scope: "platform" | "restaurant" | "branch";
  readonly mvp: boolean;
  readonly defaultState: FeatureState;
  readonly dependsOn: readonly string[];
  readonly mutableInMvp: boolean;
  readonly disablePolicy?: string;
}

const feature = (
  id: string,
  key: string,
  kind: FeatureDefinition["kind"],
  scope: FeatureDefinition["scope"],
  mvp: boolean,
  defaultState: FeatureState,
  mutableInMvp: boolean,
  dependsOn: readonly string[] = [],
  disablePolicy?: string,
): FeatureDefinition => ({
  id,
  key,
  kind,
  scope,
  mvp,
  defaultState,
  dependsOn,
  mutableInMvp,
  ...(disablePolicy ? { disablePolicy } : {}),
});

export const featureDefinitions = [
  feature(
    "CFG-001",
    "restaurant_configuration",
    "core_module",
    "restaurant",
    true,
    "enabled",
    false,
    [],
    "prohibited",
  ),
  feature(
    "CFG-002",
    "identity_access",
    "core_module",
    "restaurant",
    true,
    "enabled",
    false,
    [],
    "prohibited",
  ),
  feature(
    "CFG-003",
    "menu",
    "core_module",
    "restaurant",
    true,
    "enabled",
    false,
    [],
    "prohibit_while_branch_active",
  ),
  feature(
    "CFG-004",
    "qr_menu",
    "capability",
    "branch",
    true,
    "enabled",
    true,
    ["CFG-003"],
    "stop_new_sessions_grandfather_active",
  ),
  feature(
    "CFG-005",
    "ordering",
    "core_module",
    "branch",
    true,
    "enabled",
    true,
    ["CFG-003", "CFG-004", "CFG-006"],
    "stop_new_orders_grandfather_active",
  ),
  feature(
    "CFG-006",
    "tables",
    "core_module",
    "branch",
    true,
    "enabled",
    true,
    [],
    "prohibit_while_open_sessions_exist",
  ),
  feature(
    "CFG-007",
    "kitchen",
    "core_module",
    "branch",
    true,
    "enabled",
    true,
    ["CFG-005"],
    "prohibit_while_open_work_exists",
  ),
  feature(
    "CFG-008",
    "order_acceptance",
    "strategy",
    "branch",
    true,
    "automatic",
    false,
    ["CFG-005"],
  ),
  feature(
    "CFG-009",
    "kitchen_assignment",
    "capability",
    "branch",
    false,
    "disabled",
    false,
    ["CFG-007"],
  ),
  feature(
    "CFG-010",
    "partial_serving",
    "capability",
    "branch",
    false,
    "disabled",
    false,
    ["CFG-007"],
  ),
  feature(
    "CFG-011",
    "payments",
    "core_module",
    "branch",
    true,
    "enabled",
    true,
    ["CFG-005"],
    "prohibit_while_unsettled_orders_exist",
  ),
  feature(
    "CFG-012",
    "online_payments",
    "integration",
    "platform",
    false,
    "unavailable",
    false,
    ["CFG-011"],
  ),
  feature(
    "CFG-013",
    "notifications",
    "core_module",
    "branch",
    true,
    "enabled",
    true,
    [],
    "in_app_delivery_may_disable_but_source_tasks_remain_queryable",
  ),
  feature(
    "CFG-014",
    "reporting",
    "core_module",
    "restaurant",
    true,
    "enabled",
    true,
    [],
    "hide_queries_preserve_projections",
  ),
  feature(
    "CFG-015",
    "audit",
    "core_module",
    "platform",
    true,
    "enabled",
    false,
    [],
    "prohibited",
  ),
  feature(
    "CFG-016",
    "inventory",
    "optional_module",
    "branch",
    false,
    "unavailable",
    false,
  ),
  feature(
    "CFG-017",
    "cleaning",
    "optional_module",
    "branch",
    false,
    "unavailable",
    false,
  ),
  feature(
    "CFG-018",
    "reviews",
    "optional_module",
    "restaurant",
    false,
    "unavailable",
    false,
  ),
  feature(
    "CFG-019",
    "customer_assistance",
    "capability",
    "branch",
    false,
    "disabled",
    false,
  ),
] as const satisfies readonly FeatureDefinition[];

export const branchDefaultFeatureValues = Object.fromEntries(
  featureDefinitions
    .filter((item) => item.scope === "branch")
    .map((item) => [item.id, item.defaultState]),
) as Readonly<Record<string, FeatureState>>;

export const restaurantDefaultFeatureValues = Object.fromEntries(
  featureDefinitions
    .filter((item) => item.scope === "restaurant")
    .map((item) => [item.id, item.defaultState]),
) as Readonly<Record<string, FeatureState>>;

export const featureDefinitionById = new Map(
  featureDefinitions.map((item) => [item.id, item]),
);
