import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { secretsMatch } from "@rms/building-blocks";
import { ApplicationError } from "@rms/modules";
import type {
  TenantBootstrapInput,
  TenantBootstrapResult,
} from "@rms/service-workflow";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const bootstrapSchema = z.object({
  businessCode: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]+$/),
  businessName: z.string().trim().min(1).max(160),
  restaurantName: z.string().trim().min(1).max(160),
  branch: z.object({
    name: z.string().trim().min(1).max(160),
    address: z.object({
      line1: z.string().trim().min(1).max(200),
      line2: z.string().trim().min(1).max(200).optional(),
      city: z.string().trim().min(1).max(120),
      region: z.string().trim().min(1).max(120).optional(),
      postalCode: z.string().trim().min(1).max(32).optional(),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
    }),
    contact: z
      .object({
        email: z.email().max(320).optional(),
        phone: z.string().trim().min(5).max(32).optional(),
      })
      .refine((contact) => Boolean(contact.email ?? contact.phone)),
    timeZone: z
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
      }),
    currency: z.string().regex(/^[A-Z]{3}$/),
    openingHours: z
      .array(
        z.object({
          dayOfWeek: z.int().min(0).max(6),
          opensAt: localTimeSchema,
          closesAt: localTimeSchema,
        }),
      )
      .min(1)
      .max(28),
  }),
  owner: z.object({
    displayName: z.string().trim().min(1).max(160),
    email: z.email().max(320),
    password: z
      .string()
      .min(12)
      .max(128)
      .refine((password) => /[a-z]/.test(password))
      .refine((password) => /[A-Z]/.test(password))
      .refine((password) => /\d/.test(password)),
  }),
});

export interface TenantBootstrapRouterDependencies {
  readonly bootstrapSecret: string;
  readonly bootstrapTenant: (
    input: TenantBootstrapInput,
    metadata: {
      readonly correlationId: string;
      readonly causationId: string;
    },
  ) => Promise<TenantBootstrapResult>;
}

function metadata(request: Request) {
  const correlationId =
    typeof request.id === "string" ? request.id : randomUUID();
  return { correlationId, causationId: correlationId };
}

export function createTenantBootstrapRouter(
  dependencies: TenantBootstrapRouterDependencies,
): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post("/platform/tenants", limiter, async (request, response) => {
    const suppliedSecret = request.get("x-bootstrap-secret") ?? "";
    if (!secretsMatch(suppliedSecret, dependencies.bootstrapSecret)) {
      throw new ApplicationError(
        "resource_not_found",
        404,
        "Resource not found",
      );
    }
    const result = bootstrapSchema.safeParse(request.body);
    if (!result.success) {
      throw new ApplicationError(
        "validation_error",
        422,
        "Request validation failed",
        z.prettifyError(result.error),
      );
    }
    const created = await dependencies.bootstrapTenant(
      result.data,
      metadata(request),
    );
    response.status(201).send(created);
  });

  return router;
}
