import type { Money } from "@rms/building-blocks";

export type EntityStatus = "active" | "inactive";

export interface Category {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly status: EntityStatus;
  readonly version: number;
}

export interface Option {
  readonly id: string;
  readonly businessAccountId: string;
  readonly optionGroupId: string;
  readonly name: string;
  readonly priceDelta: Money;
  readonly displayOrder: number;
  readonly status: EntityStatus;
  readonly version: number;
}

export interface OptionGroup {
  readonly id: string;
  readonly businessAccountId: string;
  readonly dishId: string;
  readonly name: string;
  readonly selectionType: "single" | "multiple";
  readonly isRequired: boolean;
  readonly minimumSelections: number;
  readonly maximumSelections: number;
  readonly displayOrder: number;
  readonly version: number;
  readonly options: readonly Option[];
}

export interface Dish {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly imageUrl?: string | undefined;
  readonly basePrice: Money;
  readonly status: EntityStatus;
  readonly available: boolean;
  readonly displayOrder: number;
  readonly version: number;
}

export interface BranchDishOverride {
  readonly businessAccountId: string;
  readonly branchId: string;
  readonly dishId: string;
  readonly price?: Money | undefined;
  readonly available?: boolean | undefined;
  readonly visible: boolean;
  readonly version: number;
}

export interface MenuAggregate {
  readonly id: string;
  readonly businessAccountId: string;
  readonly restaurantId: string;
  readonly version: number;
}

export interface CustomerMenuOption {
  readonly id: string;
  readonly name: string;
  readonly priceDelta: Money;
}

export interface CustomerMenuOptionGroup {
  readonly id: string;
  readonly name: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly options: readonly CustomerMenuOption[];
}

export interface CustomerMenuDish {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly unitPrice: Money;
  readonly available: boolean;
  readonly optionGroups: readonly CustomerMenuOptionGroup[];
}

export interface CustomerMenuCategory {
  readonly id: string;
  readonly name: string;
  readonly dishes: readonly CustomerMenuDish[];
}

export interface CustomerMenu {
  readonly version: number;
  readonly currency: string;
  readonly categories: readonly CustomerMenuCategory[];
}
