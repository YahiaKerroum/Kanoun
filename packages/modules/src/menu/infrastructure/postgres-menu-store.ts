import { randomUUID } from "node:crypto";
import type {
  Money,
  SqlExecutor,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  BranchDishOverride,
  Category,
  CustomerMenu,
  CustomerMenuCategory,
  CustomerMenuDish,
  Dish,
  EntityStatus,
  MenuAggregate,
  Option,
  OptionGroup,
} from "../domain/models.js";
import type {
  CreateCategoryInput,
  CreateDishInput,
  CreateOptionGroupInput,
  MenuStore,
  ReplaceOptionsInput,
  UpdateCategoryInput,
  UpdateDishInput,
  UpdateOptionGroupInput,
  UpsertBranchOverrideInput,
} from "../contracts/menu-store.js";
import { resolveOrderItemSnapshotsFromMenu } from "../domain/order-snapshots.js";

function requireReturnedRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Database insert did not return the created record.");
  }
  return row;
}

interface MenuRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly version: number;
}

function mapMenu(row: MenuRow): MenuAggregate {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    version: row.version,
  };
}

interface CategoryRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly name: string;
  readonly display_order: number;
  readonly status: EntityStatus;
  readonly version: number;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    name: row.name,
    displayOrder: row.display_order,
    status: row.status,
    version: row.version,
  };
}

interface DishRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly restaurant_id: string;
  readonly category_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly image_url: string | null;
  readonly base_price_amount: string;
  readonly base_price_currency: string;
  readonly status: EntityStatus;
  readonly available: boolean;
  readonly display_order: number;
  readonly version: number;
}

function mapDish(row: DishRow): Dish {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    basePrice: {
      amount: row.base_price_amount,
      currency: row.base_price_currency,
    },
    status: row.status,
    available: row.available,
    displayOrder: row.display_order,
    version: row.version,
  };
}

interface OptionGroupRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly dish_id: string;
  readonly name: string;
  readonly selection_type: "single" | "multiple";
  readonly is_required: boolean;
  readonly minimum_selections: number;
  readonly maximum_selections: number;
  readonly display_order: number;
  readonly version: number;
}

interface OptionRow {
  readonly id: string;
  readonly business_account_id: string;
  readonly option_group_id: string;
  readonly name: string;
  readonly price_delta_amount: string;
  readonly price_delta_currency: string;
  readonly display_order: number;
  readonly status: EntityStatus;
  readonly version: number;
}

function mapOption(row: OptionRow): Option {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    optionGroupId: row.option_group_id,
    name: row.name,
    priceDelta: {
      amount: row.price_delta_amount,
      currency: row.price_delta_currency,
    },
    displayOrder: row.display_order,
    status: row.status,
    version: row.version,
  };
}

async function readOptions(
  sql: SqlExecutor,
  businessAccountId: string,
  optionGroupId: string,
): Promise<readonly Option[]> {
  const result = await sql.query<OptionRow>(
    `
      select id, business_account_id, option_group_id, name,
        price_delta_amount, price_delta_currency, display_order, status, version
      from menu.options
      where business_account_id = $1 and option_group_id = $2
      order by display_order, id
    `,
    [businessAccountId, optionGroupId],
  );
  return result.rows.map(mapOption);
}

async function mapOptionGroup(
  sql: SqlExecutor,
  row: OptionGroupRow,
): Promise<OptionGroup> {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    dishId: row.dish_id,
    name: row.name,
    selectionType: row.selection_type,
    isRequired: row.is_required,
    minimumSelections: row.minimum_selections,
    maximumSelections: row.maximum_selections,
    displayOrder: row.display_order,
    version: row.version,
    options: await readOptions(sql, row.business_account_id, row.id),
  };
}

interface BranchDishOverrideRow {
  readonly business_account_id: string;
  readonly branch_id: string;
  readonly dish_id: string;
  readonly price_amount: string | null;
  readonly price_currency: string | null;
  readonly available: boolean | null;
  readonly visible: boolean;
  readonly version: number;
}

