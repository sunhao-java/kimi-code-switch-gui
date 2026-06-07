import { describe, expect, it } from "vitest";

import {
  CURRENCY_SYMBOLS,
  DEFAULT_CURRENCY_RATES,
  convertCost,
  formatCostWithCurrency,
  resolveRate,
} from "./currency";

describe("resolveRate", () => {
  it("returns 1 for USD regardless of overrides", () => {
    expect(resolveRate("USD")).toBe(1);
    expect(resolveRate("USD", { USD: 999 } as never)).toBe(1);
  });

  it("uses user rate when valid", () => {
    expect(resolveRate("CNY", { CNY: 7.0 })).toBe(7.0);
  });

  it("falls back to default for missing / invalid rate", () => {
    expect(resolveRate("CNY")).toBe(DEFAULT_CURRENCY_RATES.CNY);
    expect(resolveRate("CNY", { CNY: 0 })).toBe(DEFAULT_CURRENCY_RATES.CNY);
    expect(resolveRate("CNY", { CNY: -5 })).toBe(DEFAULT_CURRENCY_RATES.CNY);
    expect(resolveRate("CNY", { CNY: Number.NaN })).toBe(DEFAULT_CURRENCY_RATES.CNY);
    expect(resolveRate("EUR", { EUR: Infinity })).toBe(DEFAULT_CURRENCY_RATES.EUR);
  });
});

describe("convertCost", () => {
  it("passes through null (unknown pricing)", () => {
    expect(convertCost(null, "CNY", { CNY: 7 })).toBeNull();
  });

  it("returns USD amount unchanged", () => {
    expect(convertCost(1.5, "USD")).toBe(1.5);
  });

  it("converts by the resolved rate", () => {
    expect(convertCost(2, "CNY", { CNY: 7 })).toBe(14);
    expect(convertCost(10, "EUR", { EUR: 0.9 })).toBeCloseTo(9, 10);
  });

  it("preserves zero cost as zero (not null)", () => {
    expect(convertCost(0, "CNY", { CNY: 7 })).toBe(0);
  });
});

describe("formatCostWithCurrency", () => {
  it("renders the not-priced label for null", () => {
    expect(formatCostWithCurrency(null, "USD", undefined, "未设定价")).toBe("未设定价");
  });

  it("formats USD with $ and two decimals", () => {
    expect(formatCostWithCurrency(12.345, "USD", undefined, "n/a")).toBe("$12.35");
  });

  it("formats CNY with ¥ at the converted amount", () => {
    expect(formatCostWithCurrency(2, "CNY", { CNY: 7 }, "n/a")).toBe("¥14.00");
  });

  it("formats EUR with € symbol", () => {
    expect(formatCostWithCurrency(10, "EUR", { EUR: 0.9 }, "n/a")).toBe("€9.00");
  });

  it("renders sub-cent non-zero costs as <symbol0.01", () => {
    expect(formatCostWithCurrency(0.001, "USD", undefined, "n/a")).toBe("<$0.01");
    expect(formatCostWithCurrency(0.0005, "CNY", { CNY: 7 }, "n/a")).toBe("<¥0.01");
  });

  it("renders exact zero as the formatted zero, not the sub-cent marker", () => {
    expect(formatCostWithCurrency(0, "USD", undefined, "n/a")).toBe("$0.00");
  });

  it("uses default rate when user rate is omitted", () => {
    const expected = `¥${(5 * DEFAULT_CURRENCY_RATES.CNY).toFixed(2)}`;
    expect(formatCostWithCurrency(5, "CNY", undefined, "n/a")).toBe(expected);
  });
});

describe("currency tables", () => {
  it("USD default rate is 1", () => {
    expect(DEFAULT_CURRENCY_RATES.USD).toBe(1);
  });

  it("every supported currency has a symbol", () => {
    expect(CURRENCY_SYMBOLS.USD).toBe("$");
    expect(CURRENCY_SYMBOLS.CNY).toBe("¥");
    expect(CURRENCY_SYMBOLS.EUR).toBe("€");
  });
});
