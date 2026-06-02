export type InsightsStatus = "disabled" | "enabled" | "paused";

export type ProxyStatus = "stopped" | "starting" | "running" | "error";

export type InsightsErrorCode =
  | "E_PROXY_BIND"
  | "E_CA_WRITE"
  | "E_CA_EXPIRED"
  | "E_SQLITE_LOCK"
  | "E_SQLITE_CORRUPT"
  | "E_PROXY_DOWNSTREAM"
  | "E_ELECTRON_REBUILD";

export interface InsightsSettings {
  insights_status: InsightsStatus;
  insights_proxy_port: number | "auto";
  insights_retention_days: number;
  insights_disk_warn_threshold_mb: number;
  insights_store_prompt_preview: boolean;
  insights_onboarding_shown_at: string;
  insights_last_known_port: number | null;
}

export interface ProxyHealth {
  proxy_latency_ms_p50: number;
  proxy_latency_ms_p95: number;
  events_per_minute: number;
  sqlite_db_size_bytes: number;
  jsonl_total_bytes: number;
  ca_install_failures_count: number;
  dropped_events_count: number;
}

export interface ProxyState {
  status: ProxyStatus;
  port: number | null;
  error?: string;
  errorCode?: InsightsErrorCode;
  caFingerprint?: string;
  caCreatedAt?: string;
  startedAt?: string;
  health: ProxyHealth;
}

export interface UsageEvent {
  request_id: string;
  ts: number;
  ts_end: number | null;
  profile: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  latency_ms: number;
  proxy_overhead_ms: number;
  error_code: string | null;
  error_message: string | null;
  http_status: number;
  session_hint: string | null;
  cost_estimate: number | null;
  pricing_version: string | null;
  metadata_json: string | null;
}

export interface DailyAggregate {
  day_utc: string;
  profile: string;
  provider: string;
  model: string;
  call_count: number;
  error_count: number;
  prompt_tokens_sum: number;
  completion_tokens_sum: number;
  cache_read_tokens_sum: number;
  cache_creation_tokens_sum: number;
  reasoning_tokens_sum: number;
  latency_ms_sum: number;
  latency_ms_max: number;
  cost_estimate_sum: number | null;
}

export interface OverviewSlice {
  totalCalls: number;
  totalTokens: number;
  cacheHitRate: number;
  reasoningTokens: number;
  avgLatencyMs: number;
  errorRate: number;
}

export type TimeRangeKey = "today" | "3d" | "7d" | "14d" | "30d" | "90d" | "mtd";

export type TimeRange =
  | TimeRangeKey
  | { fromUtc: number; toUtc: number };

export type Bucket = "hour" | "day" | "week";

export type GroupBy = "profile" | "model" | "provider";

export interface SeriesPoint {
  bucket: number;
  group: string;
  tokens: number;
  calls: number;
}

export interface BreakdownRow {
  name: string;
  calls: number;
  tokens: number;
  errors: number;
  avg_latency_ms: number;
  cache_hit_rate: number;
}

export interface SessionRow {
  session_id: string;
  started_utc: number;
  ended_utc: number | null;
  calls: number;
  tokens: number;
  profile: string;
  models: string;
  avg_latency_ms: number;
  errors: number;
  inferred: boolean;
}

export interface EventFilter {
  range: TimeRange;
  profiles?: string[];
  models?: string[];
  providers?: string[];
  errorState?: "any" | "success" | "error";
}

export interface EventsPage {
  rows: UsageEvent[];
  nextCursor: string | null;
}

export interface StorageInfo {
  sqliteBytes: number;
  jsonlBytes: number;
  totalBytes: number;
  warnThresholdMb: number;
  exceedsWarn: boolean;
}

export interface EnvSnippet {
  shell: "bash-zsh" | "powershell" | "cmd";
  text: string;
}

export interface ProviderEnvCard {
  provider: string;
  snippets: EnvSnippet[];
  caPath: string;
  proxyUrl: string;
}

export interface EnableProxyResult {
  ok: true;
  port: number;
  caFingerprint: string;
  caPath: string;
}

export interface EnableProxyError {
  ok: false;
  code: InsightsErrorCode;
  message: string;
}

export type EnableProxyResponse = EnableProxyResult | EnableProxyError;
