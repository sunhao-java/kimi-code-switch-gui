import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeStatePaths, cloneState } from "@shared/configStore";
import type { SkillsScanReport } from "@shared/skillsStore";
import type { AppState, BackupDestinationType, BackupRecord, PreviewBundle } from "@shared/types";
import type { BackupRecordsDialogState, ConfirmDialogState, DocumentViewerState } from "./dialogs";
import type { DiagnosticsState } from "./overviewDashboard";
import { SkillsViewMode } from "./skillsWorkspace";
import { TabId, PreviewFileId, emptyPreview } from "./appOptions";
import { getApi, isDraftEntry, isEqualValue, collectDirtyKeys } from "./appHelpers";
import { t, translateError } from "./i18n";
import { createFallbackState, applyAppearanceMode, applyUiFontSize, formatMessage } from "./tabComponents";

// Auto-generated hook - contains all state, effects, and handler functions
export function useAppHandlers() {
  const [state, setState] = useState<AppState>(() => createFallbackState());
  const [savedState, setSavedState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedMcpServer, setSelectedMcpServer] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [selectedSkillPath, setSelectedSkillPath] = useState("");
  const [skillsViewMode, setSkillsViewMode] = useState<SkillsViewMode>("grid");
  const [preview, setPreview] = useState<PreviewBundle>(emptyPreview);
  const [skillsReport, setSkillsReport] = useState<SkillsScanReport | null>(null);
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [documentViewer, setDocumentViewer] = useState<DocumentViewerState | null>(null);
  const [backupRecordsDialog, setBackupRecordsDialog] = useState<BackupRecordsDialogState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isMcpImportOpen, setIsMcpImportOpen] = useState(false);
  const [mcpImportDraft, setMcpImportDraft] = useState("");
  const [mcpImportInitialDraft, setMcpImportInitialDraft] = useState("");
  const [mcpTestingName, setMcpTestingName] = useState("");
  const [profileTestingName, setProfileTestingName] = useState("");
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const [isWebDavTesting, setIsWebDavTesting] = useState(false);
  const [isBackupPasswordVisible, setIsBackupPasswordVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    preload: "pending",
    loadState: "pending",
    previewState: "pending",
    lastError: "",
  });
  const unsavedResolutionRef = useRef(false);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const skillsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = state.panelSettings.locale;

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    applyAppearanceMode(state.panelSettings.theme);
  }, [state.panelSettings.theme]);

  useEffect(() => {
    applyUiFontSize(state.panelSettings.ui_font_size);
  }, [state.panelSettings.ui_font_size]);

  useEffect(() => {
    void refreshSkills(state, { silent: true });
  }, [state.mainConfig.merge_all_available_skills]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = null;
      if (skillsRefreshTimerRef.current) {
        clearTimeout(skillsRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const api = getApi();
    if (!api?.onTrayCommand) {
      return;
    }
    return api.onTrayCommand((command) => {
      if (command === "reload") {
        void loadState();
      }
    });
  }, []);

  async function loadState(): Promise<void> {
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
      setSelectedProvider(Object.keys(normalized.mainConfig.providers)[0] ?? "");
      setSelectedModel(Object.keys(normalized.mainConfig.models)[0] ?? "");
      setSelectedProfile(normalized.activeProfile);
      setSelectedMcpServer(Object.keys(normalized.mcpConfig.mcpServers)[0] ?? "");
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
  }

  const title = t(locale, "appTitle");

  const persistState = async (nextState: AppState): Promise<void> => {
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
  };

  const onSave = async (): Promise<void> => {
    if (!state) {
      return;
    }
    await persistState(state);
  };

  const persistImmediateState = async (nextVisibleState: AppState, nextSavedStateOverride?: AppState): Promise<void> => {
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
  };

  const requestConfirm = (options: ConfirmDialogState): Promise<boolean> =>
    new Promise((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmDialog(options);
    });

  const closeConfirmDialog = (confirmed: boolean): void => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(confirmed);
  };

  const confirmDeleteResource = async (resourceLabel: string, name: string): Promise<boolean> =>
    requestConfirm({
      title: formatMessage(t(locale, "deleteResourceConfirm"), {
        resource: resourceLabel,
        name,
      }),
      confirmLabel: t(locale, "delete"),
      cancelLabel: t(locale, "cancel"),
      tone: "danger",
      kind: "delete",
    });

  const closeMcpImportDialog = useCallback((): void => {
    setIsMcpImportOpen(false);
    setMcpImportDraft("");
    setMcpImportInitialDraft("");
  }, []);

  const requestCloseMcpImportDialog = useCallback((): void => {
    void (async () => {
      if (mcpImportDraft === mcpImportInitialDraft) {
        closeMcpImportDialog();
        return;
      }

      const shouldDiscard = await requestConfirm({
        title: t(locale, "mcpImportUnsavedTitle"),
        description: t(locale, "mcpImportUnsavedDescription"),
        confirmLabel: t(locale, "discardChanges"),
        cancelLabel: t(locale, "cancel"),
        tone: "danger",
        kind: "delete",
      });

      if (shouldDiscard) {
        closeMcpImportDialog();
      }
    })();
  }, [closeMcpImportDialog, locale, mcpImportDraft, mcpImportInitialDraft]);

  const restoreSavedState = (nextSavedState: AppState): void => {
    const restored = normalizeStatePaths(cloneState(nextSavedState));
    setState(restored);
    applyAppearanceMode(restored.panelSettings.theme);
    applyUiFontSize(restored.panelSettings.ui_font_size);
    setSelectedProvider((current) =>
      restored.mainConfig.providers[current] ? current : Object.keys(restored.mainConfig.providers)[0] ?? "",
    );
    setSelectedModel((current) =>
      restored.mainConfig.models[current] ? current : Object.keys(restored.mainConfig.models)[0] ?? "",
    );
    setSelectedProfile((current) =>
      restored.profiles[current] ? current : (restored.activeProfile || Object.keys(restored.profiles)[0] || ""),
    );
    setSelectedMcpServer((current) =>
      restored.mcpConfig.mcpServers[current] ? current : Object.keys(restored.mcpConfig.mcpServers)[0] ?? "",
    );
    void refreshSkills(restored, { silent: true });
    void refreshPreview(restored);
    setError("");
    setNotice("");
  };

  const refreshPreview = async (draft?: AppState): Promise<void> => {
    const targetState = draft ?? state;
    if (!targetState) {
      setPreview(emptyPreview);
      return;
    }

    const api = getApi();
    if (!api) {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({ ...current, previewState: "unavailable" }));
      return;
    }
    try {
      const nextPreview = await api.previewState(targetState);
      setPreview(nextPreview);
      setDiagnostics((current) => ({ ...current, previewState: "ok" }));
    } catch {
      setPreview(emptyPreview);
      setDiagnostics((current) => ({
        ...current,
        previewState: "failed",
        lastError: current.lastError || "Preview generation failed.",
      }));
    }
  };

  const refreshSkills = async (
    draft?: AppState,
    options: { silent?: boolean } = {},
  ): Promise<void> => {
    const targetState = draft ?? state;
    if (!targetState) {
      setSkillsReport(null);
      return;
    }

    // Debounce silent refreshes to avoid excessive scans during rapid saves
    if (options.silent && skillsRefreshTimerRef.current) {
      clearTimeout(skillsRefreshTimerRef.current);
      skillsRefreshTimerRef.current = null;
    }

    const doRefresh = async (): Promise<void> => {
      const api = getApi();
      if (!api) {
        setSkillsReport(null);
        return;
      }
      if (typeof api.scanSkills !== "function") {
        if (!options.silent) {
          setNotice("");
          setError(t(locale, "skillsRuntimeOutdated"));
        }
        setSkillsReport(null);
        return;
      }
      try {
        setIsSkillsLoading(true);
        const report = await api.scanSkills(targetState);
        setSkillsReport(report);
        setSelectedSkillPath((current) => {
          if (current && report.paths.some((path) => path.id === current)) {
            return current;
          }
          return report.paths.find((path) => path.selected)?.id ?? report.paths[0]?.id ?? "";
        });
        setSelectedSkill((current) => {
          if (current && report.skills.some((skill) => skill.id === current)) {
            return current;
          }
          return "";
        });
        if (!options.silent) {
          setError("");
          setNotice(t(locale, "skillsRefreshed"));
        }
      } catch (scanError) {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        if (!options.silent) {
          setNotice("");
          setError(translateError(locale, message));
        }
      } finally {
        setIsSkillsLoading(false);
      }
    };

    if (options.silent) {
      skillsRefreshTimerRef.current = setTimeout(() => {
        skillsRefreshTimerRef.current = null;
        void doRefresh();
      }, 500);
      return;
    }

    await doRefresh();
  };

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
  const resolveUnsavedChanges = async (): Promise<void> => {
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
  };

  const runAfterUnsavedHandled = (action: () => void | Promise<void>): void => {
    void (async () => {
      await resolveUnsavedChanges();
      await action();
    })();
  };

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handleBlur = (): void => {
      void resolveUnsavedChanges();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [hasUnsavedChanges, locale, state, savedState]);

  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);
  const mcpEntries = Object.entries(state.mcpConfig.mcpServers);
  const skillPathEntries = skillsReport?.paths ?? [];
  const skillEntries = skillsReport?.skills ?? [];
  const sortedSkillPathEntries = [...skillPathEntries].sort((left, right) => {
    if (left.group === "builtin" && right.group !== "builtin") {
      return 1;
    }
    if (right.group === "builtin" && left.group !== "builtin") {
      return -1;
    }
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }
    if (left.exists !== right.exists) {
      return left.exists ? -1 : 1;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.label.localeCompare(right.label);
  });
  const selectedProviderName = selectedProvider || providerEntries[0]?.[0] || "";
  const selectedModelName = selectedModel || modelEntries[0]?.[0] || "";
  const selectedProfileName = selectedProfile || profileEntries[0]?.[0] || "";
  const selectedMcpServerName = selectedMcpServer || mcpEntries[0]?.[0] || "";
  const selectedSkillPathId =
    selectedSkillPath || skillPathEntries.find((path) => path.selected)?.id || skillPathEntries[0]?.id || "";
  const visibleSkillEntries = skillEntries.filter((skill) => skill.sourcePathId === selectedSkillPathId);
  const selectedSkillId = selectedSkill;

  const selectedProviderData =
    (selectedProvider && state.mainConfig.providers[selectedProvider]) ||
    providerEntries[0]?.[1] ||
    null;
  const selectedModelData =
    (selectedModel && state.mainConfig.models[selectedModel]) || modelEntries[0]?.[1] || null;
  const selectedProfileData =
    (selectedProfile && state.profiles[selectedProfile]) || profileEntries[0]?.[1] || null;
  const selectedMcpServerData =
    (selectedMcpServer && state.mcpConfig.mcpServers[selectedMcpServer]) || mcpEntries[0]?.[1] || null;
  const selectedSkillPathData =
    (selectedSkillPathId && skillPathEntries.find((path) => path.id === selectedSkillPathId)) ||
    skillPathEntries[0] ||
    null;
  const selectedSkillData =
    (selectedSkillId && visibleSkillEntries.find((skill) => skill.id === selectedSkillId)) ||
    null;
  const isProviderNameEditable = isDraftEntry(savedState?.mainConfig.providers, selectedProviderName);
  const isProfileNameEditable = isDraftEntry(savedState?.profiles, selectedProfileName);
  const isMcpServerNameEditable = isDraftEntry(savedState?.mcpConfig.mcpServers, selectedMcpServerName);

  const openDocumentViewer = (file: PreviewFileId): void => {
    const mapping: Record<PreviewFileId, DocumentViewerState> = {
      config: {
        title: t(locale, "previewConfig"),
        format: "TOML",
        content: preview.configDocument,
      },
      profiles: {
        title: t(locale, "previewProfiles"),
        format: "TOML",
        content: preview.profilesDocument,
      },
      panel: {
        title: t(locale, "previewPanel"),
        format: "TOML",
        content: preview.panelSettingsDocument,
      },
      mcp: {
        title: t(locale, "previewMcp"),
        format: "JSON",
        content: preview.mcpDocument,
      },
    };

    setDocumentViewer(mapping[file]);
  };

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

  return {
    state,
    setState,
    savedState,
    setSavedState,
    activeTab,
    setActiveTab,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    selectedProfile,
    setSelectedProfile,
    selectedMcpServer,
    setSelectedMcpServer,
    selectedSkill,
    setSelectedSkill,
    selectedSkillPath,
    setSelectedSkillPath,
    skillsViewMode,
    setSkillsViewMode,
    preview,
    setPreview,
    skillsReport,
    setSkillsReport,
    isSkillsLoading,
    setIsSkillsLoading,
    documentViewer,
    setDocumentViewer,
    backupRecordsDialog,
    setBackupRecordsDialog,
    error,
    setError,
    notice,
    setNotice,
    isMcpImportOpen,
    setIsMcpImportOpen,
    mcpImportDraft,
    setMcpImportDraft,
    mcpImportInitialDraft,
    setMcpImportInitialDraft,
    mcpTestingName,
    setMcpTestingName,
    profileTestingName,
    setProfileTestingName,
    isBackupRunning,
    setIsBackupRunning,
    isWebDavTesting,
    setIsWebDavTesting,
    isBackupPasswordVisible,
    setIsBackupPasswordVisible,
    confirmDialog,
    setConfirmDialog,
    diagnostics,
    setDiagnostics,
    unsavedResolutionRef,
    confirmResolverRef,
    skillsRefreshTimerRef,
    locale,
    title,
    loadState,
    persistState,
    onSave,
    persistImmediateState,
    requestConfirm,
    closeConfirmDialog,
    confirmDeleteResource,
    closeMcpImportDialog,
    requestCloseMcpImportDialog,
    restoreSavedState,
    refreshPreview,
    refreshSkills,
    updateState,
    updateImmediateState,
    hasUnsavedChanges,
    dirtyProviders,
    dirtyModels,
    dirtyProfiles,
    dirtyMcpServers,
    resolveUnsavedChanges,
    runAfterUnsavedHandled,
    providerEntries,
    modelEntries,
    profileEntries,
    mcpEntries,
    skillPathEntries,
    skillEntries,
    sortedSkillPathEntries,
    visibleSkillEntries,
    selectedProviderName,
    selectedModelName,
    selectedProfileName,
    selectedMcpServerName,
    selectedSkillPathId,
    selectedSkillData,
    selectedSkillPathData,
    selectedProviderData,
    selectedModelData,
    selectedProfileData,
    selectedMcpServerData,
    isProviderNameEditable,
    isProfileNameEditable,
    isMcpServerNameEditable,
    openDocumentViewer,
    runManualBackup,
    runWebDavTest,
    loadBackupRecords,
    openBackupRecords,
    deleteBackupRecord,
    restoreBackupRecord,
  };
}
