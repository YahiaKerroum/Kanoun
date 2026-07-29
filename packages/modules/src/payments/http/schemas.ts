import { z } from "zod";

export const moneySchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const branchQuerySchema = z.object({
  branchId: z.uuid(),
});

export const orderParametersSchema = z.object({
  orderId: z.uuid(),
});

export const paymentParametersSchema = z.object({
  paymentId: z.uuid(),
});

export const recordPaymentSchema = z.object({
  amount: moneySchema,
  method: z.enum(["cash", "card"]),
  externalReference: z.string().trim().min(1).max(100).optional(),
  effectiveEmployeeId: z.uuid().optional(),
});

export const recordRefundSchema = z.object({
  amount: moneySchema,
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
  effectiveEmployeeId: z.uuid().optional(),
});

export const idempotencyKeySchema = z.string().trim().min(16).max(128);
