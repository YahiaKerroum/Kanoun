import { z } from "zod";

const ianaTimeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "A valid IANA time zone is required.");

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm time.");

export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120).optional(),
  postalCode: z.string().trim().min(1).max(32).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
});

export const contactSchema = z
  .object({
    email: z.email().max(320).optional(),
    phone: z.string().trim().min(5).max(32).optional(),
  })
  .refine((contact) => Boolean(contact.email ?? contact.phone), {
    message: "At least one contact method is required.",
  });

export const openingPeriodSchema = z.object({
  dayOfWeek: z.int().min(0).max(6),
  opensAt: localTimeSchema,
  closesAt: localTimeSchema,
});

export const restaurantParametersSchema = z.object({
  restaurantId: z.uuid(),
});

export const branchParametersSchema = z.object({
  branchId: z.uuid(),
});

export const createRestaurantSchema = z.object({
  name: z.string().trim().min(1).max(160),
  branding: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const updateRestaurantSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    branding: z.record(z.string(), z.unknown()).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be changed.",
  });

export const createBranchSchema = z.object({
  restaurantId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  address: addressSchema,
  contact: contactSchema,
  timeZone: ianaTimeZoneSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  openingHours: z.array(openingPeriodSchema).min(1).max(28),
});

export const updateBranchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    address: addressSchema.optional(),
    contact: contactSchema.optional(),
    timeZone: ianaTimeZoneSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    status: z.enum(["active", "inactive"]).optional(),
    serviceStatus: z
      .enum(["open", "closed", "temporarily_unavailable"])
      .optional(),
    allowOrderOverride: z.boolean().optional(),
    openingHours: z.array(openingPeriodSchema).min(1).max(28).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be changed.",
  });

export const expectedVersionSchema = z
  .string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)));
