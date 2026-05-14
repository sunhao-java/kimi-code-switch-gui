import { contextBridge, ipcRenderer } from "electron";

import type { SkillsScanReport } from "@shared/skillsStore";
import type {
  AppState,
  BackupRecord,
  BackupResult,
  ConfigDoctorReport,
  ExternalChangeNotifyPayload,
  FileDialogResult,
  FileSnapshotBundle,
  PanelSettings,
  PreviewBundle,
  OpenKimiTerminalRequest,
  ProfileConnectivityTestResult,
  RestoreBackupResult,
  RestoreDryRunResult,
  SaveStateConflictResult,
  SaveStateResult,
  TrayCommand,
} from "@shared/types";

type InitialRendererTheme = "dark" | "light";
type InitialAppearanceTheme = "aurora" | "ocean" | "violet" | "sunset";
type PreloadDocument = {
  documentElement: {
    dataset: {
      theme?: string;
      appearanceTheme?: string;
    };
  };
};

function readInitialRendererTheme(): InitialRendererTheme {
  const prefix = "--kimi-initial-theme=";
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value === "light" ? "light" : "dark";
}

function readInitialAppearanceTheme(): InitialAppearanceTheme {
  const prefix = "--kimi-appearance-theme=";
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value === "ocean" || value === "violet" || value === "sunset" ? value : "aurora";
}

function applyInitialRendererTheme(): void {
  const preloadDocument = (globalThis as { document?: PreloadDocument }).document;
  if (!preloadDocument?.documentElement) {
    return;
  }
  preloadDocument.documentElement.dataset.theme = readInitialRendererTheme();
  preloadDocument.documentElement.dataset.appearanceTheme = readInitialAppearanceTheme();
}

applyInitialRendererTheme();

function unwrapSaveStateResult(result: SaveStateResult | SaveStateConflictResult): { ok: true } {
  if (result.ok) {
    return { ok: true };
  }
  throw new Error(`Save blocked: ${result.reason}`);
}

function unwrapRestoreBackupResult(result: RestoreBackupResult | SaveStateConflictResult): AppState {
  if (result.ok) {
    return result.state;
  }
  throw new Error(`Restore blocked: ${result.reason}`);
}

const api = {
  loadState: (paths?: {
    configPath?: string;
    profilesPath?: string;
    panelSettingsPath?: string;
    mcpConfigPath?: string;
  }): Promise<AppState> => ipcRenderer.invoke("app:load-state", paths),
  saveState: async (state: AppState): Promise<{ ok: true }> => unwrapSaveStateResult(await ipcRenderer.invoke("app:save-state", state)),
  saveStateSafe: (
    state: AppState,
    options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
  ): Promise<SaveStateResult | SaveStateConflictResult> => ipcRenderer.invoke("app:save-state", state, options),
  captureSnapshot: (state: AppState): Promise<FileSnapshotBundle> => ipcRenderer.invoke("app:capture-snapshot", state),
  runDoctor: (state: AppState): Promise<ConfigDoctorReport> => ipcRenderer.invoke("app:run-doctor", state),
  previewState: (state: AppState): Promise<PreviewBundle> => ipcRenderer.invoke("app:preview-state", state),
  scanSkills: (state: AppState): Promise<SkillsScanReport> => ipcRenderer.invoke("skills:scan", state),
  defaultSettings: (): Promise<PanelSettings> => ipcRenderer.invoke("app:default-settings"),
  pickFile: (options?: Record<string, unknown>): Promise<FileDialogResult> =>
    ipcRenderer.invoke("dialog:pick-file", options),
  saveFile: (content: string, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<FileDialogResult> =>
    ipcRenderer.invoke("dialog:save-file", content, options),
  readFile: (filePath: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke("dialog:read-file", filePath),
  setTray: (enabled: boolean): Promise<{ ok: true }> => ipcRenderer.invoke("app:set-tray", enabled),
  refreshTrayMenu: (): Promise<{ ok: true }> => ipcRenderer.invoke("app:refresh-tray-menu"),
  openExternal: (url: string): Promise<{ ok: true }> => ipcRenderer.invoke("app:open-external", url),
  openKimiInTerminal: (request: PanelSettings | OpenKimiTerminalRequest): Promise<{ ok: true }> =>
    ipcRenderer.invoke("app:open-kimi-in-terminal", request),
  getInstallSource: (): Promise<"homebrew" | "manual" | "development"> => ipcRenderer.invoke("app:get-install-source"),
  getCliVersion: (options?: { checkLatest?: boolean }): Promise<{ version: string; installed: boolean; latestVersion?: string; hasUpdate?: boolean }> => ipcRenderer.invoke("app:cli-version", options),
  upgradeKimiCli: (): Promise<{ ok: true; stdout: string; stderr: string }> => ipcRenderer.invoke("app:upgrade-kimi-cli"),
  runBackup: (state: AppState): Promise<BackupResult> => ipcRenderer.invoke("backup:run", state),
  listBackups: (state: AppState): Promise<BackupRecord[]> => ipcRenderer.invoke("backup:list", state),
  deleteBackup: (state: AppState, backupName: string): Promise<{ ok: true }> => ipcRenderer.invoke("backup:delete", state, backupName),
  restoreBackup: async (state: AppState, backupName: string): Promise<AppState> =>
    unwrapRestoreBackupResult(await ipcRenderer.invoke("backup:restore", state, backupName)),
  restoreBackupSafe: (
    state: AppState,
    backupName: string,
    options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
  ): Promise<RestoreBackupResult | SaveStateConflictResult> => ipcRenderer.invoke("backup:restore", state, backupName, options),
  restoreBackupDryRun: (
    state: AppState,
    backupName: string,
    options?: { expectedSnapshot?: FileSnapshotBundle },
  ): Promise<RestoreDryRunResult | SaveStateConflictResult> => ipcRenderer.invoke("backup:restore-dry-run", state, backupName, options),
  testBackupWebdav: (state: AppState): Promise<{ ok: true; target: string }> => ipcRenderer.invoke("backup:test-webdav", state),
  checkForUpdates: (): Promise<{
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    releaseUrl: string;
    releaseName: string;
    publishedAt: string;
    homebrewCommand: string;
    installSource: "homebrew" | "manual" | "development";
  }> => ipcRenderer.invoke("app:check-for-updates"),
  testMcpServer: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:test-server", name),
  authMcpServer: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:auth-server", name),
  resetMcpServerAuth: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:reset-auth", name),
  testProfileConnectivity: (state: AppState, profileName: string, modelName?: string): Promise<ProfileConnectivityTestResult> =>
    ipcRenderer.invoke("profile:test-connectivity", state, profileName, modelName),
  onTrayCommand: (callback: (command: TrayCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: TrayCommand): void => callback(command);
    ipcRenderer.on("tray:command", listener);
    return () => ipcRenderer.removeListener("tray:command", listener);
  },
  onExternalFileChange: (callback: (payload: ExternalChangeNotifyPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ExternalChangeNotifyPayload): void => callback(payload);
    ipcRenderer.on("file:external-change", listener);
    return () => { ipcRenderer.removeListener("file:external-change", listener); };
  },
};

contextBridge.exposeInMainWorld("kimiSwitch", api);

export type KimiSwitchApi = typeof api;
