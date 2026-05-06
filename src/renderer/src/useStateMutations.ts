import type { Dispatch, SetStateAction } from "react";

import { cloneState, normalizeStatePaths } from "@shared/configStore";
import type { AppState, Locale } from "@shared/types";
import { translateError } from "./i18n";
import type { DiagnosticsState } from "./overviewDashboard";
import { applyAppearanceMode, applyUiFontSize } from "./tabComponents";

interface StateMutationsContext {
  state: AppState;
  savedState: AppState | null;
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
    locale,
    setState,
    setError,
    setNotice,
    setDiagnostics,
    refreshPreview,
    persistState,
    persistImmediateState,
  } = ctx;

  const updateState = (updater: (draft: AppState) => void, options: { persist?: boolean } = {}): void => {
    if (!state) {
      return;
    }

    const draft = cloneState(state);
    try {
      updater(draft);
      const normalized = normalizeStatePaths(draft);
      setState(normalized);
      applyAppearanceMode(normalized.panelSettings.theme);
      applyUiFontSize(normalized.panelSettings.ui_font_size);
      void refreshPreview(normalized);
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

  const updateImmediateState = (updater: (draft: AppState) => void): void => {
    if (!state) {
      return;
    }

    const visibleDraft = cloneState(state);
    const persistedDraft = cloneState(savedState ?? state);

    try {
      updater(visibleDraft);
      updater(persistedDraft);
      void persistImmediateState(visibleDraft, persistedDraft);
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
