import { z } from "zod";

const menuVersionSchema = z
  .union([z.int().min(1), z.string().regex(/^[1-9]\d*$/)])
  .transform(Number);

const orderItemSchema = z.object({
  dishId: z.uuid(),
  quantity: z.int().min(1).max(99),
  optionIds: z
    .array(z.uuid())
    .max(100)
    .refine((values) => new Set(values).size === values.length, {
      message: "An option cannot be selected more than once.",
    }),
  note: z.string().trim().min(1).max(500).nullable().optional(),
});

export const submitOrderSchema = z.object({
  menuVersion: menuVersionSchema,
  customerName: z.string().trim().min(1).max(100).nullable().optional(),
  items: z.array(orderItemSchema).min(1).max(100),
});

export const createStaffOrderSchema = submitOrderSchema.extend({
  tableId: z.uuid(),
});

export const orderParametersSchema = z.object({
  orderId: z.uuid(),
});

export const servingActionSchema = z.object({
  effectiveEmployeeId: z.uuid().optional(),
});

export const expectedVersionSchema = z
  .string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)));

export const cancellationRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const idempotencyKeySchema = z.string().trim().min(16).max(128);

const optionalDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

export const listStaffOrdersSchema = z
  .object({
    branchId: z.uuid(),
    approval: z.enum(["submitted", "accepted", "rejected"]).optional(),
    fulfilment: z
      .enum(["not_started", "preparing", "ready", "served"])
      .optional(),
    closure: z.enum(["active", "completed", "cancelled"]).default("active"),
    tableId: z.uuid().optional(),
    createdByEmployeeId: z.uuid().optional(),
    submittedFrom: optionalDateTime,
    submittedTo: optionalDateTime,
    cursor: z.string().min(1).max(512).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (value) =>
      !value.submittedFrom ||
      !value.submittedTo ||
      value.submittedFrom <= value.submittedTo,
    {
      message: "submittedFrom must be before submittedTo.",
      path: ["submittedFrom"],
    },
  );
