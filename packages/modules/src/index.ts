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

export * from "./audit/index.js";
export * from "./identity-access/index.js";
export * from "./restaurant-configuration/index.js";
export * from "./ordering/index.js";
export * from "./menu/index.js";
export * from "./tables/index.js";
export * from "./kitchen/index.js";
export * from "./payments/index.js";
export {
  ApplicationError,
  type ApplicationErrorCode,
} from "./shared/application-error.js";
