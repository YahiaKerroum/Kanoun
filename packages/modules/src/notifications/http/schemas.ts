import { z } from "zod";

export const notificationListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  after: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const notificationParametersSchema = z.object({
  notificationId: z.uuid(),
});

export const notificationStateSchema = z.object({
  action: z.enum(["read", "acknowledge"]),
});

export const notificationGapQuerySchema = z.object({
  branchId: z.uuid(),
});
