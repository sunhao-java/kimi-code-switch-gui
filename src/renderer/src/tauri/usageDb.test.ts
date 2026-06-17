import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsageEvent } from "@shared/usageTypes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  SCHEMA_SQL,
  getEventCount,
  getIngestState,
  insertEvent,
  insertEventsBatch,
  open,
  pruneOldEvents,
  purgeAll,
  queryBreakdown,
  queryEvents,
  queryHeaviestSessions,
  queryModelTokenSums,
  queryOverview,
  queryTrend,
  setIngestState,
} from "./usageDb";

const mockedInvoke = vi.mocked(invoke);

function lastQuery(command: string): { sql: string; params: Record<string, unknown> | null } {
  const call = [...mockedInvoke.mock.calls].reverse().find((c) => c[0] === command);
  if (!call) throw new Error(`no invoke for ${command}`);
  return call[1] as { sql: string; params: Record<string, unknown> | null };
}

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    request_id: "req-1",
    kimi_code_environment_id: "",
    ts: 1700000000000,
    ts_end: null,
    profile: "default",
    provider: "kimi",
    model: "k2",
    prompt_tokens: 10,
    completion_tokens: 20,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    reasoning_tokens: 0,
    latency_ms: 100,
    proxy_overhead_ms: 0,
    error_code: null,
    error_message: null,
    http_status: 200,
    session_hint: "sess-1",
    cost_estimate: null,
    pricing_version: null,
    metadata_json: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInvoke.mockResolvedValue([] as unknown as never);
});

describe("open", () => {
  it("keeps environment index creation out of the bootstrap schema for legacy events tables", () => {
    expect(SCHEMA_SQL).not.toContain("idx_events_environment_ts");
  });

  it("opens the db with schema and applies the schema version when missing", async () => {
    mockedInvoke
      .mockResolvedValueOnce(undefined as unknown as never) // usage_open
      .mockResolvedValueOnce(0 as unknown as never) // ALTER environment column
      .mockResolvedValueOnce(0 as unknown as never) // CREATE environment index
      .mockResolvedValueOnce(0 as unknown as never) // DROP TRIGGER trg_events_aggregate
      .mockResolvedValueOnce(0 as unknown as never) // DROP TABLE daily_aggregate
      .mockResolvedValueOnce([{ version: null }] as unknown as never) // SELECT MAX(version)
      .mockResolvedValueOnce(1 as unknown as never); // usage_exec INSERT
    await open("/tmp/usage.db");

    expect(mockedInvoke).toHaveBeenCalledWith("usage_open", { dbPath: "/tmp/usage.db", schemaSql: SCHEMA_SQL });
    const insert = lastQuery("usage_exec");
    expect(insert.sql).toMatch(/INSERT OR IGNORE INTO schema_versions/);
    expect(insert.params).toMatchObject({ v: 1, d: "initial schema" });
  });

  it("skips schema version insert when already current", async () => {
    mockedInvoke
      .mockResolvedValueOnce(undefined as unknown as never)
      .mockResolvedValueOnce(0 as unknown as never)
      .mockResolvedValueOnce(0 as unknown as never)
      .mockResolvedValueOnce(0 as unknown as never) // DROP TRIGGER trg_events_aggregate
      .mockResolvedValueOnce(0 as unknown as never) // DROP TABLE daily_aggregate
      .mockResolvedValueOnce([{ version: 1 }] as unknown as never);
    await open("/tmp/usage.db");
    const schemaVersionInserts = mockedInvoke.mock.calls.filter((call) =>
      call[0] === "usage_exec"
      && typeof call[1]?.sql === "string"
      && call[1].sql.includes("INSERT OR IGNORE INTO schema_versions"),
    );
    expect(schemaVersionInserts).toHaveLength(0);
  });
});

