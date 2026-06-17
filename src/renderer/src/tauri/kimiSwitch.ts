// window.kimiSwitch 的 Tauri 适配器。
// 业务逻辑（@shared/*）直接在 renderer 跑，通过注入 tauriFileAccess 完成 I/O；
// 系统集成走 Rust 命令或 Tauri 插件。
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import parseTomlString from "@iarna/toml/parse-string.js";

import {
  createDefaultPanelSettings,
  getKimiCodeConfigPath,
  getKimiCodeMcpConfigPath,
  getKimiCodeEnvironmentHomePath,
  normalizeKimiCodeEnvironments,
  getDefaultConfigPath,
  getDefaultMcpConfigPath,
  loadAppState,
  migrateLegacyKimiCliConfigToKimiCode,
  normalizeStatePaths,
  saveAppState,
  cloneState,
  applyProfile,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildManagedDocuments, buildRedactedPreviewBundle } from "@shared/configSafety";
import { scanSkills } from "@shared/skillsStore";
import { compareReleaseVersions } from "@shared/versionUtils";
import { computeEventCost, resolveModelPricing } from "@shared/pricing";
import type { AppState, KimiCodeEnvironment, KimiCodeEnvironmentPreferenceResult, ManagedFileId, ModelConfig, PanelSettings, PreviewBundle, OpenKimiTerminalRequest, FileSnapshotBundle, SaveStateConflictResult, SaveStateResult } from "@shared/types";

import { tauriFileAccess, pathExists, ensureKimiCodeEnvironmentLayout, activateKimiCodeEnvironmentLink } from "./fileAccess";
import * as usageDb from "./usageDb";
import { UsageLogWatcher } from "./usageLogWatcher";
import * as cli from "./cli";
import { openKimiInTerminal, openSessionTerminal } from "./terminal";
import { captureSnapshotForState, detectExternalChangeConflict, readManagedDocuments } from "./fileSnapshots";
import { initConfigHistory, captureSnapshot, cleanupOldSnapshots } from "./configHistory";
import { getPanelSettings, initPanelSettingsStore, savePanelSettings } from "./panelSettingsStore";
import * as backup from "./backup";
import { setupTray, teardownTray } from "./tray";
import * as officialAccounts from "./officialAccounts";
import { recordStartupTiming, startupTimingNow } from "../startupTiming";

const skillFileAccess = {
  readText: (path: string) => tauriFileAccess.readText(path),
  listDir: (path: string) => invoke<Array<{ name: string; isDirectory: boolean }>>("list_dir_typed", { path }),
  pathExists,
};

// ── 用量洞察运行时（log watcher + db 生命周期）──
// 全局应用数据库：包含 usage 数据、config_history、panel_settings
const PANEL_APP_DIR = "~/.kimi-code-switch-gui";
const USAGE_DB_PATH = `${PANEL_APP_DIR}/app.db`;
const USAGE_JSONL_DIR = `${PANEL_APP_DIR}/usage`;
let logWatcher: UsageLogWatcher | null = null;
let usageOpen = false;
let currentAppState: AppState | null = null;
let shortcutSyncTask: Promise<void> = Promise.resolve();
let startupKimiCodeDetection: AppState["kimiTargetDetection"] | null = null;
let startupKimiCodeDetectionTask: Promise<AppState["kimiTargetDetection"]> | null = null;

type LoadStatePaths = {
  configTarget?: AppState["configTarget"];
  configPath?: string;
  profilesPath?: string;
  panelSettingsPath?: string;
  mcpConfigPath?: string;
};

export type EndpointReachabilityResult = {
  ok: boolean;
  status: number;
  message: string;
};

function activeProfile(): string {
  return currentAppState?.activeProfile ?? "default";
}

function activeKimiCodeEnvironmentId(): string {
  return currentAppState?.panelSettings.active_kimi_code_environment_id ?? "default";
}

