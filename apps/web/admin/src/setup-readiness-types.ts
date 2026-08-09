import { z } from "zod";

export const restaurantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});

export const addressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
});

export const contactSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const openingPeriodSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string(),
  closesAt: z.string(),
});

export const branchSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  address: addressSchema.optional(),
  contact: contactSchema.optional(),
  timeZone: z.string(),
  currency: z.string(),
  status: z.enum(["active", "inactive"]),
  serviceStatus: z.enum(["open", "closed", "temporarily_unavailable"]),
  allowOrderOverride: z.boolean().optional(),
  version: z.number().int().positive(),
  openingHours: z.array(openingPeriodSchema),
});

export const employeeSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  branchIds: z.array(z.uuid()),
});

export const featureDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  dependsOn: z.array(z.string()),
});

export const featureResultSchema = z.object({
  configuration: z.object({
    version: z.number().int().positive(),
    values: z.record(
      z.string(),
      z.enum(["enabled", "disabled", "automatic", "unavailable"]),
    ),
  }),
  catalog: z.array(featureDefinitionSchema),
});

export const categorySchema = z.object({ id: z.uuid(), status: z.string() });
export const dishSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  available: z.boolean(),
});
export const tableSchema = z.object({ id: z.uuid(), status: z.string() });
export const qrSchema = z.object({
  id: z.uuid(),
  tableId: z.uuid().nullable().optional(),
  kind: z.enum(["table", "branch"]),
  status: z.enum(["active", "revoked"]),
});

export type Restaurant = z.infer<typeof restaurantSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type OpeningPeriod = z.infer<typeof openingPeriodSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type FeatureResult = z.infer<typeof featureResultSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Dish = z.infer<typeof dishSchema>;
export type TableRecord = z.infer<typeof tableSchema>;
export type QrCodeRecord = z.infer<typeof qrSchema>;

export interface SetupData {
  readonly restaurants: readonly Restaurant[];
  readonly branches: readonly Branch[];
  readonly employees: readonly Employee[];
  readonly employeeVisibleRestaurantIds: readonly string[];
  readonly categories: readonly Category[];
  readonly dishes: readonly Dish[];
  readonly tables: readonly TableRecord[];
  readonly qrCodes: readonly QrCodeRecord[];
  readonly features: FeatureResult | null;
  readonly restaurantFeatures: FeatureResult | null;
}

export type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly data: SetupData };

export type ReadinessStatus = "ready" | "attention" | "blocked";

export interface ReadinessItem {
  readonly id: string;
  readonly title: string;
  readonly status: ReadinessStatus;
  readonly detail: string;
  readonly href?: string;
}

export interface HoursPeriodDraft {
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface HoursDraft {
  readonly enabled: boolean;
  readonly periods: readonly HoursPeriodDraft[];
}

export interface BranchDraft {
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly email: string;
  readonly phone: string;
  readonly timeZone: string;
  readonly currency: string;
  readonly status: Branch["status"];
  readonly serviceStatus: Branch["serviceStatus"];
  readonly allowOrderOverride: boolean;
  readonly hours: readonly HoursDraft[];
}

export const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const readinessFeatureIds = [
  "CFG-001",
  "CFG-002",
  "CFG-003",
  "CFG-004",
  "CFG-005",
  "CFG-006",
  "CFG-007",
  "CFG-008",
] as const;
