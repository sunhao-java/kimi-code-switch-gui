import { computeEventCost, resolveModelPricing } from "./pricing";
import type { ModelConfig, ModelPricing } from "./types";
import type { InsightsSettings, InsightsStatus, ProxyHealth, ProxyState, UsageEvent } from "./usageTypes";

export const INSIGHTS_PORT_MIN = 1024;
export const INSIGHTS_PORT_MAX = 65535;
export const INSIGHTS_RETENTION_MIN = 7;
export const INSIGHTS_RETENTION_MAX = 365;
export const INSIGHTS_DISK_WARN_MIN_MB = 10;
export const INSIGHTS_DISK_WARN_MAX_MB = 10000;

export function getInsightsDefaults(): InsightsSettings {
  return {
    insights_status: "disabled",
    insights_proxy_port: "auto",
    insights_retention_days: 90,
    insights_disk_warn_threshold_mb: 100,
    insights_store_prompt_preview: false,
    insights_onboarding_shown_at: "",
    insights_last_known_port: null,
  };
}

export function emptyProxyHealth(): ProxyHealth {
  return {
    proxy_latency_ms_p50: 0,
    proxy_latency_ms_p95: 0,
    events_per_minute: 0,
    sqlite_db_size_bytes: 0,
    jsonl_total_bytes: 0,
    ca_install_failures_count: 0,
    dropped_events_count: 0,
  };
}

export function initialProxyState(): ProxyState {
  return {
    status: "stopped",
    port: null,
    health: emptyProxyHealth(),
  };
}

export function clampPort(value: unknown, fallback: number | "auto" = "auto"): number | "auto" {
  if (value === "auto" || value === undefined || value === null || value === "") {
    return "auto";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < INSIGHTS_PORT_MIN || rounded > INSIGHTS_PORT_MAX) return fallback;
  return rounded;
}

export function clampRetentionDays(value: unknown, fallback = 90): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < INSIGHTS_RETENTION_MIN) return INSIGHTS_RETENTION_MIN;
  if (rounded > INSIGHTS_RETENTION_MAX) return INSIGHTS_RETENTION_MAX;
  return rounded;
}

export function clampDiskWarnMb(value: unknown, fallback = 100): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < INSIGHTS_DISK_WARN_MIN_MB) return INSIGHTS_DISK_WARN_MIN_MB;
  if (rounded > INSIGHTS_DISK_WARN_MAX_MB) return INSIGHTS_DISK_WARN_MAX_MB;
  return rounded;
}

const VALID_STATUSES: ReadonlySet<InsightsStatus> = new Set(["disabled", "enabled", "paused"]);

export function normalizeStatus(value: unknown, fallback: InsightsStatus = "disabled"): InsightsStatus {
  if (typeof value !== "string") return fallback;
  return VALID_STATUSES.has(value as InsightsStatus) ? (value as InsightsStatus) : fallback;
}

export function normalizeOnboardingShownAt(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

export function normalizeLastKnownPort(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < INSIGHTS_PORT_MIN || rounded > INSIGHTS_PORT_MAX) return null;
  return rounded;
}

export function normalizeInsightsSettings(input: Partial<InsightsSettings> | null | undefined): InsightsSettings {
  const defaults = getInsightsDefaults();
  if (!input) return defaults;
  return {
    insights_status: normalizeStatus(input.insights_status, defaults.insights_status),
    insights_proxy_port: clampPort(input.insights_proxy_port, defaults.insights_proxy_port),
    insights_retention_days: clampRetentionDays(input.insights_retention_days, defaults.insights_retention_days),
    insights_disk_warn_threshold_mb: clampDiskWarnMb(
      input.insights_disk_warn_threshold_mb,
      defaults.insights_disk_warn_threshold_mb,
    ),
    insights_store_prompt_preview:
      typeof input.insights_store_prompt_preview === "boolean"
        ? input.insights_store_prompt_preview
        : defaults.insights_store_prompt_preview,
    insights_onboarding_shown_at: normalizeOnboardingShownAt(input.insights_onboarding_shown_at),
    insights_last_known_port: normalizeLastKnownPort(input.insights_last_known_port),
  };
}

export function shouldShowFirstRunDialog(settings: InsightsSettings): boolean {
  return !settings.insights_onboarding_shown_at;
}

export function isCollectionActive(settings: InsightsSettings): boolean {
  return settings.insights_status === "enabled";
}

export function exceedsDiskWarn(totalBytes: number, thresholdMb: number): boolean {
  return totalBytes > thresholdMb * 1024 * 1024;
}

export function pickPreferredPort(settings: InsightsSettings): number | null {
  if (typeof settings.insights_proxy_port === "number") {
    return settings.insights_proxy_port;
  }
  return settings.insights_last_known_port;
}

/**
 * Resolves the pricing to apply for an event's model. Looks up the model
 * definition in `models` (keyed by model id) so a user-defined `pricing`
 * override is honored; falls back to the built-in default table by the event's
 * `model` string. Returns `null` when no price is known.
 *
 * Pure function: never mutates inputs.
 */
export function resolveEventPricing(
  event: Pick<UsageEvent, "model">,
  models: Record<string, ModelConfig> = {},
): ModelPricing | null {
  const configured = models[event.model];
  if (configured) {
    return resolveModelPricing(configured);
  }
  return resolveModelPricing({ model: event.model });
}

/**
 * Sums the estimated cost across a set of usage events, resolving pricing per
 * event's model. Cost is computed at read time (tokens × current rate), never
 * read from a stored/固化 value. Returns `null` when not a single event yields a
 * known cost — so the caller can distinguish "no price known anywhere" from a
 * genuine zero — and otherwise returns the sum of the events whose cost is
 * known.
 *
 * Pure function: never mutates inputs.
 */
export function sumEventCost(
  events: ReadonlyArray<UsageEvent>,
  models: Record<string, ModelConfig> = {},
): number | null {
  let total = 0;
  let anyKnown = false;
  for (const event of events) {
    const cost = computeEventCost(event, resolveEventPricing(event, models));
    if (cost !== null) {
      total += cost;
      anyKnown = true;
    }
  }
  return anyKnown ? total : null;
}