function mapBranchOverride(row: BranchDishOverrideRow): BranchDishOverride {
  return {
    businessAccountId: row.business_account_id,
    branchId: row.branch_id,
    dishId: row.dish_id,
    price:
      row.price_amount !== null && row.price_currency !== null
        ? { amount: row.price_amount, currency: row.price_currency }
        : undefined,
    available: row.available ?? undefined,
    visible: row.visible,
    version: row.version,
  };
}

interface CustomerMenuRow {
  readonly category_id: string;
  readonly category_name: string;
  readonly category_order: number;
  readonly dish_id: string;
  readonly dish_name: string;
  readonly description: string | null;
  readonly image_url: string | null;
  readonly base_price_amount: string;
  readonly base_price_currency: string;
  readonly dish_available: boolean;
  readonly dish_order: number;
  readonly override_price_amount: string | null;
  readonly override_price_currency: string | null;
  readonly override_available: boolean | null;
  readonly override_visible: boolean | null;
}

export class PostgresMenuStore implements MenuStore {
  public async touchMenu(
    transaction: TransactionContext,
    businessAccountId: string,
    restaurantId: string,
    now: Date,
  ): Promise<MenuAggregate> {
    const result = await transaction.sql.query<MenuRow>(
      `
        insert into menu.menus (
          id, business_account_id, restaurant_id, version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, 1, $4, $4)
        on conflict (business_account_id, restaurant_id)
        do update set version = menu.menus.version + 1, updated_at_utc = $4
        returning id, business_account_id, restaurant_id, version
      `,
      [randomUUID(), businessAccountId, restaurantId, now],
    );
    return mapMenu(requireReturnedRow(result.rows));
  }

