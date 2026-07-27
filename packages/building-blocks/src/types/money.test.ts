import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  isNegative,
  multiplyMoney,
  subtractMoney,
  zeroMoney,
  type Money,
} from "./money.js";

const usd = (amount: string): Money => ({ amount, currency: "USD" });
const eur = (amount: string): Money => ({ amount, currency: "EUR" });

describe("addMoney", () => {
  it("adds two positive amounts in the same currency", () => {
    expect(addMoney(usd("10.00"), usd("5.25"))).toStrictEqual(usd("15.25"));
  });

  it("produces a negative result when the subtrahend dominates", () => {
    expect(addMoney(usd("5.00"), usd("-12.50"))).toStrictEqual(usd("-7.50"));
  });

  it("throws when combining different currencies", () => {
    expect(() => addMoney(usd("10.00"), eur("5.00"))).toThrow(RangeError);
    expect(() => addMoney(usd("10.00"), eur("5.00"))).toThrow(
      /different currencies/,
    );
  });
});

describe("subtractMoney", () => {
  it("subtracts two positive amounts in the same currency", () => {
    expect(subtractMoney(usd("10.00"), usd("4.00"))).toStrictEqual(usd("6.00"));
  });

  it("produces a negative result when the minuend is smaller", () => {
    expect(subtractMoney(usd("4.00"), usd("10.00"))).toStrictEqual(
      usd("-6.00"),
    );
  });

  it("throws when combining different currencies", () => {
    expect(() => subtractMoney(usd("10.00"), eur("5.00"))).toThrow(RangeError);
    expect(() => subtractMoney(usd("10.00"), eur("5.00"))).toThrow(
      /different currencies/,
    );
  });
});

describe("multiplyMoney", () => {
  it("multiplies by a positive integer factor", () => {
    expect(multiplyMoney(usd("3.50"), 3)).toStrictEqual(usd("10.50"));
  });

  it("multiplies by zero", () => {
    expect(multiplyMoney(usd("3.50"), 0)).toStrictEqual(usd("0.00"));
  });

  it("multiplies by a negative integer factor", () => {
    expect(multiplyMoney(usd("3.50"), -2)).toStrictEqual(usd("-7.00"));
  });

  it("throws RangeError for a non-integer factor", () => {
    expect(() => multiplyMoney(usd("3.50"), 1.5)).toThrow(RangeError);
  });
});

describe("isNegative", () => {
  it("returns true for a negative amount", () => {
    expect(isNegative(usd("-0.01"))).toBe(true);
  });

  it("returns false for zero", () => {
    expect(isNegative(usd("0.00"))).toBe(false);
  });

  it("returns false for a positive amount", () => {
    expect(isNegative(usd("0.01"))).toBe(false);
  });
});

describe("compareMoney", () => {
  it("returns -1 when the first amount is smaller", () => {
    expect(compareMoney(usd("1.00"), usd("2.00"))).toBe(-1);
  });

  it("returns 0 when the amounts are equal", () => {
    expect(compareMoney(usd("2.00"), usd("2.00"))).toBe(0);
  });

  it("returns 1 when the first amount is larger", () => {
    expect(compareMoney(usd("3.00"), usd("2.00"))).toBe(1);
  });

  it("throws when comparing different currencies", () => {
    expect(() => compareMoney(usd("1.00"), eur("1.00"))).toThrow(RangeError);
    expect(() => compareMoney(usd("1.00"), eur("1.00"))).toThrow(
      /different currencies/,
    );
  });
});

describe("zeroMoney", () => {
  it("returns 0.00 for the given currency", () => {
    expect(zeroMoney("USD")).toStrictEqual(usd("0.00"));
  });
});

describe("invalid input rejection", () => {
  it("throws RangeError for an amount with three decimal places", () => {
    expect(() => addMoney(usd("12.345"), zeroMoney("USD"))).toThrow(RangeError);
  });

  it("throws RangeError for a non-numeric amount", () => {
    expect(() => addMoney(usd("abc"), zeroMoney("USD"))).toThrow(RangeError);
  });

  it("throws RangeError for an empty amount", () => {
    expect(() => addMoney(usd(""), zeroMoney("USD"))).toThrow(RangeError);
  });

  it("throws RangeError for a lowercase currency", () => {
    expect(() =>
      addMoney({ amount: "12.00", currency: "usd" }, zeroMoney("USD")),
    ).toThrow(RangeError);
  });

  it("throws RangeError for a two-character currency", () => {
    expect(() =>
      addMoney({ amount: "12.00", currency: "US" }, zeroMoney("USD")),
    ).toThrow(RangeError);
  });
});

describe("rounding and precision", () => {
  it("never introduces fractional cents", () => {
    expect(addMoney(usd("0.01"), usd("0.02"))).toStrictEqual(usd("0.03"));
  });
});
