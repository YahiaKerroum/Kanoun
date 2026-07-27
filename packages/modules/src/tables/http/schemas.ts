import { z } from "zod";

export const branchParametersSchema = z.object({
  branchId: z.uuid(),
});

export const tableParametersSchema = z.object({
  tableId: z.uuid(),
});

export const qrCodeParametersSchema = z.object({
  qrCodeId: z.uuid(),
});

export const qrTokenParametersSchema = z.object({
  qrToken: z.string().trim().min(16).max(256),
});

export const expectedVersionSchema = z
  .string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)));

export const createTableSchema = z.object({
  code: z.string().trim().min(1).max(32),
  area: z.string().trim().min(1).max(120).optional(),
});

export const updateTableSchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    area: z.string().trim().min(1).max(120).nullable().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    outOfService: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be changed.",
  });

export const revokeQrCodeSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});
