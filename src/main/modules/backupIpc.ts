import type { IpcMain } from "electron";

import type {
  AppState,
  FileSnapshotBundle,
  ManagedFileId,
  RestoreBackupResult,
  RestoreDryRunResult,
  SaveStateConflictResult,
} from "@shared/types";

import { resolveManagedPaths } from "./fileSnapshots";
import { markSelfWrite } from "./fileWatcher";
import { testWebDavConnection } from "./webdav";
import { buildRestoreDryRun, restoreBackupSafely } from "./backupRestore";

export interface BackupIpcContext {
  runBackup: (state?: AppState) => Promise<{ ok: true; backupPath: string; files: string[] }>;
  listBackups: (state: AppState) => Promise<Array<{ name: string; createdAt: string; path: string; itemCount?: number }>>;
  deleteBackup: (state: AppState, backupName: string) => Promise<{ ok: true }>;
  createBackupSnapshot: (state: AppState, trigger: "manual" | "scheduled" | "on-change" | "pre-restore" | "rollback") => Promise<{ backupName: string }>;
  loadAppState: (paths?: Record<string, string>) => Promise<AppState>;
  decryptWebDavPassword: (state: AppState) => AppState;
  updateBackupSchedule: (state: AppState) => void;
  refreshGlobalShortcuts: (state: AppState) => void;
  cloneState: (state: AppState) => AppState;
  updateBaseline: () => Promise<void>;
  updateTrayMenu: () => Promise<void>;
  setLatestAppState: (state: AppState) => void;
  captureSnapshotForState: (state: AppState) => Promise<FileSnapshotBundle>;
}

export function registerBackupIpc(ipcMain: IpcMain, ctx: BackupIpcContext): void {
  ipcMain.handle("backup:run", async (_, state?: AppState) => {
    return ctx.runBackup(state);
  });

  ipcMain.handle("backup:list", async (_, state: AppState) => {
    return ctx.listBackups(state);
  });

  ipcMain.handle("backup:delete", async (_, state: AppState, backupName: string) => {
    return ctx.deleteBackup(state, backupName);
  });

  ipcMain.handle(
    "backup:restore-dry-run",
    async (
      _,
      state: AppState,
      backupName: string,
      options?: { expectedSnapshot?: FileSnapshotBundle },
    ): Promise<RestoreDryRunResult | SaveStateConflictResult> => {
      return buildRestoreDryRun(state, backupName, options?.expectedSnapshot);
    },
  );

  ipcMain.handle(
    "backup:restore",
    async (
      _,
      state: AppState,
      backupName: string,
      options?: { expectedSnapshot?: FileSnapshotBundle; allowOverwrite?: boolean },
    ): Promise<RestoreBackupResult | SaveStateConflictResult> => {
      for (const id of Object.keys(resolveManagedPaths(state)) as ManagedFileId[]) {
        markSelfWrite(id);
      }
      return restoreBackupSafely({
        state,
        backupName,
        expectedSnapshot: options?.expectedSnapshot,
        allowOverwrite: options?.allowOverwrite,
        createBackupSnapshot: async (snapshotState, trigger) => ctx.createBackupSnapshot(snapshotState, trigger),
        loadRestoredState: async (paths) => {
          const restoredState = await ctx.loadAppState(paths);
          ctx.decryptWebDavPassword(restoredState);
          return restoredState;
        },
        onRestored: (restoredState) => {
          ctx.updateBackupSchedule(restoredState);
          ctx.setLatestAppState(ctx.cloneState(restoredState));
          ctx.refreshGlobalShortcuts(restoredState);
          void ctx.updateBaseline();
          void ctx.updateTrayMenu();
        },
        captureSnapshot: ctx.captureSnapshotForState,
      });
    },
  );

  ipcMain.handle("backup:test-webdav", async (_, state: AppState) => {
    return testWebDavConnection(state.panelSettings);
  });
}
