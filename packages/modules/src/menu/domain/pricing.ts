import { addMoney, isNegative, type Money } from "@rms/building-blocks";
import type { EntityStatus } from "./models.js";

export interface PricedOption {
  readonly priceDelta: Money;
  readonly status: EntityStatus;
}

export interface PricedOptionGroup {
  readonly minimumSelections: number;
  readonly options: readonly PricedOption[];
}

/**
 * The lowest price a valid selection can drive a dish to: every group forced
 * to its minimum required count, always picking its most-negative options.
 */
export function worstCaseDishPrice(
  basePrice: Money,
  optionGroups: readonly PricedOptionGroup[],
): Money {
  let worstCase = basePrice;
  for (const group of optionGroups) {
    const negativeDeltas = group.options
      .filter(
        (option) => option.status === "active" && isNegative(option.priceDelta),
      )
      .map((option) => option.priceDelta)
      .sort((a, b) => Number(a.amount) - Number(b.amount));
    for (const delta of negativeDeltas.slice(0, group.minimumSelections)) {
      worstCase = addMoney(worstCase, delta);
    }
  }
  return worstCase;
}

export function isPricingConfigurationValid(
  basePrice: Money,
  optionGroups: readonly PricedOptionGroup[],
): boolean {
  return !isNegative(worstCaseDishPrice(basePrice, optionGroups));
}
