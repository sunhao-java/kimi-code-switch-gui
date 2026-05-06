import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { cloneState, normalizeStatePaths } from "@shared/configStore";
import type { AppState, Locale, PreviewBundle } from "@shared/types";
import { getApi } from "./appHelpers";
import { translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";
import { applyPrimarySelections, getDefaultPrimarySelections, getRetainedPrimarySelections } from "./primarySelections";
import { applyAppearanceMode, applyUiFontSize, createFallbackState } from "./tabComponents";

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
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      applyPrimarySelections(getDefaultPrimarySelections(normalized), {
        setSelectedProvider,
        setSelectedModel,
        setSelectedProfile,
        setSelectedMcpServer,
      });
      const nextPreview = await api.previewState(normalized);
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
    } catch (loadError) {
      const fallback = createFallbackState();
      setState(fallback);
      setSavedState(fallback);
      applyAppearanceMode(fallback.panelSettings.theme);
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
    setError,
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
      await api.saveState(normalized);
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
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    locale,
    refreshSkills,
    savedState,
    setDiagnostics,
    setError,
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
    applyUiFontSize(normalizedVisibleState.panelSettings.ui_font_size);
    void refreshPreview(normalizedVisibleState);
    setError("");
    setNotice("");

    try {
      await api.saveState(normalizedSavedState);
      if (previousSavedState?.panelSettings.tray_icon !== normalizedSavedState.panelSettings.tray_icon) {
        await api.setTray(normalizedSavedState.panelSettings.tray_icon);
      }
      const nextPreview = await api.previewState(normalizedVisibleState);
      setPreview(nextPreview);
      void refreshSkills(normalizedVisibleState, { silent: true });
      setError("");
      setNotice("");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setSavedState(previousSavedState ?? null);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  }, [
    locale,
    refreshPreview,
    refreshSkills,
    savedState,
    setDiagnostics,
    setError,
    setNotice,
    setPreview,
    setSavedState,
    setState,
  ]);

  const restoreSavedState = useCallback((nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
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
