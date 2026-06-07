import type { DisplayCurrency } from "./types";

/**
 * 多币种成本展示的纯逻辑层。
 *
 * 设计约束：定价（ModelPricing）始终以 USD 存储，成本在 SQLite 层也以 USD 聚合。
 * 本模块只负责「展示时」把 USD 金额按用户设定汇率换算为目标币种并格式化。
 * 不接实时汇率 API —— 汇率由用户在设置中手填，内置默认仅作兜底（保持本地、零网络上报）。
 */

/** 各币种相对 USD 的内置默认汇率（1 USD = N 目标币种）。USD 恒为 1。 */
export const DEFAULT_CURRENCY_RATES: Readonly<Record<DisplayCurrency, number>> = Object.freeze({
  USD: 1,
  CNY: 7.2,
  EUR: 0.92,
});

/** 各币种展示符号。 */
export const CURRENCY_SYMBOLS: Readonly<Record<DisplayCurrency, string>> = Object.freeze({
  USD: "$",
  CNY: "¥",
  EUR: "€",
});

/** 支持的币种白名单（用于校验持久化值）。 */
export const SUPPORTED_CURRENCIES: readonly DisplayCurrency[] = ["USD", "CNY", "EUR"];

/**
 * 解析有效汇率：优先用用户设定，缺失或非法（非正有限数）回退内置默认。
 * USD 始终为 1，忽略任何覆盖。
 */
export function resolveRate(
  currency: DisplayCurrency,
  rates?: Partial<Record<DisplayCurrency, number>>,
): number {
  if (currency === "USD") return 1;
  const r = rates?.[currency];
  if (typeof r === "number" && Number.isFinite(r) && r > 0) return r;
  return DEFAULT_CURRENCY_RATES[currency];
}

/**
 * 把 USD 成本换算为目标币种金额。`null`（未知定价）原样透传，
 * 以保留「未设定价」与「零成本」的语义区分。
 */
export function convertCost(
  usdCost: number | null,
  currency: DisplayCurrency,
  rates?: Partial<Record<DisplayCurrency, number>>,
): number | null {
  if (usdCost === null) return null;
  return usdCost * resolveRate(currency, rates);
}

/**
 * 格式化成本展示字符串：换算 + 加币种符号 + 小额边界处理。
 * - `null` → `notPricedLabel`（调用方传入本地化「未设定价」文案）
 * - 0 < 金额 < 0.01 → `<{符号}0.01`
 * - 其余 → `{符号}{金额.toFixed(2)}`
 *
 * 纯函数，不读全局状态。
 */
export function formatCostWithCurrency(
  usdCost: number | null,
  currency: DisplayCurrency,
  rates: Partial<Record<DisplayCurrency, number>> | undefined,
  notPricedLabel: string,
): string {
  const converted = convertCost(usdCost, currency, rates);
  if (converted === null) return notPricedLabel;
  const symbol = CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS.USD;
  if (converted > 0 && converted < 0.01) return `<${symbol}0.01`;
  return `${symbol}${converted.toFixed(2)}`;
}
