import { describe, expect, it } from "vitest";
import { estimateMonthlyCost } from "./costEstimate";
import type { UsageEvent } from "./usageTypes";
import type { ModelConfig } from "./types";

describe("costEstimate", () => {
  const mockModels: Record<string, ModelConfig> = {
    "gpt-4o": {
      provider: "openai",
      model: "gpt-4o",
      pricing: {
        input_per_mtok: 2.5,
        output_per_mtok: 10.0,
      },
    },
  };

  function createEvent(
    date: string,
    prompt: number,
    completion: number,
    model = "gpt-4o",
  ): UsageEvent {
    return {
      request_id: `req-${Date.now()}-${Math.random()}`,
      ts: new Date(`${date}T12:00:00Z`).getTime(),
      ts_end: new Date(`${date}T12:00:01Z`).getTime(),
      profile: "default",
      provider: "openai",
      model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      reasoning_tokens: 0,
      latency_ms: 1000,
      proxy_overhead_ms: 10,
      error_code: null,
      error_message: null,
    };
  }

  it("returns null when no events in current month", () => {
    const result = estimateMonthlyCost([], mockModels);
    expect(result).toBeNull();
  });

  it("calculates month-to-date cost", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const events: UsageEvent[] = [
      createEvent(`${year}-${month}-01`, 100_000, 50_000),
      createEvent(`${year}-${month}-02`, 100_000, 50_000),
      createEvent(`${year}-${month}-03`, 100_000, 50_000),
    ];

    const result = estimateMonthlyCost(events, mockModels);
    expect(result).not.toBeNull();
    expect(result!.monthToDate).toBeCloseTo(2.25, 2);
  });

  it("estimates remaining based on daily average", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const today = now.getDate();

    // 生成本月前 min(5, today) 天的数据，每天固定成本
    const daysToCreate = Math.min(5, today);
    const events: UsageEvent[] = Array.from({ length: daysToCreate }, (_, i) =>
      createEvent(`${year}-${month}-${String(i + 1).padStart(2, "0")}`, 100_000, 50_000)
    );

    const result = estimateMonthlyCost(events, mockModels);

    if (daysToCreate > 0) {
      expect(result).not.toBeNull();
      // 每天成本 = (100K × 2.5 + 50K × 10.0) / 1M = 0.75 USD
      const expectedTotal = daysToCreate * 0.75;
      expect(result!.monthToDate).toBeCloseTo(expectedTotal, 2);

      const avgDaily = result!.monthToDate / result!.daysPassed;
      expect(avgDaily).toBeGreaterThan(0);

      expect(result!.estimatedMonthTotal).toBeCloseTo(
        result!.monthToDate + result!.estimatedRemaining, 2
      );
    }
  });

  it("filters events outside current month", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prevMonth = String(now.getMonth()).padStart(2, "0");

    const events: UsageEvent[] = [
      createEvent(`${year}-${prevMonth}-15`, 100_000, 50_000),
      createEvent(`${year}-${month}-01`, 100_000, 50_000),
      createEvent(`${year}-${month}-02`, 100_000, 50_000),
    ];

    const result = estimateMonthlyCost(events, mockModels);
    expect(result).not.toBeNull();
    expect(result!.monthToDate).toBeCloseTo(1.5, 2);
  });

  it("uses DEFAULT_MODEL_PRICING fallback", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const events: UsageEvent[] = [
      createEvent(`${year}-${month}-01`, 1_000_000, 1_000_000, "gpt-4o-mini"),
    ];

    const result = estimateMonthlyCost(events, {});
    expect(result).not.toBeNull();
    expect(result!.monthToDate).toBeCloseTo(0.75, 2);
  });
});
