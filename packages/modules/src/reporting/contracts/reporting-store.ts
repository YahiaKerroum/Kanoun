import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";

export interface ReportingBranch {
  readonly restaurantId: string;
  readonly branchId: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly timeZone: string;
  readonly currency: string;
  readonly status: "active" | "inactive";
}

export interface BranchDashboardData {
  readonly branch: ReportingBranch;
  readonly activeOrders: number;
  readonly orderStates: readonly {
    readonly fulfilment: string;
    readonly financial: string;
    readonly count: number;
  }[];
  readonly occupiedTables: number;
  readonly pendingRequests: {
    readonly bills: number;
    readonly cancellations: number;
  };
  readonly kitchenWaiting: readonly {
    readonly workItemId: string;
    readonly orderId: string;
    readonly orderReference: string;
    readonly itemName: string;
    readonly state: "queued" | "preparing";
    readonly waitingSinceUtc: Date;
  }[];
  readonly dailySales: readonly {
    readonly currency: string;
    readonly grossAmount: string;
    readonly paidAmount: string;
    readonly refundedAmount: string;
    readonly cancelledAmount: string;
  }[];
}

export interface SalesReportRow {
  readonly restaurantId: string;
  readonly branchId: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly orderId: string;
  readonly orderReference: string;
  readonly businessDate: string;
  readonly currency: string;
  readonly grossAmount: string;
  readonly cancelledAmount: string;
  readonly paidAmount: string;
  readonly refundedAmount: string;
  readonly paymentMethod?: "cash" | "card";
  readonly orderState: "active" | "completed" | "cancelled";
  readonly submittedAtUtc: Date;
}

export interface ReportingStore {
  applyEvent(
    transaction: TransactionContext,
    input: {
      readonly handlerName: string;
      readonly eventId: string;
      readonly eventType: string;
      readonly businessAccountId: string;
      readonly restaurantId?: string;
      readonly branchId?: string;
      readonly aggregateId: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly occurredAtUtc: Date;
      readonly now: Date;
    },
  ): Promise<void>;
  rebuildTenant(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly handlerName: string;
      readonly eventId: string;
      readonly occurredAtUtc: Date;
      readonly now: Date;
    },
  ): Promise<void>;
  getBranch(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<ReportingBranch | undefined>;
  getBranchDashboard(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly branchId: string;
      readonly now: Date;
    },
  ): Promise<BranchDashboardData | undefined>;
  listSales(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly authorizedBranchIds: readonly string[];
      readonly restaurantIds?: readonly string[];
      readonly branchIds?: readonly string[];
      readonly dateFrom: string;
      readonly dateTo: string;
      readonly paymentMethod?: "cash" | "card";
      readonly orderState?: "active" | "completed" | "cancelled";
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<readonly SalesReportRow[]>;
  summarizeSales(
    sql: SqlExecutor,
    input: {
      readonly businessAccountId: string;
      readonly authorizedBranchIds: readonly string[];
      readonly restaurantIds?: readonly string[];
      readonly branchIds?: readonly string[];
      readonly dateFrom: string;
      readonly dateTo: string;
      readonly paymentMethod?: "cash" | "card";
      readonly orderState?: "active" | "completed" | "cancelled";
    },
  ): Promise<
    readonly {
      readonly currency: string;
      readonly grossAmount: string;
      readonly cancelledAmount: string;
      readonly paidAmount: string;
      readonly refundedAmount: string;
    }[]
  >;
}
