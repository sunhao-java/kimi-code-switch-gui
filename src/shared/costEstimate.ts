import type { UsageEvent } from "./usageTypes";
import { computeEventCost, resolveModelPricing } from "./pricing";
import type { ModelConfig } from "./types";

/**
 * 成本估算结果（基于历史趋势的线性外推）
 */
export interface CostEstimate {
  /** 本月已用成本（USD） */
  monthToDate: number;
  /** 预计本月总成本（USD） */
  estimatedMonthTotal: number;
  /** 预计本月剩余成本（USD） */
  estimatedRemaining: number;
  /** 统计区间：本月第一天到今天 */
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  /** 本月已过天数 */
  daysPassed: number;
  /** 本月剩余天数 */
  daysRemaining: number;
}

/**
 * 基于历史使用数据估算本月成本。
 *
 * 算法：
 * 1. 筛选本月数据
 * 2. 计算已用成本
 * 3. 日均成本 × 剩余天数 = 预计剩余
 * 4. 已用 + 预计剩余 = 预计月总
 *
 * @param events 使用事件列表
 * @param models 模型配置（用于解析定价）
 * @returns 成本估算结果，无数据时返回 null
 */
export function estimateMonthlyCost(
  events: UsageEvent[],
  models: Record<string, ModelConfig>,
): CostEstimate | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const today = now.getDate();

  // 本月第一天和最后一天
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // 下月第 0 天 = 本月最后一天
  const daysInMonth = monthEnd.getDate();

  // 筛选本月事件（ts 在 [monthStart, now] 之间，ts 是 Unix timestamp 毫秒）
  const monthEvents = events.filter((e) => {
    const ts = new Date(e.ts);
    return ts >= monthStart && ts <= now;
  });

  if (monthEvents.length === 0) {
    return null; // 无数据
  }

  // 计算本月已用成本
  let monthToDate = 0;
  for (const e of monthEvents) {
    const configured = models[e.model];
    const pricing = configured
      ? resolveModelPricing(configured)
      : resolveModelPricing({ model: e.model });
    if (pricing) {
      monthToDate += computeEventCost(e, pricing);
    }
  }

  // 日均成本
  const daysPassed = today; // 今天是本月第 today 天
  const daysRemaining = daysInMonth - today;
  const avgDailyCost = daysPassed > 0 ? monthToDate / daysPassed : 0;

  // 预计剩余和月总
  const estimatedRemaining = avgDailyCost * daysRemaining;
  const estimatedMonthTotal = monthToDate + estimatedRemaining;

  return {
    monthToDate,
    estimatedMonthTotal,
    estimatedRemaining,
    periodStart: monthStart.toISOString().split("T")[0],
    periodEnd: now.toISOString().split("T")[0],
    daysPassed,
    daysRemaining,
  };
}
