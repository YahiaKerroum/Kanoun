import type {
  Money,
  SqlExecutor,
  TransactionContext,
} from "@rms/building-blocks";
import type {
  BranchDishOverride,
  Category,
  CustomerMenu,
  Dish,
  EntityStatus,
  MenuAggregate,
  OptionGroup,
} from "../domain/models.js";

export interface CreateCategoryInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly now: Date;
}

export interface UpdateCategoryInput {
  readonly businessAccountId: string;
  readonly categoryId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly displayOrder?: number;
  readonly status?: EntityStatus;
  readonly now: Date;
}

export interface CreateDishInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly imageUrl?: string | undefined;
  readonly basePrice: Money;
  readonly displayOrder: number;
  readonly now: Date;
}

export interface UpdateDishInput {
  readonly businessAccountId: string;
  readonly dishId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly imageUrl?: string | null;
  readonly categoryId?: string;
  readonly displayOrder?: number;
  readonly basePrice?: Money;
  readonly available?: boolean;
  readonly status?: EntityStatus;
  readonly now: Date;
}

export interface CreateOptionGroupInput {
  readonly id: string;
  readonly businessAccountId: string;
  readonly dishId: string;
  readonly name: string;
  readonly selectionType: "single" | "multiple";
  readonly isRequired: boolean;
  readonly minimumSelections: number;
  readonly maximumSelections: number;
  readonly displayOrder: number;
  readonly options: readonly {
    readonly id: string;
    readonly name: string;
    readonly priceDelta: Money;
    readonly displayOrder: number;
  }[];
  readonly now: Date;
}

export interface UpdateOptionGroupInput {
  readonly businessAccountId: string;
  readonly optionGroupId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly isRequired?: boolean;
  readonly minimumSelections?: number;
  readonly maximumSelections?: number;
  readonly displayOrder?: number;
  readonly now: Date;
}

export interface ReplaceOptionsInput {
  readonly businessAccountId: string;
  readonly optionGroupId: string;
  readonly options: readonly {
    readonly id: string;
    readonly name: string;
    readonly priceDelta: Money;
    readonly displayOrder: number;
    readonly status: EntityStatus;
  }[];
  readonly now: Date;
}

export interface UpsertBranchOverrideInput {
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly dishId: string;
  readonly expectedVersion: number;
  readonly price?: Money | null;
  readonly available?: boolean | null;
  readonly visible?: boolean;
  readonly now: Date;
}

export interface MenuStore {
  /**
   * Upserts the restaurant's menu aggregate row and bumps its version by one
   * in the same statement (version starts at 1 on first touch). Every
   * mutating menu command calls this within its transaction so `menuVersion`
   * always reflects the latest structural change.
   */
  touchMenu(
    transaction: TransactionContext,
    businessAccountId: string,
    restaurantId: string,
    now: Date,
  ): Promise<MenuAggregate>;
  getMenu(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<MenuAggregate | undefined>;
  validateMenuVersion(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
    expectedVersion: number,
  ): Promise<boolean>;

  createCategory(
    transaction: TransactionContext,
    input: CreateCategoryInput,
  ): Promise<Category>;
  updateCategory(
    transaction: TransactionContext,
    input: UpdateCategoryInput,
  ): Promise<Category | undefined>;
  listCategories(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly Category[]>;
  getCategory(
    sql: SqlExecutor,
    businessAccountId: string,
    categoryId: string,
  ): Promise<Category | undefined>;

  createDish(
    transaction: TransactionContext,
    input: CreateDishInput,
  ): Promise<Dish>;
  updateDish(
    transaction: TransactionContext,
    input: UpdateDishInput,
  ): Promise<Dish | undefined>;
  listDishes(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
  ): Promise<readonly Dish[]>;
  getDish(
    sql: SqlExecutor,
    businessAccountId: string,
    dishId: string,
  ): Promise<Dish | undefined>;

  createOptionGroup(
    transaction: TransactionContext,
    input: CreateOptionGroupInput,
  ): Promise<OptionGroup>;
  updateOptionGroup(
    transaction: TransactionContext,
    input: UpdateOptionGroupInput,
  ): Promise<OptionGroup | undefined>;
  replaceOptions(
    transaction: TransactionContext,
    input: ReplaceOptionsInput,
  ): Promise<OptionGroup | undefined>;
  listOptionGroups(
    sql: SqlExecutor,
    businessAccountId: string,
    dishId: string,
  ): Promise<readonly OptionGroup[]>;
  getOptionGroup(
    sql: SqlExecutor,
    businessAccountId: string,
    optionGroupId: string,
  ): Promise<OptionGroup | undefined>;

  /**
   * Creates the branch override on first use, or applies an optimistic-
   * concurrency update on subsequent calls. Pass `expectedVersion: 0` when no
   * override exists yet for the branch/dish pair — a genuine version
   * mismatch on an existing row resolves to `undefined` (409 upstream).
   */
  upsertBranchOverride(
    transaction: TransactionContext,
    input: UpsertBranchOverrideInput,
  ): Promise<BranchDishOverride | undefined>;
  getBranchOverride(
    sql: SqlExecutor,
    businessAccountId: string,
    branchId: string,
    dishId: string,
  ): Promise<BranchDishOverride | undefined>;

  getCustomerMenu(
    sql: SqlExecutor,
    businessAccountId: string,
    restaurantId: string,
    branchId: string,
    branchCurrency: string,
  ): Promise<CustomerMenu>;
}
