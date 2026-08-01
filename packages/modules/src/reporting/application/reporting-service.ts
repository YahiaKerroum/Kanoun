import type {
  DatabasePool,
  OutboxEvent,
  OutboxEventHandler,
  TransactionContext,
} from "@rms/building-blocks";
import {
  hasPermission,
  type StaffRequestContext,
} from "../../identity-access/index.js";
import type { RestaurantConfigurationStore } from "../../restaurant-configuration/index.js";
import { ApplicationError } from "../../shared/application-error.js";
import type {
  BranchDashboardData,
  ReportingBranch,
  ReportingStore,
  SalesReportRow,
} from "../contracts/reporting-store.js";

const supportedPrefixes = [
  "restaurant.",
  "ordering.",
  "kitchen.",
  "payments.",
  "tables.",
];

export interface ReportingServiceDependencies {
  readonly databasePool: DatabasePool;
  readonly store: ReportingStore;
  readonly restaurantConfiguration: RestaurantConfigurationStore;
  readonly now?: () => Date;
}

export interface SalesReportInput {
  readonly restaurantIds?: readonly string[];
  readonly branchIds?: readonly string[];
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly paymentMethod?: "cash" | "card";
  readonly orderState?: "active" | "completed" | "cancelled";
  readonly page: number;
  readonly pageSize: number;
}

export class ReportingService implements OutboxEventHandler {
  public readonly name = "reporting.projections.v1";
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: ReportingServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public supports(eventType: string): boolean {
    return supportedPrefixes.some((prefix) => eventType.startsWith(prefix));
  }

  public handle(
    transaction: TransactionContext,
    event: OutboxEvent,
    now: Date,
  ): Promise<void> {
    return this.dependencies.store.applyEvent(transaction, {
      handlerName: this.name,
      eventId: event.eventId,
      eventType: event.eventType,
      businessAccountId: event.businessAccountId,
      ...(event.restaurantId ? { restaurantId: event.restaurantId } : {}),
      ...(event.branchId ? { branchId: event.branchId } : {}),
      aggregateId: event.aggregateId,
      payload: event.payload,
      occurredAtUtc: event.occurredAtUtc,
      now,
    });
  }

  public async getBranchDashboard(
    context: StaffRequestContext,
    branchId: string,
  ): Promise<
    BranchDashboardData & {
      readonly enabledWidgets: readonly string[];
    }
  > {
    await this.requireBranchPermission(context, branchId, "reports.view");
    await this.requireReportingEnabled(context.businessAccountId, branchId);
    const data = await this.dependencies.store.getBranchDashboard(
      this.dependencies.databasePool,
      {
        businessAccountId: context.businessAccountId,
        branchId,
        now: this.now(),
      },
    );
    if (!data) {
      throw new ApplicationError(
        "service_unavailable",
        503,
        "Dashboard projection is not ready",
        "Retry after the reporting worker catches up.",
      );
    }
    const featureIds = [
      ["orders", "CFG-005"],
      ["tables", "CFG-006"],
      ["kitchen", "CFG-007"],
      ["payments", "CFG-011"],
    ] as const;
    const enabledWidgets: string[] = [];
    for (const [widget, featureId] of featureIds) {
      if (
        await this.dependencies.restaurantConfiguration.isBranchFeatureEnabled(
          this.dependencies.databasePool,
          context.businessAccountId,
          branchId,
          featureId,
        )
      ) {
        enabledWidgets.push(widget);
      }
    }
    return {
      ...data,
      activeOrders: enabledWidgets.includes("orders") ? data.activeOrders : 0,
      orderStates: enabledWidgets.includes("orders") ? data.orderStates : [],
      occupiedTables: enabledWidgets.includes("tables")
        ? data.occupiedTables
        : 0,
      pendingRequests: {
        bills: enabledWidgets.includes("payments")
          ? data.pendingRequests.bills
          : 0,
        cancellations: enabledWidgets.includes("orders")
          ? data.pendingRequests.cancellations
          : 0,
      },
      kitchenWaiting: enabledWidgets.includes("kitchen")
        ? data.kitchenWaiting
        : [],
      dailySales: enabledWidgets.includes("payments") ? data.dailySales : [],
      enabledWidgets,
    };
  }

