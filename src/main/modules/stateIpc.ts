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
  restoreInsightsRuntime?: (state: AppState) => Promise<void>;
}

export function registerStateIpc(ipcMain: IpcMain, ctx: StateIpcContext): void {
  ipcMain.handle("app:load-state", async (_, paths) => {
    try {
      const state = await loadAppState(ctx.fileAccess, paths);
      ctx.decryptWebDavPassword(state);
      ctx.updateBackupSchedule(state);
      ctx.refreshGlobalShortcuts(state);
      if (state.panelSettings.tray_icon) {
        ctx.createTray();
      }
      void ctx.updateTrayMenu();
      void startWatching(state, ctx.onExternalFileChange);
      if (ctx.restoreInsightsRuntime) {
        void ctx.restoreInsightsRuntime(state);
      }
      return state;
    } catch (error) {
      console.error("app:load-state", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:capture-snapshot", async (_, state: AppState) => {
    try {
      return await captureSnapshotForState(state);
    } catch (error) {
      console.error("app:capture-snapshot", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:run-doctor", async (_, state: AppState) => {
    try {
      return buildConfigDoctorReport(state);
    } catch (error) {
      console.error("app:run-doctor", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    "app:save-state",
    async (
      _,
      state: AppState,
      options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
    ) => {
      try {
        return await ctx.saveStateWithSafety(state, options);
      } catch (error) {
        console.error("app:save-state", error);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle("app:preview-state", async (_, state: AppState) => {
    try {
      const normalizedState = normalizeStatePaths(state);
      const targetPaths = resolveManagedPaths(normalizedState);
      const diskDocuments = await readManagedDocuments(targetPaths);
      return buildRedactedPreviewBundle(normalizedState, diskDocuments);
    } catch (error) {
      console.error("app:preview-state", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("skills:scan", async (_, state: AppState) => {
    try {
      const normalizedState = normalizeStatePaths(state);
      return await scanSkills(ctx.skillFileAccess, {
        mergeAllAvailableSkills: normalizedState.mainConfig.merge_all_available_skills,
      });
    } catch (error) {
      console.error("skills:scan", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:default-settings", () => {
    try {
      return createDefaultPanelSettings();
    } catch (error) {
      console.error("app:default-settings", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
