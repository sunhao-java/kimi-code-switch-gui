// window.kimiSwitch 的 Tauri 适配器。
// 业务逻辑（@shared/*）直接在 renderer 跑，通过注入 tauriFileAccess 完成 I/O；
// 系统集成走 Rust 命令或 Tauri 插件。
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import parseTomlString from "@iarna/toml/parse-string.js";

import {
  createDefaultPanelSettings,
  loadAppState,
  normalizeStatePaths,
  saveAppState,
  cloneState,
  applyProfile,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildRedactedPreviewBundle } from "@shared/configSafety";
import { scanSkills } from "@shared/skillsStore";
import { compareReleaseVersions } from "@shared/versionUtils";
import { computeEventCost, resolveModelPricing } from "@shared/pricing";
import type { AppState, ManagedFileId, ModelConfig, PanelSettings, PreviewBundle, OpenKimiTerminalRequest, FileSnapshotBundle } from "@shared/types";

import { tauriFileAccess, pathExists } from "./fileAccess";
import * as usageDb from "./usageDb";
import { UsageLogWatcher } from "./usageLogWatcher";
import * as cli from "./cli";
import { openKimiInTerminal, openSessionTerminal } from "./terminal";
import { captureSnapshotForState, readManagedDocuments } from "./fileSnapshots";
import { initConfigHistory, captureSnapshot, cleanupOldSnapshots } from "./configHistory";
import { initPanelSettingsStore } from "./panelSettingsStore";
import * as backup from "./backup";
import { setupTray, teardownTray } from "./tray";

const skillFileAccess = {
  readText: (path: string) => tauriFileAccess.readText(path),
  listDir: (path: string) => invoke<Array<{ name: string; isDirectory: boolean }>>("list_dir_typed", { path }),
  pathExists,
};

// ── 用量洞察运行时（log watcher + db 生命周期）──
// 全局应用数据库：包含 usage 数据、config_history、panel_settings
const USAGE_DB_PATH = "~/.kimi/.panel/app.db";
const USAGE_JSONL_DIR = "~/.kimi/.panel/usage";
let logWatcher: UsageLogWatcher | null = null;
let usageOpen = false;
let currentAppState: AppState | null = null;

function activeProfile(): string {
  return currentAppState?.activeProfile ?? "default";
}

/**
 * Compute the estimated cost of a per-model token-sum row using the model's
 * *current* pricing (user override → built-in default → null). Cost is derived
 * at read time so changing a model's price re-prices history. Returns `null`
 * when no price is known for the model.
 */
function costForModelTokens(row: usageDb.ModelTokenSums, models: Record<string, ModelConfig>): number | null {
  const configured = models[row.model];
  const pricing = configured
    ? resolveModelPricing(configured)
    : resolveModelPricing({ model: row.model });
  return computeEventCost(
    {
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      cache_read_tokens: row.cache_read_tokens,
      cache_creation_tokens: row.cache_creation_tokens,
      reasoning_tokens: row.reasoning_tokens,
    },
    pricing,
  );
}

/**
 * Aggregates per-model token sums into a cost map keyed by a chosen dimension
 * (`""` for the grand total, the day string for a daily bucket, or the model
 * id). A key's cost is `null` only when not a single contributing model has a
 * known price — so the UI can show "未设定价" instead of a misleading 0.
 */
function aggregateCost(
  rows: usageDb.ModelTokenSums[],
  models: Record<string, ModelConfig>,
  keyOf: (row: usageDb.ModelTokenSums) => string,
): Record<string, number | null> {
  const out: Record<string, { total: number; anyKnown: boolean }> = {};
  for (const row of rows) {
    const key = keyOf(row);
    const cost = costForModelTokens(row, models);
    const bucket = out[key] ?? (out[key] = { total: 0, anyKnown: false });
    if (cost !== null) {
      bucket.total += cost;
      bucket.anyKnown = true;
    }
  }
  const result: Record<string, number | null> = {};
  for (const [key, { total, anyKnown }] of Object.entries(out)) {
    result[key] = anyKnown ? total : null;
  }
  return result;
}

async function ensureUsageRuntime(): Promise<void> {
  if (!usageOpen) {
    await usageDb.open(USAGE_DB_PATH);
    await initConfigHistory();
    usageOpen = true;
  }
  if (!logWatcher) {
    logWatcher = new UsageLogWatcher({ getActiveProfile: activeProfile });
    await logWatcher.start();
  }
}