describe("insertEvent / insertEventsBatch", () => {
  it("maps an event onto named params and reports inserted=true when rows change", async () => {
    mockedInvoke.mockResolvedValue(1 as unknown as never);
    const inserted = await insertEvent(event({ request_id: "abc", kimi_code_environment_id: "env-2" }));
    expect(inserted).toBe(true);

    const call = lastQuery("usage_exec");
    expect(call.sql).toMatch(/INSERT OR IGNORE INTO events/);
    expect(call.params).toMatchObject({ request_id: "abc", kimi_code_environment_id: "env-2", prompt_tokens: 10 });
    expect((call.params as Record<string, unknown>).ingested_at_utc).toEqual(expect.any(Number));
  });

  it("reports inserted=false when no rows change (duplicate)", async () => {
    mockedInvoke.mockResolvedValue(0 as unknown as never);
    await expect(insertEvent(event())).resolves.toBe(false);
  });

  it("short-circuits an empty batch without invoking", async () => {
    await expect(insertEventsBatch([])).resolves.toBe(0);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("passes rows with a shared ingested timestamp to usage_exec_batch", async () => {
    mockedInvoke.mockResolvedValue(2 as unknown as never);
    await insertEventsBatch([event({ request_id: "a" }), event({ request_id: "b" })]);
    const call = mockedInvoke.mock.calls.find((c) => c[0] === "usage_exec_batch")![1] as {
      rows: Array<{ ingested_at_utc: number }>;
    };
    expect(call.rows).toHaveLength(2);
    expect(call.rows[0].ingested_at_utc).toBe(call.rows[1].ingested_at_utc);
  });
});

describe("getEventCount", () => {
  it("maps the COUNT(*) result", async () => {
    mockedInvoke.mockResolvedValue([{ cnt: 42 }] as unknown as never);
    await expect(getEventCount()).resolves.toBe(42);
  });
});

describe("queryOverview", () => {
  it("derives cache hit rate / avg latency / error rate from aggregate sums", async () => {
    mockedInvoke.mockResolvedValue([{
      calls: 4,
      tokens: 1000,
      cache_read: 200,
      cache_input: 400,
      reasoning: 50,
      latency_sum: 800,
      errors: 1,
    }] as unknown as never);

    const slice = await queryOverview("7d");
    expect(slice.totalCalls).toBe(4);
    expect(slice.totalTokens).toBe(1000);
    expect(slice.cacheHitRate).toBeCloseTo(0.5);
    expect(slice.avgLatencyMs).toBe(200);
    expect(slice.errorRate).toBe(0.25);

    const call = lastQuery("usage_query");
    expect(call.sql).toMatch(/FROM events WHERE ts >= @from_ms AND ts < @to_ms/);
    expect(call.params).toHaveProperty("from_ms");
    expect(call.params).toHaveProperty("to_ms");
  });

  it("avoids divide-by-zero when there are no calls", async () => {
    mockedInvoke.mockResolvedValue([{ calls: 0, cache_input: 0 }] as unknown as never);
    const slice = await queryOverview("today");
    expect(slice.cacheHitRate).toBe(0);
    expect(slice.avgLatencyMs).toBe(0);
    expect(slice.errorRate).toBe(0);
  });

  it("filters a non-default environment strictly by environment id", async () => {
    mockedInvoke.mockResolvedValue([{ calls: 0, cache_input: 0 }] as unknown as never);
    await queryOverview("7d", "env-2");

    const call = lastQuery("usage_query");
    expect(call.sql).toContain("kimi_code_environment_id = @environment_id");
    expect(call.sql).not.toContain("kimi_code_environment_id = ''");
    expect(call.params).toMatchObject({ environment_id: "env-2" });
  });

  it("keeps legacy unscoped rows visible for the default environment", async () => {
    mockedInvoke.mockResolvedValue([{ calls: 0, cache_input: 0 }] as unknown as never);
    await queryOverview("7d", "default");

    const call = lastQuery("usage_query");
    expect(call.sql).toContain("(kimi_code_environment_id = @environment_id OR kimi_code_environment_id = '')");
    expect(call.params).toMatchObject({ environment_id: "default" });
  });
});

describe("queryTrend", () => {
  it("uses hour buckets from the events table and maps points", async () => {
    mockedInvoke.mockResolvedValue([{ bucket: 3600000, grp: "default", tokens: 5, calls: 1 }] as unknown as never);
    const points = await queryTrend("today", "hour", "profile");
    expect(points).toEqual([{ bucket: 3600000, group: "default", tokens: 5, calls: 1 }]);
    const call = lastQuery("usage_query");
    expect(call.sql).toMatch(/FROM events WHERE ts >= @from_ms AND ts < @to_ms/);
    expect(call.sql).toContain("profile AS grp");
  });

  it("uses day buckets from events and converts local day strings to ms", async () => {
    mockedInvoke.mockResolvedValue([{ bucket: "2026-01-02", grp: "", tokens: 7, calls: 2 }] as unknown as never);
    const points = await queryTrend("7d", "day", null);
    expect(points[0].bucket).toBe(new Date(2026, 0, 2).getTime());
    const call = lastQuery("usage_query");
    expect(call.sql).toMatch(/FROM events WHERE ts >= @from_ms AND ts < @to_ms/);
    expect(call.sql).toContain("localtime");
  });

  it("applies the environment filter to trend queries", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryTrend("7d", "day", "model", "env-2");
    const call = lastQuery("usage_query");
    expect(call.sql).toContain("kimi_code_environment_id = @environment_id");
    expect(call.params).toMatchObject({ environment_id: "env-2" });
  });
});

describe("queryBreakdown", () => {
  it("clamps limit to [1,50] and orders by the requested column", async () => {
    mockedInvoke.mockResolvedValue([{ name: "m", calls: 3, tokens: 9, errors: 0, avg_latency_ms: 100, cache_hit_rate: 0.3 }] as unknown as never);
    await queryBreakdown("model", "30d", 999, "errors");
    const call = lastQuery("usage_query");
    expect(call.sql).toMatch(/FROM events WHERE ts >= @from_ms AND ts < @to_ms/);
    expect(call.sql).toContain("ORDER BY errors DESC");
    expect(call.params).toMatchObject({ limit: 50 });
  });

  it("applies the environment filter to breakdown queries", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryBreakdown("profile", "30d", 10, "tokens", "env-2");
    const call = lastQuery("usage_query");
    expect(call.sql).toContain("kimi_code_environment_id = @environment_id");
    expect(call.params).toMatchObject({ environment_id: "env-2" });
  });
});

