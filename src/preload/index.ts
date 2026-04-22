import { contextBridge, ipcRenderer } from "electron";

import type { SkillsScanReport } from "@shared/skillsStore";
import type { AppState, BackupRecord, BackupResult, FileDialogResult, PanelSettings, PreviewBundle, TrayCommand } from "@shared/types";

const api = {
  loadState: (paths?: {
    configPath?: string;
    profilesPath?: string;
    panelSettingsPath?: string;
    mcpConfigPath?: string;
  }): Promise<AppState> => ipcRenderer.invoke("app:load-state", paths),
  saveState: (state: AppState): Promise<{ ok: true }> => ipcRenderer.invoke("app:save-state", state),
  previewState: (state: AppState): Promise<PreviewBundle> => ipcRenderer.invoke("app:preview-state", state),
  scanSkills: (state: AppState): Promise<SkillsScanReport> => ipcRenderer.invoke("skills:scan", state),
  defaultSettings: (): Promise<PanelSettings> => ipcRenderer.invoke("app:default-settings"),
  pickFile: (options?: Record<string, unknown>): Promise<FileDialogResult> =>
    ipcRenderer.invoke("dialog:pick-file", options),
  setTray: (enabled: boolean): Promise<{ ok: true }> => ipcRenderer.invoke("app:set-tray", enabled),
  openExternal: (url: string): Promise<{ ok: true }> => ipcRenderer.invoke("app:open-external", url),
  runBackup: (state: AppState): Promise<BackupResult> => ipcRenderer.invoke("backup:run", state),
  listBackups: (state: AppState): Promise<BackupRecord[]> => ipcRenderer.invoke("backup:list", state),
  deleteBackup: (state: AppState, backupName: string): Promise<{ ok: true }> => ipcRenderer.invoke("backup:delete", state, backupName),
  restoreBackup: (state: AppState, backupName: string): Promise<AppState> => ipcRenderer.invoke("backup:restore", state, backupName),
  testBackupWebdav: (state: AppState): Promise<{ ok: true; target: string }> => ipcRenderer.invoke("backup:test-webdav", state),
  testMcpServer: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:test-server", name),
  authMcpServer: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:auth-server", name),
  resetMcpServerAuth: (name: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("mcp:reset-auth", name),
  testProfileConnectivity: (state: AppState, profileName: string): Promise<{ ok: true; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("profile:test-connectivity", state, profileName),
  onTrayCommand: (callback: (command: TrayCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: TrayCommand): void => callback(command);
    ipcRenderer.on("tray:command", listener);
    return () => ipcRenderer.removeListener("tray:command", listener);
  },
};

contextBridge.exposeInMainWorld("kimiSwitch", api);

export type KimiSwitchApi = typeof api;
