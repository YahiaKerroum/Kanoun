import { z } from "zod";

const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const restaurantParametersSchema = z.object({
  restaurantId: z.uuid(),
});

export const categoryParametersSchema = z.object({
  categoryId: z.uuid(),
});

export const dishParametersSchema = z.object({
  dishId: z.uuid(),
});

export const optionGroupParametersSchema = z.object({
  optionGroupId: z.uuid(),
});

export const branchDishParametersSchema = z.object({
  branchId: z.uuid(),
  dishId: z.uuid(),
});

export const expectedVersionSchema = z
  .string()
  .regex(/^"[1-9]\d*"$/)
  .transform((value) => Number(value.slice(1, -1)));

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(160),
  displayOrder: z.int().min(0).max(10_000).default(0),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    displayOrder: z.int().min(0).max(10_000).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be changed.",
  });

export const createDishSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000).optional(),
  imageUrl: z.url().max(2048).optional(),
  basePrice: moneySchema,
  displayOrder: z.int().min(0).max(10_000).default(0),
});

export const updateDishSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(1000).nullable().optional(),
    imageUrl: z.url().max(2048).nullable().optional(),
    categoryId: z.uuid().optional(),
    displayOrder: z.int().min(0).max(10_000).optional(),
    basePrice: moneySchema.optional(),
    available: z.boolean().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be changed.",
  });

const optionInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  priceDelta: moneySchema,
  displayOrder: z.int().min(0).max(10_000).default(0),
});

export const createOptionGroupSchema = z
  .object({
    dishId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    selectionType: z.enum(["single", "multiple"]),
    isRequired: z.boolean().default(false),
    minimumSelections: z.int().min(0).max(50),
    maximumSelections: z.int().min(1).max(50),
    displayOrder: z.int().min(0).max(10_000).default(0),
    options: z.array(optionInputSchema).min(1).max(50),
  })
  .refine((value) => value.minimumSelections <= value.maximumSelections, {
    message: "The minimum selection count cannot exceed the maximum.",
    path: ["minimumSelections"],
  });

export const updateOptionGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    isRequired: z.boolean().optional(),
    minimumSelections: z.int().min(0).max(50).optional(),
    maximumSelections: z.int().min(1).max(50).optional(),
    displayOrder: z.int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be changed.",
  })
  .refine(
    (value) =>
      value.minimumSelections === undefined ||
      value.maximumSelections === undefined ||
      value.minimumSelections <= value.maximumSelections,
    {
      message: "The minimum selection count cannot exceed the maximum.",
      path: ["minimumSelections"],
    },
  );

export const replaceOptionsSchema = z.object({
  options: z
    .array(
      optionInputSchema.extend({
        status: z.enum(["active", "inactive"]).default("active"),
      }),
    )
    .min(1)
    .max(50),
});

export const upsertBranchOverrideSchema = z.object({
  expectedVersion: z.int().min(0),
  price: moneySchema.nullable().optional(),
  available: z.boolean().nullable().optional(),
  visible: z.boolean().optional(),
});
