import { randomUUID } from "node:crypto";
import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type {
  BranchRecord,
  OpeningPeriod,
  RestaurantRecord,
} from "../domain/models.js";
import {
  branchDefaultFeatureValues,
  restaurantDefaultFeatureValues,
  type FeatureState,
} from "../domain/feature-catalog.js";
import type {
  CreateBranchInput,
  CreateBusinessAccountInput,
  CreateEmployeeInput,
  CreateRestaurantInput,
  EmployeeReference,
  FeatureConfiguration,
  RestaurantConfigurationStore,
  SupportTenantSnapshot,
  UpdateBranchInput,
  UpdateEmployeeInput,
  UpdateRestaurantInput,
} from "../contracts/restaurant-configuration-store.js";

interface RestaurantRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly name: string;
  readonly status: RestaurantRecord["status"];
  readonly branding: Record<string, unknown>;
  readonly settings: Record<string, unknown>;
  readonly version: number;
}

function requireReturnedRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Database insert did not return the created record.");
  }
  return row;
}

interface BranchRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly name: string;
  readonly address: BranchRecord["address"];
  readonly contact: BranchRecord["contact"];
  readonly time_zone: string;
  readonly currency: string;
  readonly status: BranchRecord["status"];
  readonly service_status: BranchRecord["serviceStatus"];
  readonly allow_order_override: boolean;
  readonly version: number;
}

interface OpeningPeriodRow {
  readonly day_of_week: number;
  readonly opens_at_local: string;
  readonly closes_at_local: string;
}

interface EmployeeRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly display_name: string;
  readonly email: string;
  readonly status: EmployeeReference["status"];
  readonly version: number;
}

function mapRestaurant(row: RestaurantRow): RestaurantRecord {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    name: row.name,
    status: row.status,
    branding: row.branding,
    settings: row.settings,
    version: row.version,
  };
}

function mapEmployee(
  row: EmployeeRow,
  branchIds: readonly string[],
): EmployeeReference {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    version: row.version,
    branchIds,
  };
}

async function readEmployeeBranchIds(
  sql: SqlExecutor,
  businessAccountId: string,
  employeeId: string,
): Promise<readonly string[]> {
  const result = await sql.query<{ branch_id: string }>(
    `
      select branch_id
      from restaurant.employee_branch_access
      where business_account_id = $1 and employee_id = $2
      order by branch_id
    `,
    [businessAccountId, employeeId],
  );
  return result.rows.map((row) => row.branch_id);
}

async function mapEmployeeWithBranches(
  sql: SqlExecutor,
  row: EmployeeRow,
): Promise<EmployeeReference> {
  return mapEmployee(
    row,
    await readEmployeeBranchIds(sql, row.business_account_id, row.id),
  );
}

async function readOpeningHours(
  sql: SqlExecutor,
  businessAccountId: string,
  branchId: string,
): Promise<readonly OpeningPeriod[]> {
  const result = await sql.query<OpeningPeriodRow>(
    `
      select day_of_week, opens_at_local::text, closes_at_local::text
      from restaurant.branch_hours
      where business_account_id = $1 and branch_id = $2
      order by day_of_week, opens_at_local
    `,
    [businessAccountId, branchId],
  );

  return result.rows.map((row) => ({
    dayOfWeek: row.day_of_week,
    opensAt: row.opens_at_local.slice(0, 5),
    closesAt: row.closes_at_local.slice(0, 5),
  }));
}

async function mapBranch(
  sql: SqlExecutor,
  row: BranchRow,
): Promise<BranchRecord> {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    name: row.name,
    address: row.address,
    contact: row.contact,
    timeZone: row.time_zone,
    currency: row.currency,
    status: row.status,
    serviceStatus: row.service_status,
    allowOrderOverride: row.allow_order_override,
    version: row.version,
    openingHours: await readOpeningHours(sql, row.business_account_id, row.id),
  };
}

async function replaceOpeningHours(
  transaction: TransactionContext,
  businessAccountId: string,
  branchId: string,
  openingHours: readonly OpeningPeriod[],
  now: Date,
): Promise<void> {
  await transaction.sql.query(
    `
      delete from restaurant.branch_hours
      where business_account_id = $1 and branch_id = $2
    `,
    [businessAccountId, branchId],
  );

  for (const period of openingHours) {
    await transaction.sql.query(
      `
        insert into restaurant.branch_hours (
          id,
          business_account_id,
          branch_id,
          day_of_week,
          opens_at_local,
          closes_at_local,
          created_at_utc
        )
        values ($1, $2, $3, $4, $5::time, $6::time, $7)
      `,
      [
        randomUUID(),
        businessAccountId,
        branchId,
        period.dayOfWeek,
        period.opensAt,
        period.closesAt,
        now,
      ],
    );
  }
}

