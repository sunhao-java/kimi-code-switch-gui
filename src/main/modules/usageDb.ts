import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  BreakdownRow,
  Bucket,
  DailyAggregate,
  EventFilter,
  EventsPage,
  GroupBy,
  OverviewSlice,
  SeriesPoint,
  SessionRow,
  TimeRange,
  UsageEvent,
} from "@shared/usageTypes";
import { resolveHome } from "./fileAccess";

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at_utc INTEGER NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS events (
  request_id TEXT NOT NULL PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS daily_aggregate (
  day_utc TEXT NOT NULL,
  profile TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens_sum INTEGER NOT NULL DEFAULT 0,
  completion_tokens_sum INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens_sum INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens_sum INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens_sum INTEGER NOT NULL DEFAULT 0,
  latency_ms_sum INTEGER NOT NULL DEFAULT 0,
  latency_ms_max INTEGER NOT NULL DEFAULT 0,
  cost_estimate_sum REAL,
  PRIMARY KEY (day_utc, profile, provider, model)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_agg_day ON daily_aggregate (day_utc);

CREATE TABLE IF NOT EXISTS ingest_state (
  source_path TEXT NOT NULL PRIMARY KEY,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  inode_signature TEXT,
  last_ingested_utc INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok'
);

CREATE TRIGGER IF NOT EXISTS trg_events_aggregate
AFTER INSERT ON events
BEGIN
  INSERT INTO daily_aggregate (
    day_utc, profile, provider, model,
    call_count, error_count,
    prompt_tokens_sum, completion_tokens_sum,
    cache_read_tokens_sum, cache_creation_tokens_sum, reasoning_tokens_sum,
    latency_ms_sum, latency_ms_max
  ) VALUES (
    strftime('%Y-%m-%d', NEW.ts / 1000, 'unixepoch'),
    NEW.profile, NEW.provider, NEW.model,
    1, CASE WHEN NEW.error_code IS NULL THEN 0 ELSE 1 END,
    NEW.prompt_tokens, NEW.completion_tokens,
    NEW.cache_read_tokens, NEW.cache_creation_tokens, NEW.reasoning_tokens,
    NEW.latency_ms, NEW.latency_ms
  )
  ON CONFLICT(day_utc, profile, provider, model) DO UPDATE SET
    call_count = call_count + 1,
    error_count = error_count + CASE WHEN NEW.error_code IS NULL THEN 0 ELSE 1 END,
    prompt_tokens_sum = prompt_tokens_sum + NEW.prompt_tokens,
    completion_tokens_sum = completion_tokens_sum + NEW.completion_tokens,
    cache_read_tokens_sum = cache_read_tokens_sum + NEW.cache_read_tokens,
    cache_creation_tokens_sum = cache_creation_tokens_sum + NEW.cache_creation_tokens,
    reasoning_tokens_sum = reasoning_tokens_sum + NEW.reasoning_tokens,
    latency_ms_sum = latency_ms_sum + NEW.latency_ms,
    latency_ms_max = MAX(latency_ms_max, NEW.latency_ms);
END;
`;

export interface UsageDbOptions {
  dbPath: string;
}

interface RangeBounds {
  fromMs: number;
  toMs: number;
  fromDay: string;
  toDay: string;
}

export class UsageDb {
  private db: Database.Database;

  static async open(options: UsageDbOptions): Promise<UsageDb> {
    const resolved = resolveHome(options.dbPath);
    await mkdir(dirname(resolved), { recursive: true });
    return new UsageDb(resolved);
  }

  private constructor(resolvedPath: string) {
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
    const row = this.db.prepare("SELECT MAX(version) AS version FROM schema_versions").get() as
      | { version: number | null }
      | undefined;
    const current = row?.version ?? 0;
    if (current < SCHEMA_VERSION) {
      this.db
        .prepare("INSERT INTO schema_versions(version, applied_at_utc, description) VALUES (?, ?, ?)")
        .run(SCHEMA_VERSION, Date.now(), "initial schema");
    }
  }

  insertEvent(event: UsageEvent): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (
        request_id, ts, ts_end, profile, provider, model,
        prompt_tokens, completion_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
        latency_ms, proxy_overhead_ms, error_code, error_message, http_status,
        session_hint, cost_estimate, pricing_version, metadata_json, ingested_at_utc
      ) VALUES (
        @request_id, @ts, @ts_end, @profile, @provider, @model,
        @prompt_tokens, @completion_tokens, @cache_read_tokens, @cache_creation_tokens, @reasoning_tokens,
        @latency_ms, @proxy_overhead_ms, @error_code, @error_message, @http_status,
        @session_hint, @cost_estimate, @pricing_version, @metadata_json, @ingested_at_utc
      )
    `);
    const result = stmt.run({
      ...event,
      ingested_at_utc: Date.now(),
    });
    return result.changes > 0;
  }

  insertEventsBatch(events: UsageEvent[]): number {
    if (events.length === 0) return 0;
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO events (
        request_id, ts, ts_end, profile, provider, model,
        prompt_tokens, completion_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens,
        latency_ms, proxy_overhead_ms, error_code, error_message, http_status,
        session_hint, cost_estimate, pricing_version, metadata_json, ingested_at_utc
      ) VALUES (
        @request_id, @ts, @ts_end, @profile, @provider, @model,
        @prompt_tokens, @completion_tokens, @cache_read_tokens, @cache_creation_tokens, @reasoning_tokens,
        @latency_ms, @proxy_overhead_ms, @error_code, @error_message, @http_status,
        @session_hint, @cost_estimate, @pricing_version, @metadata_json, @ingested_at_utc
      )
    `);
    const now = Date.now();
    const tx = this.db.transaction((rows: UsageEvent[]) => {
      let inserted = 0;
      for (const row of rows) {
        const r = insert.run({ ...row, ingested_at_utc: now });
        inserted += r.changes;
      }
      return inserted;
    });
    return tx(events);
  }

  getEventCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  queryOverview(range: TimeRange): OverviewSlice {
    const bounds = computeBounds(range);
    const row = this.db
      .prepare(
        `
        SELECT
          COALESCE(SUM(call_count), 0) AS calls,
          COALESCE(SUM(prompt_tokens_sum + completion_tokens_sum + cache_read_tokens_sum
            + cache_creation_tokens_sum + reasoning_tokens_sum), 0) AS tokens,
          COALESCE(SUM(cache_read_tokens_sum), 0) AS cache_read,
          COALESCE(SUM(prompt_tokens_sum + cache_read_tokens_sum), 0) AS cache_input,
          COALESCE(SUM(reasoning_tokens_sum), 0) AS reasoning,
          COALESCE(SUM(latency_ms_sum), 0) AS latency_sum,
          COALESCE(SUM(error_count), 0) AS errors
        FROM daily_aggregate
        WHERE day_utc BETWEEN @from_day AND @to_day
      `,
      )
      .get({ from_day: bounds.fromDay, to_day: bounds.toDay }) as
      | {
          calls: number;
          tokens: number;
          cache_read: number;
          cache_input: number;
          reasoning: number;
          latency_sum: number;
          errors: number;
        }
      | undefined;

    const calls = row?.calls ?? 0;
    return {
      totalCalls: calls,
      totalTokens: row?.tokens ?? 0,
      cacheHitRate: row && row.cache_input > 0 ? row.cache_read / row.cache_input : 0,
      reasoningTokens: row?.reasoning ?? 0,
      avgLatencyMs: calls > 0 ? (row?.latency_sum ?? 0) / calls : 0,
      errorRate: calls > 0 ? (row?.errors ?? 0) / calls : 0,
    };
  }

  queryTrend(range: TimeRange, bucket: Bucket, groupBy: GroupBy | null): SeriesPoint[] {
    const bounds = computeBounds(range);
    if (bucket === "hour") {
      const groupSql = groupBy === "profile" ? "profile" : groupBy === "model" ? "model" : groupBy === "provider" ? "provider" : "''";
      const rows = this.db
        .prepare(
          `
          SELECT
            (ts / 3600000) * 3600000 AS bucket,
            ${groupSql} AS grp,
            SUM(prompt_tokens + completion_tokens + cache_read_tokens
              + cache_creation_tokens + reasoning_tokens) AS tokens,
            COUNT(*) AS calls
          FROM events
          WHERE ts >= @from_ms AND ts < @to_ms
          GROUP BY bucket, grp
          ORDER BY bucket
        `,
        )
        .all({ from_ms: bounds.fromMs, to_ms: bounds.toMs }) as Array<{
        bucket: number;
        grp: string;
        tokens: number;
        calls: number;
      }>;
      return rows.map((r) => ({ bucket: r.bucket, group: r.grp ?? "", tokens: r.tokens, calls: r.calls }));
    }

    const groupCol = groupBy === "profile" ? "profile" : groupBy === "model" ? "model" : groupBy === "provider" ? "provider" : "''";
    const rows = this.db
      .prepare(
        `
        SELECT
          day_utc AS bucket,
          ${groupCol} AS grp,
          SUM(prompt_tokens_sum + completion_tokens_sum + cache_read_tokens_sum
            + cache_creation_tokens_sum + reasoning_tokens_sum) AS tokens,
          SUM(call_count) AS calls
        FROM daily_aggregate
        WHERE day_utc BETWEEN @from_day AND @to_day
        GROUP BY day_utc, grp
        ORDER BY day_utc
      `,
      )
      .all({ from_day: bounds.fromDay, to_day: bounds.toDay }) as Array<{
      bucket: string;
      grp: string;
      tokens: number;
      calls: number;
    }>;
    return rows.map((r) => ({
      bucket: dayStringToMs(r.bucket),
      group: r.grp ?? "",
      tokens: r.tokens,
      calls: r.calls,
    }));
  }

  queryBreakdown(dim: "profile" | "model", range: TimeRange, limit: number, orderBy: BreakdownOrder): BreakdownRow[] {
    const bounds = computeBounds(range);
    const orderCol = ORDER_COLUMN_MAP[orderBy];
    const rows = this.db
      .prepare(
        `
        SELECT
          ${dim} AS name,
          SUM(call_count) AS calls,
          SUM(prompt_tokens_sum + completion_tokens_sum + cache_read_tokens_sum
            + cache_creation_tokens_sum + reasoning_tokens_sum) AS tokens,
          SUM(error_count) AS errors,
          CAST(SUM(latency_ms_sum) AS REAL) / NULLIF(SUM(call_count), 0) AS avg_latency_ms,
          CAST(SUM(cache_read_tokens_sum) AS REAL)
            / NULLIF(SUM(prompt_tokens_sum + cache_read_tokens_sum), 0) AS cache_hit_rate
        FROM daily_aggregate
        WHERE day_utc BETWEEN @from_day AND @to_day
        GROUP BY ${dim}
        ORDER BY ${orderCol} DESC
        LIMIT @limit
      `,
      )
      .all({ from_day: bounds.fromDay, to_day: bounds.toDay, limit: Math.max(1, Math.min(50, limit)) }) as Array<{
      name: string;
      calls: number;
      tokens: number;
      errors: number;
      avg_latency_ms: number | null;
      cache_hit_rate: number | null;
    }>;
    return rows.map((r) => ({
      name: r.name ?? "",
      calls: r.calls ?? 0,
      tokens: r.tokens ?? 0,
      errors: r.errors ?? 0,
      avg_latency_ms: r.avg_latency_ms ?? 0,
      cache_hit_rate: r.cache_hit_rate ?? 0,
    }));
  }

  queryHeaviestSessions(range: TimeRange, limit: number): SessionRow[] {
    const bounds = computeBounds(range);
    const cap = Math.max(1, Math.min(50, limit));
    const rows = this.db
      .prepare(
        `
        SELECT
          session_hint AS session_id,
          MIN(ts) AS started_utc,
          MAX(ts_end) AS ended_utc,
          COUNT(*) AS calls,
          SUM(prompt_tokens + completion_tokens + cache_read_tokens
            + cache_creation_tokens + reasoning_tokens) AS tokens,
          (SELECT profile FROM events e2 WHERE e2.session_hint = ue.session_hint ORDER BY ts LIMIT 1) AS profile,
          GROUP_CONCAT(DISTINCT model) AS models,
          CAST(AVG(latency_ms) AS INTEGER) AS avg_latency_ms,
          SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors
        FROM events ue
        WHERE ts >= @from_ms AND ts < @to_ms AND session_hint IS NOT NULL
        GROUP BY session_hint
        ORDER BY tokens DESC
        LIMIT @limit
      `,
      )
      .all({ from_ms: bounds.fromMs, to_ms: bounds.toMs, limit: cap }) as Array<{
      session_id: string;
      started_utc: number;
      ended_utc: number | null;
      calls: number;
      tokens: number;
      profile: string;
      models: string | null;
      avg_latency_ms: number;
      errors: number;
    }>;
    return rows.map((r) => ({
      session_id: r.session_id,
      started_utc: r.started_utc,
      ended_utc: r.ended_utc,
      calls: r.calls,
      tokens: r.tokens,
      profile: r.profile ?? "",
      models: r.models ?? "",
      avg_latency_ms: r.avg_latency_ms ?? 0,
      errors: r.errors ?? 0,
      inferred: false,
    }));
  }

  queryEvents(filter: EventFilter, cursor: string | null, pageSize: number): EventsPage {
    const bounds = computeBounds(filter.range);
    const size = Math.max(1, Math.min(200, pageSize));
    const conditions: string[] = ["ts >= @from_ms", "ts < @to_ms"];
    const params: Record<string, number | string> = { from_ms: bounds.fromMs, to_ms: bounds.toMs };

    const decodedCursor = decodeCursor(cursor);
    if (decodedCursor) {
      conditions.push("(ts < @cursor_ts OR (ts = @cursor_ts AND request_id < @cursor_id))");
      params.cursor_ts = decodedCursor.ts;
      params.cursor_id = decodedCursor.id;
    }

    if (filter.profiles?.length) {
      const placeholders = filter.profiles.map((_, i) => `@p_${i}`).join(",");
      conditions.push(`profile IN (${placeholders})`);
      filter.profiles.forEach((v, i) => {
        params[`p_${i}`] = v;
      });
    }
    if (filter.models?.length) {
      const placeholders = filter.models.map((_, i) => `@m_${i}`).join(",");
      conditions.push(`model IN (${placeholders})`);
      filter.models.forEach((v, i) => {
        params[`m_${i}`] = v;
      });
    }
    if (filter.providers?.length) {
      const placeholders = filter.providers.map((_, i) => `@pr_${i}`).join(",");
      conditions.push(`provider IN (${placeholders})`);
      filter.providers.forEach((v, i) => {
        params[`pr_${i}`] = v;
      });
    }
    if (filter.errorState === "error") {
      conditions.push("error_code IS NOT NULL");
    } else if (filter.errorState === "success") {
      conditions.push("error_code IS NULL");
    }

    const sql = `
      SELECT * FROM events
      WHERE ${conditions.join(" AND ")}
      ORDER BY ts DESC, request_id DESC
      LIMIT @limit
    `;
    params.limit = size + 1;

    const rows = this.db.prepare(sql).all(params) as UsageEvent[];
    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.ts, last.request_id) : null;
    return { rows: page, nextCursor };
  }

  countEvents(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
    return row.n;
  }

  pruneOldEvents(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = this.db.prepare("DELETE FROM events WHERE ts < ?").run(cutoff);
    return result.changes;
  }

  purgeAll(): void {
    this.db.exec(`
      DELETE FROM events;
      DELETE FROM daily_aggregate;
      DELETE FROM ingest_state;
    `);
  }

  getDailyAggregates(range: TimeRange): DailyAggregate[] {
    const bounds = computeBounds(range);
    return this.db
      .prepare(
        `SELECT * FROM daily_aggregate WHERE day_utc BETWEEN @from_day AND @to_day ORDER BY day_utc, profile, provider, model`,
      )
      .all({ from_day: bounds.fromDay, to_day: bounds.toDay }) as DailyAggregate[];
  }

  getIngestState(sourcePath: string): { byteOffset: number; inodeSignature: string | null } | null {
    const row = this.db
      .prepare("SELECT byte_offset, inode_signature FROM ingest_state WHERE source_path = ?")
      .get(sourcePath) as { byte_offset: number; inode_signature: string | null } | undefined;
    if (!row) return null;
    return { byteOffset: row.byte_offset, inodeSignature: row.inode_signature };
  }

  setIngestState(sourcePath: string, byteOffset: number, inodeSignature: string | null, status = "ok"): void {
    this.db
      .prepare(
        `
        INSERT INTO ingest_state (source_path, byte_offset, inode_signature, last_ingested_utc, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_path) DO UPDATE SET
          byte_offset = excluded.byte_offset,
          inode_signature = excluded.inode_signature,
          last_ingested_utc = excluded.last_ingested_utc,
          status = excluded.status
      `,
      )
      .run(sourcePath, byteOffset, inodeSignature, Date.now(), status);
  }

  close(): void {
    this.db.close();
  }
}

export type BreakdownOrder = "tokens" | "calls" | "errors" | "avg_latency_ms" | "cache_hit_rate";
const ORDER_COLUMN_MAP: Record<BreakdownOrder, string> = {
  tokens: "tokens",
  calls: "calls",
  errors: "errors",
  avg_latency_ms: "avg_latency_ms",
  cache_hit_rate: "cache_hit_rate",
};

function computeBounds(range: TimeRange): RangeBounds {
  const now = Date.now();
  if (typeof range === "string") {
    const DAY = 24 * 60 * 60 * 1000;
    switch (range) {
      case "today": {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        return makeBounds(todayStart.getTime(), now);
      }
      case "3d": return makeBounds(now - 3 * DAY, now);
      case "7d": return makeBounds(now - 7 * DAY, now);
      case "14d": return makeBounds(now - 14 * DAY, now);
      case "30d": return makeBounds(now - 30 * DAY, now);
      case "90d": return makeBounds(now - 90 * DAY, now);
      case "mtd": {
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        return makeBounds(monthStart.getTime(), now);
      }
    }
  }
  return makeBounds(range.fromUtc, range.toUtc);
}

function makeBounds(fromMs: number, toMs: number): RangeBounds {
  return {
    fromMs,
    toMs,
    fromDay: msToDayString(fromMs),
    toDay: msToDayString(toMs),
  };
}

function msToDayString(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayStringToMs(day: string): number {
  return new Date(`${day}T00:00:00.000Z`).getTime();
}

function encodeCursor(ts: number, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id }), "utf-8").toString("base64");
}

function decodeCursor(cursor: string | null): { ts: number; id: string } | null {
  if (!cursor) return null;
  try {
    const obj = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8")) as { ts: number; id: string };
    if (typeof obj.ts !== "number" || typeof obj.id !== "string") return null;
    return obj;
  } catch {
    return null;
  }
}

export const __test = { computeBounds, msToDayString, encodeCursor, decodeCursor };
