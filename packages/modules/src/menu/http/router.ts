import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ApplicationError } from "../../shared/application-error.js";
import {
  createCsrfProtection,
  requireStaffSession,
  type StaffRequest,
  type StaffRequestContext,
  type SessionMiddlewareDependencies,
} from "../../identity-access/index.js";
import type {
  BranchDishOverride,
  Category,
  Dish,
  OptionGroup,
} from "../domain/models.js";
import {
  branchDishParametersSchema,
  categoryParametersSchema,
  createCategorySchema,
  createDishSchema,
  createOptionGroupSchema,
  dishParametersSchema,
  expectedVersionSchema,
  optionGroupParametersSchema,
  replaceOptionsSchema,
  restaurantParametersSchema,
  updateCategorySchema,
  updateDishSchema,
  updateOptionGroupSchema,
  upsertBranchOverrideSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface MenuHttpUseCases {
  listCategories(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<readonly Category[]>;
  createCategory(
    context: StaffRequestContext,
    input: z.infer<typeof createCategorySchema> & {
      readonly restaurantId: string;
    },
    metadata: RequestMetadata,
  ): Promise<Category>;
  updateCategory(
    context: StaffRequestContext,
    input: z.infer<typeof updateCategorySchema> & {
      readonly categoryId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<Category>;
  listDishes(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<readonly Dish[]>;
  createDish(
    context: StaffRequestContext,
    input: z.infer<typeof createDishSchema> & { readonly restaurantId: string },
    metadata: RequestMetadata,
  ): Promise<Dish>;
  updateDish(
    context: StaffRequestContext,
    input: z.infer<typeof updateDishSchema> & {
      readonly dishId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<Dish>;
  createOptionGroup(
    context: StaffRequestContext,
    input: z.infer<typeof createOptionGroupSchema>,
    metadata: RequestMetadata,
  ): Promise<OptionGroup>;
  updateOptionGroup(
    context: StaffRequestContext,
    input: z.infer<typeof updateOptionGroupSchema> & {
      readonly optionGroupId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<OptionGroup>;
  replaceOptions(
    context: StaffRequestContext,
    optionGroupId: string,
    input: z.infer<typeof replaceOptionsSchema>,
    metadata: RequestMetadata,
  ): Promise<OptionGroup>;
  upsertBranchOverride(
    context: StaffRequestContext,
    branchId: string,
    dishId: string,
    input: z.infer<typeof upsertBranchOverrideSchema>,
    metadata: RequestMetadata,
  ): Promise<BranchDishOverride>;
}

export interface MenuRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: MenuHttpUseCases;
}

function metadata(request: Request): RequestMetadata {
  const requestId = z.uuid().safeParse(request.get("x-request-id"));
  const correlationId = requestId.success ? requestId.data : randomUUID();
  return { correlationId, causationId: correlationId };
}

function parse<Input>(schema: z.ZodType<Input>, value: unknown): Input {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(
      "validation_error",
      422,
      "Request validation failed",
      z.prettifyError(result.error),
    );
  }
  return result.data;
}

function context(request: Request): StaffRequestContext {
  const staffContext = (request as StaffRequest).staffContext;
  if (!staffContext) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return staffContext;
}

export function createMenuRouter(dependencies: MenuRouterDependencies): Router {
  const router = Router();
  const requireCsrf = createCsrfProtection(dependencies);
  const criticalChangeLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.use(requireStaffSession());

  router.get(
    "/staff/restaurants/:restaurantId/menu/categories",
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      response.send({
        items: await dependencies.useCases.listCategories(
          context(request),
          parameters.restaurantId,
        ),
      });
    },
  );

  router.post(
    "/staff/restaurants/:restaurantId/menu/categories",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      const input = parse(createCategorySchema, request.body);
      response
        .status(201)
        .send(
          await dependencies.useCases.createCategory(
            context(request),
            { ...input, restaurantId: parameters.restaurantId },
            metadata(request),
          ),
        );
    },
  );

  router.patch(
    "/staff/menu/categories/:categoryId",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(categoryParametersSchema, request.params);
      const input = parse(updateCategorySchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateCategory(
          context(request),
          { ...input, categoryId: parameters.categoryId, expectedVersion },
          metadata(request),
        ),
      );
    },
  );

  router.get(
    "/staff/restaurants/:restaurantId/menu/dishes",
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      response.send({
        items: await dependencies.useCases.listDishes(
          context(request),
          parameters.restaurantId,
        ),
      });
    },
  );

  router.post(
    "/staff/restaurants/:restaurantId/menu/dishes",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      const input = parse(createDishSchema, request.body);
      response
        .status(201)
        .send(
          await dependencies.useCases.createDish(
            context(request),
            { ...input, restaurantId: parameters.restaurantId },
            metadata(request),
          ),
        );
    },
  );

  router.patch(
    "/staff/menu/dishes/:dishId",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(dishParametersSchema, request.params);
      const input = parse(updateDishSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateDish(
          context(request),
          { ...input, dishId: parameters.dishId, expectedVersion },
          metadata(request),
        ),
      );
    },
  );

  router.post(
    "/staff/menu/option-groups",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const input = parse(createOptionGroupSchema, request.body);
      response
        .status(201)
        .send(
          await dependencies.useCases.createOptionGroup(
            context(request),
            input,
            metadata(request),
          ),
        );
    },
  );

  router.patch(
    "/staff/menu/option-groups/:optionGroupId",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(optionGroupParametersSchema, request.params);
      const input = parse(updateOptionGroupSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateOptionGroup(
          context(request),
          {
            ...input,
            optionGroupId: parameters.optionGroupId,
            expectedVersion,
          },
          metadata(request),
        ),
      );
    },
  );

  router.put(
    "/staff/menu/option-groups/:optionGroupId/options",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(optionGroupParametersSchema, request.params);
      const input = parse(replaceOptionsSchema, request.body);
      response.send(
        await dependencies.useCases.replaceOptions(
          context(request),
          parameters.optionGroupId,
          input,
          metadata(request),
        ),
      );
    },
  );

  router.put(
    "/staff/branches/:branchId/menu/dishes/:dishId/override",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(branchDishParametersSchema, request.params);
      const input = parse(upsertBranchOverrideSchema, request.body);
      response.send(
        await dependencies.useCases.upsertBranchOverride(
          context(request),
          parameters.branchId,
          parameters.dishId,
          input,
          metadata(request),
        ),
      );
    },
  );

  return router;
}
