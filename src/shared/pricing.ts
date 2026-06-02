import type { ModelConfig, ModelPricing } from "./types";
import type { UsageEvent } from "./usageTypes";

/**
 * Built-in default pricing table, keyed by a normalized model id.
 * Prices are USD per 1,000,000 tokens. Users can override per-model via
 * `ModelConfig.pricing`; the defaults here are a best-effort fallback so the
 * cost estimate is non-null out of the box for common models.
 *
 * Keys must be lowercase and are matched after normalization (see
 * `normalizeModelKey`). The default table is intentionally conservative — when
 * a model is unknown, cost is reported as `null` (unknown) rather than guessed.
 */
export const DEFAULT_MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
  // Kimi (Moonshot) series — per 1M tokens.
  "kimi-k2": {
    input_per_mtok: 0.6,
    output_per_mtok: 2.5,
    cache_read_per_mtok: 0.15,
    cache_creation_per_mtok: 0.6,
  },
  "kimi-k2-turbo": {
    input_per_mtok: 1.2,
    output_per_mtok: 5.0,
    cache_read_per_mtok: 0.3,
    cache_creation_per_mtok: 1.2,
  },
  "moonshot-v1-8k": { input_per_mtok: 1.65, output_per_mtok: 1.65 },
  "moonshot-v1-32k": { input_per_mtok: 3.3, output_per_mtok: 3.3 },
  "moonshot-v1-128k": { input_per_mtok: 8.25, output_per_mtok: 8.25 },

  // OpenAI-compatible mainstream models — per 1M tokens.
  "gpt-4o": {
    input_per_mtok: 2.5,
    output_per_mtok: 10.0,
    cache_read_per_mtok: 1.25,
  },
  "gpt-4o-mini": {
    input_per_mtok: 0.15,
    output_per_mtok: 0.6,
    cache_read_per_mtok: 0.075,
  },
  "gpt-4.1": {
    input_per_mtok: 2.0,
    output_per_mtok: 8.0,
    cache_read_per_mtok: 0.5,
  },
  "gpt-4.1-mini": {
    input_per_mtok: 0.4,
    output_per_mtok: 1.6,
    cache_read_per_mtok: 0.1,
  },
  "o3-mini": {
    input_per_mtok: 1.1,
    output_per_mtok: 4.4,
    cache_read_per_mtok: 0.55,
  },

  // Anthropic Claude mainstream models — per 1M tokens.
  "claude-3-5-sonnet": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_read_per_mtok: 0.3,
    cache_creation_per_mtok: 3.75,
  },
  "claude-3-5-haiku": {
    input_per_mtok: 0.8,
    output_per_mtok: 4.0,
    cache_read_per_mtok: 0.08,
    cache_creation_per_mtok: 1.0,
  },
  "claude-3-opus": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_read_per_mtok: 1.5,
    cache_creation_per_mtok: 18.75,
  },
  "claude-sonnet-4": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_read_per_mtok: 0.3,
    cache_creation_per_mtok: 3.75,
  },
});

/**
 * Normalize a raw model identifier into the lookup key used by the default
 * table: lowercased, trimmed, with any provider prefix (e.g. `openai/gpt-4o`,
 * `anthropic:claude-3-opus`) stripped, and date/version suffixes removed
 * (e.g. `gpt-4o-2024-08-06` → `gpt-4o`, `claude-3-5-sonnet-20241022` →
 * `claude-3-5-sonnet`).
 */
export function normalizeModelKey(model: string): string {
  let key = (model ?? "").trim().toLowerCase();
  if (!key) return "";
  // Strip a leading provider prefix delimited by "/" or ":".
  const sepIndex = Math.max(key.lastIndexOf("/"), key.lastIndexOf(":"));
  if (sepIndex >= 0) {
    key = key.slice(sepIndex + 1);
  }
  // Strip trailing date suffix like -20241022 or -2024-08-06.
  key = key.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  // Strip trailing "-latest".
  key = key.replace(/-latest$/, "");
  return key;
}

/**
 * Resolve the pricing for a model. User-supplied `model.pricing` wins; otherwise
 * fall back to the default table (matched on normalized key); otherwise `null`
 * (unknown — caller should treat cost as unknown, not zero).
 *
 * Pure function: never mutates inputs.
 */
export function resolveModelPricing(
  model: Pick<ModelConfig, "model" | "pricing">,
  defaults: Readonly<Record<string, ModelPricing>> = DEFAULT_MODEL_PRICING,
): ModelPricing | null {
  if (model.pricing) {
    return model.pricing;
  }
  const key = normalizeModelKey(model.model);
  if (key && Object.prototype.hasOwnProperty.call(defaults, key)) {
    return defaults[key];
  }
  return null;
}

/**
 * Compute the estimated cost of a single usage event given its pricing.
 * Sums each token dimension × its per-1M-token rate. Cache dimensions fall back
 * to the input rate when their dedicated rate is absent. Reasoning tokens are
 * billed at the output rate (they are output-side generated tokens).
 *
 * Returns `null` when pricing is `null` (unknown model) so the caller can
 * distinguish "no price known" from "zero cost".
 *
 * Pure function: never mutates inputs.
 */
export function computeEventCost(
  event: Pick<
    UsageEvent,
    | "prompt_tokens"
    | "completion_tokens"
    | "cache_read_tokens"
    | "cache_creation_tokens"
    | "reasoning_tokens"
  >,
  pricing: ModelPricing | null,
): number | null {
  if (!pricing) {
    return null;
  }
  const cacheReadRate =
    pricing.cache_read_per_mtok ?? pricing.input_per_mtok;
  const cacheCreationRate =
    pricing.cache_creation_per_mtok ?? pricing.input_per_mtok;

  const total =
    safeTokens(event.prompt_tokens) * pricing.input_per_mtok +
    safeTokens(event.completion_tokens) * pricing.output_per_mtok +
    safeTokens(event.cache_read_tokens) * cacheReadRate +
    safeTokens(event.cache_creation_tokens) * cacheCreationRate +
    safeTokens(event.reasoning_tokens) * pricing.output_per_mtok;

  return total / 1_000_000;
}

function safeTokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