async function getStartupKimiCodeDetection(
  force = false,
): Promise<AppState["kimiTargetDetection"]> {
  // force 时清空已完成的缓存，触发重新检测（如用户安装 Kimi Code 后点"刷新检测"）。
  // 若已有进行中的检测任务则复用它，避免重复打断。
  if (force) {
    startupKimiCodeDetection = null;
  }
  if (startupKimiCodeDetection) return startupKimiCodeDetection;
  if (startupKimiCodeDetectionTask) return startupKimiCodeDetectionTask;
  const startedAt = startupTimingNow();
  startupKimiCodeDetectionTask = Promise.all([
    cli.detectActiveKimiTarget(),
    cli.getTargetCliVersion("kimi-code"),
  ]).then(([detection, version]) => {
    startupKimiCodeDetection = {
      ...detection,
      installed: version.installed,
      status: version.installed ? "detected" : "not-installed",
      version: version.version,
      latestVersion: version.latestVersion,
      hasUpdate: version.hasUpdate,
      packageName: version.packageName,
      installCommand: version.installCommand,
      updateCommand: version.updateCommand,
      installSource: version.installSource ?? detection.installSource,
    };
    return startupKimiCodeDetection;
  }).finally(() => {
    startupKimiCodeDetectionTask = null;
    recordStartupTiming("kimiSwitch.getStartupKimiCodeDetection", startedAt);
  });
  return startupKimiCodeDetectionTask;
}

function createPendingKimiCodeDetection(): NonNullable<AppState["kimiTargetDetection"]> {
  return {
    target: "kimi-code",
    installed: false,
    status: "checking",
    version: "",
    executablePath: "",
    resolvedPath: "",
    candidates: [],
    reason: "startup-detection-pending",
    installSource: "unknown",
    packageName: "Kimi Code",
    installCommand: "brew install kimi-code",
    updateCommand: "brew upgrade kimi-code",
  };
}

function syncDetectedKimiTargetToState(detection: AppState["kimiTargetDetection"]): void {
  if (!detection || !currentAppState) return;
  currentAppState = {
    ...currentAppState,
    kimiTargetDetection: detection,
  };
  window.dispatchEvent(new CustomEvent("kimi-target-detection", { detail: detection }));
}

function refreshStartupKimiCodeDetection(
  force = false,
): Promise<AppState["kimiTargetDetection"]> {
  return getStartupKimiCodeDetection(force).then((detection) => {
    syncDetectedKimiTargetToState(detection);
    return detection;
  });
}

