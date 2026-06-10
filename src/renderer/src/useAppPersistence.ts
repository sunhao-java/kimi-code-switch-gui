import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MutableRefObject } from "react";

import { cloneState, normalizeStatePaths } from "@shared/configStore";
import type { AppState, ConfigDoctorReport, FileSnapshotBundle, Locale, PreviewBundle, SaveStateConflictResult } from "@shared/types";
import { getApi } from "./appHelpers";
import { translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";
import { applyPrimarySelections, getDefaultPrimarySelections, getRetainedPrimarySelections } from "./primarySelections";
import { applyAppearanceMode, applyAppearanceTheme, applyUiFontSize, createFallbackState } from "./tabComponents";
import { isExternalChangeConflict } from "./useSafetyActions";
import { initBackupBaseline, maybeBackupAfterSave, maybeRunScheduledBackup } from "./backupAuto";

interface AppPersistenceContext {
  state: AppState;
  savedState: AppState | null;
  locale: Locale;
  setState: Dispatch<SetStateAction<AppState>>;
  setSavedState: Dispatch<SetStateAction<AppState | null>>;
  setPreview: Dispatch<SetStateAction<PreviewBundle>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setDiagnostics: Dispatch<SetStateAction<DiagnosticsState>>;
  fileSnapshot: FileSnapshotBundle | null;
  fileSnapshotRef?: MutableRefObject<FileSnapshotBundle | null>;
  setFileSnapshot: Dispatch<SetStateAction<FileSnapshotBundle | null>>;
  setDoctorReport: Dispatch<SetStateAction<ConfigDoctorReport | null>>;
  confirmExternalOverwrite: (conflict: SaveStateConflictResult) => Promise<boolean>;
  refreshPreview: (draft?: AppState) => Promise<void>;
  refreshSkills: (draft?: AppState, options?: { silent?: boolean }) => Promise<void>;
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
}

export function useAppPersistence(ctx: AppPersistenceContext) {
  const {
    state,
    savedState,
    locale,
    setState,
    setSavedState,
    setPreview,
    setError,
    setNotice,
    setDiagnostics,
    fileSnapshot,
    fileSnapshotRef,
    setFileSnapshot,
    setDoctorReport,
    confirmExternalOverwrite,
    refreshPreview,
    refreshSkills,
    currentSelections,
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
  } = ctx;

  const loadState = useCallback(async (): Promise<void> => {
    const api = getApi();
    if (!api) {
      setState(createFallbackState());
      setError("Electron preload API is unavailable. Check the preload script and packaged entry paths.");
      setDiagnostics({
        preload: "unavailable",
        loadState: "failed",
        previewState: "unavailable",
        lastError: "Electron preload API is unavailable.",
      });
      return;
    }

    try {
      setDiagnostics((current) => ({
        ...current,
        preload: "ok",
        loadState: "pending",
      }));
      const next = await api.loadState();
      const normalized = normalizeStatePaths(next);
      setState(normalized);
      setSavedState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyAppearanceTheme(normalized.panelSettings.appearance_theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      applyPrimarySelections(getDefaultPrimarySelections(normalized), {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      });
      const nextPreview = await api.previewState(normalized);
      if (api.captureSnapshot && api.runDoctor) {
        const [snapshot, doctor] = await Promise.all([
          api.captureSnapshot(normalized),
          api.runDoctor(normalized),
        ]);
        setFileSnapshot(snapshot);
        setDoctorReport(doctor);
      }
      setPreview(nextPreview);
      await refreshSkills(normalized, { silent: true });
      setError("");
      setNotice("");
      setDiagnostics({
        preload: "ok",
        loadState: "ok",
        previewState: "ok",
        lastError: "",
      });
      // 设置自动备份会话基线，并在定时备份到期时补做一次。
      await initBackupBaseline(normalized);
      void maybeRunScheduledBackup(normalized);
    } catch (loadError) {
      const fallback = createFallbackState();
      setState(fallback);
      setSavedState(fallback);
      applyAppearanceMode(fallback.panelSettings.theme);
      applyAppearanceTheme(fallback.panelSettings.appearance_theme);
      applyUiFontSize(fallback.panelSettings.ui_font_size);
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setDiagnostics((current) => ({
        preload: current.preload === "pending" ? "ok" : current.preload,
        loadState: "failed",
        previewState: current.previewState,
        lastError: message,
      }));
    }
  }, [
    refreshSkills,
    setDiagnostics,
    setDoctorReport,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setSelectedMcpServer,
    setSelectedModel,
    setSelectedProfile,
    setSelectedProvider,
    setState,
  ]);

  const persistState = useCallback(async (nextState: AppState): Promise<void> => {
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }
    try {
      const normalized = normalizeStatePaths(nextState);
      const expectedSnapshot = fileSnapshotRef?.current ?? fileSnapshot ?? undefined;
      const saveResult = api.saveStateSafe
        ? await api.saveStateSafe(normalized, { expectedSnapshot })
        : await api.saveState(normalized);
      if (isExternalChangeConflict(saveResult)) {
        const overwrite = await confirmExternalOverwrite(saveResult);
        if (!overwrite) {
          setFileSnapshot(saveResult.snapshot);
          setDoctorReport(saveResult.doctor);
          return;
        }
        const overwriteResult = api.saveStateSafe
          ? await api.saveStateSafe(normalized, { expectedSnapshot, allowOverwrite: true })
          : await api.saveState(normalized);
        if (isExternalChangeConflict(overwriteResult)) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
          throw new Error("Save blocked: external-change");
        }
        if ("snapshot" in overwriteResult && "doctor" in overwriteResult) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
        }
      } else if ("snapshot" in saveResult && "doctor" in saveResult) {
        setFileSnapshot(saveResult.snapshot);
        setDoctorReport(saveResult.doctor);
      }
      if (savedState?.panelSettings.tray_icon !== normalized.panelSettings.tray_icon) {
        await api.setTray(normalized.panelSettings.tray_icon);
      }
      const nextPreview = await api.previewState(normalized);
      setState(normalized);
      setSavedState(normalized);
      setPreview(nextPreview);
      void refreshSkills(normalized, { silent: true });
      setError("");
      setNotice("");
      // 修改后备份：核心配置指纹变化时静默触发（指纹去重使纯 UI 操作成为 no-op）。
      void maybeBackupAfterSave(normalized);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    confirmExternalOverwrite,
    fileSnapshot,
    fileSnapshotRef,
    locale,
    refreshSkills,
    savedState,
    setDiagnostics,
    setDoctorReport,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setState,
  ]);

  const onSave = useCallback(async (): Promise<void> => {
    if (!state) {
      return;
    }
    await persistState(state);
  }, [persistState, state]);

  const persistImmediateState = useCallback(async (
    nextVisibleState: AppState,
    nextSavedStateOverride?: AppState,
  ): Promise<void> => {
    const api = getApi();
    if (!api) {
      const message = "Electron preload API is unavailable. Save operation cannot continue.";
      setError(message);
      setDiagnostics((current) => ({ ...current, preload: "unavailable", lastError: message }));
      return;
    }

    const previousSavedState = savedState;
    const normalizedVisibleState = normalizeStatePaths(nextVisibleState);
    const normalizedSavedState = normalizeStatePaths(nextSavedStateOverride ?? nextVisibleState);

    setState(normalizedVisibleState);
    setSavedState(normalizedSavedState);
    applyAppearanceMode(normalizedVisibleState.panelSettings.theme);
    applyAppearanceTheme(normalizedVisibleState.panelSettings.appearance_theme);
    applyUiFontSize(normalizedVisibleState.panelSettings.ui_font_size);
    void refreshPreview(normalizedVisibleState);
    setError("");
    setNotice("");

    try {
      const expectedSnapshot = fileSnapshotRef?.current ?? fileSnapshot ?? undefined;
      const saveResult = api.saveStateSafe
        ? await api.saveStateSafe(normalizedSavedState, { expectedSnapshot })
        : await api.saveState(normalizedSavedState);
      if (isExternalChangeConflict(saveResult)) {
        const overwrite = await confirmExternalOverwrite(saveResult);
        if (!overwrite) {
          setSavedState(previousSavedState ?? null);
          setFileSnapshot(saveResult.snapshot);
          setDoctorReport(saveResult.doctor);
          return;
        }
        const overwriteResult = api.saveStateSafe
          ? await api.saveStateSafe(normalizedSavedState, { expectedSnapshot, allowOverwrite: true })
          : await api.saveState(normalizedSavedState);
        if (isExternalChangeConflict(overwriteResult)) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
          throw new Error("Save blocked: external-change");
        }
        if ("snapshot" in overwriteResult && "doctor" in overwriteResult) {
          setFileSnapshot(overwriteResult.snapshot);
          setDoctorReport(overwriteResult.doctor);
        }
      } else if ("snapshot" in saveResult && "doctor" in saveResult) {
        setFileSnapshot(saveResult.snapshot);
        setDoctorReport(saveResult.doctor);
      }
      if (previousSavedState?.panelSettings.tray_icon !== normalizedSavedState.panelSettings.tray_icon) {
        await api.setTray(normalizedSavedState.panelSettings.tray_icon);
      }
      if (
        previousSavedState?.panelSettings.locale !== normalizedSavedState.panelSettings.locale ||
        previousSavedState?.panelSettings.theme !== normalizedSavedState.panelSettings.theme
      ) {
        await api.refreshTrayMenu?.();
      }
      const nextPreview = await api.previewState(normalizedVisibleState);
      setPreview(nextPreview);
      void refreshSkills(normalizedVisibleState, { silent: true });
      setError("");
      setNotice("");
      // 修改后备份（on-change）：核心配置指纹变化时静默触发，纯 UI 操作为 no-op。
      void maybeBackupAfterSave(normalizedSavedState);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setSavedState(previousSavedState ?? null);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    confirmExternalOverwrite,
    fileSnapshot,
    fileSnapshotRef,
    locale,
    refreshPreview,
    refreshSkills,
    savedState,
    setDiagnostics,
    setDoctorReport,
    setError,
    setFileSnapshot,
    setNotice,
    setPreview,
    setSavedState,
    setState,
  ]);

  const restoreSavedState = useCallback((nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
    applyAppearanceTheme(restored.panelSettings.appearance_theme);
    applyUiFontSize(restored.panelSettings.ui_font_size);
    applyPrimarySelections(
      getRetainedPrimarySelections(restored, currentSelections),
      {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      },
    );
    void refreshSkills(restored, { silent: true });
    void refreshPreview(restored);
    setError("");
    setNotice("");
  }, [
    currentSelections,
    refreshPreview,
    refreshSkills,
    setError,
    setNotice,
    setSelectedMcpServer,
    setSelectedModel,
    setSelectedProfile,
    setSelectedProvider,
    setState,
  ]);

  return {
    loadState,
    persistState,
    onSave,
    persistImmediateState,
    restoreSavedState,
  };
}