export class PostgresRestaurantConfigurationStore implements RestaurantConfigurationStore {
  public async createBusinessAccount(
    transaction: TransactionContext,
    input: CreateBusinessAccountInput,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into restaurant.business_accounts (
          id, code, name, status, version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, 'active', 1, $4, $4)
      `,
      [input.id, input.code, input.name, input.now],
    );
  }

  public async createRestaurant(
    transaction: TransactionContext,
    input: CreateRestaurantInput,
  ): Promise<RestaurantRecord> {
    const result = await transaction.sql.query<RestaurantRow>(
      `
        insert into restaurant.restaurants (
          id,
          business_account_id,
          name,
          status,
          branding,
          settings,
          version,
          created_at_utc,
          updated_at_utc
        )
        values ($1, $2, $3, 'active', $4::jsonb, $5::jsonb, 1, $6, $6)
        returning id, business_account_id, name, status, branding, settings, version
      `,
      [
        input.id,
        input.businessAccountId,
        input.name,
        JSON.stringify(input.branding ?? {}),
        JSON.stringify(input.settings ?? {}),
        input.now,
      ],
    );
    const restaurant = mapRestaurant(requireReturnedRow(result.rows));
    await transaction.sql.query(
      `
        insert into restaurant.feature_configuration_versions (
          id,
          business_account_id,
          restaurant_id,
          version,
          configuration,
          created_at_utc
        )
        values ($1, $2, $3, 1, $4::jsonb, $5)
      `,
      [
        randomUUID(),
        input.businessAccountId,
        input.id,
        JSON.stringify(restaurantDefaultFeatureValues),
        input.now,
      ],
    );
    return restaurant;
  }

  public async createBranch(
    transaction: TransactionContext,
    input: CreateBranchInput,
  ): Promise<BranchRecord> {
    const result = await transaction.sql.query<BranchRow>(
      `
        insert into restaurant.branches (
          id,
          business_account_id,
          restaurant_id,
          name,
          address,
          contact,
          time_zone,
          currency,
          status,
          service_status,
          allow_order_override,
          version,
          created_at_utc,
          updated_at_utc
        )
        values (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8,
          'active', $9, $10, 1, $11, $11
        )
        returning
          id,
          business_account_id,
          restaurant_id,
          name,
          address,
          contact,
          time_zone,
          currency,
          status,
          service_status,
          allow_order_override,
          version
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.name,
        JSON.stringify(input.address),
        JSON.stringify(input.contact),
        input.timeZone,
        input.currency,
        input.serviceStatus,
        input.allowOrderOverride,
        input.now,
      ],
    );
    await replaceOpeningHours(
      transaction,
      input.businessAccountId,
      input.id,
      input.openingHours,
      input.now,
    );
    await transaction.sql.query(
      `
        insert into restaurant.feature_configuration_versions (
          id,
          business_account_id,
          restaurant_id,
          branch_id,
          version,
          configuration,
          created_at_utc
        )
        values ($1, $2, $3, $4, 1, $5::jsonb, $6)
      `,
      [
        randomUUID(),
        input.businessAccountId,
        input.restaurantId,
        input.id,
        JSON.stringify(branchDefaultFeatureValues),
        input.now,
      ],
    );

    return mapBranch(transaction.sql, requireReturnedRow(result.rows));
  }

  public async createEmployee(
    transaction: TransactionContext,
    input: CreateEmployeeInput,
  ): Promise<EmployeeReference> {
    const result = await transaction.sql.query<EmployeeRow>(
      `
        insert into restaurant.employees (
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version,
          created_at_utc,
          updated_at_utc
        )
        values ($1, $2, $3, $4, $5, 'active', 1, $6, $6)
        returning
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.displayName,
        input.email,
        input.now,
      ],
    );

    for (const branchId of input.branchIds) {
      await transaction.sql.query(
        `
          insert into restaurant.employee_branch_access (
            business_account_id, employee_id, branch_id, created_at_utc
          )
          values ($1, $2, $3, $4)
        `,
        [input.businessAccountId, input.id, branchId, input.now],
      );
    }

    return mapEmployee(requireReturnedRow(result.rows), input.branchIds);
  }

  public async grantEmployeeBranchAccess(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    branchId: string,
    now: Date,
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into restaurant.employee_branch_access (
          business_account_id, employee_id, branch_id, created_at_utc
        )
        values ($1, $2, $3, $4)
        on conflict (business_account_id, employee_id, branch_id) do nothing
      `,
      [businessAccountId, employeeId, branchId, now],
    );
  }

  public async getRestaurant(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<RestaurantRecord | undefined> {
    const result = await sql.query<RestaurantRow>(
      `
        select id, business_account_id, name, status, branding, settings, version
        from restaurant.restaurants
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, restaurantId],
    );
    const row = result.rows[0];
    return row ? mapRestaurant(row) : undefined;
  }

  public async listRestaurants(
    sql: SqlExecutor,
    businessAccountId: string,
  ): Promise<readonly RestaurantRecord[]> {
    const result = await sql.query<RestaurantRow>(
      `
        select id, business_account_id, name, status, branding, settings, version
        from restaurant.restaurants
        where business_account_id = $1
        order by name, id
      `,
      [businessAccountId],
    );
    return result.rows.map(mapRestaurant);
  }

  public async updateRestaurant(
    transaction: TransactionContext,
    input: UpdateRestaurantInput,
  ): Promise<RestaurantRecord | undefined> {
    const result = await transaction.sql.query<RestaurantRow>(
      `
        update restaurant.restaurants
        set
          name = coalesce($4, name),
          status = coalesce($5, status),
          branding = coalesce($6::jsonb, branding),
          settings = coalesce($7::jsonb, settings),
          version = version + 1,
          updated_at_utc = $8
        where business_account_id = $1
          and id = $2
          and version = $3
        returning id, business_account_id, name, status, branding, settings, version
      `,
      [
        input.businessAccountId,
        input.restaurantId,
        input.expectedVersion,
        input.name ?? null,
        input.status ?? null,
        input.branding ? JSON.stringify(input.branding) : null,
        input.settings ? JSON.stringify(input.settings) : null,
        input.now,
      ],
    );
    const row = result.rows[0];
    return row ? mapRestaurant(row) : undefined;
  }

  public async getBranch(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<BranchRecord | undefined> {
    const result = await sql.query<BranchRow>(
      `
        select
          id,
          business_account_id,
          restaurant_id,
          name,
          address,
          contact,
          time_zone,
          currency,
          status,
          service_status,
          allow_order_override,
          version
        from restaurant.branches
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, branchId],
    );
    const row = result.rows[0];
    return row ? mapBranch(sql, row) : undefined;
  }

  public async listAssignedBranches(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<readonly BranchRecord[]> {
    const result = await sql.query<BranchRow>(
      `
        select
          b.id,
          b.business_account_id,
          b.restaurant_id,
          b.name,
          b.address,
          b.contact,
          b.time_zone,
          b.currency,
          b.status,
          b.service_status,
          b.allow_order_override,
          b.version
        from restaurant.branches b
        inner join restaurant.employee_branch_access eba
          on eba.business_account_id = b.business_account_id
          and eba.branch_id = b.id
        where b.business_account_id = $1 and eba.employee_id = $2
        order by b.name, b.id
      `,
      [businessAccountId, employeeId],
    );
    return Promise.all(result.rows.map((row) => mapBranch(sql, row)));
  }

  public async updateBranch(
    transaction: TransactionContext,
    input: UpdateBranchInput,
  ): Promise<BranchRecord | undefined> {
    const result = await transaction.sql.query<BranchRow>(
      `
        update restaurant.branches
        set
          name = coalesce($4, name),
          address = coalesce($5::jsonb, address),
          contact = coalesce($6::jsonb, contact),
          time_zone = coalesce($7, time_zone),
          currency = coalesce($8, currency),
          status = coalesce($9, status),
          service_status = coalesce($10, service_status),
          allow_order_override = coalesce($11, allow_order_override),
          version = version + 1,
          updated_at_utc = $12
        where business_account_id = $1
          and id = $2
          and version = $3
        returning
          id,
          business_account_id,
          restaurant_id,
          name,
          address,
          contact,
          time_zone,
          currency,
          status,
          service_status,
          allow_order_override,
          version
      `,
      [
        input.businessAccountId,
        input.branchId,
        input.expectedVersion,
        input.name ?? null,
        input.address ? JSON.stringify(input.address) : null,
        input.contact ? JSON.stringify(input.contact) : null,
        input.timeZone ?? null,
        input.currency ?? null,
        input.status ?? null,
        input.serviceStatus ?? null,
        input.allowOrderOverride ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    if (input.openingHours) {
      await replaceOpeningHours(
        transaction,
        input.businessAccountId,
        input.branchId,
        input.openingHours,
        input.now,
      );
    }
    return mapBranch(transaction.sql, row);
  }

  public async getEmployee(
    sql: SqlExecutor,
    businessAccountId: string,
    employeeId: string,
  ): Promise<EmployeeReference | undefined> {
    const result = await sql.query<EmployeeRow>(
      `
        select
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
        from restaurant.employees
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, employeeId],
    );
    const row = result.rows[0];
    return row ? mapEmployeeWithBranches(sql, row) : undefined;
  }

  public async deactivateEmployee(
    transaction: TransactionContext,
    businessAccountId: string,
    employeeId: string,
    expectedVersion: number,
    now: Date,
  ): Promise<EmployeeReference | undefined> {
    const result = await transaction.sql.query<EmployeeRow>(
      `
        update restaurant.employees
        set status = 'inactive', version = version + 1, updated_at_utc = $4
        where business_account_id = $1
          and id = $2
          and version = $3
        returning
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
      `,
      [businessAccountId, employeeId, expectedVersion, now],
    );
    const row = result.rows[0];
    return row ? mapEmployeeWithBranches(transaction.sql, row) : undefined;
  }

  public async listEmployees(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly EmployeeReference[]> {
    const result = await sql.query<EmployeeRow>(
      `
        select
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
        from restaurant.employees
        where business_account_id = $1 and restaurant_id = $2
        order by display_name, id
      `,
      [businessAccountId, restaurantId],
    );
    return Promise.all(
      result.rows.map((row) => mapEmployeeWithBranches(sql, row)),
    );
  }

  public async updateEmployee(
    transaction: TransactionContext,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeReference | undefined> {
    const result = await transaction.sql.query<EmployeeRow>(
      `
        update restaurant.employees
        set
          display_name = coalesce($4, display_name),
          email = coalesce($5, email),
          status = coalesce($6, status),
          version = version + 1,
          updated_at_utc = $7
        where business_account_id = $1
          and id = $2
          and version = $3
        returning
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
      `,
      [
        input.businessAccountId,
        input.employeeId,
        input.expectedVersion,
        input.displayName ?? null,
        input.email ?? null,
        input.status ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    return row ? mapEmployeeWithBranches(transaction.sql, row) : undefined;
  }

  public async replaceEmployeeBranchAccess(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly employeeId: string;
      readonly expectedVersion: number;
      readonly branchIds: readonly string[];
      readonly now: Date;
    },
  ): Promise<EmployeeReference | undefined> {
    const result = await transaction.sql.query<EmployeeRow>(
      `
        update restaurant.employees
        set version = version + 1, updated_at_utc = $4
        where business_account_id = $1
          and id = $2
          and version = $3
        returning
          id,
          business_account_id,
          restaurant_id,
          display_name,
          email,
          status,
          version
      `,
      [
        input.businessAccountId,
        input.employeeId,
        input.expectedVersion,
        input.now,
      ],
    );
    const employee = result.rows[0];
    if (!employee) {
      return undefined;
    }
    await transaction.sql.query(
      `
        delete from restaurant.employee_branch_access
        where business_account_id = $1 and employee_id = $2
      `,
      [input.businessAccountId, input.employeeId],
    );
    for (const branchId of input.branchIds) {
      await transaction.sql.query(
        `
          insert into restaurant.employee_branch_access (
            business_account_id, employee_id, branch_id, created_at_utc
          )
          values ($1, $2, $3, $4)
        `,
        [input.businessAccountId, input.employeeId, branchId, input.now],
      );
    }
    return mapEmployee(employee, input.branchIds);
  }

  public async getFeatureConfiguration(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
  ): Promise<FeatureConfiguration | undefined> {
    const result = await sql.query<{
      id: string;
      business_account_id: string;
      restaurant_id: string;
      branch_id: string;
      version: number;
      configuration: Record<string, FeatureState>;
      created_at_utc: Date;
    }>(
      `
        select distinct on (branch_id)
          id,
          business_account_id,
          restaurant_id,
          branch_id,
          version,
          configuration,
          created_at_utc
        from restaurant.feature_configuration_versions
        where business_account_id = $1 and branch_id = $2
        order by branch_id, version desc
      `,
      [businessAccountId, branchId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          businessAccountId: row.business_account_id,
          restaurantId: row.restaurant_id,
          ...(row.branch_id ? { branchId: row.branch_id } : {}),
          version: row.version,
          values: row.configuration,
          createdAtUtc: row.created_at_utc,
        }
      : undefined;
  }

  public async appendFeatureConfiguration(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly branchId: string;
      readonly expectedVersion: number;
      readonly values: Readonly<Record<string, FeatureState>>;
      readonly createdByUserId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<FeatureConfiguration | undefined> {
    const current = await transaction.sql.query<{ version: number }>(
      `
        select version
        from restaurant.feature_configuration_versions
        where business_account_id = $1 and branch_id = $2
        order by version desc
        limit 1
        for update
      `,
      [input.businessAccountId, input.branchId],
    );
    if (current.rows[0]?.version !== input.expectedVersion) {
      return undefined;
    }
    const nextVersion = input.expectedVersion + 1;
    const id = randomUUID();
    await transaction.sql.query(
      `
        insert into restaurant.feature_configuration_versions (
          id,
          business_account_id,
          restaurant_id,
          branch_id,
          version,
          configuration,
          created_by_user_id,
          reason,
          created_at_utc
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        id,
        input.businessAccountId,
        input.restaurantId,
        input.branchId,
        nextVersion,
        JSON.stringify(input.values),
        input.createdByUserId,
        input.reason,
        input.now,
      ],
    );
    return {
      id,
      businessAccountId: input.businessAccountId,
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      version: nextVersion,
      values: input.values,
      createdAtUtc: input.now,
    };
  }

  public async getRestaurantFeatureConfiguration(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<FeatureConfiguration | undefined> {
    const result = await sql.query<{
      id: string;
      business_account_id: string;
      restaurant_id: string;
      version: number;
      configuration: Record<string, FeatureState>;
      created_at_utc: Date;
    }>(
      `
        select
          id,
          business_account_id,
          restaurant_id,
          version,
          configuration,
          created_at_utc
        from restaurant.feature_configuration_versions
        where business_account_id = $1
          and restaurant_id = $2
          and branch_id is null
        order by version desc
        limit 1
      `,
      [businessAccountId, restaurantId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          businessAccountId: row.business_account_id,
          restaurantId: row.restaurant_id,
          version: row.version,
          values: row.configuration,
          createdAtUtc: row.created_at_utc,
        }
      : undefined;
  }

  public async appendRestaurantFeatureConfiguration(
    transaction: TransactionContext,
    input: {
      readonly businessAccountId: string;
      readonly restaurantId: string;
      readonly expectedVersion: number;
      readonly values: Readonly<Record<string, FeatureState>>;
      readonly createdByUserId: string;
      readonly reason: string;
      readonly now: Date;
    },
  ): Promise<FeatureConfiguration | undefined> {
    const current = await transaction.sql.query<{ version: number }>(
      `
        select version
        from restaurant.feature_configuration_versions
        where business_account_id = $1
          and restaurant_id = $2
          and branch_id is null
        order by version desc
        limit 1
        for update
      `,
      [input.businessAccountId, input.restaurantId],
    );
    if (current.rows[0]?.version !== input.expectedVersion) {
      return undefined;
    }
    const nextVersion = input.expectedVersion + 1;
    const id = randomUUID();
    await transaction.sql.query(
      `
        insert into restaurant.feature_configuration_versions (
          id,
          business_account_id,
          restaurant_id,
          version,
          configuration,
          created_by_user_id,
          reason,
          created_at_utc
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      `,
      [
        id,
        input.businessAccountId,
        input.restaurantId,
        nextVersion,
        JSON.stringify(input.values),
        input.createdByUserId,
        input.reason,
        input.now,
      ],
    );
    return {
      id,
      businessAccountId: input.businessAccountId,
      restaurantId: input.restaurantId,
      version: nextVersion,
      values: input.values,
      createdAtUtc: input.now,
    };
  }

  public async getSupportTenantSnapshot(
    sql: SqlExecutor,
    businessAccountId: string,
  ): Promise<SupportTenantSnapshot | undefined> {
    const business = await sql.query<{ id: string; name: string }>(
      `
        select id, name
        from restaurant.business_accounts
        where id = $1
      `,
      [businessAccountId],
    );
    const account = business.rows[0];
    if (!account) {
      return undefined;
    }
    const [restaurants, branches] = await Promise.all([
      sql.query<{ id: string; name: string; status: string }>(
        `
          select id, name, status
          from restaurant.restaurants
          where business_account_id = $1
          order by name, id
        `,
        [businessAccountId],
      ),
      sql.query<{
        id: string;
        restaurant_id: string;
        name: string;
        status: string;
      }>(
        `
          select id, restaurant_id, name, status
          from restaurant.branches
          where business_account_id = $1
          order by name, id
        `,
        [businessAccountId],
      ),
    ]);
    return {
      businessAccountId,
      businessName: account.name,
      restaurants: restaurants.rows,
      branches: branches.rows.map((row) => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        name: row.name,
        status: row.status,
      })),
    };
  }
}
