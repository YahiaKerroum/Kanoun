const amountPattern = /^-?\d+(\.\d{1,2})?$/;
const currencyPattern = /^[A-Z]{3}$/;

export interface Money {
  readonly amount: string;
  readonly currency: string;
}

function assertValidMoney(money: Money): void {
  if (!amountPattern.test(money.amount)) {
    throw new RangeError(`Invalid money amount: ${money.amount}`);
  }
  if (!currencyPattern.test(money.currency)) {
    throw new RangeError(`Invalid money currency: ${money.currency}`);
  }
}

function toMinorUnits(amount: string): bigint {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const minorUnits =
    BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -minorUnits : minorUnits;
}

function fromMinorUnits(minorUnits: bigint, currency: string): Money {
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return {
    amount: `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`,
    currency,
  };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError(
      `Cannot combine money in different currencies: ${a.currency} and ${b.currency}`,
    );
  }
}

export function zeroMoney(currency: string): Money {
  const money = { amount: "0.00", currency };
  assertValidMoney(money);
  return money;
}

export function addMoney(a: Money, b: Money): Money {
  assertValidMoney(a);
  assertValidMoney(b);
  assertSameCurrency(a, b);
  return fromMinorUnits(
    toMinorUnits(a.amount) + toMinorUnits(b.amount),
    a.currency,
  );
}

export function subtractMoney(a: Money, b: Money): Money {
  assertValidMoney(a);
  assertValidMoney(b);
  assertSameCurrency(a, b);
  return fromMinorUnits(
    toMinorUnits(a.amount) - toMinorUnits(b.amount),
    a.currency,
  );
}

export function multiplyMoney(money: Money, factor: number): Money {
  assertValidMoney(money);
  if (!Number.isInteger(factor)) {
    throw new RangeError("Money can only be multiplied by an integer factor.");
  }
  return fromMinorUnits(
    toMinorUnits(money.amount) * BigInt(factor),
    money.currency,
  );
}

export function isNegative(money: Money): boolean {
  assertValidMoney(money);
  return toMinorUnits(money.amount) < 0n;
}

export function compareMoney(a: Money, b: Money): number {
  assertValidMoney(a);
  assertValidMoney(b);
  assertSameCurrency(a, b);
  const difference = toMinorUnits(a.amount) - toMinorUnits(b.amount);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}
