import type { Dispatch, SetStateAction } from "react";
import type { MutableRefObject } from "react";

import { cloneState, normalizeStatePaths } from "@shared/configStore";
import type { AppState, Locale } from "@shared/types";
import { pushChangeSnapshot } from "./historyManager";
import { t, translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";
import { applyAppearanceMode, applyAppearanceTheme, applyUiFontSize } from "./tabComponents";

interface StateMutationsContext {
  state: AppState;
  savedState: AppState | null;
  stateRef?: MutableRefObject<AppState>;
  savedStateRef?: MutableRefObject<AppState | null>;
  locale: Locale;
  setState: Dispatch<SetStateAction<AppState>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setDiagnostics: Dispatch<SetStateAction<DiagnosticsState>>;
  refreshPreview: (draft?: AppState) => Promise<void>;
  persistState: (nextState: AppState) => Promise<void>;
  persistImmediateState: (nextVisibleState: AppState, nextSavedStateOverride?: AppState) => Promise<void>;
}

export function useStateMutations(ctx: StateMutationsContext) {
  const {
    state,
    savedState,
    stateRef,
    savedStateRef,
    locale,
    setState,
    setError,
    setNotice,
    setDiagnostics,
    refreshPreview,
    persistState,
    persistImmediateState,
  } = ctx;

  const updateState = (updater: (draft: AppState) => void, options: { persist?: boolean; recordHistory?: boolean; historySummary?: string } = {}): void => {
    const currentState = stateRef?.current ?? state;
    if (!currentState) {
      return;
    }

    const draft = cloneState(currentState);
    try {
      updater(draft);
      const normalized = normalizeStatePaths(draft);
      setState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyAppearanceTheme(normalized.panelSettings.appearance_theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      void refreshPreview(normalized);
      const shouldRecordHistory = options.recordHistory ?? options.persist !== false;
      if (shouldRecordHistory) {
        pushChangeSnapshot(currentState, normalized, options.historySummary ?? t(locale, "historyGenericChange"));
      }
      if (options.persist !== false) {
        void persistState(normalized);
      }
      setError("");
      setNotice("");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  const updateImmediateState = (updater: (draft: AppState) => void, options: { recordHistory?: boolean; historySummary?: string } = {}): void => {
    const currentState = stateRef?.current ?? state;
    if (!currentState) {
      return;
    }

    const currentSavedState = savedStateRef?.current ?? savedState;
    const visibleDraft = cloneState(currentState);
    const persistedDraft = cloneState(currentSavedState ?? currentState);

    try {
      updater(visibleDraft);
      updater(persistedDraft);
      const normalizedVisibleDraft = normalizeStatePaths(visibleDraft);
      const normalizedPersistedDraft = normalizeStatePaths(persistedDraft);
      if (options.recordHistory === true) {
        pushChangeSnapshot(currentState, normalizedVisibleDraft, options.historySummary ?? t(locale, "historyGenericChange"));
      }
      void persistImmediateState(normalizedVisibleDraft, normalizedPersistedDraft);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError);
      setError(translateError(locale, message));
      setNotice("");
      setDiagnostics((current) => ({ ...current, lastError: message }));
    }
  };

  return {
    updateState,
    updateImmediateState,
  };
}
