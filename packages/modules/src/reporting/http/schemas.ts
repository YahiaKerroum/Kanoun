import { z } from "zod";

const date = z.iso.date();

export const dashboardParametersSchema = z.object({ branchId: z.uuid() });

export const salesReportQuerySchema = z
  .object({
    restaurantId: z.union([z.uuid(), z.array(z.uuid())]).optional(),
    branchId: z.union([z.uuid(), z.array(z.uuid())]).optional(),
    dateFrom: date,
    dateTo: date,
    paymentMethod: z.enum(["cash", "card"]).optional(),
    orderState: z.enum(["active", "completed", "cancelled"]).optional(),
    page: z.coerce.number().int().min(0).default(0),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((input) => input.dateFrom <= input.dateTo, {
    message: "dateFrom must not be after dateTo",
    path: ["dateTo"],
  })
  .transform((input) => ({
    ...input,
    ...(input.restaurantId
      ? {
          restaurantIds: Array.isArray(input.restaurantId)
            ? input.restaurantId
            : [input.restaurantId],
        }
      : {}),
    ...(input.branchId
      ? {
          branchIds: Array.isArray(input.branchId)
            ? input.branchId
            : [input.branchId],
        }
      : {}),
  }));