function stopUsageRuntime(): void {
  logWatcher?.stop();
  logWatcher = null;
}

function extractInsightsSettings(state: AppState | null): PanelSettings["insights_status"] extends never ? never : Record<string, unknown> {
  const ps = state?.panelSettings;
  return {
    insights_status: ps?.insights_status ?? "disabled",
    insights_proxy_port: ps?.insights_proxy_port ?? "auto",
    insights_retention_days: ps?.insights_retention_days ?? 90,
    insights_disk_warn_threshold_mb: ps?.insights_disk_warn_threshold_mb ?? 100,
    insights_store_prompt_preview: ps?.insights_store_prompt_preview ?? false,
    insights_onboarding_shown_at: ps?.insights_onboarding_shown_at ?? "",
    insights_last_known_port: ps?.insights_last_known_port ?? null,
    insights_display_currency: ps?.insights_display_currency ?? "USD",
    insights_currency_rates: ps?.insights_currency_rates ?? {},
  } as never;
}

function notImplemented(name: string): never {
  throw new Error(`[tauri] ${name} 尚未迁移`);
}

export const kimiSwitchTauri = {
  // ── 核心状态链路 ──
  loadState: async (paths?: Record<string, string>): Promise<AppState> => {
    // 确保数据库打开（panel_settings 依赖数据库连接）
    if (!usageOpen) {
      // 迁移数据库文件到 .panel 目录（如果还在根目录）
      const oldDbPath = "~/.kimi/app.db";
      const newDbPath = USAGE_DB_PATH; // ~/.kimi/.panel/app.db
      const { pathExists, ensureDir, moveFile, removeFile } = await import("./fileAccess");

      try {
        if (await pathExists(oldDbPath)) {
          console.log("Migrating app.db to .panel directory...");
          // 确保目标目录存在
          await ensureDir("~/.kimi/.panel");
          // 移动文件（如果目标已存在则删除旧文件）
          if (!(await pathExists(newDbPath))) {
            await moveFile(oldDbPath, newDbPath);
            console.log("Database migrated to ~/.kimi/.panel/app.db");
          } else {
            console.log("Target database already exists, removing old file...");
            await removeFile(oldDbPath);
          }
        }
      } catch (err) {
        console.warn("Database file migration skipped:", err);
      }

      await usageDb.open(USAGE_DB_PATH);
      await initConfigHistory();

      // 自动迁移旧数据库（如果存在）
      try {
        const result = await invoke<string>("migrate_legacy_database");
        if (result.includes("Migrated")) {
          console.log("Legacy database migration:", result);
        }
      } catch (err) {
        console.warn("Legacy database migration skipped:", err);
      }

      usageOpen = true;
    }

    // 初始化 panel_settings_store 表
    await initPanelSettingsStore();

    // 初始化 mcp_servers_store 表
    const { initMcpServersStore, migrateMcpFromJson } = await import("./mcpServersStore");
    await initMcpServersStore();

    // 自动迁移 mcp.json 到数据库（如果存在）
    try {
      await migrateMcpFromJson(paths?.mcpConfigPath || "~/.kimi/config.mcp.json");
    } catch (err) {
      console.warn("MCP migration skipped:", err);
    }

    const state = await loadAppState(tauriFileAccess, paths);
    currentAppState = state;
    if (state.panelSettings.insights_status === "enabled") {
      void ensureUsageRuntime().catch((e) => console.error("usage runtime", e));
    }
    if (state.panelSettings.tray_icon) {
      void setupTray(() => currentAppState, () => window.dispatchEvent(new Event("kimi-tray-reload"))).catch((e) => console.error("tray", e));
    }
    return state;
  },
  saveState: async (state: AppState): Promise<{ ok: true }> => {
    // 保存前捕获快照（4 个配置文件）
    const normalized = normalizeStatePaths(state);
    await Promise.all([
      captureSnapshot("config", normalized.configPath),
      captureSnapshot("profiles", normalized.profilesPath),
      captureSnapshot("panel", normalized.panelSettingsPath),
      captureSnapshot("mcp", normalized.mcpConfigPath),
    ]);

    await saveAppState(tauriFileAccess, state);
    currentAppState = state;

    // 保存后清理旧快照（30 天前）
    void cleanupOldSnapshots();

    return { ok: true };
  },
  saveStateSafe: async (state: AppState): Promise<{ ok: true }> => {
    // 保存前捕获快照（4 个配置文件）
    const normalized = normalizeStatePaths(state);
    await Promise.all([
      captureSnapshot("config", normalized.configPath),
      captureSnapshot("profiles", normalized.profilesPath),
      captureSnapshot("panel", normalized.panelSettingsPath),
      captureSnapshot("mcp", normalized.mcpConfigPath),
    ]);

    await saveAppState(tauriFileAccess, state);
    currentAppState = state;

    // 保存后清理旧快照（30 天前）
    void cleanupOldSnapshots();

    return { ok: true };
  },
  captureSnapshot: (state: AppState): Promise<FileSnapshotBundle> => captureSnapshotForState(state),
  runDoctor: async (state: AppState) => {
    // 读取并解析磁盘原始文档，供 buildConfigDoctorReport 做配置漂移（未知字段）探测。
    // 单文件解析失败不阻断体检——跳过该文件的漂移检测即可。
    const normalized = normalizeStatePaths(state);
    const disk = await readManagedDocuments({
      config: normalized.configPath,
      profiles: normalized.profilesPath,
      panel: normalized.panelSettingsPath,
      mcp: normalized.mcpConfigPath,
    });
    const safeToml = (text?: string): unknown => {
      if (!text) return undefined;
      try { return parseTomlString(text); } catch { return undefined; }
    };
    const safeJson = (text?: string): unknown => {
      if (!text) return undefined;
      try { return JSON.parse(text); } catch { return undefined; }
    };
    const rawDocs: Partial<Record<ManagedFileId, unknown>> = {
      config: safeToml(disk.config),
      profiles: safeToml(disk.profiles),
      panel: safeToml(disk.panel),
      mcp: safeJson(disk.mcp),
    };
    return buildConfigDoctorReport(state, rawDocs);
  },
  previewState: async (state: AppState): Promise<PreviewBundle> => {
    const normalized = normalizeStatePaths(state);
    const disk = await readManagedDocuments({
      config: normalized.configPath,
      profiles: normalized.profilesPath,
      panel: normalized.panelSettingsPath,
      mcp: normalized.mcpConfigPath,
    });
    return buildRedactedPreviewBundle(normalized, disk as never);
  },
  scanSkills: (state: AppState) => {
    const normalized = normalizeStatePaths(state);
    return scanSkills(skillFileAccess, { mergeAllAvailableSkills: normalized.mainConfig.merge_all_available_skills });
  },
  defaultSettings: (): Promise<PanelSettings> => Promise.resolve(createDefaultPanelSettings()),

  // ── dialog / shell ──
  pickFile: async (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    const selected = await openDialog({ multiple: false, filters: options?.filters });
    return typeof selected === "string" ? { canceled: false, filePath: selected } : { canceled: true };
  },
  saveFile: async (content: string, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const filePath = await saveDialog({ defaultPath: options?.defaultPath, filters: options?.filters });
    if (!filePath) return { canceled: true };
    await tauriFileAccess.writeText(filePath, content);
    return { canceled: false, filePath };
  },
  readFile: async (filePath: string) => {
    const content = await tauriFileAccess.readText(filePath);
    return content === null ? { ok: false, error: "File not found." } : { ok: true, content };
  },
  openExternal: async (url: string): Promise<{ ok: true }> => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "mailto:") {
      throw new Error("Only HTTPS and mailto URLs can be opened.");
    }
    await openUrl(url);
    return { ok: true };
  },
  openKimiInTerminal: (request: PanelSettings | OpenKimiTerminalRequest) => openKimiInTerminal(request),

  // ── CLI / MCP / 连通性 ──
  getInstallSource: (): Promise<"homebrew" | "manual" | "development"> => Promise.resolve("manual"),
  getCliVersion: (options?: { checkLatest?: boolean }) => cli.getCliVersion(options),
  runProvidersHealthCheck: (state: AppState) => cli.runProvidersHealthCheck(state),
  upgradeKimiCli: () => cli.upgradeKimiCli(),
  testMcpServer: (name: string) => cli.runKimiMcpCommand(["test", name]),
  authMcpServer: (name: string) => cli.runKimiMcpCommand(["auth", name]),
  resetMcpServerAuth: (name: string) => cli.runKimiMcpCommand(["reset-auth", name]),
  testProfileConnectivity: (state: AppState, profileName: string, modelName?: string) => {
    const draft = cloneState(state);
    applyProfile(draft, profileName);
    return cli.runKimiConnectivityTest(draft, modelName ?? draft.mainConfig.default_model);
  },

  // ── 更新 / changelog ──
  checkForUpdates: async () => {
    const currentVersion = await getVersion();
    const resp = await invoke<{ status: number; ok: boolean; body: string }>("http_request", {
      method: "GET",
      url: "https://api.github.com/repos/sunhao-java/kimi-code-switch-gui/releases/latest",
      headers: { Accept: "application/vnd.github+json", "User-Agent": "kimi-code-switch-gui" },
      body: null,
    });
    const payload = resp.ok ? (JSON.parse(resp.body) as { tag_name?: string; name?: string; html_url?: string; body?: string; published_at?: string }) : {};
    const latestVersion = (payload.tag_name ?? "").replace(/^v/i, "");
    return {
      currentVersion,
      latestVersion,
      hasUpdate: latestVersion ? compareReleaseVersions(latestVersion, currentVersion) > 0 : false,
      releaseUrl: payload.html_url ?? "https://github.com/sunhao-java/kimi-code-switch-gui/releases",
      releaseName: payload.name ?? `v${latestVersion}`,
      releaseBody: payload.body ?? "",
      publishedAt: payload.published_at ?? "",
      homebrewCommand: "brew upgrade --cask kimi-code-switch-gui",
      installSource: "manual" as const,
    };
  },
  readChangelog: async (locale: string): Promise<string | null> => {
    const resp = await invoke<{ status: number; ok: boolean; body: string }>("http_request", {
      method: "GET",
      url: `https://raw.githubusercontent.com/sunhao-java/kimi-code-switch-gui/master/CHANGELOGS/${locale}.md`,
      headers: { "User-Agent": "kimi-code-switch-gui" },
      body: null,
    });
    return resp.ok ? resp.body : null;
  },

  // ── 托盘 ──
  setTray: async (enabled: boolean) => {
    if (currentAppState) currentAppState.panelSettings.tray_icon = enabled;
    if (enabled) {
      await setupTray(() => currentAppState, () => window.dispatchEvent(new Event("kimi-tray-reload")));
    } else {
      await teardownTray();
    }
    return { ok: true as const };
  },
  refreshTrayMenu: async () => {
    if (currentAppState?.panelSettings.tray_icon) {
      await setupTray(() => currentAppState, () => window.dispatchEvent(new Event("kimi-tray-reload")));
    }
    return { ok: true as const };
  },
  onTrayCommand: () => () => {},
  onExternalFileChange: () => () => {},

  // ── 用量洞察 ──
  usageGetStatus: async () => {
    const stats = logWatcher?.getStats() ?? { sessionsTracked: 0, eventsIngested: 0 };
    return {
      ok: true as const,
      settings: extractInsightsSettings(currentAppState) as never,
      proxy: {
        status: logWatcher?.isRunning() ? "running" : "stopped",
        sessionsTracked: stats.sessionsTracked,
        eventsIngested: stats.eventsIngested,
      },
    };
  },
  usageEnable: async () => {
    await ensureUsageRuntime();
    if (currentAppState) {
      currentAppState.panelSettings.insights_status = "enabled";
      await saveAppState(tauriFileAccess, currentAppState);
    }
    return { ok: true };
  },
  usageDisable: async () => {
    stopUsageRuntime();
    if (currentAppState) {
      currentAppState.panelSettings.insights_status = "disabled";
      await saveAppState(tauriFileAccess, currentAppState);
    }
    return { ok: true as const };
  },
  usagePause: async () => {
    stopUsageRuntime();
    return { ok: true as const };
  },
  usageSetConfig: async (patch: Partial<PanelSettings>) => {
    if (currentAppState) {
      Object.assign(currentAppState.panelSettings, patch);
      await saveAppState(tauriFileAccess, currentAppState);
    }
    return { ok: true as const, settings: extractInsightsSettings(currentAppState) as never };
  },
  usageQueryOverview: async (range: never) => {
    if (!usageOpen) return { ok: true as const, slice: { totalCalls: 0, totalTokens: 0, cacheHitRate: 0, reasoningTokens: 0, avgLatencyMs: 0, errorRate: 0 } };
    return { ok: true as const, slice: await usageDb.queryOverview(range) };
  },
  usageQueryTrend: async (args: { range: never; bucket: never; groupBy: never }) => {
    if (!usageOpen) return { ok: true as const, series: [] };
    return { ok: true as const, series: await usageDb.queryTrend(args.range, args.bucket, args.groupBy) };
  },
  usageQueryBreakdown: async (args: { dim: "profile" | "model"; range: never; limit: number; orderBy: never }) => {
    if (!usageOpen) return { ok: true as const, rows: [] };
    return { ok: true as const, rows: await usageDb.queryBreakdown(args.dim, args.range, args.limit, args.orderBy) };
  },
  usageQuerySessions: async (args: { range: never; limit: number }) => {
    if (!usageOpen) return { ok: true as const, rows: [] };
    return { ok: true as const, rows: await usageDb.queryHeaviestSessions(args.range, args.limit) };
  },
  usageQueryEvents: async (args: { filter: never; cursor: string | null; pageSize: number }) => {
    if (!usageOpen) return { ok: true as const, page: { rows: [], nextCursor: null } };
    return { ok: true as const, page: await usageDb.queryEvents(args.filter, args.cursor, args.pageSize) };
  },
  usageQueryCost: async (range: never) => {
    const empty = { ok: true as const, total: null as number | null, byDay: {} as Record<string, number | null>, byModel: {} as Record<string, number | null> };
    if (!usageOpen) return empty;
    const models = currentAppState?.mainConfig.models ?? {};
    const [modelSums, modelDaySums] = await Promise.all([
      usageDb.queryModelTokenSums(range, false),
      usageDb.queryModelTokenSums(range, true),
    ]);
    const byModel = aggregateCost(modelSums, models, (r) => r.model);
    const byDay = aggregateCost(modelDaySums, models, (r) => r.day);
    const totalMap = aggregateCost(modelSums, models, () => "");
    return { ok: true as const, total: totalMap[""] ?? null, byDay, byModel };
  },
  usageGetStorageInfo: async () => {
    const dbStat = await invoke<{ size: number } | null>("file_stat", { path: USAGE_DB_PATH });
    const sqliteBytes = dbStat?.size ?? 0;
    const warnMb = currentAppState?.panelSettings.insights_disk_warn_threshold_mb ?? 100;
    return {
      ok: true as const,
      info: { sqliteBytes, jsonlBytes: 0, totalBytes: sqliteBytes, warnThresholdMb: warnMb, exceedsWarn: sqliteBytes > warnMb * 1024 * 1024 },
    };
  },
  usageCleanup: async (retentionDays: number) => {
    if (!usageOpen) return { ok: true as const, eventsDeleted: 0, jsonlFilesDeleted: 0 };
    const eventsDeleted = await usageDb.pruneOldEvents(Math.max(1, Math.floor(retentionDays)));
    return { ok: true as const, eventsDeleted, jsonlFilesDeleted: 0 };
  },
  usageResetAllData: async () => {
    if (usageOpen) await usageDb.purgeAll();
    return { ok: true as const };
  },
  usageOpenSessionTerminal: async (sessionId: string) => {
    const app = currentAppState?.panelSettings.terminal_app ?? "system-terminal";
    await openSessionTerminal(sessionId, app);
    return { ok: true as const };
  },

  // ── backup ──
  runBackup: (state: AppState) => backup.runBackup(state),
  listBackups: (state: AppState) => backup.listBackups(state),
  deleteBackup: (state: AppState, backupName: string) => backup.deleteBackup(state, backupName),
  restoreBackup: (state: AppState, backupName: string) => backup.restoreBackup(state, backupName),
  restoreBackupSafe: (state: AppState, backupName: string, options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean }) => backup.restoreBackupSafe(state, backupName, options),
  restoreBackupDryRun: (state: AppState, backupName: string) => backup.restoreBackupDryRun(state, backupName),
  testBackupWebdav: (state: AppState) => backup.testBackupWebdav(state),

  void: () => { void USAGE_JSONL_DIR; void notImplemented; },
};

export function installKimiSwitchTauri(): void {
  // @ts-expect-error 运行时注入，与 Electron preload 的 KimiSwitchApi 对齐
  window.kimiSwitch = kimiSwitchTauri;
}
