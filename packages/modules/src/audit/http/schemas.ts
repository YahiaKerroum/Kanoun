import { z } from "zod";

export const auditSearchSchema = z
  .object({
    restaurantId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    actorUserId: z.uuid().optional(),
    action: z.string().trim().min(1).max(160).optional(),
    targetType: z.string().trim().min(1).max(80).optional(),
    occurredFrom: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    occurredTo: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    page: z.coerce.number().int().min(0).default(0),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (input) =>
      !input.occurredFrom ||
      !input.occurredTo ||
      input.occurredFrom <= input.occurredTo,
    {
      message: "occurredFrom must not be after occurredTo",
      path: ["occurredTo"],
    },
  );