  public async getSalesReport(
    context: StaffRequestContext,
    input: SalesReportInput,
  ): Promise<{
    readonly rows: readonly SalesReportRow[];
    readonly totals: readonly {
      readonly currency: string;
      readonly grossAmount: string;
      readonly cancelledAmount: string;
      readonly paidAmount: string;
      readonly refundedAmount: string;
    }[];
    readonly page: number;
    readonly hasMore: boolean;
  }> {
    const explicitlySelected = Boolean(input.branchIds?.length);
    const candidateBranches = explicitlySelected
      ? (input.branchIds ?? [])
      : context.authorizedBranchIds;
    const selectedBranches: string[] = [];
    const selectedBranchRecords: ReportingBranch[] = [];
    for (const branchId of candidateBranches) {
      const branch = await this.dependencies.store.getBranch(
        this.dependencies.databasePool,
        context.businessAccountId,
        branchId,
      );
      const permitted =
        branch &&
        context.authorizedBranchIds.includes(branchId) &&
        hasPermission(context, "reports.view", branch.restaurantId, branchId);
      if (!permitted) {
        if (explicitlySelected) {
          throw new ApplicationError(
            "permission_denied",
            403,
            "Permission denied",
          );
        }
        continue;
      }
      if (
        input.restaurantIds?.length &&
        !input.restaurantIds.includes(branch.restaurantId)
      ) {
        if (explicitlySelected) {
          throw new ApplicationError(
            "permission_denied",
            403,
            "Permission denied",
          );
        }
        continue;
      }
      if (
        !(await this.reportingEnabled(
          context.businessAccountId,
          branch.restaurantId,
        ))
      ) {
        if (explicitlySelected) {
          throw new ApplicationError(
            "feature_disabled",
            409,
            "Reporting is disabled",
          );
        }
        continue;
      }
      selectedBranches.push(branchId);
      selectedBranchRecords.push(branch);
    }
    if (selectedBranches.length === 0) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const restaurantIds = new Set(
      selectedBranchRecords.map((branch) => branch.restaurantId),
    );
    if (
      selectedBranches.length > 1 &&
      [...restaurantIds].some(
        (restaurantId) =>
          !hasPermission(context, "reports.view_cross_branch", restaurantId),
      )
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const query = {
      businessAccountId: context.businessAccountId,
      authorizedBranchIds: selectedBranches,
      ...(input.restaurantIds ? { restaurantIds: input.restaurantIds } : {}),
      branchIds: selectedBranches,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.orderState ? { orderState: input.orderState } : {}),
    };
    const [rows, totals] = await Promise.all([
      this.dependencies.store.listSales(this.dependencies.databasePool, {
        ...query,
        limit: input.pageSize + 1,
        offset: input.page * input.pageSize,
      }),
      this.dependencies.store.summarizeSales(
        this.dependencies.databasePool,
        query,
      ),
    ]);
    const visible = rows.slice(0, input.pageSize);
    return {
      rows: visible,
      totals,
      page: input.page,
      hasMore: rows.length > input.pageSize,
    };
  }

  private async requireBranchPermission(
    context: StaffRequestContext,
    branchId: string,
    permission: "reports.view",
  ) {
    if (!context.authorizedBranchIds.includes(branchId)) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    const branch = await this.dependencies.restaurantConfiguration.getBranch(
      this.dependencies.databasePool,
      context.businessAccountId,
      branchId,
    );
    if (
      !branch ||
      !hasPermission(context, permission, branch.restaurantId, branchId)
    ) {
      throw new ApplicationError("permission_denied", 403, "Permission denied");
    }
    return branch;
  }

  private async requireReportingEnabled(
    businessAccountId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.dependencies.store.getBranch(
      this.dependencies.databasePool,
      businessAccountId,
      branchId,
    );
    if (
      !branch ||
      !(await this.reportingEnabled(businessAccountId, branch.restaurantId))
    ) {
      throw new ApplicationError(
        "feature_disabled",
        409,
        "Reporting is disabled",
      );
    }
  }

  private async reportingEnabled(
    businessAccountId: string,
    restaurantId: string,
  ): Promise<boolean> {
    const configuration =
      await this.dependencies.restaurantConfiguration.getRestaurantFeatureConfiguration(
        this.dependencies.databasePool,
        businessAccountId,
        restaurantId,
      );
    const value = configuration?.values["CFG-014"];
    return value !== "disabled" && value !== "unavailable";
  }
}