async function runPostLoadMaintenance(
  state: AppState,
  effectivePaths: LoadStatePaths,
  migrateMcpFromJson: (path: string) => Promise<unknown>,
): Promise<void> {
  const startedAt = startupTimingNow();
  try {
    try {
      const result = await invoke<string>("migrate_legacy_database");
      if (result.includes("Migrated")) {
        console.log("Legacy database migration:", result);
      }
    } catch (err) {
      console.warn("Legacy database migration skipped:", err);
    }

    try {
      const migration = await migrateLegacyKimiCliConfigToKimiCode(tauriFileAccess);
      if (migration.migrated) {
        console.log("Legacy Kimi CLI config migrated to Kimi Code:", migration);
      }
    } catch (err) {
      console.warn("Legacy Kimi CLI config migration skipped:", err);
    }

    try {
      const migrationPaths = new Set([
        "~/.kimi/mcp.json",
        "~/.kimi/config.mcp.json",
      ].filter((path): path is string => Boolean(path)));
      for (const path of migrationPaths) {
        await migrateMcpFromJson(path);
      }
    } catch (err) {
      console.warn("MCP migration skipped:", err);
    }

    const currentSettings = await getPanelSettings();
    if (!currentSettings) {
      await savePanelSettings({
        ...state.panelSettings,
        config_target: state.panelSettings.config_target,
        config_path: state.panelSettings.config_path,
        profiles: state.profiles,
        active_profile: state.activeProfile,
        mcp_servers: state.mcpConfig.mcpServers,
        kimi_code_environments: state.panelSettings.kimi_code_environments,
        active_kimi_code_environment_id: state.panelSettings.active_kimi_code_environment_id,
        active_official_account_id: state.panelSettings.active_official_account_id ?? "",
        profiles_path: "",
        follow_config_profiles: true,
      });
      return;
    }
    const needsPanelSync =
      currentSettings.config_target !== state.panelSettings.config_target ||
      currentSettings.config_path !== state.panelSettings.config_path ||
      currentSettings.active_profile !== state.activeProfile ||
      JSON.stringify(currentSettings.profiles ?? {}) !== JSON.stringify(state.profiles ?? {}) ||
      JSON.stringify(currentSettings.mcp_servers ?? {}) !== JSON.stringify(state.mcpConfig.mcpServers ?? {}) ||
      JSON.stringify(currentSettings.kimi_code_environments ?? []) !== JSON.stringify(state.panelSettings.kimi_code_environments ?? []) ||
      (currentSettings.active_kimi_code_environment_id ?? "") !== (state.panelSettings.active_kimi_code_environment_id ?? "") ||
      (currentSettings.active_official_account_id ?? "") !== (state.panelSettings.active_official_account_id ?? "");
    if (needsPanelSync) {
      await savePanelSettings({
        ...currentSettings,
        config_target: state.panelSettings.config_target,
        config_path: state.panelSettings.config_path,
        profiles: state.profiles,
        active_profile: state.activeProfile,
        mcp_servers: state.mcpConfig.mcpServers,
        kimi_code_environments: state.panelSettings.kimi_code_environments,
        active_kimi_code_environment_id: state.panelSettings.active_kimi_code_environment_id,
        active_official_account_id: state.panelSettings.active_official_account_id ?? "",
        profiles_path: "",
        follow_config_profiles: true,
      });
    }
  } finally {
    recordStartupTiming("kimiSwitch.runPostLoadMaintenance", startedAt);
  }
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
    logWatcher = new UsageLogWatcher({
      getActiveProfile: activeProfile,
      getActiveEnvironmentId: activeKimiCodeEnvironmentId,
    });
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
  loadState: async (paths?: LoadStatePaths): Promise<AppState> => {
    const loadStartedAt = startupTimingNow();
    // 确保数据库打开（panel_settings 依赖数据库连接）
    if (!usageOpen) {
      const dbStartedAt = startupTimingNow();
      // 迁移旧数据库文件到独立 GUI 目录，避免和 Kimi Code 运行时数据混在一起。
      const oldDbPaths = ["~/.kimi-code/.panel/app.db", "~/.kimi/app.db"];
      const newDbPath = USAGE_DB_PATH;
      const { pathExists, ensureDir, moveFile, removeFile } = await import("./fileAccess");

      try {
        await ensureDir(PANEL_APP_DIR);
        for (const oldDbPath of oldDbPaths) {
          if (await pathExists(oldDbPath)) {
            console.log(`Migrating app.db from ${oldDbPath} to ${newDbPath}...`);
            if (!(await pathExists(newDbPath))) {
              await moveFile(oldDbPath, newDbPath);
            } else {
              await removeFile(oldDbPath);
            }
          }
        }
      } catch (err) {
        console.warn("Database file migration skipped:", err);
      }

      await usageDb.open(USAGE_DB_PATH);
      await initConfigHistory();

      usageOpen = true;
      recordStartupTiming("kimiSwitch.loadState.database", dbStartedAt);
    }

    // 初始化 panel_settings_store 表
    const storeStartedAt = startupTimingNow();
    await initPanelSettingsStore();

    // 初始化 mcp_servers_store 表
    const { initMcpServersStore, migrateMcpFromJson } = await import("./mcpServersStore");
    await initMcpServersStore();
    await officialAccounts.initOfficialAccountsStore();
    recordStartupTiming("kimiSwitch.loadState.stores", storeStartedAt);

    const currentSettingsBeforeLoad = await getPanelSettings();
    const activeEnvironmentIdBeforeLoad = currentSettingsBeforeLoad?.active_kimi_code_environment_id ?? "default";
    await ensureKimiCodeEnvironmentLayout(activeEnvironmentIdBeforeLoad);

    const effectiveTarget = "kimi-code";
    const effectivePaths: LoadStatePaths = {
      ...paths,
      configTarget: effectiveTarget,
    };

    const stateStartedAt = startupTimingNow();
    const state = await loadAppState(tauriFileAccess, effectivePaths);
    recordStartupTiming("kimiSwitch.loadState.loadAppState", stateStartedAt);
    state.kimiTargetDetection = startupKimiCodeDetection ?? createPendingKimiCodeDetection();
    try {
      const accountStartedAt = startupTimingNow();
      const accountStatus = await officialAccounts.getOfficialAccountCredentialsStatus();
      state.panelSettings.active_official_account_id = accountStatus.active_account_id;
      recordStartupTiming("kimiSwitch.loadState.accountStatus", accountStartedAt);
    } catch (err) {
      console.warn("Official account status load skipped:", err);
    }
    currentAppState = state;

    void runPostLoadMaintenance(state, effectivePaths, migrateMcpFromJson)
      .catch((err) => console.warn("Post-load maintenance skipped:", err));
    void refreshStartupKimiCodeDetection()
      .catch((err) => console.warn("Kimi Code detection skipped:", err));

    if (state.panelSettings.insights_status === "enabled") {
      void ensureUsageRuntime().catch((e) => console.error("usage runtime", e));
    }
    if (state.panelSettings.tray_icon) {
      void setupTray(() => currentAppState, () => window.dispatchEvent(new Event("kimi-tray-reload"))).catch((e) => console.error("tray", e));
    }
    void syncWindowToggleShortcut().catch((e) => console.error("shortcut", e));
    recordStartupTiming("kimiSwitch.loadState.total", loadStartedAt);
    return state;
  },
  saveState: async (state: AppState): Promise<SaveStateResult> => {
    // 保存前捕获快照（Kimi 标准配置 + GUI SQLite 导出）
    const normalized = normalizeStatePaths(state);
    const environmentId = normalized.panelSettings.active_kimi_code_environment_id ?? "";
    await Promise.all([
      captureSnapshot("config", normalized.configPath, undefined, environmentId),
      captureSnapshot("panel", normalized.panelSettingsPath, undefined, environmentId),
      captureSnapshot("mcp", normalized.mcpConfigPath, undefined, environmentId),
    ]);

    await saveAppState(tauriFileAccess, state);
    currentAppState = state;

    await syncWindowToggleShortcut();

    // 保存后清理旧快照（30 天前）
    void cleanupOldSnapshots();

    return {
      ok: true,
      snapshot: await captureSnapshotForState(normalized),
      doctor: buildConfigDoctorReport(normalized),
    };
  },
  saveStateSafe: async (
    state: AppState,
    options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
  ): Promise<SaveStateResult | SaveStateConflictResult> => {
    const normalized = normalizeStatePaths(state);
    if (options?.allowOverwrite !== true) {
      const conflict = await detectExternalChangeConflict({
        expectedSnapshot: options?.expectedSnapshot,
        targetPaths: {
          config: normalized.configPath,
          panel: normalized.panelSettingsPath,
          mcp: normalized.mcpConfigPath,
        },
        draftDocuments: buildManagedDocuments(normalized),
      });
      if (conflict.conflict) {
        return {
          ok: false,
          reason: "external-change",
          snapshot: conflict.snapshot,
          doctor: buildConfigDoctorReport(normalized),
          conflict: conflict.conflict,
        };
      }
    }

    // 保存前捕获快照（Kimi 标准配置 + GUI SQLite 导出）
    const environmentId = normalized.panelSettings.active_kimi_code_environment_id ?? "";
    await Promise.all([
      captureSnapshot("config", normalized.configPath, undefined, environmentId),
      captureSnapshot("panel", normalized.panelSettingsPath, undefined, environmentId),
      captureSnapshot("mcp", normalized.mcpConfigPath, undefined, environmentId),
    ]);

    await saveAppState(tauriFileAccess, state);
    currentAppState = state;

    await syncWindowToggleShortcut();

    // 保存后清理旧快照（30 天前）
    void cleanupOldSnapshots();

    return {
      ok: true,
      snapshot: await captureSnapshotForState(normalized),
      doctor: buildConfigDoctorReport(normalized),
    };
  },
  saveConfigTargetPreference: async (): Promise<{ ok: true }> => {
    const currentSettings = (await getPanelSettings())
      ?? currentAppState?.panelSettings
      ?? createDefaultPanelSettings();
    const configTarget = "kimi-code" as const;
    const configPath = getDefaultConfigPath(configTarget);
    const saved = await savePanelSettings({
      ...currentSettings,
      config_target: configTarget,
      config_path: configPath,
      profiles_path: "",
      follow_config_profiles: true,
    });
    if (!saved) {
      throw new Error("Failed to save config target preference.");
    }
    if (currentAppState) {
      currentAppState = {
        ...currentAppState,
        configTarget,
        panelSettings: {
          ...currentAppState.panelSettings,
          config_target: configTarget,
          config_path: configPath,
          profiles_path: "",
          follow_config_profiles: true,
        },
      };
    }
    return { ok: true };
  },
  saveKimiCodeEnvironmentPreference: async (
    environments: KimiCodeEnvironment[],
    activeEnvironmentId: string,
  ): Promise<KimiCodeEnvironmentPreferenceResult> => {
    const currentSettings = (await getPanelSettings())
      ?? currentAppState?.panelSettings
      ?? createDefaultPanelSettings();
    const currentActiveEnvironmentId = currentAppState?.panelSettings.active_kimi_code_environment_id
      ?? currentSettings.active_kimi_code_environment_id;
    const normalizedEnvironments = normalizeKimiCodeEnvironments(environments, currentSettings.kimi_code_environments)
      .map((environment) => ({
        ...environment,
        homePath: getKimiCodeEnvironmentHomePath(environment.id),
      }))
      .map((environment) => (
        currentAppState && environment.id === currentActiveEnvironmentId
          ? {
              ...environment,
              mainConfig: currentAppState.mainConfig,
              profiles: currentAppState.profiles,
              activeProfile: currentAppState.activeProfile,
              mcpServers: currentAppState.mcpConfig.mcpServers,
            }
          : environment
      ));
    const activeEnvironment = normalizedEnvironments.find((environment) => environment.id === activeEnvironmentId)
      ?? normalizedEnvironments[0];
    if (!activeEnvironment) {
      throw new Error("No Kimi Code environment is available.");
    }
    await activateKimiCodeEnvironmentLink(activeEnvironment.id);
    const configPath = getKimiCodeConfigPath(activeEnvironment.homePath);
    const saved = await savePanelSettings({
      ...currentSettings,
      config_target: "kimi-code",
      config_path: configPath,
      profiles_path: "",
      follow_config_profiles: true,
      kimi_code_environments: normalizedEnvironments,
      active_kimi_code_environment_id: activeEnvironment.id,
    });
    if (!saved) {
      throw new Error("Failed to save Kimi Code environment preference.");
    }

    const nextState = normalizeStatePaths(await loadAppState(tauriFileAccess, {
      configTarget: "kimi-code",
      configPath,
      mcpConfigPath: getKimiCodeMcpConfigPath(activeEnvironment.homePath),
    }));
    nextState.kimiTargetDetection = currentAppState?.kimiTargetDetection
      ?? startupKimiCodeDetection
      ?? createPendingKimiCodeDetection();
    try {
      const accountStatus = await officialAccounts.getOfficialAccountCredentialsStatus();
      nextState.panelSettings.active_official_account_id = accountStatus.active_account_id;
    } catch (err) {
      console.warn("Official account status load skipped:", err);
    }

    const finalPanelSettings: PanelSettings = {
      ...nextState.panelSettings,
      config_target: "kimi-code",
      config_path: nextState.configPath,
      profiles: nextState.profiles,
      active_profile: nextState.activeProfile,
      mcp_servers: nextState.mcpConfig.mcpServers,
      profiles_path: "",
      follow_config_profiles: true,
      kimi_code_environments: nextState.panelSettings.kimi_code_environments,
      active_kimi_code_environment_id: activeEnvironment.id,
      active_official_account_id: nextState.panelSettings.active_official_account_id ?? "",
    };
    await savePanelSettings(finalPanelSettings);
    currentAppState = {
      ...nextState,
      panelSettings: finalPanelSettings,
    };
    const normalizedState = normalizeStatePaths(currentAppState);
    return {
      ok: true,
      snapshot: await captureSnapshotForState(normalizedState),
      doctor: buildConfigDoctorReport(normalizedState),
    };
  },
  captureSnapshot: (state: AppState): Promise<FileSnapshotBundle> => captureSnapshotForState(state),
  runDoctor: async (state: AppState) => {
    // 读取并解析磁盘原始文档，供 buildConfigDoctorReport 做配置漂移（未知字段）探测。
    // 单文件解析失败不阻断体检——跳过该文件的漂移检测即可。
    const normalized = normalizeStatePaths(state);
    const disk = await readManagedDocuments({
      config: normalized.configPath,
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
      panel: safeToml(disk.panel),
      mcp: safeJson(disk.mcp),
    };
    return buildConfigDoctorReport(state, rawDocs);
  },
  previewState: async (state: AppState): Promise<PreviewBundle> => {
    const normalized = normalizeStatePaths(state);
    const disk = await readManagedDocuments({
      config: normalized.configPath,
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
  getCliVersion: (options?: { checkLatest?: boolean; latestTimeoutMs?: number; target?: AppState["configTarget"] }) =>
    cli.getTargetCliVersion(options?.target ?? "kimi-code", {
      checkLatest: options?.checkLatest,
      latestTimeoutMs: options?.latestTimeoutMs,
    }),
  refreshKimiTargetDetection: () => refreshStartupKimiCodeDetection(true),
  runProvidersHealthCheck: (state: AppState) => cli.runProvidersHealthCheck(state),
  upgradeKimiCli: (target?: AppState["configTarget"], options?: { install?: boolean }) =>
    cli.upgradeTargetCli(target ?? "kimi-code", options),
  startKimiOAuthLogin: (target: AppState["configTarget"], onEvent?: (event: cli.KimiOAuthLoginEvent) => void, options?: { accountId?: string; activate?: boolean }) =>
    cli.startKimiOAuthLogin(target, onEvent, options),
  startKimiCodeOAuthLogin: (onEvent?: (event: cli.KimiOAuthLoginEvent) => void) =>
    cli.startKimiOAuthLogin("kimi-code", onEvent),
  listOfficialAccounts: () => officialAccounts.listOfficialAccounts(),
  getOfficialAccountCredentialsStatus: () => officialAccounts.getOfficialAccountCredentialsStatus(),
  createOfficialAccount: (displayName: string) => officialAccounts.createOfficialAccount(displayName),
  renameOfficialAccount: (id: string, displayName: string) => officialAccounts.renameOfficialAccount(id, displayName),
  captureCurrentOfficialAccount: (displayName: string) => officialAccounts.captureCurrentOfficialAccount(displayName),
  activateOfficialAccount: async (id: string) => {
    const result = await officialAccounts.activateOfficialAccount(id);
    currentAppState = currentAppState
      ? {
        ...currentAppState,
        panelSettings: {
          ...currentAppState.panelSettings,
          active_official_account_id: result.active_account_id,
        },
      }
      : currentAppState;
    return result;
  },
  deleteOfficialAccount: (id: string) => officialAccounts.deleteOfficialAccount(id),
  testMcpServer: (name: string) => {
    const server = currentAppState?.mcpConfig.mcpServers[name];
    if (!server) throw new Error(`MCP server not found: ${name}`);
    return cli.runKimiMcpServerTest(name, server);
  },
  listMcpServerTools: (name: string, server?: AppState["mcpConfig"]["mcpServers"][string]) => {
    const target = server ?? currentAppState?.mcpConfig.mcpServers[name];
    if (!target) throw new Error(`MCP server not found: ${name}`);
    return cli.listKimiMcpServerTools(name, target);
  },
  callMcpServerTool: (name: string, toolName: string, argsJson: string, server?: AppState["mcpConfig"]["mcpServers"][string]) => {
    const target = server ?? currentAppState?.mcpConfig.mcpServers[name];
    if (!target) throw new Error(`MCP server not found: ${name}`);
    return cli.callKimiMcpServerTool(name, target, toolName, argsJson);
  },
  authMcpServer: (name: string) => {
    void name;
    throw new Error("Kimi Code does not expose MCP authorization commands in the current CLI.");
  },
  resetMcpServerAuth: (name: string) => {
    void name;
    throw new Error("Kimi Code does not expose MCP authorization reset commands in the current CLI.");
  },
  testProfileConnectivity: (state: AppState, profileName: string, modelName?: string) => {
    const draft = cloneState(state);
    applyProfile(draft, profileName);
    return cli.runKimiConnectivityTest(draft, modelName ?? draft.mainConfig.default_model);
  },
  testEndpointReachability: async (url: string): Promise<EndpointReachabilityResult> => {
    let endpoint: URL;
    try {
      endpoint = new URL(url.trim());
    } catch {
      return { ok: false, status: 0, message: "Invalid endpoint URL." };
    }
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      return { ok: false, status: 0, message: "Endpoint URL must use http or https." };
    }
    try {
      const resp = await Promise.race([
        invoke<{ status: number; ok: boolean; body: string }>("http_request", {
          method: "GET",
          url: endpoint.toString(),
          headers: { Accept: "*/*", "User-Agent": "kimi-code-switch-gui" },
          body: null,
        }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Endpoint health check timed out.")), 8000);
        }),
      ]);
      return {
        ok: resp.status === 200,
        status: resp.status,
        message: `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
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
  usageIngestNow: async () => {
    await logWatcher?.ingestNow();
    return { ok: true as const };
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
    return { ok: true as const, slice: await usageDb.queryOverview(range, activeKimiCodeEnvironmentId()) };
  },
  usageQueryTrend: async (args: { range: never; bucket: never; groupBy: never }) => {
    if (!usageOpen) return { ok: true as const, series: [] };
    return { ok: true as const, series: await usageDb.queryTrend(args.range, args.bucket, args.groupBy, activeKimiCodeEnvironmentId()) };
  },
  usageQueryBreakdown: async (args: { dim: "profile" | "model"; range: never; limit: number; orderBy: never }) => {
    if (!usageOpen) return { ok: true as const, rows: [] };
    return { ok: true as const, rows: await usageDb.queryBreakdown(args.dim, args.range, args.limit, args.orderBy, activeKimiCodeEnvironmentId()) };
  },
  usageQuerySessions: async (args: { range: never; limit: number }) => {
    if (!usageOpen) return { ok: true as const, rows: [] };
    return { ok: true as const, rows: await usageDb.queryHeaviestSessions(args.range, args.limit, activeKimiCodeEnvironmentId()) };
  },
  usageQueryEvents: async (args: { filter: never; cursor: string | null; pageSize: number }) => {
    if (!usageOpen) return { ok: true as const, page: { rows: [], nextCursor: null } };
    return { ok: true as const, page: await usageDb.queryEvents(args.filter, args.cursor, args.pageSize, activeKimiCodeEnvironmentId()) };
  },
  usageQueryCost: async (range: never) => {
    const empty = { ok: true as const, total: null as number | null, byDay: {} as Record<string, number | null>, byModel: {} as Record<string, number | null> };
    if (!usageOpen) return empty;
    const models = currentAppState?.mainConfig.models ?? {};
    const environmentId = activeKimiCodeEnvironmentId();
    const [modelSums, modelDaySums] = await Promise.all([
      usageDb.queryModelTokenSums(range, false, environmentId),
      usageDb.queryModelTokenSums(range, true, environmentId),
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
  runBackup: (state: AppState, trigger?: string) => backup.runBackup(state, trigger),
  listBackups: (state: AppState) => backup.listBackups(state),
  deleteBackup: (state: AppState, backupName: string) => backup.deleteBackup(state, backupName),
  restoreBackup: (state: AppState, backupName: string) => backup.restoreBackup(state, backupName),
  restoreBackupSafe: (state: AppState, backupName: string, options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean }) => backup.restoreBackupSafe(state, backupName, options),
  restoreBackupDryRun: (state: AppState, backupName: string) => backup.restoreBackupDryRun(state, backupName),
  testBackupWebdav: (state: AppState) => backup.testBackupWebdav(state),

  void: () => { void USAGE_JSONL_DIR; void notImplemented; },
};

export function installKimiSwitchTauri(): void {
  window.kimiSwitch = kimiSwitchTauri;

  // 监听窗口关闭事件：根据 close_behavior 决定是隐藏到托盘还是退出
  const mainWindow = getCurrentWindow();
  void mainWindow.onCloseRequested(async (event) => {
    // 读取当前设置
    const closeBehavior = currentAppState?.panelSettings.close_behavior ?? "quit";
    const trayEnabled = currentAppState?.panelSettings.tray_icon ?? false;

    // 如果设置为隐藏到托盘且托盘已启用，则隐藏窗口而不是退出
    if (closeBehavior === "keep-in-tray" && trayEnabled) {
      event.preventDefault();
      await mainWindow.hide();

      // 隐藏到托盘时自动隐藏 Dock 图标
      await invoke("set_dock_icon_visibility", { visible: false }).catch((err) => {
        console.error("Failed to hide dock icon:", err);
      });
    }
    // 否则允许默认行为（退出应用）
  });

  // 监听窗口显示事件：恢复 Dock 图标
  void mainWindow.listen("tauri://show", async () => {
    const closeBehavior = currentAppState?.panelSettings.close_behavior ?? "quit";
    const trayEnabled = currentAppState?.panelSettings.tray_icon ?? false;

    // 如果是托盘模式，恢复 Dock 图标
    if (closeBehavior === "keep-in-tray" && trayEnabled) {
      await invoke("set_dock_icon_visibility", { visible: true }).catch((err) => {
        console.error("Failed to show dock icon:", err);
      });
    }
  });

  void syncWindowToggleShortcut();
}

function syncWindowToggleShortcut(): Promise<void> {
  shortcutSyncTask = shortcutSyncTask
    .catch(() => undefined)
    .then(() => syncWindowToggleShortcutOnce());
  return shortcutSyncTask;
}

async function syncWindowToggleShortcutOnce(): Promise<void> {
  if (!currentAppState) {
    return;
  }

  const windowToggle = currentAppState.panelSettings.shortcuts["window.toggle"];
  const accelerator = windowToggle?.enabled && windowToggle.scope === "global"
    ? windowToggle.accelerator.trim() || null
    : null;

  await invoke("sync_window_toggle_shortcut", {
    accelerator,
    closeBehavior: currentAppState.panelSettings.close_behavior,
    trayEnabled: currentAppState.panelSettings.tray_icon,
  }).catch((err) => {
    console.error("[Global Shortcut] sync failed:", err);
  });
}
