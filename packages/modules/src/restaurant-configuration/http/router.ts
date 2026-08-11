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
  EmployeeReference,
  FeatureConfiguration,
} from "../contracts/restaurant-configuration-store.js";
import type {
  FeatureDefinition,
  FeatureState,
} from "../domain/feature-catalog.js";
import type { BranchRecord, RestaurantRecord } from "../domain/models.js";
import {
  branchParametersSchema,
  createBranchSchema,
  createEmployeeSchema,
  createRestaurantSchema,
  employeeListQuerySchema,
  employeeParametersSchema,
  expectedVersionSchema,
  replaceEmployeeBranchesSchema,
  restaurantParametersSchema,
  updateBranchSchema,
  updateEmployeeSchema,
  updateFeatureConfigurationSchema,
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
  listEmployees(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<readonly EmployeeReference[]>;
  getEmployee(
    context: StaffRequestContext,
    employeeId: string,
  ): Promise<EmployeeReference>;
  createEmployee(
    context: StaffRequestContext,
    input: z.infer<typeof createEmployeeSchema>,
    metadata: RequestMetadata,
  ): Promise<EmployeeReference>;
  updateEmployeeProfile(
    context: StaffRequestContext,
    input: z.infer<typeof updateEmployeeSchema> & {
      readonly employeeId: string;
      readonly expectedVersion: number;
    },
    metadata: RequestMetadata,
  ): Promise<EmployeeReference>;
  replaceEmployeeBranches(
    context: StaffRequestContext,
    employeeId: string,
    expectedVersion: number,
    branchIds: readonly string[],
    reason: string,
    metadata: RequestMetadata,
  ): Promise<EmployeeReference>;
  getFeatureConfiguration(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{
    readonly configuration: FeatureConfiguration;
    readonly catalog: readonly FeatureDefinition[];
  }>;
  updateFeatureConfiguration(
    context: StaffRequestContext,
    input: {
      readonly branchId: string;
      readonly expectedVersion: number;
      readonly changes: Readonly<Record<string, FeatureState>>;
      readonly confirmAffectedWorkflows: boolean;
      readonly reason: string;
    },
    metadata: RequestMetadata,
  ): Promise<FeatureConfiguration>;
  getRestaurantFeatureConfiguration(
    context: StaffRequestContext,
    restaurantId: string,
  ): Promise<{
    readonly configuration: FeatureConfiguration;
    readonly catalog: readonly FeatureDefinition[];
  }>;
  updateRestaurantFeatureConfiguration(
    context: StaffRequestContext,
    input: {
      readonly restaurantId: string;
      readonly expectedVersion: number;
      readonly changes: Readonly<Record<string, FeatureState>>;
      readonly confirmAffectedWorkflows: boolean;
      readonly reason: string;
    },
    metadata: RequestMetadata,
  ): Promise<FeatureConfiguration>;
  getPortalCapabilities(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<{
    readonly branchId: string;
    readonly branchName: string;
    readonly restaurantId: string;
    readonly timeZone: string;
    readonly currency: string;
    readonly permissions: readonly string[];
    readonly enabledFeatures: readonly string[];
    readonly configurationVersion: number;
  }>;
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
  const criticalChangeLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.use("/staff", requireStaffSession());

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

  router.get("/staff/employees", async (request, response) => {
    const query = parse(employeeListQuerySchema, request.query);
    response.send({
      items: await dependencies.useCases.listEmployees(
        context(request),
        query.restaurantId,
      ),
    });
  });

  router.post(
    "/staff/employees",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const input = parse(createEmployeeSchema, request.body);
      response
        .status(201)
        .send(
          await dependencies.useCases.createEmployee(
            context(request),
            input,
            metadata(request),
          ),
        );
    },
  );

  router.get("/staff/employees/:employeeId", async (request, response) => {
    const parameters = parse(employeeParametersSchema, request.params);
    response.send(
      await dependencies.useCases.getEmployee(
        context(request),
        parameters.employeeId,
      ),
    );
  });

  router.patch(
    "/staff/employees/:employeeId",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(employeeParametersSchema, request.params);
      const input = parse(updateEmployeeSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateEmployeeProfile(
          context(request),
          {
            ...input,
            employeeId: parameters.employeeId,
            expectedVersion,
          },
          metadata(request),
        ),
      );
    },
  );

  router.put(
    "/staff/employees/:employeeId/branches",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(employeeParametersSchema, request.params);
      const input = parse(replaceEmployeeBranchesSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.replaceEmployeeBranches(
          context(request),
          parameters.employeeId,
          expectedVersion,
          input.branchIds,
          input.reason,
          metadata(request),
        ),
      );
    },
  );

  router.get(
    "/staff/branches/:branchId/features",
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      response.send(
        await dependencies.useCases.getFeatureConfiguration(
          context(request),
          parameters.branchId,
        ),
      );
    },
  );

  router.patch(
    "/staff/branches/:branchId/features",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      const input = parse(updateFeatureConfigurationSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateFeatureConfiguration(
          context(request),
          {
            branchId: parameters.branchId,
            expectedVersion,
            changes: input.changes,
            confirmAffectedWorkflows: input.confirmAffectedWorkflows,
            reason: input.reason,
          },
          metadata(request),
        ),
      );
    },
  );

  router.get(
    "/staff/restaurants/:restaurantId/features",
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      response.send(
        await dependencies.useCases.getRestaurantFeatureConfiguration(
          context(request),
          parameters.restaurantId,
        ),
      );
    },
  );

  router.patch(
    "/staff/restaurants/:restaurantId/features",
    criticalChangeLimiter,
    requireCsrf,
    async (request, response) => {
      const parameters = parse(restaurantParametersSchema, request.params);
      const input = parse(updateFeatureConfigurationSchema, request.body);
      const expectedVersion = parse(
        expectedVersionSchema,
        request.get("if-match"),
      );
      response.send(
        await dependencies.useCases.updateRestaurantFeatureConfiguration(
          context(request),
          {
            restaurantId: parameters.restaurantId,
            expectedVersion,
            changes: input.changes,
            confirmAffectedWorkflows: input.confirmAffectedWorkflows,
            reason: input.reason,
          },
          metadata(request),
        ),
      );
    },
  );

  router.get(
    "/staff/branches/:branchId/capabilities",
    async (request, response) => {
      const parameters = parse(branchParametersSchema, request.params);
      response.send(
        await dependencies.useCases.getPortalCapabilities(
          context(request),
          parameters.branchId,
        ),
      );
    },
  );

  return router;
}
