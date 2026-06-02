import { describe, expect, it } from "vitest";

import {
  clampDiskWarnMb,
  clampPort,
  clampRetentionDays,
  exceedsDiskWarn,
  getInsightsDefaults,
  isCollectionActive,
  normalizeInsightsSettings,
  normalizeLastKnownPort,
  normalizeStatus,
  pickPreferredPort,
  resolveEventPricing,
  shouldShowFirstRunDialog,
  sumEventCost,
} from "./usageStore";
import type { ModelConfig } from "./types";
import type { UsageEvent } from "./usageTypes";

function makeUsageEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
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

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    provider: "moonshot",
    model: "kimi-k2",
    max_context_size: 128000,
    capabilities: [],
    ...overrides,
  };
}

describe("usageStore", () => {
  describe("getInsightsDefaults", () => {
    it("returns disabled status with auto port", () => {
      const d = getInsightsDefaults();
      expect(d.insights_status).toBe("disabled");
      expect(d.insights_proxy_port).toBe("auto");
      expect(d.insights_retention_days).toBe(90);
      expect(d.insights_disk_warn_threshold_mb).toBe(100);
      expect(d.insights_store_prompt_preview).toBe(false);
      expect(d.insights_onboarding_shown_at).toBe("");
      expect(d.insights_last_known_port).toBeNull();
    });
  });

  describe("clampPort", () => {
    it("returns 'auto' for undefined/null/empty", () => {
      expect(clampPort(undefined)).toBe("auto");
      expect(clampPort(null)).toBe("auto");
      expect(clampPort("")).toBe("auto");
      expect(clampPort("auto")).toBe("auto");
    });

    it("accepts valid port numbers", () => {
      expect(clampPort(8080)).toBe(8080);
      expect(clampPort(1024)).toBe(1024);
      expect(clampPort(65535)).toBe(65535);
    });

    it("rejects out-of-range ports", () => {
      expect(clampPort(0)).toBe("auto");
      expect(clampPort(1023)).toBe("auto");
      expect(clampPort(65536)).toBe("auto");
      expect(clampPort(-1)).toBe("auto");
    });

    it("parses string numbers", () => {
      expect(clampPort("8080")).toBe(8080);
      expect(clampPort("abc")).toBe("auto");
    });
  });

  describe("clampRetentionDays", () => {
    it("clamps to valid range [7, 365]", () => {
      expect(clampRetentionDays(90)).toBe(90);
      expect(clampRetentionDays(1)).toBe(7);
      expect(clampRetentionDays(500)).toBe(365);
      expect(clampRetentionDays(undefined)).toBe(90);
      expect(clampRetentionDays("abc")).toBe(90);
    });
  });

  describe("clampDiskWarnMb", () => {
    it("clamps to valid range [10, 10000]", () => {
      expect(clampDiskWarnMb(100)).toBe(100);
      expect(clampDiskWarnMb(5)).toBe(10);
      expect(clampDiskWarnMb(20000)).toBe(10000);
      expect(clampDiskWarnMb(undefined)).toBe(100);
    });
  });

  describe("normalizeStatus", () => {
    it("accepts valid statuses", () => {
      expect(normalizeStatus("disabled")).toBe("disabled");
      expect(normalizeStatus("enabled")).toBe("enabled");
      expect(normalizeStatus("paused")).toBe("paused");
    });

    it("falls back for invalid values", () => {
      expect(normalizeStatus("invalid")).toBe("disabled");
      expect(normalizeStatus(null)).toBe("disabled");
      expect(normalizeStatus(123)).toBe("disabled");
    });
  });

  describe("normalizeLastKnownPort", () => {
    it("returns null for invalid values", () => {
      expect(normalizeLastKnownPort(null)).toBeNull();
      expect(normalizeLastKnownPort(undefined)).toBeNull();
      expect(normalizeLastKnownPort("")).toBeNull();
      expect(normalizeLastKnownPort(0)).toBeNull();
      expect(normalizeLastKnownPort(99999)).toBeNull();
    });

    it("returns valid port numbers", () => {
      expect(normalizeLastKnownPort(8080)).toBe(8080);
      expect(normalizeLastKnownPort(49152)).toBe(49152);
    });
  });

  describe("normalizeInsightsSettings", () => {
    it("returns defaults for null/undefined", () => {
      expect(normalizeInsightsSettings(null)).toEqual(getInsightsDefaults());
      expect(normalizeInsightsSettings(undefined)).toEqual(getInsightsDefaults());
    });

    it("normalizes partial input", () => {
      const result = normalizeInsightsSettings({
        insights_status: "enabled",
        insights_proxy_port: 9999,
        insights_retention_days: 30,
      });
      expect(result.insights_status).toBe("enabled");
      expect(result.insights_proxy_port).toBe(9999);
      expect(result.insights_retention_days).toBe(30);
      expect(result.insights_disk_warn_threshold_mb).toBe(100);
    });

    it("clamps invalid values", () => {
      const result = normalizeInsightsSettings({
        insights_status: "bogus" as never,
        insights_proxy_port: -1,
        insights_retention_days: 1000,
        insights_disk_warn_threshold_mb: 1,
      });
      expect(result.insights_status).toBe("disabled");
      expect(result.insights_proxy_port).toBe("auto");
      expect(result.insights_retention_days).toBe(365);
      expect(result.insights_disk_warn_threshold_mb).toBe(10);
    });
  });

  describe("shouldShowFirstRunDialog", () => {
    it("returns true when onboarding not shown", () => {
      const s = getInsightsDefaults();
      expect(shouldShowFirstRunDialog(s)).toBe(true);
    });

    it("returns false when onboarding was shown", () => {
      const s = { ...getInsightsDefaults(), insights_onboarding_shown_at: "2026-05-23T00:00:00Z" };
      expect(shouldShowFirstRunDialog(s)).toBe(false);
    });
  });

  describe("isCollectionActive", () => {
    it("returns true only for enabled", () => {
      expect(isCollectionActive({ ...getInsightsDefaults(), insights_status: "enabled" })).toBe(true);
      expect(isCollectionActive({ ...getInsightsDefaults(), insights_status: "disabled" })).toBe(false);
      expect(isCollectionActive({ ...getInsightsDefaults(), insights_status: "paused" })).toBe(false);
    });
  });

  describe("exceedsDiskWarn", () => {
    it("compares bytes to MB threshold", () => {
      expect(exceedsDiskWarn(100 * 1024 * 1024, 100)).toBe(false);
      expect(exceedsDiskWarn(100 * 1024 * 1024 + 1, 100)).toBe(true);
      expect(exceedsDiskWarn(50 * 1024 * 1024, 100)).toBe(false);
    });
  });

  describe("pickPreferredPort", () => {
    it("returns explicit port when set", () => {
      const s = { ...getInsightsDefaults(), insights_proxy_port: 8080 as number | "auto" };
      expect(pickPreferredPort(s)).toBe(8080);
    });

    it("falls back to last known port when auto", () => {
      const s = { ...getInsightsDefaults(), insights_last_known_port: 51234 };
      expect(pickPreferredPort(s)).toBe(51234);
    });

    it("returns null when auto and no last known", () => {
      expect(pickPreferredPort(getInsightsDefaults())).toBeNull();
    });
  });

  describe("resolveEventPricing", () => {
    it("uses a configured model's user pricing override", () => {
      const models = {
        "kimi-k2": makeModel({ pricing: { input_per_mtok: 7, output_per_mtok: 9 } }),
      };
      const pricing = resolveEventPricing(makeUsageEvent({ model: "kimi-k2" }), models);
      expect(pricing).toEqual({ input_per_mtok: 7, output_per_mtok: 9 });
    });

    it("falls back to the default table when model is configured without pricing", () => {
      const models = { "kimi-k2": makeModel() };
      const pricing = resolveEventPricing(makeUsageEvent({ model: "kimi-k2" }), models);
      expect(pricing?.input_per_mtok).toBeGreaterThan(0);
    });

    it("falls back to the default table when model is not configured", () => {
      const pricing = resolveEventPricing(makeUsageEvent({ model: "gpt-4o" }));
      expect(pricing?.output_per_mtok).toBeGreaterThan(0);
    });

    it("returns null for an unknown, unconfigured model", () => {
      expect(resolveEventPricing(makeUsageEvent({ model: "no-such-model" }))).toBeNull();
    });
  });

  describe("sumEventCost", () => {
    it("returns null when no event has a known price", () => {
      const events = [makeUsageEvent({ model: "no-such-model", prompt_tokens: 1000 })];
      expect(sumEventCost(events)).toBeNull();
    });

    it("returns null for an empty event list", () => {
      expect(sumEventCost([])).toBeNull();
    });

    it("sums known costs and skips unknown-priced events", () => {
      const models = {
        priced: makeModel({ model: "priced", pricing: { input_per_mtok: 1_000_000, output_per_mtok: 0 } }),
      };
      const events = [
        makeUsageEvent({ model: "priced", prompt_tokens: 1 }), // 1 * 1M / 1M = 1
        makeUsageEvent({ model: "priced", prompt_tokens: 2 }), // 2
        makeUsageEvent({ model: "unknown-model", prompt_tokens: 5 }), // skipped (null)
      ];
      expect(sumEventCost(events, models)).toBeCloseTo(3, 10);
    });

    it("returns 0 when a known-priced event has zero tokens", () => {
      const models = {
        free: makeModel({ model: "free", pricing: { input_per_mtok: 5, output_per_mtok: 5 } }),
      };
      expect(sumEventCost([makeUsageEvent({ model: "free" })], models)).toBe(0);
    });
  });
});
