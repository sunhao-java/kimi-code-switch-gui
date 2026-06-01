// window.kimiSwitch 的 Tauri 适配器。
//
// 架构（见迁移策略）：业务逻辑（@shared/*）直接在 renderer 跑，
// 通过注入 tauriFileAccess 完成 I/O；纯系统集成能力走 Tauri invoke。
//
// 迁移期渐进式实现：已接通的命令走真实逻辑，未迁移的抛 NotImplemented，
// 便于运行时清楚定位剩余工作量。
import { invoke } from "@tauri-apps/api/core";

import {
  createDefaultPanelSettings,
  loadAppState,
  normalizeStatePaths,
  saveAppState,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildRedactedPreviewBundle } from "@shared/configSafety";
import { scanSkills } from "@shared/skillsStore";
import type { AppState, PanelSettings, PreviewBundle } from "@shared/types";

import { tauriFileAccess, pathExists } from "./fileAccess";

const PANEL_FILENAMES = ["config.toml", "config.profiles.toml", "config.panel.toml"];

function notImplemented(name: string): never {
  throw new Error(`[tauri] ${name} 尚未迁移到 Tauri 后端`);
}

const skillFileAccess = {
  readText: (path: string) => tauriFileAccess.readText(path),
  listDir: (path: string) =>
    invoke<Array<{ name: string; isDirectory: boolean }>>("list_dir_typed", { path }),
  pathExists,
};

// 读取磁盘上托管文档（供 preview 对比用）
async function readManagedDocuments(state: AppState): Promise<Record<string, string | null>> {
  const normalized = normalizeStatePaths(state);
  const targets: Record<string, string> = {
    config: normalized.configPath,
    profiles: normalized.profilesPath,
    panelSettings: normalized.panelSettingsPath,
    mcpConfig: normalized.mcpConfigPath,
  };
  const out: Record<string, string | null> = {};
  for (const [key, path] of Object.entries(targets)) {
    out[key] = await tauriFileAccess.readText(path);
  }
  return out;
}

export const kimiSwitchTauri = {
  // ── 核心状态链路（已接通真实业务逻辑）──
  loadState: (paths?: {
    configPath?: string;
    profilesPath?: string;
    panelSettingsPath?: string;
    mcpConfigPath?: string;
  }): Promise<AppState> => loadAppState(tauriFileAccess, paths),

  saveState: async (state: AppState): Promise<{ ok: true }> => {
    await saveAppState(tauriFileAccess, state);
    return { ok: true };
  },

  previewState: async (state: AppState): Promise<PreviewBundle> => {
    const normalized = normalizeStatePaths(state);
    const disk = await readManagedDocuments(normalized);
    return buildRedactedPreviewBundle(normalized, disk);
  },

  runDoctor: (state: AppState) => buildConfigDoctorReport(state),

  scanSkills: (state: AppState) => {
    const normalized = normalizeStatePaths(state);
    return scanSkills(skillFileAccess, {
      mergeAllAvailableSkills: normalized.mainConfig.merge_all_available_skills,
    });
  },

  defaultSettings: (): Promise<PanelSettings> =>
    Promise.resolve(createDefaultPanelSettings()),

  // ── 基础系统集成（Tauri 插件，POC 后逐步接通）──
  openExternal: async (url: string): Promise<{ ok: true }> => {
    await invoke("plugin:opener|open_url", { url });
    return { ok: true };
  },

  // ── 以下为占位，按里程碑逐步迁移 ──
  saveStateSafe: () => notImplemented("saveStateSafe"),
  captureSnapshot: () => notImplemented("captureSnapshot"),
  pickFile: () => notImplemented("pickFile"),
  saveFile: () => notImplemented("saveFile"),
  readFile: () => notImplemented("readFile"),
  setTray: () => Promise.resolve({ ok: true as const }),
  refreshTrayMenu: () => Promise.resolve({ ok: true as const }),
  openKimiInTerminal: () => notImplemented("openKimiInTerminal"),
  getInstallSource: () => Promise.resolve("development" as const),
  getCliVersion: () => notImplemented("getCliVersion"),
  upgradeKimiCli: () => notImplemented("upgradeKimiCli"),
  runBackup: () => notImplemented("runBackup"),
  listBackups: () => notImplemented("listBackups"),
  deleteBackup: () => notImplemented("deleteBackup"),
  restoreBackup: () => notImplemented("restoreBackup"),
  restoreBackupSafe: () => notImplemented("restoreBackupSafe"),
  restoreBackupDryRun: () => notImplemented("restoreBackupDryRun"),
  testBackupWebdav: () => notImplemented("testBackupWebdav"),
  checkForUpdates: () => notImplemented("checkForUpdates"),
  readChangelog: () => Promise.resolve(null),
  testMcpServer: () => notImplemented("testMcpServer"),
  authMcpServer: () => notImplemented("authMcpServer"),
  resetMcpServerAuth: () => notImplemented("resetMcpServerAuth"),
  testProfileConnectivity: () => notImplemented("testProfileConnectivity"),
  onTrayCommand: () => () => {},
  onExternalFileChange: () => () => {},
  usageGetStatus: () => Promise.resolve({ ok: false as const, error: "usage 尚未迁移" }),
  usageEnable: () => notImplemented("usageEnable"),
  usageDisable: () => notImplemented("usageDisable"),
  usagePause: () => notImplemented("usagePause"),
  usageSetConfig: () => notImplemented("usageSetConfig"),
  usageQueryOverview: () => notImplemented("usageQueryOverview"),
  usageQueryTrend: () => notImplemented("usageQueryTrend"),
  usageQueryBreakdown: () => notImplemented("usageQueryBreakdown"),
  usageQuerySessions: () => notImplemented("usageQuerySessions"),
  usageQueryEvents: () => notImplemented("usageQueryEvents"),
  usageGetStorageInfo: () => notImplemented("usageGetStorageInfo"),
  usageCleanup: () => notImplemented("usageCleanup"),
  usageResetAllData: () => notImplemented("usageResetAllData"),
  usageOpenSessionTerminal: () => notImplemented("usageOpenSessionTerminal"),
};

/** 在 Tauri 环境下把适配器挂到 window.kimiSwitch。 */
export function installKimiSwitchTauri(): void {
  // @ts-expect-error 运行时注入，类型与 Electron preload 的 KimiSwitchApi 对齐
  window.kimiSwitch = kimiSwitchTauri;
  void PANEL_FILENAMES;
}
