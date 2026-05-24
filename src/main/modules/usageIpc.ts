import type { IpcMain } from "electron";
import { stat, readdir, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";

import type {
  EventFilter,
  EventsPage,
  GroupBy,
  InsightsSettings,
  OverviewSlice,
  SeriesPoint,
  StorageInfo,
  TimeRange,
  Bucket,
  BreakdownRow,
  SessionRow,
} from "@shared/usageTypes";
import type { AppState } from "@shared/types";
import { PANEL_USAGE_DIRECTORY, PANEL_USAGE_DB_PATH } from "@shared/configStore";
import { resolveHome } from "./fileAccess";
import type { UsageDb, BreakdownOrder } from "./usageDb";
import type { UsageLogWatcher } from "./usageLogWatcher";

export interface UsageIpcContext {
  getLogWatcher: () => UsageLogWatcher | null;
  getDb: () => UsageDb | null;
  getAppState: () => AppState | null;
  enableInsights: () => Promise<{ ok: boolean; message?: string }>;
  disableInsights: () => Promise<{ ok: true }>;
  pauseInsights: () => Promise<{ ok: true }>;
  updateInsightsSettings: (patch: Partial<InsightsSettings>) => Promise<InsightsSettings>;
}

const JSONL_DIR = PANEL_USAGE_DIRECTORY;
const SQLITE_PATH = PANEL_USAGE_DB_PATH;

export function registerUsageIpc(ipcMain: IpcMain, ctx: UsageIpcContext): void {
  ipcMain.handle("usage:get-status", async () => {
    try {
      const watcher = ctx.getLogWatcher();
      const state = ctx.getAppState();
      const insights = extractInsightsSettings(state);
      const watcherStats = watcher?.getStats() ?? { sessionsTracked: 0, eventsIngested: 0 };
      return {
        ok: true,
        settings: insights,
        proxy: {
          status: watcher?.isRunning() ? "running" : "stopped",
          port: null,
          caFingerprint: null,
          health: {
            proxy_latency_ms_p50: 0,
            proxy_latency_ms_p95: 0,
            events_per_minute: 0,
            sqlite_db_size_bytes: 0,
            jsonl_total_bytes: 0,
            ca_install_failures_count: 0,
            dropped_events_count: 0,
          },
          sessionsTracked: watcherStats.sessionsTracked,
          eventsIngested: watcherStats.eventsIngested,
        },
      };
    } catch (error) {
      console.error("usage:get-status", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:enable", async () => {
    try {
      return await ctx.enableInsights();
    } catch (error) {
      console.error("usage:enable", error);
      return { ok: false, message: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:disable", async () => {
    try {
      return await ctx.disableInsights();
    } catch (error) {
      console.error("usage:disable", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:pause", async () => {
    try {
      return await ctx.pauseInsights();
    } catch (error) {
      console.error("usage:pause", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:set-config", async (_event, patch: Partial<InsightsSettings>) => {
    try {
      const settings = await ctx.updateInsightsSettings(patch);
      return { ok: true, settings };
    } catch (error) {
      console.error("usage:set-config", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle(
    "usage:query-overview",
    async (_event, args: { range: TimeRange }) => {
      try {
        const db = ctx.getDb();
        if (!db) return { ok: true, slice: emptyOverview() satisfies OverviewSlice };
        const slice = db.queryOverview(args.range);
        return { ok: true, slice };
      } catch (error) {
        console.error("usage:query-overview", error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "usage:query-trend",
    async (_event, args: { range: TimeRange; bucket: Bucket; groupBy: GroupBy | null }) => {
      try {
        const db = ctx.getDb();
        if (!db) return { ok: true, series: [] as SeriesPoint[] };
        const series = db.queryTrend(args.range, args.bucket, args.groupBy);
        return { ok: true, series };
      } catch (error) {
        console.error("usage:query-trend", error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "usage:query-breakdown",
    async (
      _event,
      args: { dim: "profile" | "model"; range: TimeRange; limit: number; orderBy: BreakdownOrder },
    ) => {
      try {
        const db = ctx.getDb();
        if (!db) return { ok: true, rows: [] as BreakdownRow[] };
        const rows = db.queryBreakdown(args.dim, args.range, args.limit, args.orderBy);
        return { ok: true, rows };
      } catch (error) {
        console.error("usage:query-breakdown", error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "usage:query-sessions",
    async (_event, args: { range: TimeRange; limit: number }) => {
      try {
        const db = ctx.getDb();
        if (!db) return { ok: true, rows: [] as SessionRow[] };
        const rows = db.queryHeaviestSessions(args.range, args.limit);
        return { ok: true, rows };
      } catch (error) {
        console.error("usage:query-sessions", error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    "usage:query-events",
    async (_event, args: { filter: EventFilter; cursor: string | null; pageSize: number }) => {
      try {
        const db = ctx.getDb();
        if (!db) return { ok: true, page: { rows: [], nextCursor: null } satisfies EventsPage };
        const page = db.queryEvents(args.filter, args.cursor, args.pageSize);
        return { ok: true, page };
      } catch (error) {
        console.error("usage:query-events", error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle("usage:get-storage-info", async () => {
    try {
      const state = ctx.getAppState();
      const insights = extractInsightsSettings(state);
      const sqliteBytes = await safeStatSize(resolveHome(SQLITE_PATH));
      const jsonlBytes = await sumJsonlBytes(resolveHome(JSONL_DIR));
      const totalBytes = sqliteBytes + jsonlBytes;
      const warnThresholdMb = insights.insights_disk_warn_threshold_mb;
      const info: StorageInfo = {
        sqliteBytes,
        jsonlBytes,
        totalBytes,
        warnThresholdMb,
        exceedsWarn: totalBytes > warnThresholdMb * 1024 * 1024,
      };
      return { ok: true, info };
    } catch (error) {
      console.error("usage:get-storage-info", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:cleanup", async (_event, args: { retentionDays: number }) => {
    try {
      const days = Math.max(1, Math.floor(args.retentionDays));
      const db = ctx.getDb();
      const eventsDeleted = db ? db.pruneOldEvents(days) : 0;
      const jsonlFilesDeleted = await pruneOldJsonl(resolveHome(JSONL_DIR), days);
      return { ok: true, eventsDeleted, jsonlFilesDeleted };
    } catch (error) {
      console.error("usage:cleanup", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:reset-all-data", async () => {
    try {
      const db = ctx.getDb();
      db?.purgeAll();
      const dir = resolveHome(JSONL_DIR);
      try {
        const entries = await readdir(dir);
        for (const name of entries) {
          if (/^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) {
            await unlink(join(dir, name)).catch(() => undefined);
          }
        }
      } catch {
        /* dir may not exist */
      }
      return { ok: true };
    } catch (error) {
      console.error("usage:reset-all-data", error);
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("usage:open-session-terminal", async (_event, sessionId: string) => {
    try {
      const state = ctx.getAppState();
      const terminalApp = state?.panelSettings.terminal_app ?? "system-terminal";
      const appName = terminalApp === "iterm2" ? "iTerm" : "Terminal";
      const cmd = `kimi -r ${sessionId}`;
      const escaped = cmd.replace(/"/g, '\\"');
      const script = terminalApp === "iterm2"
        ? `tell application "iTerm"\nactivate\ntell current window\ncreate tab with default profile\ntell current session\nwrite text "${escaped}"\nend tell\nend tell\nend tell`
        : `tell application "Terminal"\nactivate\ndo script "${escaped}"\nend tell`;
      await new Promise<void>((resolve, reject) => {
        execFile("osascript", ["-e", script], (err) => err ? reject(err) : resolve());
      });
      return { ok: true };
    } catch (error) {
      console.error("usage:open-session-terminal", error);
      return { ok: false, error: errorMessage(error) };
    }
  });
}

async function safeStatSize(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return 0;
  }
}

async function sumJsonlBytes(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    let total = 0;
    for (const name of entries) {
      if (!/^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      total += await safeStatSize(join(dir, name));
    }
    return total;
  } catch {
    return 0;
  }
}

async function pruneOldJsonl(dir: string, retentionDays: number): Promise<number> {
  try {
    const entries = await readdir(dir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of entries) {
      const match = name.match(/^events-(\d{4})-(\d{2})-(\d{2})\.jsonl$/);
      if (!match) continue;
      const ts = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
      if (Number.isNaN(ts)) continue;
      if (ts < cutoff) {
        await unlink(join(dir, name)).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

function emptyOverview(): OverviewSlice {
  return {
    totalCalls: 0,
    totalTokens: 0,
    cacheHitRate: 0,
    reasoningTokens: 0,
    avgLatencyMs: 0,
    errorRate: 0,
  };
}

function extractInsightsSettings(state: AppState | null): InsightsSettings {
  if (!state) {
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
  const ps = state.panelSettings;
  return {
    insights_status: ps.insights_status ?? "disabled",
    insights_proxy_port: ps.insights_proxy_port ?? "auto",
    insights_retention_days: ps.insights_retention_days ?? 90,
    insights_disk_warn_threshold_mb: ps.insights_disk_warn_threshold_mb ?? 100,
    insights_store_prompt_preview: ps.insights_store_prompt_preview ?? false,
    insights_onboarding_shown_at: ps.insights_onboarding_shown_at ?? "",
    insights_last_known_port: ps.insights_last_known_port ?? null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
