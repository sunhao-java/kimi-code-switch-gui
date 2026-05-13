import type { IpcMain } from "electron";

import {
  createDefaultPanelSettings,
  loadAppState,
  normalizeStatePaths,
} from "@shared/configStore";
import { buildConfigDoctorReport, buildRedactedPreviewBundle } from "@shared/configSafety";
import { scanSkills } from "@shared/skillsStore";
import type { AppState, FileSnapshotBundle, SaveStateConflictResult, SaveStateResult } from "@shared/types";

import { captureSnapshotForState, readManagedDocuments, resolveManagedPaths } from "./fileSnapshots";
import { startWatching } from "./fileWatcher";
import { fileAccess as defaultFileAccess, skillFileAccess as defaultSkillFileAccess } from "./fileAccess";

export interface StateIpcContext {
  fileAccess: typeof defaultFileAccess;
  skillFileAccess: typeof defaultSkillFileAccess;
  decryptWebDavPassword: (state: AppState) => AppState;
  saveStateWithSafety: (state: AppState, options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean }) => Promise<SaveStateResult | SaveStateConflictResult>;
  updateBackupSchedule: (state: AppState) => void;
  refreshGlobalShortcuts: (state: AppState) => void;
  createTray: () => void;
  updateTrayMenu: () => Promise<void>;
  onExternalFileChange: (changedFileIds: string[]) => void;
}

export function registerStateIpc(ipcMain: IpcMain, ctx: StateIpcContext): void {
  ipcMain.handle("app:load-state", async (_, paths) => {
    const state = await loadAppState(ctx.fileAccess, paths);
    ctx.decryptWebDavPassword(state);
    ctx.updateBackupSchedule(state);
    ctx.refreshGlobalShortcuts(state);
    if (state.panelSettings.tray_icon) {
      ctx.createTray();
    }
    void ctx.updateTrayMenu();
    void startWatching(state, ctx.onExternalFileChange);
    return state;
  });

  ipcMain.handle("app:capture-snapshot", async (_, state: AppState) => {
    return captureSnapshotForState(state);
  });

  ipcMain.handle("app:run-doctor", async (_, state: AppState) => {
    return buildConfigDoctorReport(state);
  });

  ipcMain.handle(
    "app:save-state",
    async (
      _,
      state: AppState,
      options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
    ) => {
      return ctx.saveStateWithSafety(state, options);
    },
  );

  ipcMain.handle("app:preview-state", async (_, state: AppState) => {
    const normalizedState = normalizeStatePaths(state);
    const targetPaths = resolveManagedPaths(normalizedState);
    const diskDocuments = await readManagedDocuments(targetPaths);
    return buildRedactedPreviewBundle(normalizedState, diskDocuments);
  });

  ipcMain.handle("skills:scan", async (_, state: AppState) => {
    const normalizedState = normalizeStatePaths(state);
    return scanSkills(ctx.skillFileAccess, {
      mergeAllAvailableSkills: normalizedState.mainConfig.merge_all_available_skills,
    });
  });

  ipcMain.handle("app:default-settings", () => {
    return createDefaultPanelSettings();
  });
}
