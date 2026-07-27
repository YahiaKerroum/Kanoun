import { z } from "zod";

export const loginSchema = z.object({
  businessCode: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]+$/),
  email: z.email().max(320),
  password: z.string().min(1).max(1_000),
});

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((password) => /[a-z]/.test(password), {
    message: "Password must include a lowercase letter.",
  })
  .refine((password) => /[A-Z]/.test(password), {
    message: "Password must include an uppercase letter.",
  })
  .refine((password) => /\d/.test(password), {
    message: "Password must include a number.",
  });

export const invitationAcceptanceSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

export const recoveryRequestSchema = z.object({
  businessCode: loginSchema.shape.businessCode,
  email: z.email().max(320),
});

export const recoveryCompletionSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

export const branchSwitchSchema = z.object({
  branchId: z.uuid(),
});

export const employeeIdParametersSchema = z.object({
  employeeId: z.uuid(),
});

export const administratorChangeSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

export const administratorTransferSchema = z.object({
  replacementEmployeeId: z.uuid(),
  removeCurrentAdministrator: z.boolean(),
  reason: z.string().trim().min(8).max(500),
});

export const employeeDeactivationSchema = z.object({
  expectedVersion: z.int().positive(),
  reason: z.string().trim().min(8).max(500),
});
