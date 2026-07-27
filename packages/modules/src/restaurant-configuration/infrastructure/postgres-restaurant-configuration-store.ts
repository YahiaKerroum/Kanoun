import { randomUUID } from "node:crypto";
import type { SqlExecutor, TransactionContext } from "@rms/building-blocks";
import type {
  BranchRecord,
  OpeningPeriod,
  RestaurantRecord,
} from "../domain/models.js";
import type {
  CreateBranchInput,
  CreateBusinessAccountInput,
  CreateEmployeeInput,
  CreateRestaurantInput,
  EmployeeReference,
  RestaurantConfigurationStore,
  UpdateBranchInput,
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

function mapEmployee(row: EmployeeRow): EmployeeReference {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    version: row.version,
  };
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

    return mapRestaurant(requireReturnedRow(result.rows));
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

    return mapEmployee(requireReturnedRow(result.rows));
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
    return row ? mapEmployee(row) : undefined;
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
    return row ? mapEmployee(row) : undefined;
  }
}
