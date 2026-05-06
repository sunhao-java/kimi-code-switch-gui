import type { Dispatch, SetStateAction } from "react";

import { normalizeStatePaths } from "@shared/configStore";
import type { AppState, BackupDestinationType, BackupRecord, Locale } from "@shared/types";
import type { BackupRecordsDialogState, ConfirmDialogState } from "./dialogs";
import { getApi } from "./appHelpers";
import { t, translateError } from "./i18n";
import { formatMessage, applyAppearanceMode, applyUiFontSize } from "./tabComponents";

interface BackupContext {
  state: AppState;
  locale: Locale;
  setState: Dispatch<SetStateAction<AppState | null>>;
  setSavedState: Dispatch<SetStateAction<AppState | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setIsBackupRunning: (v: boolean) => void;
  setIsWebDavTesting: (v: boolean) => void;
  setBackupRecordsDialog: Dispatch<SetStateAction<BackupRecordsDialogState | null>>;
  confirmDeleteResource: (label: string, name: string) => Promise<boolean>;
  requestConfirm: (opts: ConfirmDialogState) => Promise<boolean>;
  refreshPreview: (draft?: AppState) => Promise<void>;
  setSelectedProvider: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  setSelectedMcpServer: Dispatch<SetStateAction<string>>;
}

export function useBackup(ctx: BackupContext) {
  const {
    state,
    locale,
    setState,
    setSavedState,
    setError,
    setNotice,
    setIsBackupRunning,
    setIsWebDavTesting,
    setBackupRecordsDialog,
    confirmDeleteResource,
    requestConfirm,
    refreshPreview,
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
  } = ctx;

  const runManualBackup = (): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup cannot continue.");
      return;
    }
    if (typeof api.runBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      try {
        setIsBackupRunning(true);
        const result = await api.runBackup(state);
        setError("");
        setNotice(formatMessage(t(locale, "backupSuccess"), { path: result.backupPath }));
      } catch (backupError) {
        const message = backupError instanceof Error ? backupError.message : String(backupError);
        setNotice("");
        setError(translateError(locale, message));
      } finally {
        setIsBackupRunning(false);
      }
    })();
  };

  const runWebDavTest = (): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup test cannot continue.");
      return;
    }
    if (typeof api.testBackupWebdav !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      try {
        setIsWebDavTesting(true);
        const result = await api.testBackupWebdav(state);
        setError("");
        setNotice(formatMessage(t(locale, "backupWebdavTestSuccess"), { path: result.target }));
      } catch (backupError) {
        const message = backupError instanceof Error ? backupError.message : String(backupError);
        setNotice("");
        setError(translateError(locale, message));
      } finally {
        setIsWebDavTesting(false);
      }
    })();
  };

  const loadBackupRecords = async (
    destinationType: BackupDestinationType,
    deletingName?: string,
  ): Promise<void> => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup records cannot be loaded.");
      return;
    }
    if (typeof api.listBackups !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }
    setBackupRecordsDialog({
      destinationType,
      records: [],
      isLoading: true,
      errorMessage: "",
      deletingName,
    });

    try {
      const records = await api.listBackups(state);
      setBackupRecordsDialog({
        destinationType,
        records,
        isLoading: false,
        errorMessage: "",
        deletingName,
      });
    } catch (listError) {
      const message = listError instanceof Error ? listError.message : String(listError);
      setBackupRecordsDialog({
        destinationType,
        records: [],
        isLoading: false,
        errorMessage: translateError(locale, message),
        deletingName,
      });
    }
  };

  const openBackupRecords = (): void => {
    void loadBackupRecords(state.panelSettings.backup_destination_type);
  };

  const deleteBackupRecord = (record: BackupRecord): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup deletion cannot continue.");
      return;
    }
    if (typeof api.deleteBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      const resourceLabel = locale === "zh-CN" ? "备份" : "backup";
      const confirmed = await confirmDeleteResource(resourceLabel, record.name);
      if (!confirmed) {
        return;
      }

      try {
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                deletingName: record.name,
              }
            : current,
        );
        await api.deleteBackup(state, record.name);
        setError("");
        setNotice(formatMessage(t(locale, "backupDeleteSuccess"), { name: record.name }));
        await loadBackupRecords(state.panelSettings.backup_destination_type);
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
        setNotice("");
        setError(translateError(locale, message));
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                deletingName: undefined,
              }
            : current,
        );
      }
    })();
  };

  const restoreBackupRecord = (record: BackupRecord): void => {
    const api = getApi();
    if (!api) {
      setNotice("");
      setError("Electron preload API is unavailable. Backup restore cannot continue.");
      return;
    }
    if (typeof api.restoreBackup !== "function") {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    void (async () => {
      const confirmed = await requestConfirm({
        title: formatMessage(t(locale, "backupRestoreConfirmTitle"), { name: record.name }),
        description: t(locale, "backupRestoreConfirmDescription"),
        confirmLabel: t(locale, "restore"),
        cancelLabel: t(locale, "cancel"),
        tone: "primary",
        kind: "save",
      });
      if (!confirmed) {
        return;
      }

      try {
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                restoringName: record.name,
              }
            : current,
        );
        const restored = await api.restoreBackup(state, record.name);
        const normalized = normalizeStatePaths(restored);
        setState(normalized);
        setSavedState(normalized);
        applyAppearanceMode(normalized.panelSettings.theme);
        applyUiFontSize(normalized.panelSettings.ui_font_size);
        setSelectedProvider((current) =>
          normalized.mainConfig.providers[current]
            ? current
            : Object.keys(normalized.mainConfig.providers)[0] ?? "",
        );
        setSelectedModel((current) =>
          normalized.mainConfig.models[current]
            ? current
            : Object.keys(normalized.mainConfig.models)[0] ?? "",
        );
        setSelectedProfile((current) =>
          normalized.profiles[current]
            ? current
            : normalized.activeProfile || Object.keys(normalized.profiles)[0] || "",
        );
        setSelectedMcpServer((current) =>
          normalized.mcpConfig.mcpServers[current]
            ? current
            : Object.keys(normalized.mcpConfig.mcpServers)[0] ?? "",
        );
        void refreshPreview(normalized);
        setError("");
        setNotice(formatMessage(t(locale, "backupRestoreSuccess"), { name: record.name }));
        setBackupRecordsDialog(null);
      } catch (restoreError) {
        const message = restoreError instanceof Error ? restoreError.message : String(restoreError);
        setNotice("");
        setError(translateError(locale, message));
        setBackupRecordsDialog((current) =>
          current
            ? {
                ...current,
                restoringName: undefined,
              }
            : current,
        );
      }
    })();
  };

  return { runManualBackup, runWebDavTest, loadBackupRecords, openBackupRecords, deleteBackupRecord, restoreBackupRecord };
}
