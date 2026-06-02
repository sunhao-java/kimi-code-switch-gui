import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsageEvent } from "@shared/usageTypes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./usageDb", () => ({ insertEvent: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import * as db from "./usageDb";
import { UsageLogWatcher } from "./usageLogWatcher";

const mockedInvoke = vi.mocked(invoke);
const mockedInsert = vi.mocked(db.insertEvent);

// A realistic kimi.log excerpt: provider -> model -> session create -> two LLM steps.
const SESSION = "11111111-2222-3333-4444-555555555555";
// The module-path token before ":create"/":_run"/":_step" matters: the regexes require `.+`
// (≥1 char) before the function-name suffix, so a dotted logger path is mandatory.
const SAMPLE_LOG = [
  `2026-01-02 10:00:00.100 | INFO     | kimi.providers.factory:create:12 |  - Using LLM provider: type='kimi' base_url='https://api.kimi.test'`,
  `2026-01-02 10:00:00.200 | INFO     | kimi.providers.factory:create:34 |  - Using LLM model: provider='kimi' model='kimi-k2.5'`,
  `2026-01-02 10:00:00.300 | INFO     | kimi.runtime:_run:56 |  - Created new session: ${SESSION}`,
  `2026-01-02 10:00:01.000 | INFO     | kimi.soul.kimisoul:_step:78 | ${SESSION} - LLM step completed in 1.50s (input=120, output=45)`,
  `2026-01-02 10:00:02.000 | INFO     | kimi.soul.kimisoul:_step:79 | ${SESSION} - LLM step completed in 0.25s (input=10, output=5)`,
  "this line should be ignored",
].join("\n");

/** Drives a watcher through one historical-ingest pass over SAMPLE_LOG. */
function primeInvokeForHistoricalIngest(log: string): void {
  mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const a = (args ?? {}) as { path?: string };
    if (cmd === "list_dir") return ["kimi.2026-01-01.log"] as never;
    if (cmd === "file_stat") {
      // historical file has content; live kimi.log is empty so readNewLines is a no-op
      if (a.path?.endsWith("kimi.log")) return { size: 0, mtime_ms: 0, ino: 1 } as never;
      return { size: log.length, mtime_ms: 0, ino: 2 } as never;
    }
    if (cmd === "read_file_slice") return log as never;
    return undefined as never;
  });
}

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInsert.mockReset();
  mockedInsert.mockResolvedValue(true);
});

describe("UsageLogWatcher parsing", () => {
  it("parses LLM step lines into UsageEvents with provider/model/session context", async () => {
    primeInvokeForHistoricalIngest(SAMPLE_LOG);
    const events: UsageEvent[] = [];
    const watcher = new UsageLogWatcher({ getActiveProfile: () => "work", onEvent: (e) => events.push(e) });

    await watcher.start();
    watcher.stop();

    expect(events).toHaveLength(2);
    const [first, second] = events;
    expect(first.provider).toBe("kimi");
    expect(first.model).toBe("kimi-k2.5");
    expect(first.profile).toBe("work");
    expect(first.session_hint).toBe(SESSION);
    expect(first.prompt_tokens).toBe(120);
    expect(first.completion_tokens).toBe(45);
    expect(first.latency_ms).toBe(1500); // 1.50s -> ms
    expect(first.ts).toBe(new Date("2026-01-02T10:00:01.000").getTime());
    expect(second.latency_ms).toBe(250); // 0.25s -> ms
  });

  it("counts only events that insertEvent reports as newly inserted", async () => {
    primeInvokeForHistoricalIngest(SAMPLE_LOG);
    mockedInsert.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // second is a duplicate
    const watcher = new UsageLogWatcher({ getActiveProfile: () => "default" });

    await watcher.start();
    watcher.stop();

    expect(mockedInsert).toHaveBeenCalledTimes(2);
    expect(watcher.getStats()).toMatchObject({ sessionsTracked: 1, eventsIngested: 1 });
  });

  it("ignores non-matching lines and never emits events for them", async () => {
    primeInvokeForHistoricalIngest("garbage line one\nanother non-log line\n");
    const events: UsageEvent[] = [];
    const watcher = new UsageLogWatcher({ getActiveProfile: () => "default", onEvent: (e) => events.push(e) });

    await watcher.start();
    watcher.stop();

    expect(events).toHaveLength(0);
    expect(mockedInsert).not.toHaveBeenCalled();
  });

  it("start() is idempotent and isRunning reflects lifecycle", async () => {
    primeInvokeForHistoricalIngest("");
    const watcher = new UsageLogWatcher({ getActiveProfile: () => "default" });
    expect(watcher.isRunning()).toBe(false);

    await watcher.start();
    expect(watcher.isRunning()).toBe(true);
    await watcher.start(); // second start is a no-op (already running)

    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });
});
