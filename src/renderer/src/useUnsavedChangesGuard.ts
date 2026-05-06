import { useCallback, useEffect, useRef } from "react";

import type { AppState, Locale } from "@shared/types";
import type { ConfirmDialogState } from "./dialogs";
import { collectDirtyKeys, isEqualValue } from "./appHelpers";
import { t } from "./i18n";

interface UnsavedChangesGuardContext {
  state: AppState;
  savedState: AppState | null;
  locale: Locale;
  requestConfirm: (options: ConfirmDialogState) => Promise<boolean>;
  persistState: (nextState: AppState) => Promise<void>;
  restoreSavedState: (nextSavedState: AppState) => void;
}

export function useUnsavedChangesGuard(ctx: UnsavedChangesGuardContext) {
  const {
    state,
    savedState,
    locale,
    requestConfirm,
    persistState,
    restoreSavedState,
  } = ctx;
  const unsavedResolutionRef = useRef(false);
  const hasUnsavedChanges = Boolean(state && savedState) && !isEqualValue(state, savedState);
  const dirtyProviders = state && savedState
    ? collectDirtyKeys(state.mainConfig.providers, savedState.mainConfig.providers)
    : new Set<string>();
  const dirtyModels = state && savedState
    ? collectDirtyKeys(state.mainConfig.models, savedState.mainConfig.models)
    : new Set<string>();
  const dirtyProfiles = state && savedState
    ? collectDirtyKeys(state.profiles, savedState.profiles)
    : new Set<string>();
  const dirtyMcpServers = state && savedState
    ? collectDirtyKeys(state.mcpConfig.mcpServers, savedState.mcpConfig.mcpServers)
    : new Set<string>();

  const resolveUnsavedChanges = useCallback(async (): Promise<void> => {
    const currentState = state;
    if (!currentState || !hasUnsavedChanges || !savedState || unsavedResolutionRef.current) {
      return;
    }
    unsavedResolutionRef.current = true;
    try {
      const shouldSave = await requestConfirm({
        title: t(locale, "unsavedChangesTitle"),
        description: t(locale, "unsavedChangesDescription"),
        confirmLabel: t(locale, "save"),
        cancelLabel: t(locale, "discardChanges"),
        tone: "primary",
        kind: "save",
      });
      if (shouldSave) {
        await persistState(currentState);
      } else {
        restoreSavedState(savedState);
      }
    } finally {
      unsavedResolutionRef.current = false;
    }
  }, [
    hasUnsavedChanges,
    locale,
    persistState,
    requestConfirm,
    restoreSavedState,
    savedState,
    state,
  ]);

  const runAfterUnsavedHandled = useCallback((action: () => void | Promise<void>): void => {
    void (async () => {
      await resolveUnsavedChanges();
      await action();
    })();
  }, [resolveUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handleBlur = (): void => {
      void resolveUnsavedChanges();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [hasUnsavedChanges, resolveUnsavedChanges]);

  return {
    unsavedResolutionRef,
    hasUnsavedChanges,
    dirtyProviders,
    dirtyModels,
    dirtyProfiles,
    dirtyMcpServers,
    resolveUnsavedChanges,
    runAfterUnsavedHandled,
  };
}
