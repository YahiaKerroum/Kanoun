import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type {
  Address,
  BranchRecord,
  ContactInformation,
  OpeningPeriod,
  RestaurantRecord,
} from "../domain/models.js";

export interface CreateBusinessAccountInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly now: Date;
}

export interface CreateRestaurantInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly name: string;
  readonly branding?: Readonly<Record<string, unknown>>;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly now: Date;
}

export interface CreateBranchInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly address: Address;
  readonly contact: ContactInformation;
  readonly timeZone: string;
  readonly currency: string;
  readonly serviceStatus: BranchRecord["serviceStatus"];
  readonly allowOrderOverride: boolean;
  readonly openingHours: readonly OpeningPeriod[];
  readonly now: Date;
}

export interface CreateEmployeeInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly branchIds: readonly string[];
  readonly now: Date;
}

export interface EmployeeReference {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly status: "active" | "inactive";
  readonly version: number;
}

export interface UpdateRestaurantInput {
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly status?: RestaurantRecord["status"];
  readonly branding?: Readonly<Record<string, unknown>>;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly now: Date;
}

export interface UpdateBranchInput {
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly address?: Address;
  readonly contact?: ContactInformation;
  readonly timeZone?: string;
  readonly currency?: string;
  readonly status?: BranchRecord["status"];
  readonly serviceStatus?: BranchRecord["serviceStatus"];
  readonly allowOrderOverride?: boolean;
  readonly openingHours?: readonly OpeningPeriod[];
  readonly now: Date;
}

export interface RestaurantConfigurationStore {
  createBusinessAccount(
    transaction: TransactionContext,
    input: CreateBusinessAccountInput,
  ): Promise<void>;
  createRestaurant(
    transaction: TransactionContext,
    input: CreateRestaurantInput,
  ): Promise<RestaurantRecord>;
  createBranch(
    transaction: TransactionContext,
    input: CreateBranchInput,
  ): Promise<BranchRecord>;
  createEmployee(
    transaction: TransactionContext,
    input: CreateEmployeeInput,
  ): Promise<EmployeeReference>;
  grantEmployeeBranchAccess(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    branchId: string,
    now: Date,
  ): Promise<void>;
  getRestaurant(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<RestaurantRecord | undefined>;
  listRestaurants(
    sql: SqlExecutor,
    businessAccountId: string,
  ): Promise<readonly RestaurantRecord[]>;
  updateRestaurant(
    transaction: TransactionContext,
    input: UpdateRestaurantInput,
  ): Promise<RestaurantRecord | undefined>;
  getBranch(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<BranchRecord | undefined>;
  listAssignedBranches(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<readonly BranchRecord[]>;
  updateBranch(
    transaction: TransactionContext,
    input: UpdateBranchInput,
  ): Promise<BranchRecord | undefined>;
  getEmployee(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<EmployeeReference | undefined>;
  deactivateEmployee(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    expectedVersion: number,
    now: Date,
  ): Promise<EmployeeReference | undefined>;
}
