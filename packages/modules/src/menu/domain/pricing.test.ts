import { describe, expect, it } from "vitest";
import type { Money } from "@rms/building-blocks";
import {
  isPricingConfigurationValid,
  worstCaseDishPrice,
  type PricedOption,
  type PricedOptionGroup,
} from "./pricing.js";
import type { EntityStatus } from "./models.js";

const usd = (amount: string): Money => ({ amount, currency: "USD" });

function option(
  priceDelta: string,
  status: EntityStatus = "active",
): PricedOption {
  return { priceDelta: usd(priceDelta), status };
}

function group(
  minimumSelections: number,
  options: readonly PricedOption[],
): PricedOptionGroup {
  return { minimumSelections, options };
}

describe("worstCaseDishPrice", () => {
  it("equals the base price when there are no option groups", () => {
    expect(worstCaseDishPrice(usd("10.00"), [])).toStrictEqual(usd("10.00"));
  });

  it("applies no deltas when minimumSelections is 0, regardless of how negative the options are", () => {
    const optionGroups = [group(0, [option("-5.00"), option("-10.00")])];

    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("10.00"),
    );
  });

  it("picks the most-negative active options by magnitude, not array order", () => {
    const optionGroups = [
      group(2, [option("-1.00"), option("-5.00"), option("-2.00")]),
    ];

    // If the group selected by order instead of magnitude it would wrongly
    // sum -1.00 and -5.00 (= 4.00), instead of the correct -5.00 and -2.00.
    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("3.00"),
    );
  });

  it("excludes an inactive option's negative delta from the worst case", () => {
    const optionGroups = [
      group(1, [option("-100.00", "inactive"), option("-1.00", "active")]),
    ];

    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("9.00"),
    );
  });

  it("sums each option group's contribution independently", () => {
    const optionGroups = [
      group(1, [option("-1.00"), option("-2.00")]),
      group(1, [option("-3.00"), option("-4.00")]),
    ];

    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("4.00"),
    );
  });

  it("leaves the base price unchanged when option deltas are positive-only, even with minimumSelections > 0", () => {
    const optionGroups = [group(2, [option("1.00"), option("2.00")])];

    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("10.00"),
    );
  });
});

describe("isPricingConfigurationValid", () => {
  it("returns false when the worst case goes negative", () => {
    const optionGroups = [group(1, [option("-15.00")])];

    expect(isPricingConfigurationValid(usd("10.00"), optionGroups)).toBe(false);
  });

  it("returns true when the worst case is exactly zero", () => {
    const optionGroups = [group(1, [option("-10.00")])];

    expect(worstCaseDishPrice(usd("10.00"), optionGroups)).toStrictEqual(
      usd("0.00"),
    );
    expect(isPricingConfigurationValid(usd("10.00"), optionGroups)).toBe(true);
  });

  it("returns true when there are no option groups", () => {
    expect(isPricingConfigurationValid(usd("10.00"), [])).toBe(true);
  });
});
