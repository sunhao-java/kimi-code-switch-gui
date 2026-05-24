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
  shouldShowFirstRunDialog,
} from "./usageStore";

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
});