describe("queryModelTokenSums", () => {
  it("sums token dimensions from events within the exact range", async () => {
    mockedInvoke.mockResolvedValue([{
      model: "k2",
      day: "2026-01-02",
      prompt_tokens: 10,
      completion_tokens: 20,
      cache_read_tokens: 3,
      cache_creation_tokens: 4,
      reasoning_tokens: 5,
    }] as unknown as never);

    const rows = await queryModelTokenSums("7d", true);
    expect(rows).toEqual([{
      model: "k2",
      day: "2026-01-02",
      prompt_tokens: 10,
      completion_tokens: 20,
      cache_read_tokens: 3,
      cache_creation_tokens: 4,
      reasoning_tokens: 5,
    }]);
    const call = lastQuery("usage_query");
    expect(call.sql).toMatch(/FROM events WHERE ts >= @from_ms AND ts < @to_ms/);
    expect(call.sql).toContain("localtime");
  });

  it("applies the environment filter to cost token sums", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryModelTokenSums("7d", false, "env-2");
    const call = lastQuery("usage_query");
    expect(call.sql).toContain("kimi_code_environment_id = @environment_id");
    expect(call.params).toMatchObject({ environment_id: "env-2" });
  });
});

describe("queryHeaviestSessions", () => {
  it("applies the environment filter to session aggregation and profile lookup", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryHeaviestSessions("7d", 10, "env-2");

    const call = lastQuery("usage_query");
    expect(call.sql).toContain("FROM events ue WHERE ts >= @from_ms AND ts < @to_ms AND kimi_code_environment_id = @environment_id");
    expect(call.sql).toContain("e2.kimi_code_environment_id = @environment_id");
    expect(call.params).toMatchObject({ environment_id: "env-2", limit: 10 });
  });
});

