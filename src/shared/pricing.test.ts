import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_PRICING,
  computeEventCost,
  normalizeModelKey,
  resolveModelPricing,
} from "./pricing";
import type { ModelPricing } from "./types";
import type { UsageEvent } from "./usageTypes";

function makeEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    request_id: "r1",
    ts: 0,
    ts_end: null,
    profile: "default",
    provider: "moonshot",
    model: "kimi-k2",
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    reasoning_tokens: 0,
    latency_ms: 0,
    proxy_overhead_ms: 0,
    error_code: null,
    error_message: null,
    http_status: 200,
    session_hint: null,
    cost_estimate: null,
    pricing_version: null,
    metadata_json: null,
    ...overrides,
  };
}

describe("DEFAULT_MODEL_PRICING", () => {
  it("contains kimi and mainstream models with sane shape", () => {
    expect(DEFAULT_MODEL_PRICING["kimi-k2"]).toBeDefined();
    expect(DEFAULT_MODEL_PRICING["gpt-4o"]).toBeDefined();
    expect(DEFAULT_MODEL_PRICING["claude-3-5-sonnet"]).toBeDefined();
    for (const pricing of Object.values(DEFAULT_MODEL_PRICING)) {
      expect(pricing.input_per_mtok).toBeGreaterThan(0);
      expect(pricing.output_per_mtok).toBeGreaterThan(0);
    }
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(DEFAULT_MODEL_PRICING)).toBe(true);
  });
});

describe("normalizeModelKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeModelKey("  Kimi-K2  ")).toBe("kimi-k2");
  });

  it("strips provider prefix delimited by / or :", () => {
    expect(normalizeModelKey("openai/gpt-4o")).toBe("gpt-4o");
    expect(normalizeModelKey("anthropic:claude-3-opus")).toBe("claude-3-opus");
    expect(normalizeModelKey("a/b/gpt-4.1-mini")).toBe("gpt-4.1-mini");
  });

  it("strips date suffixes", () => {
    expect(normalizeModelKey("gpt-4o-2024-08-06")).toBe("gpt-4o");
    expect(normalizeModelKey("claude-3-5-sonnet-20241022")).toBe("claude-3-5-sonnet");
  });

  it("strips -latest suffix", () => {
    expect(normalizeModelKey("claude-3-5-haiku-latest")).toBe("claude-3-5-haiku");
  });

  it("returns empty string for empty/whitespace/nullish input", () => {
    expect(normalizeModelKey("")).toBe("");
    expect(normalizeModelKey("   ")).toBe("");
    expect(normalizeModelKey(undefined as unknown as string)).toBe("");
  });
});

describe("resolveModelPricing", () => {
  it("prefers user-supplied pricing over defaults", () => {
    const custom: ModelPricing = { input_per_mtok: 99, output_per_mtok: 199 };
    const resolved = resolveModelPricing({ model: "kimi-k2", pricing: custom });
    expect(resolved).toBe(custom);
  });

  it("falls back to default table matched by normalized key", () => {
    const resolved = resolveModelPricing({ model: "openai/gpt-4o-2024-08-06" });
    expect(resolved).toEqual(DEFAULT_MODEL_PRICING["gpt-4o"]);
  });

  it("returns null for an unknown model", () => {
    expect(resolveModelPricing({ model: "totally-unknown-model" })).toBeNull();
  });

  it("returns null for empty model string with no override", () => {
    expect(resolveModelPricing({ model: "" })).toBeNull();
  });

  it("respects a caller-provided defaults table", () => {
    const defaults: Record<string, ModelPricing> = {
      "my-model": { input_per_mtok: 1, output_per_mtok: 2 },
    };
    expect(resolveModelPricing({ model: "my-model" }, defaults)).toEqual(defaults["my-model"]);
    expect(resolveModelPricing({ model: "kimi-k2" }, defaults)).toBeNull();
  });
});

describe("computeEventCost", () => {
  it("returns null when pricing is null", () => {
    expect(computeEventCost(makeEvent({ prompt_tokens: 1000 }), null)).toBeNull();
  });

  it("computes input + output cost per 1M tokens", () => {
    const pricing: ModelPricing = { input_per_mtok: 2, output_per_mtok: 10 };
    const event = makeEvent({ prompt_tokens: 1_000_000, completion_tokens: 500_000 });
    // 1M * 2 / 1M = 2 ; 0.5M * 10 / 1M = 5 → 7
    expect(computeEventCost(event, pricing)).toBeCloseTo(7, 10);
  });

  it("bills each token dimension", () => {
    const pricing: ModelPricing = {
      input_per_mtok: 1_000_000,
      output_per_mtok: 2_000_000,
      cache_read_per_mtok: 3_000_000,
      cache_creation_per_mtok: 4_000_000,
    };
    const event = makeEvent({
      prompt_tokens: 1,
      completion_tokens: 1,
      cache_read_tokens: 1,
      cache_creation_tokens: 1,
      reasoning_tokens: 1,
    });
    // input 1 + output 2 + cache_read 3 + cache_creation 4 + reasoning(at output) 2 = 12
    expect(computeEventCost(event, pricing)).toBeCloseTo(12, 10);
  });

  it("falls back to input rate when cache rates are absent", () => {
    const pricing: ModelPricing = { input_per_mtok: 5_000_000, output_per_mtok: 1 };
    const event = makeEvent({
      cache_read_tokens: 1,
      cache_creation_tokens: 1,
    });
    // both cache dims fall back to input rate 5 → 5 + 5 = 10
    expect(computeEventCost(event, pricing)).toBeCloseTo(10, 10);
  });

  it("treats negative / non-finite token counts as zero", () => {
    const pricing: ModelPricing = { input_per_mtok: 1_000_000, output_per_mtok: 1_000_000 };
    const event = makeEvent({
      prompt_tokens: -50,
      completion_tokens: Number.NaN,
      cache_read_tokens: 2,
    });
    // only cache_read counts: 2 * (input fallback 1M) / 1M = 2
    expect(computeEventCost(event, pricing)).toBeCloseTo(2, 10);
  });

  it("returns 0 for a known price with zero tokens", () => {
    const pricing: ModelPricing = { input_per_mtok: 10, output_per_mtok: 20 };
    expect(computeEventCost(makeEvent(), pricing)).toBe(0);
  });
});
