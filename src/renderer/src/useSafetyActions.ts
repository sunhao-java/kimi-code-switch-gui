import type { Dispatch, SetStateAction } from "react";

import { normalizeStatePaths } from "@shared/configStore";
import type {
  AppState,
  ConfigDoctorReport,
  FileSnapshotBundle,
  Locale,
  SaveStateConflictResult,
} from "@shared/types";
import { getApi } from "./appHelpers";
import { t, translateError } from "./i18n";
import { applyPrimarySelections, getRetainedPrimarySelections } from "./primarySelections";
import { applyAppearanceMode, applyAppearanceTheme, applyUiFontSize, formatMessage } from "./tabComponents";

interface SafetyActionsContext {
  locale: Locale;
  setState: Dispatch<SetStateAction<AppState>>;
  setSavedState: Dispatch<SetStateAction<AppState | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  fileSnapshot: FileSnapshotBundle | null;
  setFileSnapshot: Dispatch<SetStateAction<FileSnapshotBundle | null>>;
  doctorReport: ConfigDoctorReport | null;
  setDoctorReport: Dispatch<SetStateAction<ConfigDoctorReport | null>>;
  currentSelections: {
    provider: string;
    model: string;
    profile: string;
    mcpServer: string;
  };
  setSelectedProvider: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  setSelectedMcpServer: Dispatch<SetStateAction<string>>;
  refreshPreview: (draft?: AppState) => Promise<void>;
  requestConfirm: (options: {
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
    tone: "primary" | "danger";
    kind: "save" | "delete";
  }) => Promise<boolean>;
}

export function isExternalChangeConflict(value: unknown): value is SaveStateConflictResult {
  return isRecord(value) && value.ok === false && value.reason === "external-change";
}

export function useSafetyActions(ctx: SafetyActionsContext) {
  const {
    locale,
    setState,
    setSavedState,
    setError,
    setNotice,
    fileSnapshot,
    setFileSnapshot,
    doctorReport,
    setDoctorReport,
    currentSelections,
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
    refreshPreview,
    requestConfirm,
  } = ctx;

  const refreshSafetyState = async (state: AppState): Promise<void> => {
    const api = getApi();
    if (!api?.captureSnapshot || !api?.runDoctor) {
      return;
    }
    const normalized = normalizeStatePaths(state);
    const [snapshot, report] = await Promise.all([
      api.captureSnapshot(normalized),
      api.runDoctor(normalized),
    ]);
    setFileSnapshot(snapshot);
    setDoctorReport(report);
  };

  const runDoctor = (state: AppState): void => {
    const api = getApi();
    if (!api?.runDoctor) {
      setNotice("");
      setError(t(locale, "doctorRuntimeOutdated"));
      return;
    }

    void (async () => {
      try {
        const report = await api.runDoctor(normalizeStatePaths(state));
        setDoctorReport(report);
        setError("");
        setNotice(
          formatMessage(t(locale, "doctorRunComplete"), {
            errors: report.errorCount,
            warnings: report.warningCount,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice("");
        setError(translateError(locale, message));
      }
    })();
  };

  const confirmExternalOverwrite = async (conflict: SaveStateConflictResult): Promise<boolean> => {
    const first = conflict.conflict.changedFiles[0];
    const changedList = conflict.conflict.changedFiles
      .map((file) => `${file.id}: ${file.reason}`)
      .join(" / ");
    return requestConfirm({
      title: t(locale, "externalChangeTitle"),
      description: formatMessage(t(locale, "externalChangeDescription"), {
        count: conflict.conflict.changedFiles.length,
        file: first?.path ?? "",
        files: changedList,
      }),
      confirmLabel: t(locale, "externalChangeOverwrite"),
      cancelLabel: t(locale, "cancel"),
      tone: "danger",
      kind: "save",
    });
  };

  const restoreWithDryRun = async (state: AppState, backupName: string): Promise<void> => {
    const api = getApi();
    if (!api?.restoreBackupDryRun || !api?.restoreBackupSafe) {
      setNotice("");
      setError(t(locale, "backupRuntimeOutdated"));
      return;
    }

    const normalizedState = normalizeStatePaths(state);
    const dryRun = await api.restoreBackupDryRun(normalizedState, backupName, {
      expectedSnapshot: fileSnapshot ?? undefined,
    });
    if (isExternalChangeConflict(dryRun)) {
      const overwrite = await confirmExternalOverwrite(dryRun);
      if (!overwrite) {
        setDoctorReport(dryRun.doctor);
        setFileSnapshot(dryRun.snapshot);
        return;
      }
    } else {
      const changedFiles = dryRun.filePlans.filter((plan) => plan.action !== "unchanged");
      const confirmed = await requestConfirm({
        title: formatMessage(t(locale, "backupRestoreDryRunTitle"), { name: backupName }),
        description: formatMessage(t(locale, "backupRestoreDryRunDescription"), {
          count: changedFiles.length,
          warnings: dryRun.warnings.length,
        }),
        confirmLabel: t(locale, "restore"),
        cancelLabel: t(locale, "cancel"),
        tone: dryRun.doctor.errorCount > 0 ? "danger" : "primary",
        kind: "save",
      });
      if (!confirmed) {
        setDoctorReport(dryRun.doctor);
        return;
      }
    }

    const restored = await api.restoreBackupSafe(normalizedState, backupName, {
      expectedSnapshot: fileSnapshot ?? undefined,
      allowOverwrite: true,
    });
    if (isExternalChangeConflict(restored)) {
      setDoctorReport(restored.doctor);
      setFileSnapshot(restored.snapshot);
      throw new Error(t(locale, "externalChangeCanceled"));
    }

    const normalized = normalizeStatePaths(restored.state);
    setState(normalized);
    setSavedState(normalized);
    setFileSnapshot(restored.snapshot);
    setDoctorReport(restored.doctor);
    applyAppearanceMode(normalized.panelSettings.theme);
    applyAppearanceTheme(normalized.panelSettings.appearance_theme);
    applyUiFontSize(normalized.panelSettings.ui_font_size);
    applyPrimarySelections(
      getRetainedPrimarySelections(normalized, currentSelections),
      {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      },
    );
    void refreshPreview(normalized);
    setError("");
    setNotice(
      formatMessage(t(locale, "backupRestoreSuccessWithRollback"), {
        name: backupName,
        rollback: restored.rollbackBackupName,
      }),
    );
  };

  return {
    doctorReport,
    refreshSafetyState,
    runDoctor,
    confirmExternalOverwrite,
    restoreWithDryRun,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
