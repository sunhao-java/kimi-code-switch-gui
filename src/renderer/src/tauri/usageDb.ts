// 用量洞察 SQLite 前端适配：SQL 与时间/游标逻辑（移植自 main/modules/usageDb.ts）
// 全部在 renderer 跑，通过 Rust 的 usage_* 命令操作 SQLite 连接。
import { invoke } from "@tauri-apps/api/core";

import type {
  BreakdownRow,
  Bucket,
  EventFilter,
  EventsPage,
  GroupBy,
  OverviewSlice,
  SeriesPoint,
  SessionRow,
  TimeRange,
  UsageEvent,
} from "@shared/usageTypes";

type Params = Record<string, string | number | null>;
type Row = Record<string, unknown>;

const SCHEMA_VERSION = 1;
const DEFAULT_ENVIRONMENT_ID = "default";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at_utc INTEGER NOT NULL,
  description TEXT
);
CREATE TABLE IF NOT EXISTS events (
  request_id TEXT NOT NULL PRIMARY KEY,
  kimi_code_environment_id TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL,
  ts_end INTEGER,
  profile TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  proxy_overhead_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER NOT NULL DEFAULT 0,
  session_hint TEXT,
  cost_estimate REAL,
  pricing_version TEXT,
  metadata_json TEXT,
  ingested_at_utc INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_profile_ts ON events (profile, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_model_ts ON events (model, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_error_ts ON events (error_code, ts DESC) WHERE error_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS ingest_state (
  source_path TEXT NOT NULL PRIMARY KEY,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  inode_signature TEXT,
  last_ingested_utc INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok'
);
`;

async function query(sql: string, params?: Params): Promise<Row[]> {
  return invoke<Row[]>("usage_query", { sql, params: params ?? null });
}

async function exec(sql: string, params?: Params): Promise<number> {
  return invoke<number>("usage_exec", { sql, params: params ?? null });
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// ── 时间区间计算（移植自 usageDb computeBounds）──
interface RangeBounds {
  fromMs: number;
  toMs: number;
  fromDay: string;
  toDay: string;
}

function msToDayString(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function localDayStringToMs(day: string): number {
  const [year, month, date] = day.split("-").map((part) => Number(part));
  if (!year || !month || !date) return 0;
  return new Date(year, month - 1, date).getTime();
}

function makeBounds(fromMs: number, toMs: number): RangeBounds {
  return { fromMs, toMs, fromDay: msToDayString(fromMs), toDay: msToDayString(toMs) };
}

function computeBounds(range: TimeRange): RangeBounds {
  const now = Date.now();
  if (typeof range === "string") {
    const DAY = 86400000;
    switch (range) {
      case "today": {
        const s = new Date(now);
        s.setHours(0, 0, 0, 0);
        return makeBounds(s.getTime(), now);
      }
      case "3d": return makeBounds(now - 3 * DAY, now);
      case "7d": return makeBounds(now - 7 * DAY, now);
      case "14d": return makeBounds(now - 14 * DAY, now);
      case "30d": return makeBounds(now - 30 * DAY, now);
      case "90d": return makeBounds(now - 90 * DAY, now);
      case "mtd": {
        const s = new Date(now);
        s.setDate(1);
        s.setHours(0, 0, 0, 0);
        return makeBounds(s.getTime(), now);
      }
    }
  }
  const r = range as { fromUtc: number; toUtc: number };
  return makeBounds(r.fromUtc, r.toUtc);
}

function encodeCursor(ts: number, id: string): string {
  return btoa(JSON.stringify({ ts, id }));
}

function decodeCursor(cursor: string | null): { ts: number; id: string } | null {
  if (!cursor) return null;
  try {
    const obj = JSON.parse(atob(cursor)) as { ts: number; id: string };
    return typeof obj.ts === "number" && typeof obj.id === "string" ? obj : null;
  } catch {
    return null;
  }
}

type BreakdownOrder = "tokens" | "calls" | "errors" | "avg_latency_ms" | "cache_hit_rate";
const ORDER_COLUMN_MAP: Record<BreakdownOrder, string> = {
  tokens: "tokens",
  calls: "calls",
  errors: "errors",
  avg_latency_ms: "avg_latency_ms",
  cache_hit_rate: "cache_hit_rate",
};

function addEnvironmentCondition(
  conditions: string[],
  params: Params,
  environmentId?: string,
): void {
  if (!environmentId) {
    return;
  }
  if (environmentId === DEFAULT_ENVIRONMENT_ID) {
    conditions.push("(kimi_code_environment_id = @environment_id OR kimi_code_environment_id = '')");
  } else {
    conditions.push("kimi_code_environment_id = @environment_id");
  }
  params.environment_id = environmentId;
}

function buildRangeConditions(
  range: TimeRange,
  environmentId?: string,
): { conditions: string[]; params: Params } {
  const b = computeBounds(range);
  const conditions = ["ts >= @from_ms", "ts < @to_ms"];
  const params: Params = { from_ms: b.fromMs, to_ms: b.toMs };
  addEnvironmentCondition(conditions, params, environmentId);
  return { conditions, params };
}

// ── 公开 API ──

export async function open(dbPath: string): Promise<void> {
  await invoke("usage_open", { dbPath, schemaSql: SCHEMA_SQL });
  await exec("ALTER TABLE events ADD COLUMN kimi_code_environment_id TEXT NOT NULL DEFAULT ''").catch(() => 0);
  await exec("CREATE INDEX IF NOT EXISTS idx_events_environment_ts ON events (kimi_code_environment_id, ts DESC)");
  // 清理已废弃的 daily_aggregate 聚合表与触发器（查询统一改读 events 原始表）。
  // 旧库可能残留它们，触发器仍会在每次插入时产生写开销且按 UTC 分桶与本地不一致。
  await exec("DROP TRIGGER IF EXISTS trg_events_aggregate").catch(() => 0);
  await exec("DROP TABLE IF EXISTS daily_aggregate").catch(() => 0);
  const rows = await query("SELECT MAX(version) AS version FROM schema_versions");
  const current = num(rows[0]?.version, 0);
  if (current < SCHEMA_VERSION) {
    // INSERT OR IGNORE：幂等写入，避免并发/重复 open() 时两次插入同一 version
    // 触发 UNIQUE constraint failed（首次启动 StrictMode 双调用会复现）。
    await exec(
      "INSERT OR IGNORE INTO schema_versions(version, applied_at_utc, description) VALUES (@v, @t, @d)",
      { v: SCHEMA_VERSION, t: Date.now(), d: "initial schema" },
    );
  }
}

export async function close(): Promise<void> {
  await invoke("usage_close");
}

const INSERT_SQL = `
  INSERT OR IGNORE INTO events (
    request_id, kimi_code_environment_id, ts, ts_end, profile, provider, model,
    prompt_tokens, completion_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
    latency_ms, proxy_overhead_ms, error_code, error_message, http_status,
    session_hint, cost_estimate, pricing_version, metadata_json, ingested_at_utc
  ) VALUES (
    @request_id, @kimi_code_environment_id, @ts, @ts_end, @profile, @provider, @model,
    @prompt_tokens, @completion_tokens, @cache_read_tokens, @cache_creation_tokens, @reasoning_tokens,
    @latency_ms, @proxy_overhead_ms, @error_code, @error_message, @http_status,
    @session_hint, @cost_estimate, @pricing_version, @metadata_json, @ingested_at_utc
  )
`;

function eventToParams(e: UsageEvent): Params {
  return {
    request_id: e.request_id,
    kimi_code_environment_id: e.kimi_code_environment_id ?? "",
    ts: e.ts,
    ts_end: e.ts_end,
    profile: e.profile,
    provider: e.provider,
    model: e.model,
    prompt_tokens: e.prompt_tokens,
    completion_tokens: e.completion_tokens,
    cache_read_tokens: e.cache_read_tokens,
    cache_creation_tokens: e.cache_creation_tokens,
    reasoning_tokens: e.reasoning_tokens,
    latency_ms: e.latency_ms,
    proxy_overhead_ms: e.proxy_overhead_ms,
    error_code: e.error_code,
    error_message: e.error_message,
    http_status: e.http_status,
    session_hint: e.session_hint,
    cost_estimate: e.cost_estimate,
    pricing_version: e.pricing_version,
    metadata_json: e.metadata_json,
    ingested_at_utc: Date.now(),
  };
}

function rowToUsageEvent(row: Record<string, unknown>): UsageEvent {
  return {
    request_id: String(row.request_id ?? ''),
    kimi_code_environment_id: String(row.kimi_code_environment_id ?? ''),
    ts: num(row.ts),
    ts_end: num(row.ts_end),
    profile: String(row.profile ?? ''),
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    prompt_tokens: num(row.prompt_tokens),
    completion_tokens: num(row.completion_tokens),
    cache_read_tokens: num(row.cache_read_tokens),
    cache_creation_tokens: num(row.cache_creation_tokens),
    reasoning_tokens: num(row.reasoning_tokens),
    latency_ms: num(row.latency_ms),
    proxy_overhead_ms: num(row.proxy_overhead_ms),
    error_code: row.error_code != null ? String(row.error_code) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    http_status: row.http_status != null ? num(row.http_status) : null,
    session_hint: row.session_hint != null ? String(row.session_hint) : null,
    cost_estimate: row.cost_estimate != null ? num(row.cost_estimate) : null,
    pricing_version: row.pricing_version != null ? String(row.pricing_version) : null,
    metadata_json: row.metadata_json != null ? String(row.metadata_json) : null,
  };
}

export async function insertEvent(event: UsageEvent): Promise<boolean> {
  const changes = await exec(INSERT_SQL, eventToParams(event));
  return changes > 0;
}

export async function insertEventsBatch(events: UsageEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const now = Date.now();
  // 复用 eventToParams 以保证与 insertEvent 一致的默认值处理（如 kimi_code_environment_id ?? ""），
  // 避免缺字段导致 NOT NULL 命名参数缺失；ingested_at_utc 统一为同一批次时间。
  const rows = events.map((e) => ({ ...eventToParams(e), ingested_at_utc: now }));
  return invoke<number>("usage_exec_batch", { sql: INSERT_SQL, rows });
}

export async function getEventCount(): Promise<number> {
  const rows = await query("SELECT COUNT(*) AS cnt FROM events");
  return num(rows[0]?.cnt);
}

export async function queryOverview(range: TimeRange, environmentId?: string): Promise<OverviewSlice> {
  const { conditions, params } = buildRangeConditions(range, environmentId);
  const rows = await query(
    `SELECT
       COUNT(*) AS calls,
       COALESCE(SUM(prompt_tokens+completion_tokens+cache_read_tokens+cache_creation_tokens+reasoning_tokens),0) AS tokens,
       COALESCE(SUM(cache_read_tokens),0) AS cache_read,
       COALESCE(SUM(prompt_tokens+cache_read_tokens),0) AS cache_input,
       COALESCE(SUM(reasoning_tokens),0) AS reasoning,
       COALESCE(SUM(latency_ms),0) AS latency_sum,
       COALESCE(SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END),0) AS errors
     FROM events WHERE ${conditions.join(" AND ")}`,
    params,
  );
  const r = rows[0] ?? {};
  const calls = num(r.calls);
  const cacheInput = num(r.cache_input);
  return {
    totalCalls: calls,
    totalTokens: num(r.tokens),
    cacheHitRate: cacheInput > 0 ? num(r.cache_read) / cacheInput : 0,
    reasoningTokens: num(r.reasoning),
    avgLatencyMs: calls > 0 ? num(r.latency_sum) / calls : 0,
    errorRate: calls > 0 ? num(r.errors) / calls : 0,
  };
}

export async function queryTrend(range: TimeRange, bucket: Bucket, groupBy: GroupBy | null, environmentId?: string): Promise<SeriesPoint[]> {
  const { conditions, params } = buildRangeConditions(range, environmentId);
  const groupCol = groupBy === "profile" ? "profile" : groupBy === "model" ? "model" : groupBy === "provider" ? "provider" : "''";
  if (bucket === "hour") {
    const rows = await query(
      `SELECT (ts/3600000)*3600000 AS bucket, ${groupCol} AS grp,
         SUM(prompt_tokens+completion_tokens+cache_read_tokens+cache_creation_tokens+reasoning_tokens) AS tokens,
         COUNT(*) AS calls
       FROM events WHERE ${conditions.join(" AND ")}
       GROUP BY bucket, grp ORDER BY bucket`,
      params,
    );
    return rows.map((r) => ({ bucket: num(r.bucket), group: str(r.grp), tokens: num(r.tokens), calls: num(r.calls) }));
  }
  const rows = await query(
    `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS bucket, ${groupCol} AS grp,
       SUM(prompt_tokens+completion_tokens+cache_read_tokens+cache_creation_tokens+reasoning_tokens) AS tokens,
       COUNT(*) AS calls
     FROM events WHERE ${conditions.join(" AND ")}
     GROUP BY bucket, grp ORDER BY bucket`,
    params,
  );
  return rows.map((r) => ({ bucket: localDayStringToMs(str(r.bucket)), group: str(r.grp), tokens: num(r.tokens), calls: num(r.calls) }));
}

export async function queryBreakdown(dim: "profile" | "model", range: TimeRange, limit: number, orderBy: BreakdownOrder, environmentId?: string): Promise<BreakdownRow[]> {
  const { conditions, params } = buildRangeConditions(range, environmentId);
  const orderCol = ORDER_COLUMN_MAP[orderBy];
  params.limit = Math.max(1, Math.min(50, limit));
  const rows = await query(
    `SELECT ${dim} AS name, COUNT(*) AS calls,
       SUM(prompt_tokens+completion_tokens+cache_read_tokens+cache_creation_tokens+reasoning_tokens) AS tokens,
       SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors,
       CAST(SUM(latency_ms) AS REAL)/NULLIF(COUNT(*),0) AS avg_latency_ms,
       CAST(SUM(cache_read_tokens) AS REAL)/NULLIF(SUM(prompt_tokens+cache_read_tokens),0) AS cache_hit_rate
     FROM events WHERE ${conditions.join(" AND ")}
     GROUP BY ${dim} ORDER BY ${orderCol} DESC LIMIT @limit`,
    params,
  );
  return rows.map((r) => ({
    name: str(r.name),
    calls: num(r.calls),
    tokens: num(r.tokens),
    errors: num(r.errors),
    avg_latency_ms: num(r.avg_latency_ms),
    cache_hit_rate: num(r.cache_hit_rate),
  }));
}

/**
 * Per-model token-type sums over a range, optionally bucketed by day. Returned
 * rows carry the raw token dimensions so the caller can compute cost at read
 * time with the model's *current* pricing (cost is never read from a stored
 * value). `day` is an empty string when `byDay` is false.
 */
export interface ModelTokenSums {
  model: string;
  day: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
}

export async function queryModelTokenSums(range: TimeRange, byDay: boolean, environmentId?: string): Promise<ModelTokenSums[]> {
  const { conditions, params } = buildRangeConditions(range, environmentId);
  const rows = await query(
    `SELECT model AS model, ${byDay ? "strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime')" : "''"} AS day,
       SUM(prompt_tokens) AS prompt_tokens,
       SUM(completion_tokens) AS completion_tokens,
       SUM(cache_read_tokens) AS cache_read_tokens,
       SUM(cache_creation_tokens) AS cache_creation_tokens,
       SUM(reasoning_tokens) AS reasoning_tokens
     FROM events WHERE ${conditions.join(" AND ")}
     GROUP BY model${byDay ? ", day" : ""}`,
    params,
  );
  return rows.map((r) => ({
    model: str(r.model),
    day: str(r.day),
    prompt_tokens: num(r.prompt_tokens),
    completion_tokens: num(r.completion_tokens),
    cache_read_tokens: num(r.cache_read_tokens),
    cache_creation_tokens: num(r.cache_creation_tokens),
    reasoning_tokens: num(r.reasoning_tokens),
  }));
}

export async function queryHeaviestSessions(range: TimeRange, limit: number, environmentId?: string): Promise<SessionRow[]> {
  const { conditions, params } = buildRangeConditions(range, environmentId);
  params.limit = Math.max(1, Math.min(50, limit));
  const environmentJoinCondition = environmentId === DEFAULT_ENVIRONMENT_ID
    ? " AND (e2.kimi_code_environment_id = @environment_id OR e2.kimi_code_environment_id = '')"
    : environmentId
      ? " AND e2.kimi_code_environment_id = @environment_id"
      : "";
  const rows = await query(
    `SELECT session_hint AS session_id, MIN(ts) AS started_utc, MAX(ts_end) AS ended_utc,
       COUNT(*) AS calls,
       SUM(prompt_tokens+completion_tokens+cache_read_tokens+cache_creation_tokens+reasoning_tokens) AS tokens,
       (SELECT profile FROM events e2 WHERE e2.session_hint = ue.session_hint${environmentJoinCondition} ORDER BY ts LIMIT 1) AS profile,
       GROUP_CONCAT(DISTINCT model) AS models,
       CAST(AVG(latency_ms) AS INTEGER) AS avg_latency_ms,
       SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors
     FROM events ue WHERE ${conditions.join(" AND ")} AND session_hint IS NOT NULL
     GROUP BY session_hint ORDER BY tokens DESC LIMIT @limit`,
    params,
  );
  return rows.map((r) => ({
    session_id: str(r.session_id),
    started_utc: num(r.started_utc),
    ended_utc: r.ended_utc === null ? null : num(r.ended_utc),
    calls: num(r.calls),
    tokens: num(r.tokens),
    profile: str(r.profile),
    models: str(r.models),
    avg_latency_ms: num(r.avg_latency_ms),
    errors: num(r.errors),
    inferred: false,
  }));
}

export async function queryEvents(filter: EventFilter, cursor: string | null, pageSize: number, environmentId?: string): Promise<EventsPage> {
  const b = computeBounds(filter.range);
  const size = Math.max(1, Math.min(200, pageSize));
  const conditions = ["ts >= @from_ms", "ts < @to_ms"];
  const params: Params = { from_ms: b.fromMs, to_ms: b.toMs };
  addEnvironmentCondition(conditions, params, environmentId);

  const dc = decodeCursor(cursor);
  if (dc) {
    conditions.push("(ts < @cursor_ts OR (ts = @cursor_ts AND request_id < @cursor_id))");
    params.cursor_ts = dc.ts;
    params.cursor_id = dc.id;
  }
  const addIn = (vals: string[] | undefined, col: string, prefix: string): void => {
    if (!vals?.length) return;
    conditions.push(`${col} IN (${vals.map((_, i) => `@${prefix}_${i}`).join(",")})`);
    vals.forEach((v, i) => { params[`${prefix}_${i}`] = v; });
  };
  addIn(filter.profiles, "profile", "p");
  addIn(filter.models, "model", "m");
  addIn(filter.providers, "provider", "pr");
  if (filter.errorState === "error") conditions.push("error_code IS NOT NULL");
  else if (filter.errorState === "success") conditions.push("error_code IS NULL");

  params.limit = size + 1;
  const rows = await query(
    `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY ts DESC, request_id DESC LIMIT @limit`,
    params,
  );
  const hasMore = rows.length > size;
  const page = (hasMore ? rows.slice(0, size) : rows).map(rowToUsageEvent);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.ts, last.request_id) : null;
  return { rows: page, nextCursor };
}

export async function pruneOldEvents(retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 86400000;
  return exec("DELETE FROM events WHERE ts < @cutoff", { cutoff });
}

export async function purgeAll(): Promise<void> {
  await invoke("usage_exec_script", {
    sql: "DELETE FROM events; DELETE FROM ingest_state;",
  });
}

export async function getIngestState(sourcePath: string): Promise<{ byteOffset: number; inodeSignature: string | null } | null> {
  const rows = await query("SELECT byte_offset, inode_signature FROM ingest_state WHERE source_path = @p", { p: sourcePath });
  if (!rows[0]) return null;
  return { byteOffset: num(rows[0].byte_offset), inodeSignature: (rows[0].inode_signature as string | null) ?? null };
}

export async function setIngestState(sourcePath: string, byteOffset: number, inodeSignature: string | null, status = "ok"): Promise<void> {
  await exec(
    `INSERT INTO ingest_state (source_path, byte_offset, inode_signature, last_ingested_utc, status)
     VALUES (@p, @o, @sig, @t, @st)
     ON CONFLICT(source_path) DO UPDATE SET
       byte_offset=excluded.byte_offset, inode_signature=excluded.inode_signature,
       last_ingested_utc=excluded.last_ingested_utc, status=excluded.status`,
    { p: sourcePath, o: byteOffset, sig: inodeSignature, t: Date.now(), st: status },
  );
}
