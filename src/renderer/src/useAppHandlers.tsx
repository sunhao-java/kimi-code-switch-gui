import { useCallback, useEffect, useState } from "react";
import type { AppState, ConfigDoctorReport, FileSnapshotBundle } from "@shared/types";
import type { BackupRecordsDialogState, DocumentViewerState } from "./dialogs";
import type { DiagnosticsState } from "./overviewDashboard";
import { SkillsViewMode } from "./skillsWorkspace";
import { TabId, PreviewFileId } from "./appOptions";
import { getApi } from "./appHelpers";
import { getAppDerivedData } from "./appDerivedData";
import { t, translateError } from "./i18n";
import { createFallbackState, applyAppearanceMode, applyAppearanceTheme, applyUiFontSize } from "./tabComponents";
import { useAppPersistence } from "./useAppPersistence";
import { useBackupActions } from "./useBackupActions";
import { useConfirmDialog } from "./useConfirmDialog";
import { usePreviewAndSkills } from "./usePreviewAndSkills";
import { useSafetyActions } from "./useSafetyActions";
import { useStateMutations } from "./useStateMutations";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

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
  const [documentViewer, setDocumentViewer] = useState<DocumentViewerState | null>(null);
  const [backupRecordsDialog, setBackupRecordsDialog] = useState<BackupRecordsDialogState | null>(null);
  const [fileSnapshot, setFileSnapshot] = useState<FileSnapshotBundle | null>(null);
  const [doctorReport, setDoctorReport] = useState<ConfigDoctorReport | null>(null);
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    preload: "pending",
    loadState: "pending",
    previewState: "pending",
    lastError: "",
  });
  const locale = state.panelSettings.locale;
  const {
    confirmDialog,
    requestConfirm,
    closeConfirmDialog,
    confirmDeleteResource,
  } = useConfirmDialog(locale);
  const {
    preview,
    setPreview,
    skillsReport,
    setSkillsReport,
    isSkillsLoading,
    setIsSkillsLoading,
    skillsRefreshTimerRef,
    refreshPreview,
    refreshSkills,
  } = usePreviewAndSkills({
    state,
    locale,
    setError,
    setNotice,
    setDiagnostics,
    setSelectedSkillPath,
    setSelectedSkill,
  });
  const {
    refreshSafetyState,
    runDoctor,
    confirmExternalOverwrite,
    restoreWithDryRun,
  } = useSafetyActions({
    locale,
    setState,
    setSavedState,
    setError,
    setNotice,
    fileSnapshot,
    setFileSnapshot,
    doctorReport,
    setDoctorReport,
    currentSelections: {
      provider: selectedProvider,
      model: selectedModel,
      profile: selectedProfile,
      mcpServer: selectedMcpServer,
    },
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
    refreshPreview,
    requestConfirm,
  });
  const {
    loadState,
    persistState,
    onSave,
    persistImmediateState,
    restoreSavedState,
  } = useAppPersistence({
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
    setFileSnapshot,
    setDoctorReport,
    confirmExternalOverwrite,
    refreshPreview,
    refreshSkills,
    currentSelections: {
      provider: selectedProvider,
      model: selectedModel,
      profile: selectedProfile,
      mcpServer: selectedMcpServer,
    },
    setSelectedProvider,
    setSelectedModel,
    setSelectedProfile,
    setSelectedMcpServer,
  });
  const {
    unsavedResolutionRef,
    hasUnsavedChanges,
    dirtyProviders,
    dirtyModels,
    dirtyProfiles,
    dirtyMcpServers,
    resolveUnsavedChanges,
    runAfterUnsavedHandled,
  } = useUnsavedChangesGuard({
    state,
    savedState,
    locale,
    requestConfirm,
    persistState,
    restoreSavedState,
  });
  const {
    updateState,
    updateImmediateState,
  } = useStateMutations({
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
  });

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    applyAppearanceMode(state.panelSettings.theme);
  }, [state.panelSettings.theme]);

  useEffect(() => {
    applyAppearanceTheme(state.panelSettings.appearance_theme);
  }, [state.panelSettings.appearance_theme]);

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

  const title = t(locale, "appTitle");

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

  const openKimiInTerminal = useCallback((profileName?: string): void => {
    void (async () => {
      const api = getApi();
      if (!api) {
        setNotice("");
        setError(t(locale, "openInTerminalUnavailable"));
        return;
      }
      if (!api.openKimiInTerminal) {
        setNotice("");
        setError(t(locale, "openInTerminalRuntimeOutdated"));
        return;
      }
      try {
        setError("");
        setNotice("");
        await api.openKimiInTerminal({
          settings: state.panelSettings,
          state,
          profileName,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice("");
        setError(translateError(locale, message));
      }
    })();
  }, [locale, setError, setNotice, state]);

  const {
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
  } = getAppDerivedData(state, savedState, skillsReport, {
    provider: selectedProvider,
    model: selectedModel,
    profile: selectedProfile,
    mcpServer: selectedMcpServer,
    skillPath: selectedSkillPath,
    skill: selectedSkill,
  });

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

  const {
    runManualBackup,
    runWebDavTest,
    loadBackupRecords,
    openBackupRecords,
    deleteBackupRecord,
    restoreBackupRecord,
  } = useBackupActions({
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
    restoreWithDryRun,
  });

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
    setSelectedSkill,
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
    doctorReport,
    fileSnapshot,
    setBackupRecordsDialog,
    setDoctorReport,
    setFileSnapshot,
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
    diagnostics,
    setDiagnostics,
    refreshSafetyState,
    runDoctor,
    unsavedResolutionRef,
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
    openKimiInTerminal,
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
