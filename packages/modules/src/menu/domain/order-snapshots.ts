import {
  addMoney,
  isNegative,
  multiplyMoney,
  zeroMoney,
} from "@rms/building-blocks";
import type {
  CustomerMenu,
  CustomerMenuDish,
  OrderItemSelection,
  ResolveOrderItemSnapshotsResult,
  ResolvedOrderItemSnapshot,
} from "./models.js";

function resolveDish(
  menu: CustomerMenu,
  dishId: string,
): CustomerMenuDish | undefined {
  for (const category of menu.categories) {
    const dish = category.dishes.find((candidate) => candidate.id === dishId);
    if (dish) {
      return dish;
    }
  }
  return undefined;
}

export function resolveOrderItemSnapshotsFromMenu(
  menu: CustomerMenu,
  expectedVersion: number,
  selections: readonly OrderItemSelection[],
): ResolveOrderItemSnapshotsResult {
  if (menu.version !== expectedVersion) {
    return { kind: "menu_changed", currentVersion: menu.version };
  }

  const snapshots: ResolvedOrderItemSnapshot[] = [];
  let total = zeroMoney(menu.currency);

  for (const selection of selections) {
    const dish = resolveDish(menu, selection.dishId);
    if (!dish || !dish.available || dish.unitPrice.currency !== menu.currency) {
      return { kind: "dish_unavailable", dishId: selection.dishId };
    }

    const selectedIds = new Set(selection.optionIds);
    if (selectedIds.size !== selection.optionIds.length) {
      return {
        kind: "invalid_options",
        dishId: selection.dishId,
        detail: "An option cannot be selected more than once.",
      };
    }

    const selectedOptions = [];
    let unitPrice = dish.unitPrice;
    let matchedOptionCount = 0;
    for (const group of dish.optionGroups) {
      const groupSelections = group.options.filter((option) =>
        selectedIds.has(option.id),
      );
      matchedOptionCount += groupSelections.length;
      if (
        groupSelections.length < group.minimum ||
        groupSelections.length > group.maximum
      ) {
        return {
          kind: "invalid_options",
          dishId: selection.dishId,
          detail: `${group.name} requires between ${group.minimum} and ${group.maximum} selections.`,
        };
      }
      for (const option of groupSelections) {
        if (option.priceDelta.currency !== menu.currency) {
          return { kind: "dish_unavailable", dishId: selection.dishId };
        }
        unitPrice = addMoney(unitPrice, option.priceDelta);
        selectedOptions.push({
          optionGroupId: group.id,
          optionGroupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta,
        });
      }
    }

    if (matchedOptionCount !== selectedIds.size) {
      return {
        kind: "invalid_options",
        dishId: selection.dishId,
        detail: "One or more selected options are not available for this dish.",
      };
    }
    if (isNegative(unitPrice)) {
      return {
        kind: "invalid_options",
        dishId: selection.dishId,
        detail: "The selected options produce an invalid item price.",
      };
    }

    const lineTotal = multiplyMoney(unitPrice, selection.quantity);
    snapshots.push({
      sourceDishId: dish.id,
      sourceMenuVersion: menu.version,
      dishName: dish.name,
      basePrice: dish.unitPrice,
      unitPrice,
      quantity: selection.quantity,
      selectedOptions,
      ...(selection.note ? { note: selection.note } : {}),
      taxInclusive: true,
      lineTotal,
    });
    total = addMoney(total, lineTotal);
  }

  return { kind: "resolved", items: snapshots, total };
}
