import { z } from "zod";

export const kitchenQueueQuerySchema = z.object({
  branchId: z.uuid(),
});

export const kitchenWorkItemParametersSchema = z.object({
  workItemId: z.uuid(),
});

export const kitchenActionSchema = z.object({
  effectiveEmployeeId: z.uuid().optional(),
});

export const expectedVersionSchema = z
  .string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)));

export const idempotencyKeySchema = z.string().trim().min(16).max(128);
