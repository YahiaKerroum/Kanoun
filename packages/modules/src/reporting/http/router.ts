import { Router, type Request } from "express";
import { z } from "zod";
import {
  requireStaffSession,
  type SessionMiddlewareDependencies,
  type StaffRequest,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  BranchDashboardData,
  SalesReportRow,
} from "../contracts/reporting-store.js";
import type { SalesReportInput } from "../application/reporting-service.js";
import {
  dashboardParametersSchema,
  salesReportQuerySchema,
} from "./schemas.js";

export interface ReportingHttpUseCases {
  getBranchDashboard(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<
    BranchDashboardData & { readonly enabledWidgets: readonly string[] }
  >;
  getSalesReport(
    context: StaffRequestContext,
    input: SalesReportInput,
  ): Promise<{
    readonly rows: readonly SalesReportRow[];
    readonly totals: readonly object[];
    readonly page: number;
    readonly hasMore: boolean;
  }>;
}

export interface ReportingRouterDependencies extends SessionMiddlewareDependencies {
  readonly useCases: ReportingHttpUseCases;
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
  const value = (request as StaffRequest).staffContext;
  if (!value) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return value;
}

export function createReportingRouter(
  dependencies: ReportingRouterDependencies,
): Router {
  const router = Router();
  router.get(
    "/staff/branches/:branchId/dashboard",
    requireStaffSession(),
    async (request, response) => {
      const parameters = parse(dashboardParametersSchema, request.params);
      const dashboard = await dependencies.useCases.getBranchDashboard(
        context(request),
        parameters.branchId,
      );
      response.send({
        ...dashboard,
        kitchenWaiting: dashboard.kitchenWaiting.map((item) => ({
          ...item,
          waitingSince: item.waitingSinceUtc.toISOString(),
          waitingSinceUtc: undefined,
        })),
      });
    },
  );
  router.get(
    "/staff/reports/sales",
    requireStaffSession(),
    async (request, response) => {
      const input = parse(salesReportQuerySchema, request.query);
      const report = await dependencies.useCases.getSalesReport(
        context(request),
        {
          ...(input.restaurantIds
            ? { restaurantIds: input.restaurantIds }
            : {}),
          ...(input.branchIds ? { branchIds: input.branchIds } : {}),
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          ...(input.paymentMethod
            ? { paymentMethod: input.paymentMethod }
            : {}),
          ...(input.orderState ? { orderState: input.orderState } : {}),
          page: input.page,
          pageSize: input.pageSize,
        },
      );
      response.send({
        ...report,
        rows: report.rows.map((row) => ({
          ...row,
          paymentMethod: row.paymentMethod ?? null,
          submittedAt: row.submittedAtUtc.toISOString(),
          submittedAtUtc: undefined,
        })),
      });
    },
  );
  return router;
}
