export const moduleNames = [
  "identity-access",
  "restaurant-configuration",
  "menu",
  "tables",
  "ordering",
  "kitchen",
  "payments",
  "notifications",
  "reporting",
  "audit",
] as const;

export type ModuleName = (typeof moduleNames)[number];
