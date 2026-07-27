import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { ApplicationError } from "../../shared/application-error.js";
import {
  createCsrfProtection,
  requireStaffSession,
  type StaffRequest,
  type StaffRequestContext,
  type SessionMiddlewareDependencies,
} from "../../identity-access/index.js";
import type { BranchRecord, RestaurantRecord } from "../domain/models.js";
import {
  branchParametersSchema,
  createBranchSchema,
  createRestaurantSchema,
  expectedVersionSchema,
  restaurantParametersSchema,
  updateBranchSchema,
  updateRestaurantSchema,
} from "./schemas.js";

interface RequestMetadata {
  readonly correlationId: string;
  readonly causationId: string;
}

export interface RestaurantConfigurationHttpUseCases {
  listRestaurants(
    context: StaffRequestContext,
  ): Promise<readonly RestaurantRecord[]>;
  getRestaurant(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<RestaurantRecord>;
  createRestaurant(
    context: StaffRequestContext,
    input: z.infer<typeof createRestaurantSchema>,
    metadata: RequestMetadata,
  ): Promise<RestaurantRecord>;
  updateRestaurant(
    context: StaffRequestContext,
    input: z.infer<typeof updateRestaurantSchema> & {
      readonly restaurantId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<RestaurantRecord>;
  listBranches(context: StaffRequestContext): Promise<readonly BranchRecord[]>;
  getBranch(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<BranchRecord>;
  createBranch(
    context: StaffRequestContext,
    input: z.infer<typeof createBranchSchema>,
    metadata: RequestMetadata,
  ): Promise<BranchRecord>;
  updateBranch(
    context: StaffRequestContext,
    input: z.infer<typeof updateBranchSchema> & {
      readonly branchId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<BranchRecord>;
}

export interface RestaurantConfigurationRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: RestaurantConfigurationHttpUseCases;
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

export function createRestaurantConfigurationRouter(
  dependencies: RestaurantConfigurationRouterDependencies,
): Router {
  const router = Router();
  const requireCsrf = createCsrfProtection(dependencies);

  router.use(requireStaffSession());

  router.get("/staff/restaurants", async (request, response) => {
    const items = await dependencies.useCases.listRestaurants(context(request));
    response.send({ items });
  });

  router.post("/staff/restaurants", requireCsrf, async (request, response) => {
    const input = parse(createRestaurantSchema, request.body);
    const restaurant = await dependencies.useCases.createRestaurant(
      context(request),
      input,
      metadata(request),
    );
    response.status(201).send(restaurant);
  });

  router.get("/staff/restaurants/:restaurantId", async (request, response) => {
    const parameters = parse(restaurantParametersSchema, request.params);
    response.send(
      await dependencies.useCases.getRestaurant(
        context(request),
        parameters.restaurantId,
      ),
    );
  });

  router.patch(
    "/staff/restaurants/:restaurantId",
    requireCsrf,
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      const input = parse(updateRestaurantSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateRestaurant(
          context(request),
          {
            ...input,
            restaurantId: parameters.restaurantId,
            expectedVersion,
          },
          metadata(request),
        ),
      );
    },
  );

  router.get("/staff/branches", async (request, response) => {
    const items = await dependencies.useCases.listBranches(context(request));
    response.send({ items });
  });

  router.post("/staff/branches", requireCsrf, async (request, response) => {
    const input = parse(createBranchSchema, request.body);
    const branch = await dependencies.useCases.createBranch(
      context(request),
      input,
      metadata(request),
    );
    response.status(201).send(branch);
  });

  router.get("/staff/branches/:branchId", async (request, response) => {
    const parameters = parse(branchParametersSchema, request.params);
    response.send(
      await dependencies.useCases.getBranch(
        context(request),
        parameters.branchId,
      ),
    );
  });

  router.patch(
    "/staff/branches/:branchId",
    requireCsrf,
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      const input = parse(updateBranchSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateBranch(
          context(request),
          {
            ...input,
            branchId: parameters.branchId,
            expectedVersion,
          },
          metadata(request),
        ),
      );
    },
  );

  return router;
}