describe("queryEvents cursor + filters", () => {
  it("builds IN clauses and a paging cursor", async () => {
    // page returns size+1 rows -> hasMore true -> nextCursor produced
    mockedInvoke.mockResolvedValue([
      { ...event({ request_id: "r2", ts: 200 }) },
      { ...event({ request_id: "r1", ts: 100 }) },
    ] as unknown as never);

    const page = await queryEvents(
      { range: "7d", profiles: ["a", "b"], errorState: "error" },
      null,
      1,
    );
    expect(page.rows).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf("string");

    const call = lastQuery("usage_query");
    expect(call.sql).toContain("profile IN (@p_0,@p_1)");
    expect(call.sql).toContain("error_code IS NOT NULL");
    expect(call.params).toMatchObject({ p_0: "a", p_1: "b", limit: 2 });
  });

  it("applies the environment filter to event pages", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryEvents({ range: "7d" }, null, 10, "env-2");
    const call = lastQuery("usage_query");
    expect(call.sql).toContain("kimi_code_environment_id = @environment_id");
    expect(call.params).toMatchObject({ environment_id: "env-2" });
  });

  it("decodes a cursor into ts/id predicate params", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    const cursor = btoa(JSON.stringify({ ts: 500, id: "xyz" }));
    await queryEvents({ range: "7d" }, cursor, 10);
    const call = lastQuery("usage_query");
    expect(call.sql).toContain("ts < @cursor_ts");
    expect(call.params).toMatchObject({ cursor_ts: 500, cursor_id: "xyz" });
  });

  it("ignores a malformed cursor", async () => {
    mockedInvoke.mockResolvedValue([] as unknown as never);
    await queryEvents({ range: "7d" }, "not-base64-json", 10);
    expect(lastQuery("usage_query").sql).not.toContain("cursor_ts");
  });
});

describe("pruneOldEvents / purgeAll", () => {
  it("computes a cutoff and issues a DELETE", async () => {
    mockedInvoke.mockResolvedValue(3 as unknown as never);
    await expect(pruneOldEvents(7)).resolves.toBe(3);
    const call = lastQuery("usage_exec");
    expect(call.sql).toMatch(/DELETE FROM events WHERE ts < @cutoff/);
    expect((call.params as Record<string, number>).cutoff).toBeLessThan(Date.now());
  });

  it("purges every table via a script", async () => {
    await purgeAll();
    expect(mockedInvoke).toHaveBeenCalledWith("usage_exec_script", expect.objectContaining({
      sql: expect.stringContaining("DELETE FROM events"),
    }));
  });
});

describe("ingest state", () => {
  it("returns null when no row exists and maps a present row", async () => {
    mockedInvoke.mockResolvedValueOnce([] as unknown as never);
    await expect(getIngestState("/log")).resolves.toBeNull();

    mockedInvoke.mockResolvedValueOnce([{ byte_offset: 99, inode_signature: "sig" }] as unknown as never);
    await expect(getIngestState("/log")).resolves.toEqual({ byteOffset: 99, inodeSignature: "sig" });
  });

  it("upserts ingest state with named params", async () => {
    mockedInvoke.mockResolvedValue(1 as unknown as never);
    await setIngestState("/log", 128, "sig", "ok");
    const call = lastQuery("usage_exec");
    expect(call.sql).toMatch(/INSERT INTO ingest_state/);
    expect(call.params).toMatchObject({ p: "/log", o: 128, sig: "sig", st: "ok" });
  });
});