  public async getMenu(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<MenuAggregate | undefined> {
    const result = await sql.query<MenuRow>(
      `
        select id, business_account_id, restaurant_id, version
        from menu.menus
        where business_account_id = $1 and restaurant_id = $2
      `,
      [businessAccountId, restaurantId],
    );
    const row = result.rows[0];
    return row ? mapMenu(row) : undefined;
  }

  public async validateMenuVersion(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const menu = await this.getMenu(sql, businessAccountId, restaurantId);
    return menu?.version === expectedVersion;
  }

  public async createCategory(
    transaction: TransactionContext,
    input: CreateCategoryInput,
  ): Promise<Category> {
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      input.restaurantId,
      input.now,
    );
    const result = await transaction.sql.query<CategoryRow>(
      `
        insert into menu.categories (
          id, business_account_id, restaurant_id, name, display_order,
          status, version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, $4, $5, 'active', 1, $6, $6)
        returning id, business_account_id, restaurant_id, name, display_order, status, version
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.name,
        input.displayOrder,
        input.now,
      ],
    );
    return mapCategory(requireReturnedRow(result.rows));
  }

  public async updateCategory(
    transaction: TransactionContext,
    input: UpdateCategoryInput,
  ): Promise<Category | undefined> {
    const result = await transaction.sql.query<CategoryRow>(
      `
        update menu.categories
        set
          name = coalesce($4, name),
          display_order = coalesce($5, display_order),
          status = coalesce($6, status),
          version = version + 1,
          updated_at_utc = $7
        where business_account_id = $1 and id = $2 and version = $3
        returning id, business_account_id, restaurant_id, name, display_order, status, version
      `,
      [
        input.businessAccountId,
        input.categoryId,
        input.expectedVersion,
        input.name ?? null,
        input.displayOrder ?? null,
        input.status ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      row.restaurant_id,
      input.now,
    );
    return mapCategory(row);
  }

  public async listCategories(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly Category[]> {
    const result = await sql.query<CategoryRow>(
      `
        select id, business_account_id, restaurant_id, name, display_order, status, version
        from menu.categories
        where business_account_id = $1 and restaurant_id = $2
        order by display_order, id
      `,
      [businessAccountId, restaurantId],
    );
    return result.rows.map(mapCategory);
  }

  public async getCategory(
    sql: SqlExecutor,
    businessAccountId: string,
    categoryId: string,
  ): Promise<Category | undefined> {
    const result = await sql.query<CategoryRow>(
      `
        select id, business_account_id, restaurant_id, name, display_order, status, version
        from menu.categories
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, categoryId],
    );
    const row = result.rows[0];
    return row ? mapCategory(row) : undefined;
  }

  public async createDish(
    transaction: TransactionContext,
    input: CreateDishInput,
  ): Promise<Dish> {
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      input.restaurantId,
      input.now,
    );
    const result = await transaction.sql.query<DishRow>(
      `
        insert into menu.dishes (
          id, business_account_id, restaurant_id, category_id, name, description, image_url,
          base_price_amount, base_price_currency, status, available, display_order,
          version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', true, $10, 1, $11, $11)
        returning
          id, business_account_id, restaurant_id, category_id, name, description, image_url,
          base_price_amount, base_price_currency, status, available, display_order, version
      `,
      [
        input.id,
        input.businessAccountId,
        input.restaurantId,
        input.categoryId,
        input.name,
        input.description ?? null,
        input.imageUrl ?? null,
        input.basePrice.amount,
        input.basePrice.currency,
        input.displayOrder,
        input.now,
      ],
    );
    return mapDish(requireReturnedRow(result.rows));
  }

  public async updateDish(
    transaction: TransactionContext,
    input: UpdateDishInput,
  ): Promise<Dish | undefined> {
    const result = await transaction.sql.query<DishRow>(
      `
        update menu.dishes
        set
          name = coalesce($4, name),
          description = case when $5::boolean then $6 else description end,
          image_url = case when $7::boolean then $8 else image_url end,
          category_id = coalesce($9, category_id),
          display_order = coalesce($10, display_order),
          base_price_amount = coalesce($11, base_price_amount),
          base_price_currency = coalesce($12, base_price_currency),
          available = coalesce($13, available),
          status = coalesce($14, status),
          version = version + 1,
          updated_at_utc = $15
        where business_account_id = $1 and id = $2 and version = $3
        returning
          id, business_account_id, restaurant_id, category_id, name, description, image_url,
          base_price_amount, base_price_currency, status, available, display_order, version
      `,
      [
        input.businessAccountId,
        input.dishId,
        input.expectedVersion,
        input.name ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.imageUrl !== undefined,
        input.imageUrl ?? null,
        input.categoryId ?? null,
        input.displayOrder ?? null,
        input.basePrice?.amount ?? null,
        input.basePrice?.currency ?? null,
        input.available ?? null,
        input.status ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      row.restaurant_id,
      input.now,
    );
    return mapDish(row);
  }

  public async listDishes(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly Dish[]> {
    const result = await sql.query<DishRow>(
      `
        select
          id, business_account_id, restaurant_id, category_id, name, description, image_url,
          base_price_amount, base_price_currency, status, available, display_order, version
        from menu.dishes
        where business_account_id = $1 and restaurant_id = $2
        order by display_order, id
      `,
      [businessAccountId, restaurantId],
    );
    return result.rows.map(mapDish);
  }

  public async getDish(
    sql: SqlExecutor,
    businessAccountId: string,
    dishId: string,
  ): Promise<Dish | undefined> {
    const result = await sql.query<DishRow>(
      `
        select
          id, business_account_id, restaurant_id, category_id, name, description, image_url,
          base_price_amount, base_price_currency, status, available, display_order, version
        from menu.dishes
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, dishId],
    );
    const row = result.rows[0];
    return row ? mapDish(row) : undefined;
  }

  public async createOptionGroup(
    transaction: TransactionContext,
    input: CreateOptionGroupInput,
  ): Promise<OptionGroup> {
    const dish = await transaction.sql.query<{ restaurant_id: string }>(
      `select restaurant_id from menu.dishes where business_account_id = $1 and id = $2`,
      [input.businessAccountId, input.dishId],
    );
    const restaurantId = requireReturnedRow(dish.rows).restaurant_id;
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      restaurantId,
      input.now,
    );
    const result = await transaction.sql.query<OptionGroupRow>(
      `
        insert into menu.option_groups (
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version,
          created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $10)
        returning
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version
      `,
      [
        input.id,
        input.businessAccountId,
        input.dishId,
        input.name,
        input.selectionType,
        input.isRequired,
        input.minimumSelections,
        input.maximumSelections,
        input.displayOrder,
        input.now,
      ],
    );
    for (const option of input.options) {
      await transaction.sql.query(
        `
          insert into menu.options (
            id, business_account_id, option_group_id, name,
            price_delta_amount, price_delta_currency, display_order, status,
            version, created_at_utc, updated_at_utc
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'active', 1, $8, $8)
        `,
        [
          option.id,
          input.businessAccountId,
          input.id,
          option.name,
          option.priceDelta.amount,
          option.priceDelta.currency,
          option.displayOrder,
          input.now,
        ],
      );
    }
    return mapOptionGroup(transaction.sql, requireReturnedRow(result.rows));
  }

  public async updateOptionGroup(
    transaction: TransactionContext,
    input: UpdateOptionGroupInput,
  ): Promise<OptionGroup | undefined> {
    const result = await transaction.sql.query<OptionGroupRow>(
      `
        update menu.option_groups
        set
          name = coalesce($4, name),
          is_required = coalesce($5, is_required),
          minimum_selections = coalesce($6, minimum_selections),
          maximum_selections = coalesce($7, maximum_selections),
          display_order = coalesce($8, display_order),
          version = version + 1,
          updated_at_utc = $9
        where business_account_id = $1 and id = $2 and version = $3
        returning
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version
      `,
      [
        input.businessAccountId,
        input.optionGroupId,
        input.expectedVersion,
        input.name ?? null,
        input.isRequired ?? null,
        input.minimumSelections ?? null,
        input.maximumSelections ?? null,
        input.displayOrder ?? null,
        input.now,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    const dish = await transaction.sql.query<{ restaurant_id: string }>(
      `select restaurant_id from menu.dishes where business_account_id = $1 and id = $2`,
      [input.businessAccountId, row.dish_id],
    );
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      requireReturnedRow(dish.rows).restaurant_id,
      input.now,
    );
    return mapOptionGroup(transaction.sql, row);
  }

  public async replaceOptions(
    transaction: TransactionContext,
    input: ReplaceOptionsInput,
  ): Promise<OptionGroup | undefined> {
    const group = await transaction.sql.query<OptionGroupRow>(
      `
        select
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version
        from menu.option_groups
        where business_account_id = $1 and id = $2
      `,
      [input.businessAccountId, input.optionGroupId],
    );
    const groupRow = group.rows[0];
    if (!groupRow) {
      return undefined;
    }
    await transaction.sql.query(
      `delete from menu.options where business_account_id = $1 and option_group_id = $2`,
      [input.businessAccountId, input.optionGroupId],
    );
    for (const option of input.options) {
      await transaction.sql.query(
        `
          insert into menu.options (
            id, business_account_id, option_group_id, name,
            price_delta_amount, price_delta_currency, display_order, status,
            version, created_at_utc, updated_at_utc
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)
        `,
        [
          option.id,
          input.businessAccountId,
          input.optionGroupId,
          option.name,
          option.priceDelta.amount,
          option.priceDelta.currency,
          option.displayOrder,
          option.status,
          input.now,
        ],
      );
    }
    const dish = await transaction.sql.query<{ restaurant_id: string }>(
      `select restaurant_id from menu.dishes where business_account_id = $1 and id = $2`,
      [input.businessAccountId, groupRow.dish_id],
    );
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      requireReturnedRow(dish.rows).restaurant_id,
      input.now,
    );
    return mapOptionGroup(transaction.sql, groupRow);
  }

  public async listOptionGroups(
    sql: SqlExecutor,
    businessAccountId: string,
    dishId: string,
  ): Promise<readonly OptionGroup[]> {
    const result = await sql.query<OptionGroupRow>(
      `
        select
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version
        from menu.option_groups
        where business_account_id = $1 and dish_id = $2
        order by display_order, id
      `,
      [businessAccountId, dishId],
    );
    return Promise.all(result.rows.map((row) => mapOptionGroup(sql, row)));
  }

  public async getOptionGroup(
    sql: SqlExecutor,
    businessAccountId: string,
    optionGroupId: string,
  ): Promise<OptionGroup | undefined> {
    const result = await sql.query<OptionGroupRow>(
      `
        select
          id, business_account_id, dish_id, name, selection_type, is_required,
          minimum_selections, maximum_selections, display_order, version
        from menu.option_groups
        where business_account_id = $1 and id = $2
      `,
      [businessAccountId, optionGroupId],
    );
    const row = result.rows[0];
    return row ? mapOptionGroup(sql, row) : undefined;
  }

  public async upsertBranchOverride(
    transaction: TransactionContext,
    input: UpsertBranchOverrideInput,
  ): Promise<BranchDishOverride | undefined> {
    const dish = await transaction.sql.query<{ restaurant_id: string }>(
      `select restaurant_id from menu.dishes where business_account_id = $1 and id = $2`,
      [input.businessAccountId, input.dishId],
    );
    await this.touchMenu(
      transaction,
      input.businessAccountId,
      requireReturnedRow(dish.rows).restaurant_id,
      input.now,
    );
    const result = await transaction.sql.query<BranchDishOverrideRow>(
      `
        insert into menu.branch_dish_overrides (
          business_account_id, branch_id, dish_id,
          price_amount, price_currency, available, visible,
          version, created_at_utc, updated_at_utc
        )
        values ($1, $2, $3, $4, $5, $6, coalesce($7, true), 1, $8, $8)
        on conflict (business_account_id, branch_id, dish_id) do update set
          price_amount = $4,
          price_currency = $5,
          available = $6,
          visible = coalesce($7, menu.branch_dish_overrides.visible),
          version = menu.branch_dish_overrides.version + 1,
          updated_at_utc = $8
        where menu.branch_dish_overrides.version = $9
        returning business_account_id, branch_id, dish_id, price_amount, price_currency, available, visible, version
      `,
      [
        input.businessAccountId,
        input.branchId,
        input.dishId,
        input.price?.amount ?? null,
        input.price?.currency ?? null,
        input.available ?? null,
        input.visible ?? null,
        input.now,
        input.expectedVersion,
      ],
    );
    const row = result.rows[0];
    return row ? mapBranchOverride(row) : undefined;
  }

  public async getBranchOverride(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
    dishId: string,
  ): Promise<BranchDishOverride | undefined> {
    const result = await sql.query<BranchDishOverrideRow>(
      `
        select business_account_id, branch_id, dish_id, price_amount, price_currency, available, visible, version
        from menu.branch_dish_overrides
        where business_account_id = $1 and branch_id = $2 and dish_id = $3
      `,
      [businessAccountId, branchId, dishId],
    );
    const row = result.rows[0];
    return row ? mapBranchOverride(row) : undefined;
  }

  public async getCustomerMenu(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
    branchId: string,
    branchCurrency: string,
  ): Promise<CustomerMenu> {
    const menu = await this.getMenu(sql, businessAccountId, restaurantId);
    const result = await sql.query<CustomerMenuRow>(
      `
        select
          c.id as category_id, c.name as category_name, c.display_order as category_order,
          d.id as dish_id, d.name as dish_name, d.description, d.image_url, d.base_price_amount, d.base_price_currency,
          d.available as dish_available, d.display_order as dish_order,
          o.price_amount as override_price_amount, o.price_currency as override_price_currency,
          o.available as override_available, o.visible as override_visible
        from menu.categories c
        inner join menu.dishes d
          on d.business_account_id = c.business_account_id and d.category_id = c.id
        left join menu.branch_dish_overrides o
          on o.business_account_id = d.business_account_id
          and o.branch_id = $2
          and o.dish_id = d.id
        where c.business_account_id = $1
          and c.restaurant_id = $3
          and c.status = 'active'
          and d.status = 'active'
        order by c.display_order, c.id, d.display_order, d.id
      `,
      [businessAccountId, branchId, restaurantId],
    );
    const visibleRows = result.rows.filter(
      (row) => row.override_visible !== false,
    );
    const dishIds = visibleRows.map((row) => row.dish_id);
    const optionGroupsByDish = new Map<string, OptionGroup[]>();
    if (dishIds.length > 0) {
      const groupsResult = await sql.query<OptionGroupRow>(
        `
          select
            id, business_account_id, dish_id, name, selection_type, is_required,
            minimum_selections, maximum_selections, display_order, version
          from menu.option_groups
          where business_account_id = $1 and dish_id = any($2::uuid[])
          order by dish_id, display_order, id
        `,
        [businessAccountId, dishIds],
      );
      for (const row of groupsResult.rows) {
        const group = await mapOptionGroup(sql, row);
        const groups = optionGroupsByDish.get(row.dish_id) ?? [];
        groups.push(group);
        optionGroupsByDish.set(row.dish_id, groups);
      }
    }

    const categories = new Map<
      string,
      CustomerMenuCategory & { dishes: CustomerMenuDish[] }
    >();
    for (const row of visibleRows) {
      const effectivePrice: Money =
        row.override_price_amount !== null &&
        row.override_price_currency !== null
          ? {
              amount: row.override_price_amount,
              currency: row.override_price_currency,
            }
          : {
              amount: row.base_price_amount,
              currency: row.base_price_currency,
            };
      const effectiveAvailable = row.override_available ?? row.dish_available;
      const dish: CustomerMenuDish = {
        id: row.dish_id,
        name: row.dish_name,
        description: row.description ?? undefined,
        imageUrl: row.image_url ?? undefined,
        unitPrice: effectivePrice,
        available: effectiveAvailable,
        optionGroups: (optionGroupsByDish.get(row.dish_id) ?? []).map(
          (group) => ({
            id: group.id,
            name: group.name,
            minimum: group.minimumSelections,
            maximum: group.maximumSelections,
            options: group.options
              .filter((option) => option.status === "active")
              .map((option) => ({
                id: option.id,
                name: option.name,
                priceDelta: option.priceDelta,
              })),
          }),
        ),
      };
      const category = categories.get(row.category_id) ?? {
        id: row.category_id,
        name: row.category_name,
        dishes: [],
      };
      category.dishes.push(dish);
      categories.set(row.category_id, category);
    }

    return {
      version: menu?.version ?? 0,
      currency: branchCurrency,
      categories: [...categories.values()],
    };
  }

  public async resolveOrderItemSnapshots(
    transaction: TransactionContext,
    input: Parameters<MenuStore["resolveOrderItemSnapshots"]>[1],
  ): ReturnType<MenuStore["resolveOrderItemSnapshots"]> {
    await transaction.sql.query(
      `
        select id
        from menu.menus
        where business_account_id = $1 and restaurant_id = $2
        for share
      `,
      [input.businessAccountId, input.restaurantId],
    );
    const versionMatches = await this.validateMenuVersion(
      transaction.sql,
      input.businessAccountId,
      input.restaurantId,
      input.expectedMenuVersion,
    );
    const menu = await this.getCustomerMenu(
      transaction.sql,
      input.businessAccountId,
      input.restaurantId,
      input.branchId,
      input.branchCurrency,
    );
    if (!versionMatches) {
      return { kind: "menu_changed", currentVersion: menu.version };
    }
    return resolveOrderItemSnapshotsFromMenu(
      menu,
      input.expectedMenuVersion,
      input.items,
    );
  }
}
