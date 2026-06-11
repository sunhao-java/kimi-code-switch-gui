import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, Bug, Copy, Download, ExternalLink, FileInput, FolderOpen, History, LoaderCircle, LogIn, Plus, Power, RefreshCw, RotateCcw, Star, Terminal, Trash2, Upload, X } from "lucide-react";
import { applyProfile, cloneProfile, deleteModel, deleteProfile, deleteProvider, exportConfig, getImportPreview, importConfig, toggleFavorite, validateImportData, upsertModel, upsertProfile, upsertProvider } from "@shared/configStore";
import { buildModelName, ensureUniqueEntryName, normalizeEntryName } from "@shared/nameRules";
import { getCascadePreview } from "@shared/configRelations";
import {
  formatAcceleratorForPlatform,
  getBrowserShortcutPlatform,
  getShortcutConflicts,
  resetShortcutBinding,
  SHORTCUT_ACTIONS,
} from "@shared/shortcutStore";
import type {
  AppearanceMode,
  AppearanceTheme,
  AppState,
  BackupDestinationType,
  BackupFrequency,
  BackupStrategy,
  CloseBehavior,
  ConfigTarget,
  DisplayOpenMode,
  ExportBundle,
  ImportConflictStrategy,
  ImportPreview,
  Locale,
  ShortcutAction,
  ShortcutBinding,
  ConfigDoctorReport,
  TerminalApp,
} from "@shared/types";

import { AboutPage } from "../aboutPage";
import { getHistory, restoreHistoryEntry } from "../historyManager";
import { getApi, getMcpAction, getMcpActionNotice, getResourceLabel, createUniqueName, renameModelInState, renameProviderInState } from "../appHelpers";
import {
  APPEARANCE_THEME_OPTIONS,
  BACKUP_DESTINATION_OPTIONS, BACKUP_FREQUENCY_OPTIONS, BACKUP_STRATEGY_OPTIONS,
  CLOSE_BEHAVIOR_OPTIONS, DISPLAY_OPEN_OPTIONS, labelForLocale, LOCALE_OPTIONS, TERMINAL_APP_OPTIONS, THEME_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "../appOptions";
import { useDialogEscape, useFocusTrap } from "../dialogs";
import { ErrorBoundary } from "../ErrorBoundary";
import { Field, FontSizeSliderField, SelectField, SettingsGroup, ShortcutRecorderField } from "../formControls";
import { t, translateError } from "../i18n";
import { InsightsSettingsPanel, InsightsDashboard } from "../insightsComponents";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { ProviderHealthBanner } from "../providerHealthBanner";
import { OverviewDashboard } from "../overviewDashboard";
import { SkillsWorkspace } from "../skillsWorkspace";
import type { KimiOAuthLoginEvent, ProviderHealthResult } from "../tauri/cli";
import type { AppContext } from "./appContext";
import {
  ProviderForm, ModelForm, ProfileForm, McpServerForm,
  SecretField, PathField, createCopyName, createLocalizedCopyName, createDefaultMcpServer,
  formatMessage, formatSkillPathLabel, renderSkillPathLabel, DoctorDriftList,
} from "../tabComponents";

type TabPanelsProps = Pick<
  AppContext,
  | "state"
  | "activeTab"
  | "locale"
  | "diagnostics"
  | "selectedProvider"
  | "setSelectedProvider"
  | "selectedModel"
  | "setSelectedModel"
  | "selectedProfile"
  | "setSelectedProfile"
  | "selectedMcpServer"
  | "setSelectedMcpServer"
  | "setSelectedSkill"
  | "setSelectedSkillPath"
  | "skillsViewMode"
  | "setSkillsViewMode"
  | "skillsReport"
  | "isSkillsLoading"
  | "providerEntries"
  | "modelEntries"
  | "profileEntries"
  | "mcpEntries"
  | "skillPathEntries"
  | "skillEntries"
  | "sortedSkillPathEntries"
  | "visibleSkillEntries"
  | "selectedProviderName"
  | "selectedModelName"
  | "selectedProfileName"
  | "selectedMcpServerName"
  | "selectedSkillPathId"
  | "selectedSkillData"
  | "selectedSkillPathData"
  | "selectedProviderData"
  | "selectedModelData"
  | "selectedProfileData"
  | "selectedMcpServerData"
  | "isProviderNameEditable"
  | "isProfileNameEditable"
  | "isMcpServerNameEditable"
  | "dirtyProviders"
  | "dirtyModels"
  | "dirtyProfiles"
  | "dirtyMcpServers"
  | "setIsMcpImportOpen"
  | "setMcpImportDraft"
  | "setMcpImportInitialDraft"
  | "mcpTestingName"
  | "setMcpTestingName"
  | "profileTestingName"
  | "setProfileTestingName"
  | "backupRecordsDialog"
  | "doctorReport"
  | "isBackupRunning"
  | "isWebDavTesting"
  | "isBackupPasswordVisible"
  | "setIsBackupPasswordVisible"
  | "updateState"
  | "updateImmediateState"
  | "runAfterUnsavedHandled"
  | "onSave"
  | "persistState"
  | "persistConfigTarget"
  | "confirmDeleteResource"
  | "refreshSkills"
  | "openDocumentViewer"
  | "runManualBackup"
  | "runWebDavTest"
  | "runDoctor"
  | "openBackupRecords"
  | "setActiveTab"
  | "setError"
  | "setNotice"
  | "openKimiInTerminal"
  | "loadState"
> & {
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  onRequestCascadeDelete: (type: "provider" | "model", name: string) => void;
};

type SettingsSubTab = "general" | "config-target" | "shortcuts" | "backup" | "doctor" | "insights" | "history";
const POST_CONFIG_TARGET_SWITCH_TAB_KEY = "kimi-switch:post-config-target-switch-tab";

type KimiOAuthLoginState = {
  status: "idle" | "running" | "success" | "failed" | "account-required";
  url: string;
  userCode: string;
  expiresIn: number | null;
  message: string;
  messageKey: string;
};

function isOAuthAccountRequiredMessage(message: string | undefined): boolean {
  return Boolean(message?.includes("402 Payment Required") || message?.includes("Payment Required"));
}

function oauthFailureMessageKey(message: string | undefined): string {
  const normalized = message?.toLowerCase() ?? "";
  if (isOAuthAccountRequiredMessage(message)) return "kimiOauthAccountRequired";
  if (normalized.includes("expired")) return "kimiOauthExpired";
  if (normalized.includes("cancelled") || normalized.includes("canceled") || normalized.includes("denied") || normalized.includes("reject")) {
    return "kimiOauthCancelled";
  }
  if (normalized.includes("already running")) return "kimiOauthAlreadyRunning";
  if (normalized.includes("spawn") || normalized.includes("not found") || normalized.includes("no such file")) return "kimiOauthCommandUnavailable";
  return "kimiOauthFailed";
}

function oauthStatusForEvent(event: KimiOAuthLoginEvent): KimiOAuthLoginState["status"] {
  if (event.kind === "account-required" || isOAuthAccountRequiredMessage(event.message ?? event.line)) {
    return "account-required";
  }
  if (event.kind === "failed" || event.kind === "error") {
    return "failed";
  }
  if (event.kind === "success" || event.kind === "complete") {
    return "success";
  }
  return "running";
}

function oauthMessageKeyForEvent(event: KimiOAuthLoginEvent): string {
  if (event.kind === "account-required" || isOAuthAccountRequiredMessage(event.message ?? event.line)) {
    return "kimiOauthAccountRequired";
  }
  switch (event.kind) {
    case "start":
    case "device-code":
    case "user-code":
    case "expires-in":
    case "output":
      return "kimiOauthWaiting";
    case "success":
    case "complete":
      return "kimiOauthSuccess";
    case "failed":
    case "error":
      return oauthFailureMessageKey(event.message ?? event.line);
    default:
      return "kimiOauthWaiting";
  }
}

export function TabPanels(props: TabPanelsProps): JSX.Element {
  const {
    state,
    activeTab,
    locale,
    diagnostics,
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
    onRequestCascadeDelete,
    skillsViewMode,
    setSkillsViewMode,
    skillsReport,
    isSkillsLoading,
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
    dirtyProviders,
    dirtyModels,
    dirtyProfiles,
    dirtyMcpServers,
    setIsMcpImportOpen,
    setMcpImportDraft,
    setMcpImportInitialDraft,
    mcpTestingName,
    setMcpTestingName,
    profileTestingName,
    setProfileTestingName,
    backupRecordsDialog,
    doctorReport,
    isBackupRunning,
    isWebDavTesting,
    isBackupPasswordVisible,
    setIsBackupPasswordVisible,
    updateState,
    updateImmediateState,
    runAfterUnsavedHandled,
    onSave,
    persistConfigTarget,
    persistState,
    confirmDeleteResource,
    refreshSkills,
    openDocumentViewer,
    runManualBackup,
    runWebDavTest,
    runDoctor,
    openBackupRecords,
    setActiveTab,
    setError,
    setNotice,
    openKimiInTerminal,
    loadState,
    shortcuts,
  } = props;
  const shortcutConflicts = getShortcutConflicts(shortcuts);
  const shortcutPlatform = getBrowserShortcutPlatform();
  const shortcutConflictActions = new Set(shortcutConflicts.flatMap((conflict) => conflict.actions));
  const shortcutLabels = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [definition.action, labelForLocale(definition.label, locale)]),
  ) as Record<ShortcutAction, string>;
  const [kimiCodeOAuthLogin, setKimiCodeOAuthLogin] = useState<KimiOAuthLoginState>({
    status: "idle",
    url: "",
    userCode: "",
    expiresIn: null,
    message: "",
    messageKey: "kimiOauthReady",
  });
  const currentConfigTarget = state.panelSettings.config_target ?? "kimi-code";
  const currentConfigTargetLabel = currentConfigTarget === "kimi-code" ? "Kimi Code" : "Kimi CLI";
  const shortcutGroups = [
    {
      scope: "global" as const,
      title: t(locale, "shortcutGlobalGroup"),
      description: t(locale, "shortcutGlobalDescription"),
      actions: SHORTCUT_ACTIONS.filter((definition) => definition.scope === "global"),
    },
    {
      scope: "window" as const,
      title: t(locale, "shortcutWindowGroup"),
      description: t(locale, "shortcutWindowDescription"),
      actions: SHORTCUT_ACTIONS.filter((definition) => definition.scope === "window"),
    },
  ];
  // 空状态检查
  const hasProviders = Object.keys(state.mainConfig.providers).length > 0;
  const hasModels = Object.keys(state.mainConfig.models).length > 0;

  const [activeSettingsSubTab, setActiveSettingsSubTab] = useState<SettingsSubTab>("config-target");
  const [importDialog, setImportDialog] = useState<{ open: boolean; preview: ImportPreview | null; data: ExportBundle | null; strategy: ImportConflictStrategy }>({ open: false, preview: null, data: null, strategy: "skip" });
  const [providerHealthResults, setProviderHealthResults] = useState<ProviderHealthResult[] | null>(null);
  const [isProviderHealthChecking, setIsProviderHealthChecking] = useState(false);
  const [providerHealthBannerOpen, setProviderHealthBannerOpen] = useState(false);
  const [providerHealthBannerKey, setProviderHealthBannerKey] = useState(0);

  const startKimiOAuthLogin = (): void => {
    const api = getApi();
    const loginTarget = currentConfigTarget;
    const loginTargetLabel = currentConfigTargetLabel;
    if (!api?.startKimiOAuthLogin) {
      setError(formatMessage(t(locale, "kimiOauthUnavailable"), { target: loginTargetLabel }));
      return;
    }
    setError("");
    setNotice("");
    setKimiCodeOAuthLogin({
      status: "running",
      url: "",
      userCode: "",
      expiresIn: null,
      message: formatMessage(t(locale, "kimiOauthWaiting"), { target: loginTargetLabel }),
      messageKey: "kimiOauthWaiting",
    });
    void api.startKimiOAuthLogin(loginTarget, (event) => {
      console.debug("[kimi-oauth-login]", event);
      if (event.target !== loginTarget) {
        return;
      }
      setKimiCodeOAuthLogin((current) => ({
        status: oauthStatusForEvent(event),
        url: event.url ?? current.url,
        userCode: event.user_code ?? current.userCode,
        expiresIn: event.expires_in ?? current.expiresIn,
        message: event.message ?? event.line ?? current.message,
        messageKey: oauthMessageKeyForEvent(event),
      }));
    })
      .then(async () => {
        setKimiCodeOAuthLogin((current) => ({
          ...current,
          status: "success",
          message: formatMessage(t(locale, "kimiOauthSuccess"), { target: loginTargetLabel }),
          messageKey: "kimiOauthSuccess",
        }));
        setNotice(formatMessage(t(locale, "kimiOauthSuccess"), { target: loginTargetLabel }));
        await loadState();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const messageKey = oauthFailureMessageKey(message);
        setKimiCodeOAuthLogin((current) => ({
          ...current,
          status: isOAuthAccountRequiredMessage(message) ? "account-required" : "failed",
          message,
          messageKey,
        }));
        console.debug("[kimi-oauth-login]", { kind: "failed", target: loginTarget, message });
        setError(formatMessage(t(locale, messageKey), { target: loginTargetLabel, message }));
      });
  };

  const runProvidersHealthCheck = (): void => {
    const api = getApi();
    if (!api || typeof api.runProvidersHealthCheck !== "function" || isProviderHealthChecking) {
      return;
    }
    setIsProviderHealthChecking(true);
    void Promise.resolve(api.runProvidersHealthCheck(state))
      .then((results) => setProviderHealthResults(results))
      .catch(() => setProviderHealthResults([]))
      .finally(() => {
        setIsProviderHealthChecking(false);
        // key++ 让提示条重挂载以重置自动关闭计时；open=true 重新展示。
        setProviderHealthBannerKey((key) => key + 1);
        setProviderHealthBannerOpen(true);
      });
  };

  const providerHealthReasonLabel = (result: ProviderHealthResult): string => {
    switch (result.reason) {
      case "ok":
        return result.latencyMs != null
          ? `${t(locale, "providerHealthOk")} · ${result.latencyMs}ms`
          : t(locale, "providerHealthOk");
      case "no-model":
        return t(locale, "providerHealthNoModel");
      case "missing-base-url":
        return t(locale, "providerHealthMissingBaseUrl");
      case "missing-api-key":
        return t(locale, "providerHealthMissingApiKey");
      case "rate-limited":
        return t(locale, "providerHealthRateLimited");
      case "http-error":
        return formatMessage(t(locale, "providerHealthHttpError"), { status: result.status ?? 0 });
      default:
        return t(locale, "providerHealthNetworkError");
    }
  };
  const settingsSubTabs: Array<{ id: SettingsSubTab; label: string; description: string }> = [
    {
      id: "config-target",
      label: t(locale, "settingsTabConfigTarget"),
      description: t(locale, "settingsTabConfigTargetDescription"),
    },
    {
      id: "general",
      label: t(locale, "settingsTabGeneral"),
      description: t(locale, "settingsTabGeneralDescription"),
    },
    {
      id: "shortcuts",
      label: t(locale, "settingsTabShortcuts"),
      description: t(locale, "settingsTabShortcutsDescription"),
    },
    {
      id: "backup",
      label: t(locale, "settingsTabBackup"),
      description: t(locale, "settingsTabBackupDescription"),
    },
    {
      id: "doctor",
      label: t(locale, "settingsTabDoctor"),
      description: t(locale, "settingsTabDoctorDescription"),
    },
    {
      id: "insights",
      label: t(locale, "settingsTabInsights"),
      description: t(locale, "settingsTabInsightsDescription"),
    },
    {
      id: "history",
      label: t(locale, "historyTitle"),
      description: t(locale, "historyTitle"),
    },
  ];

  return (
    <ErrorBoundary locale={locale}>
      <div className="tab-panel-shell">
        {activeTab === "overview" ? (
          <OverviewDashboard
            state={state}
            locale={locale}
            diagnostics={diagnostics}
            onActivateProfile={(name) =>
              updateState((draft) => {
                applyProfile(draft, name);
              }, {
                persist: true,
                historySummary: formatMessage(t(locale, "historyActivateProfile"), { name }),
              })
            }
            onNavigate={(tab) => runAfterUnsavedHandled(() => setActiveTab(tab))}
          />
        ) : null}

        {activeTab === "providers" ? (
          <SplitLayout
            headerActions={
              <button
                className={isProviderHealthChecking ? "action-button compact icon-only is-loading" : "action-button compact icon-only"}
                type="button"
                disabled={isProviderHealthChecking || providerEntries.length === 0}
                aria-label={t(locale, "providerHealthCheck")}
                title={t(locale, "providerHealthCheck")}
                onClick={runProvidersHealthCheck}
              >
                {isProviderHealthChecking ? <LoaderCircle size={15} className="button-spinner" /> : <Activity size={15} />}
              </button>
            }
            listBanner={
              providerHealthBannerOpen && providerHealthResults ? (
                <ProviderHealthBanner
                  key={providerHealthBannerKey}
                  results={providerHealthResults}
                  emptyLabel={t(locale, "providerHealthEmpty")}
                  failLabel={t(locale, "providerHealthFail")}
                  reasonLabel={providerHealthReasonLabel}
                  closeLabel={t(locale, "close")}
                  onClose={() => setProviderHealthBannerOpen(false)}
                />
              ) : null
            }
            listTitle={t(locale, "providers")}
            listItems={providerEntries.map(([name]) => name)}
            dirtyItems={dirtyProviders}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProviderName}
            itemClassName={() => "provider-list-row"}
            onSelect={(item) => setSelectedProvider(item)}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const provider = draft.mainConfig.providers[name];
                if (!provider) return;
                const copyName = createCopyName(name, draft.mainConfig.providers);
                draft.mainConfig.providers[copyName] = { ...provider };
                setSelectedProvider(copyName);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyCloneProvider"), { name }),
              })
            }
            addLabel={t(locale, "newProvider")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newProvider")}
            addButtonContent={<Plus size={15} />}
            onAdd={() =>
              updateState((draft) => {
                const name = createUniqueName("provider", Object.keys(draft.mainConfig.providers));
                upsertProvider(draft, name, {
                  type: "kimi",
                  base_url: "https://api.example.com/v1",
                  api_key: "",
                });
                setSelectedProvider(name);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyNewProvider"), { name }),
              })
            }
            renderItemAction={(name) => (
              <span className="list-row-action-set providers-actions">
                <button
                  className={state.panelSettings.favorites?.providers?.includes(name) ? "list-toggle-button active" : "list-toggle-button"}
                  type="button"
                  aria-label={state.panelSettings.favorites?.providers?.includes(name) ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
                  title={state.panelSettings.favorites?.providers?.includes(name) ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
                  onClick={(event) => {
                    event.stopPropagation();
                    const isFavorite = state.panelSettings.favorites?.providers?.includes(name) ?? false;
                    updateImmediateState((draft) => { toggleFavorite(draft, "provider", name); }, {
                      recordHistory: true,
                      historySummary: formatMessage(
                        t(locale, isFavorite ? "historyUnfavoriteProvider" : "historyFavoriteProvider"),
                        { name },
                      ),
                    });
                  }}
                >
                  <Star size={14} fill={state.panelSettings.favorites?.providers?.includes(name) ? "currentColor" : "none"} />
                </button>
              </span>
            )}
          >
            {selectedProviderData ? (
              <ProviderForm
                locale={locale}
                name={selectedProviderName}
                nameEditable={isProviderNameEditable}
                value={selectedProviderData}
                onChange={(name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedProviderName;
                    const currentProvider = draft.mainConfig.providers[currentName];
                    if (!currentProvider) return;
                    const nextProvider = { ...currentProvider, ...patch };
                    const nextName = isProviderNameEditable
                      ? renameProviderInState(draft, currentName, name, nextProvider)
                      : currentName;

                    if (!isProviderNameEditable) {
                      draft.mainConfig.providers[currentName] = nextProvider;
                    }
                    setSelectedProvider(nextName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() => {
                  void (async () => {
                    // 有引用时弹级联删除对话框（影响预览 + 一并删除/仅删此项）；无引用直接确认删除
                    const impact = getCascadePreview(state, { type: "provider", name: selectedProviderName });
                    if (impact.affectedModels.length > 0 || impact.affectedProfiles.length > 0) {
                      onRequestCascadeDelete("provider", selectedProviderName);
                      return;
                    }
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "provider"), selectedProviderName))) return;
                    updateState((draft) => {
                      deleteProvider(draft, selectedProviderName);
                      setSelectedProvider(Object.keys(draft.mainConfig.providers)[0] ?? "");
                    }, {
                      historySummary: formatMessage(t(locale, "historyDeleteProvider"), { name: selectedProviderName }),
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "models" ? (
          <SplitLayout
            listTitle={t(locale, "models")}
            listItems={modelEntries.map(([name]) => name)}
            dirtyItems={dirtyModels}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedModelName}
            onSelect={(item) => setSelectedModel(item)}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const model = draft.mainConfig.models[name];
                if (!model) return;
                const copyModelId = createUniqueName(`${model.model}-copy`, Object.values(draft.mainConfig.models)
                  .filter((entry) => entry.provider === model.provider)
                  .map((entry) => entry.model));
                const copyName = buildModelName(model.provider, copyModelId);
                draft.mainConfig.models[copyName] = {
                  ...model,
                  model: copyModelId,
                  capabilities: [...model.capabilities],
                };
                setSelectedModel(copyName);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyCloneModel"), { name }),
              })
            }
            addLabel={t(locale, "newModel")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={!hasProviders ? t(locale, "tooltipAddProviderFirst") : t(locale, "newModel")}
            addButtonContent={<Plus size={15} />}
            addButtonDisabled={!hasProviders}
            onAdd={() =>
              updateState((draft) => {
                const providerName = Object.keys(draft.mainConfig.providers)[0];
                if (!providerName) {
                  throw new Error(t(locale, "errorCreateProviderFirst"));
                }
                const modelId = createUniqueName(
                  "new-model",
                  Object.values(draft.mainConfig.models)
                    .filter((model) => model.provider === providerName)
                    .map((model) => model.model),
                );
                const name = buildModelName(providerName, modelId);
                upsertModel(draft, name, {
                  provider: providerName,
                  model: modelId,
                  max_context_size: 128000,
                  capabilities: [],
                });
                setSelectedModel(name);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyNewModel"), { name }),
              })
            }
          >
            {selectedModelData ? (
              <ModelForm
                locale={locale}
                providers={Object.keys(state.mainConfig.providers)}
                name={selectedModelName}
                value={selectedModelData}
                onChange={(_name, patch) =>
                  updateState((draft) => {
                    const currentName = selectedModelName;
                    const currentModel = draft.mainConfig.models[currentName];
                    if (!currentModel) return;
                    const nextModel = {
                      ...currentModel,
                      ...patch,
                      provider: normalizeEntryName(patch.provider ?? currentModel.provider),
                      model: normalizeEntryName(patch.model ?? currentModel.model),
                    };
                    const nextName = renameModelInState(draft, currentName, nextModel);
                    setSelectedModel(nextName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onDelete={() => {
                  void (async () => {
                    // 有引用时弹级联删除对话框；无引用直接确认删除
                    const impact = getCascadePreview(state, { type: "model", name: selectedModelName });
                    if (impact.affectedProfiles.length > 0) {
                      onRequestCascadeDelete("model", selectedModelName);
                      return;
                    }
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "model"), selectedModelName))) return;
                    updateState((draft) => {
                      deleteModel(draft, selectedModelName);
                      setSelectedModel(Object.keys(draft.mainConfig.models)[0] ?? "");
                    }, {
                      historySummary: formatMessage(t(locale, "historyDeleteModel"), { name: selectedModelName }),
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "profiles" ? (
          <SplitLayout
            hideList
            listTitle={t(locale, "profiles")}
            listItems={profileEntries.map(([name]) => name)}
            dirtyItems={dirtyProfiles}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProfileName}
            highlightedItem={state.activeProfile}
            renderItemLabel={(name) => {
              const profile = state.profiles[name];
              const displayName = profile?.label?.trim() || name;
              return (
                <span className="list-label-stack">
                  <strong>{displayName}</strong>
                  <small>{name}</small>
                </span>
              );
            }}
            itemTitle={(name) => state.profiles[name]?.label?.trim() || name}
            itemClassName={() => "profile-list-row"}
            onSelect={(item) => setSelectedProfile(item)}
            addLabel={t(locale, "newProfile")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={!hasModels ? t(locale, "tooltipAddModelFirst") : t(locale, "newProfile")}
            addButtonContent={<Plus size={15} />}
            addButtonDisabled={!hasModels}
            onAdd={() =>
              updateState((draft) => {
                const firstModel = Object.keys(draft.mainConfig.models)[0];
                if (!firstModel) {
                  throw new Error(t(locale, "errorCreateModelFirst"));
                }
                const name = createUniqueName("profile", Object.keys(draft.profiles));
                upsertProfile(draft, {
                  name,
                  label: t(locale, "newProfileLabel"),
                  default_model: firstModel,
                  default_thinking: true,
                  default_yolo: false,
                  default_plan_mode: false,
                  default_editor: "",
                  theme: "dark",
                  show_thinking_stream: false,
                  merge_all_available_skills: false,
                });
                setSelectedProfile(name);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyNewProfile"), { name }),
              })
            }
            renderItemAction={(name) =>
              (
                <span className="list-row-action-set profile-actions">
                  <span className="list-hover-actions">
                    <button
                      className={state.panelSettings.favorites?.profiles?.includes(name) ? "list-toggle-button active" : "list-toggle-button"}
                      type="button"
                      aria-label={state.panelSettings.favorites?.profiles?.includes(name) ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
                      title={state.panelSettings.favorites?.profiles?.includes(name) ? t(locale, "favoriteRemove") : t(locale, "favoriteAdd")}
                      onClick={(event) => {
                        event.stopPropagation();
                        const isFavorite = state.panelSettings.favorites?.profiles?.includes(name) ?? false;
                        updateImmediateState((draft) => { toggleFavorite(draft, "profile", name); }, {
                          recordHistory: true,
                          historySummary: formatMessage(
                            t(locale, isFavorite ? "historyUnfavoriteProfile" : "historyFavoriteProfile"),
                            { name },
                          ),
                        });
                      }}
                    >
                      <Star size={14} fill={state.panelSettings.favorites?.profiles?.includes(name) ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="list-copy-button"
                      type="button"
                      aria-label={`${t(locale, "clone")} ${name}`}
                      title={t(locale, "clone")}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateState((draft) => {
                          const profile = draft.profiles[name];
                          if (!profile) return;
                          const copyName = createLocalizedCopyName(name, draft.profiles, t(locale, "copySuffix"));
                          cloneProfile(draft, name, copyName, `${profile.label} ${t(locale, "copySuffix")}`);
                          setSelectedProfile(copyName);
                        }, {
                          persist: false,
                          recordHistory: true,
                          historySummary: formatMessage(t(locale, "historyCloneProfile"), { name }),
                        });
                      }}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="list-terminal-button"
                      type="button"
                      aria-label={t(locale, "openInTerminal")}
                      title={t(locale, "openInTerminal")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void openKimiInTerminal(name);
                      }}
                    >
                      <Terminal size={15} />
                    </button>
                  </span>
                  {name === state.activeProfile ? (
                    <span className="list-current-badge" aria-label={t(locale, "summaryActive")} title={t(locale, "summaryActive")}>
                      {t(locale, "active")}
                    </span>
                  ) : (
                    <span className="list-hover-actions">
                      <button
                        className="list-activate-button"
                        type="button"
                        aria-label={`${t(locale, "activate")} ${name}`}
                        title={t(locale, "activate")}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateState((draft) => {
                            applyProfile(draft, name);
                          }, {
                            historySummary: formatMessage(t(locale, "historyActivateProfile"), { name }),
                          });
                        }}
                      >
                        {t(locale, "activate")}
                      </button>
                    </span>
                  )}
                </span>
              )
            }
          >
            {selectedProfileData ? (
              <ProfileForm
                locale={locale}
                models={Object.keys(state.mainConfig.models)}
                name={selectedProfileName}
                nameEditable={isProfileNameEditable}
                value={selectedProfileData}
                isActive={selectedProfileName === state.activeProfile}
                isTesting={profileTestingName === selectedProfileName}
                onChange={(name, nextProfile) =>
                  updateState((draft) => {
                    const currentName = selectedProfileName;
                    const normalizedName = isProfileNameEditable
                      ? ensureUniqueEntryName({
                          kind: "Profile",
                          name,
                          currentName,
                          existingNames: Object.keys(draft.profiles),
                        })
                      : currentName;
                    const normalizedProfile = {
                      ...nextProfile,
                      default_editor: "",
                      theme: "dark",
                    };
                    const nextProfiles = { ...draft.profiles };
                    delete nextProfiles[currentName];
                    nextProfiles[normalizedName] = { ...normalizedProfile, name: normalizedName };
                    if (draft.activeProfile === currentName) {
                      draft.activeProfile = normalizedName;
                    }
                    draft.profiles = nextProfiles;
                    if (draft.configTarget === "kimi-cli") {
                      draft.mainConfig.profile_label = normalizedProfile.label;
                    }
                    setSelectedProfile(normalizedName);
                  }, { persist: false })
                }
                onSave={() => void onSave()}
                onTest={async (modelName) => {
                  const api = getApi();
                  if (!api || typeof api.testProfileConnectivity !== "function") {
                    setNotice("");
                    throw new Error(t(locale, "profileRuntimeOutdated"));
                  }
                  try {
                    setProfileTestingName(selectedProfileName);
                    const result = await api.testProfileConnectivity(state, selectedProfileName, modelName);
                    setError("");
                    setNotice("");
                    return result;
                  } catch (testError) {
                    const message = testError instanceof Error ? testError.message : String(testError);
                    const translatedMessage = translateError(locale, message);
                    setNotice("");
                    throw new Error(translatedMessage);
                  } finally {
                    setProfileTestingName("");
                  }
                }}
                onActivate={() =>
                  updateState((draft) => {
                    applyProfile(draft, selectedProfileName);
                  }, {
                    historySummary: formatMessage(t(locale, "historyActivateProfile"), { name: selectedProfileName }),
                  })
                }
                onClone={() =>
                  updateState((draft) => {
                    const source = selectedProfileName;
                    cloneProfile(draft, source, `${source}-copy`, `${selectedProfileData.label} ${t(locale, "copySuffix")}`);
                    setSelectedProfile(`${source}-copy`);
                  }, {
                    persist: false,
                    recordHistory: true,
                    historySummary: formatMessage(t(locale, "historyCloneProfile"), { name: selectedProfileName }),
                  })
                }
                onDelete={() => {
                  void (async () => {
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "profile"), selectedProfileName))) return;
                    updateState((draft) => {
                      deleteProfile(draft, selectedProfileName);
                      setSelectedProfile(Object.keys(draft.profiles)[0] ?? "");
                    }, {
                      historySummary: formatMessage(t(locale, "historyDeleteProfile"), { name: selectedProfileName }),
                    });
                  })();
                }}
              />
            ) : (
              <EmptyState locale={locale} />
            )}
          </SplitLayout>
        ) : null}

        {activeTab === "mcp" ? (
          <SplitLayout
            listTitle={t(locale, "mcpServers")}
            listItems={mcpEntries.map(([name]) => name)}
            dirtyItems={dirtyMcpServers}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedMcpServerName}
            onSelect={(item) => setSelectedMcpServer(item)}
            addLabel={t(locale, "newMcpServer")}
            onAdd={() =>
              updateState((draft) => {
                const name = createUniqueName("mcp", Object.keys(draft.mcpConfig.mcpServers));
                draft.mcpConfig.mcpServers[name] = createDefaultMcpServer();
                setSelectedMcpServer(name);
              }, {
                persist: false,
                recordHistory: true,
                historySummary: formatMessage(t(locale, "historyNewMcpServer"), { name }),
              })
            }
            headerActions={
              <>
                <button
                  className="action-button compact icon-only"
                  type="button"
                  aria-label={t(locale, "importMcpJson")}
                  title={t(locale, "importMcpJson")}
                  onClick={() => {
                    const initialDraft = t(locale, "mcpImportPlaceholder");
                    setIsMcpImportOpen(true);
                    setMcpImportDraft(initialDraft);
                    setMcpImportInitialDraft(initialDraft);
                  }}
                >
                  <FileInput size={15} />
                </button>
              </>
            }
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newMcpServer")}
            addButtonContent={<Plus size={15} />}
            itemClassName={(name) =>
              state.mcpConfig.mcpServers[name]?.enabled === false ? "disabled" : null
            }
            renderItemAction={(name) => {
              const server = state.mcpConfig.mcpServers[name];
              if (!server) {
                return null;
              }
              return (
                <>
                  <button
                    className={server.enabled ? "list-toggle-button" : "list-toggle-button disabled"}
                    type="button"
                    aria-label={server.enabled ? t(locale, "disableMcp") : t(locale, "enableMcp")}
                    title={server.enabled ? t(locale, "disableMcp") : t(locale, "enableMcp")}
                    onClick={() =>
                      updateState((draft) => {
                        const target = draft.mcpConfig.mcpServers[name];
                        if (!target) return;
                        target.enabled = !target.enabled;
                      }, {
                        historySummary: formatMessage(
                          t(locale, server.enabled ? "historyDisableMcpServer" : "historyEnableMcpServer"),
                          { name },
                        ),
                      })
                    }
                  >
                    <Power size={15} />
                  </button>
                  <button
                    className="list-delete-button"
                    type="button"
                    aria-label={`${t(locale, "delete")} ${name}`}
                    title={t(locale, "delete")}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmDeleteResource(getResourceLabel(locale, "mcp"), name))) return;
                        updateState((draft) => {
                          delete draft.mcpConfig.mcpServers[name];
                          if (selectedMcpServer === name) {
                            setSelectedMcpServer(Object.keys(draft.mcpConfig.mcpServers)[0] ?? "");
                          }
                        }, {
                          historySummary: formatMessage(t(locale, "historyDeleteMcpServer"), { name }),
                        });
                      })();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              );
            }}
          >
            <div className="mcp-workspace">
              {selectedMcpServerData ? (
                <McpServerForm
                  locale={locale}
                  name={selectedMcpServerName}
                  nameEditable={isMcpServerNameEditable}
                  value={selectedMcpServerData}
                  isTesting={mcpTestingName === selectedMcpServerName}
                  onRunAction={async (action, serverName) => {
                    const api = getApi();
                    const runAction = getMcpAction(api, action);
                    if (!api) {
                      setError("Electron preload API is unavailable. MCP command cannot continue.");
                      return;
                    }
                    if (!runAction) {
                      setNotice("");
                      setError(t(locale, "mcpRuntimeOutdated"));
                      return;
                    }
                    try {
                      if (action === "test") {
                        setMcpTestingName(serverName);
                      }
                      await persistState(state);
                      await runAction(serverName);
                      setError("");
                      setNotice(getMcpActionNotice(locale, action));
                    } catch (commandError) {
                      const message = commandError instanceof Error ? commandError.message : String(commandError);
                      setNotice("");
                      setError(translateError(locale, message));
                    } finally {
                      if (action === "test") {
                        setMcpTestingName("");
                      }
                    }
                  }}
                  onChange={(name, nextServer) =>
                    updateState((draft) => {
                      const currentName = selectedMcpServerName;
                      const normalizedName = isMcpServerNameEditable
                        ? ensureUniqueEntryName({
                            kind: "MCP server",
                            name,
                            currentName,
                            existingNames: Object.keys(draft.mcpConfig.mcpServers),
                          })
                        : currentName;
                      const nextServers = { ...draft.mcpConfig.mcpServers };
                      delete nextServers[currentName];
                      nextServers[normalizedName] = nextServer;
                      draft.mcpConfig.mcpServers = nextServers;
                      setSelectedMcpServer(normalizedName);
                    }, { persist: false })
                  }
                  onSave={() => void onSave()}
                  onDelete={() => {
                    void (async () => {
                      if (!(await confirmDeleteResource(getResourceLabel(locale, "mcp"), selectedMcpServerName))) return;
                      updateState((draft) => {
                        delete draft.mcpConfig.mcpServers[selectedMcpServerName];
                        setSelectedMcpServer(Object.keys(draft.mcpConfig.mcpServers)[0] ?? "");
                      }, {
                        historySummary: formatMessage(t(locale, "historyDeleteMcpServer"), { name: selectedMcpServerName }),
                      });
                    })();
                  }}
                />
              ) : (
                <EmptyState locale={locale} />
              )}
            </div>
          </SplitLayout>
        ) : null}

        {activeTab === "skills" ? (
          <SplitLayout
            listTitle={t(locale, "skillsDirectory")}
            listItems={sortedSkillPathEntries.map((path) => path.id)}
            itemLabel={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? formatSkillPathLabel(path, locale) : item;
            }}
            renderItemLabel={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? renderSkillPathLabel(path, locale) : item;
            }}
            itemTitle={(item) => {
              const path = sortedSkillPathEntries.find((entry) => entry.id === item);
              return path ? path.path : item;
            }}
            selectedItem={selectedSkillPathId}
            onSelect={(item) => {
              setSelectedSkillPath(item);
              setSelectedSkill("");
            }}
            addLabel={t(locale, "skillsRefresh")}
            onAdd={() => void refreshSkills(state)}
            addButtonTitle={t(locale, "skillsRefresh")}
            addButtonContent={
              isSkillsLoading ? <LoaderCircle size={15} className="button-spinner" /> : <RefreshCw size={15} />
            }
            addButtonClassName={isSkillsLoading ? "action-button compact icon-only is-loading" : "action-button compact icon-only"}
            itemClassName={(item) => {
              const path = skillPathEntries.find((entry) => entry.id === item);
              if (!path) {
                return null;
              }
              if (!path.exists || !path.selected) {
                return "disabled";
              }
              return null;
            }}
            renderItemAction={(item) => {
              const path = skillPathEntries.find((entry) => entry.id === item);
              if (!path) {
                return null;
              }
              const pathSkills = skillEntries.filter((skill) => skill.sourcePathId === item);
              return (
                <>
                  <span className="list-current-badge">{pathSkills.length}</span>
                </>
              );
            }}
          >
            <SkillsWorkspace
              locale={locale}
              report={skillsReport}
              selectedPath={selectedSkillPathData}
              visibleSkills={visibleSkillEntries}
              selectedSkill={selectedSkillData}
              viewMode={skillsViewMode}
              onViewModeChange={setSkillsViewMode}
              onSelectSkill={setSelectedSkill}
              isLoading={isSkillsLoading}
            />
          </SplitLayout>
        ) : null}

        {activeTab === "insights" ? (
          <InsightsDashboard
            locale={locale}
            onStateChange={() => void loadState()}
            onOpenSettings={() => runAfterUnsavedHandled(() => {
              setActiveSettingsSubTab("insights");
              setActiveTab("settings");
            })}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SplitLayout
            listTitle={t(locale, "settings")}
            listItems={settingsSubTabs.map((tab) => tab.id)}
            selectedItem={activeSettingsSubTab}
            itemLabel={(item) => settingsSubTabs.find((tab) => tab.id === item)?.label ?? item}
            renderItemLabel={(item) => {
              const tab = settingsSubTabs.find((entry) => entry.id === item);
              return tab ? (
                <span className="settings-list-label">
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              ) : item;
            }}
            onSelect={(item) => setActiveSettingsSubTab(item as SettingsSubTab)}
            addLabel={t(locale, "settings")}
          >
          <section className="glass-panel form-panel settings-grid settings-detail-panel">
            <div className="section-title">
              {settingsSubTabs.find((tab) => tab.id === activeSettingsSubTab)?.label ?? t(locale, "settings")}
            </div>
            {activeSettingsSubTab === "config-target" ? (
              <div className="settings-tab-panel">
                <div className={`oauth-login-panel oauth-login-${kimiCodeOAuthLogin.status}`}>
                  <div className="oauth-login-copy">
                    <strong>{formatMessage(t(locale, "kimiOauthTitle"), { target: currentConfigTargetLabel })}</strong>
                    <span>{formatMessage(t(locale, "kimiOauthDescription"), { target: currentConfigTargetLabel })}</span>
                  </div>
                  <div className="oauth-login-actions">
                    <button
                      className={kimiCodeOAuthLogin.status === "running" ? "action-button is-loading" : "action-button"}
                      type="button"
                      disabled={kimiCodeOAuthLogin.status === "running"}
                      onClick={startKimiOAuthLogin}
                    >
                      {kimiCodeOAuthLogin.status === "running" ? <LoaderCircle size={14} className="button-spinner" /> : <LogIn size={14} />}
                      <span>{formatMessage(t(locale, kimiCodeOAuthLogin.status === "running" ? "kimiOauthRunning" : "kimiOauthLogin"), { target: currentConfigTargetLabel })}</span>
                    </button>
                    {kimiCodeOAuthLogin.url ? (
                      <button
                        className="action-button secondary"
                        type="button"
                        onClick={() => void getApi()?.openExternal?.(kimiCodeOAuthLogin.url)}
                      >
                        <ExternalLink size={14} />
                        <span>{t(locale, "kimiCodeOauthOpenBrowser")}</span>
                      </button>
                    ) : null}
                  </div>
                  {kimiCodeOAuthLogin.url || kimiCodeOAuthLogin.userCode || kimiCodeOAuthLogin.message ? (
                    <div className="oauth-login-status">
                      {kimiCodeOAuthLogin.url ? (
                        <div><span>{t(locale, "kimiCodeOauthUrl")}</span><code>{kimiCodeOAuthLogin.url}</code></div>
                      ) : null}
                      {kimiCodeOAuthLogin.userCode ? (
                        <div><span>{t(locale, "kimiCodeOauthUserCode")}</span><strong>{kimiCodeOAuthLogin.userCode}</strong></div>
                      ) : null}
                      {kimiCodeOAuthLogin.expiresIn !== null ? (
                        <div><span>{t(locale, "kimiCodeOauthExpiresIn")}</span><strong>{kimiCodeOAuthLogin.expiresIn}s</strong></div>
                      ) : null}
                      <div>
                        <span>{t(locale, "kimiCodeOauthStatus")}</span>
                        <em>{formatMessage(t(locale, kimiCodeOAuthLogin.messageKey), { target: currentConfigTargetLabel, message: kimiCodeOAuthLogin.message })}</em>
                      </div>
                    </div>
                  ) : null}
                </div>
                <SettingsGroup title={t(locale, "settingsGroupConfigTarget")}>
                  <SelectField
                    locale={locale}
                    label={t(locale, "configTargetLabel")}
                    value={currentConfigTarget}
                    options={[
                      { value: "kimi-code", label: "Kimi Code" },
                      { value: "kimi-cli", label: "Kimi CLI" },
                    ]}
                    onChange={async (value) => {
                      const newTarget = value as ConfigTarget;
                      try {
                        const version = await getApi()?.getCliVersion?.({ target: newTarget });
                        if (version && !version.installed) {
                          const packageName = version.packageName ?? (newTarget === "kimi-code" ? "Kimi Code" : "Kimi CLI");
                          const command = version.installCommand ?? version.updateCommand ?? "";
                          setNotice("");
                          setError(formatMessage(t(locale, "configTargetInstallRequired"), {
                            name: packageName,
                            command,
                          }));
                          return;
                        }
                        await persistConfigTarget(newTarget);
                        try {
                          window.sessionStorage.setItem(POST_CONFIG_TARGET_SWITCH_TAB_KEY, "overview");
                        } catch {
                          // 忽略 sessionStorage 不可用的极端情况，reload 后仍能正常进入应用。
                        }
                        window.location.reload();
                      } catch (err) {
                        console.error("Failed to reload after target change:", err);
                      }
                    }}
                  />
                  <div className="field-description" style={{ color: "var(--color-warning)", fontWeight: 500 }}>
                    ⚠️ {t(locale, "configTargetWarning")}
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t(locale, "settingsGroupPaths")}>
                  <PathField
                    locale={locale}
                    label={t(locale, "configPath")}
                    value={state.configPath}
                    readOnly
                    onView={() => openDocumentViewer("config")}
                    onChange={() => {}}
                  />
                  <PathField
                    locale={locale}
                    label={t(locale, "profilesPath")}
                    value={state.profilesPath}
                    readOnly
                    onView={() => openDocumentViewer("profiles")}
                    onChange={() => {}}
                  />
                  <PathField
                    locale={locale}
                    label={t(locale, "mcpConfigPathLabel")}
                    value={state.mcpConfigPath}
                    readOnly
                    fileType="json"
                    onView={() => openDocumentViewer("mcp")}
                    onChange={() => {}}
                  />
                </SettingsGroup>
              </div>
            ) : null}
            {activeSettingsSubTab === "general" ? (
              <div className="settings-tab-panel">
                <SettingsGroup title={t(locale, "settingsGroupAppearance")}>
                  <div className="settings-inline-fields">
                    <SelectField
                      label={t(locale, "locale")}
                      value={state.panelSettings.locale}
                      onChange={(value) =>
                        updateImmediateState((draft) => {
                          draft.panelSettings.locale = value as Locale;
                        })
                      }
                      options={LOCALE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.longLabel,
                        badge: option.shortLabel,
                        badgeClassName: "flag",
                      }))}
                    />
                    <SelectField
                      label={t(locale, "displayOpenMode")}
                      value={state.panelSettings.display_open_mode}
                      onChange={(value) =>
                        updateImmediateState((draft) => {
                          draft.panelSettings.display_open_mode = value as DisplayOpenMode;
                        })
                      }
                      options={DISPLAY_OPEN_OPTIONS.map((option) => ({
                        value: option.value,
                        label: labelForLocale(option.label, locale),
                      }))}
                    />
                  </div>
                  <div className="settings-inline-fields">
                    <SelectField
                      label={t(locale, "theme")}
                      value={state.panelSettings.theme}
                      onChange={(value) =>
                        updateImmediateState((draft) => {
                          draft.panelSettings.theme = value as AppearanceMode;
                        })
                      }
                      selectedIcon={(THEME_OPTIONS.find((option) => option.value === state.panelSettings.theme) ?? THEME_OPTIONS[0]).icon}
                      options={THEME_OPTIONS.map((option) => ({
                        value: option.value,
                        label: labelForLocale(option.label, locale),
                        icon: option.icon,
                      }))}
                    />
                    <SelectField
                      label={t(locale, "appearanceTheme")}
                      value={state.panelSettings.appearance_theme ?? "aurora"}
                      onChange={(value) =>
                        updateImmediateState((draft) => {
                          draft.panelSettings.appearance_theme = value as AppearanceTheme;
                        })
                      }
                      selectedIcon={(APPEARANCE_THEME_OPTIONS.find((option) => option.value === state.panelSettings.appearance_theme) ?? APPEARANCE_THEME_OPTIONS[0]).icon}
                      options={APPEARANCE_THEME_OPTIONS.map((option) => ({
                        value: option.value,
                        label: labelForLocale(option.label, locale),
                        icon: option.icon,
                      }))}
                    />
                  </div>
                  <FontSizeSliderField
                    locale={locale}
                    label={t(locale, "uiFontSize")}
                    value={state.panelSettings.ui_font_size ?? "standard"}
                    options={UI_FONT_SIZE_OPTIONS}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.ui_font_size = value;
                      })
                    }
                  />
                </SettingsGroup>
                <SettingsGroup title={t(locale, "settingsGroupBehavior")}>
                  <label className="toggle-row">
                    <span>{t(locale, "trayIcon")}</span>
                    <input
                      type="checkbox"
                      checked={state.panelSettings.tray_icon}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        updateImmediateState((draft) => {
                          draft.panelSettings.tray_icon = enabled;
                          draft.panelSettings.close_behavior = enabled ? "keep-in-tray" : "quit";
                        });
                        void getApi()?.setTray?.(enabled).catch((trayError: unknown) => {
                          const message = trayError instanceof Error ? trayError.message : String(trayError);
                          setNotice("");
                          setError(translateError(locale, message));
                        });
                      }}
                    />
                  </label>
                  {state.panelSettings.tray_icon ? (
                    <SelectField
                      label={t(locale, "closeBehavior")}
                      value={state.panelSettings.close_behavior}
                      onChange={(value) =>
                        updateImmediateState((draft) => {
                          draft.panelSettings.close_behavior = value as CloseBehavior;
                        })
                      }
                      options={CLOSE_BEHAVIOR_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.value === "quit"
                          ? t(locale, "closeBehaviorQuit")
                          : t(locale, "closeBehaviorKeepInTray"),
                      }))}
                    />
                  ) : null}
                  <SelectField
                    label={t(locale, "terminalApp")}
                    value={state.panelSettings.terminal_app}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.terminal_app = value as TerminalApp;
                      })
                    }
                    options={TERMINAL_APP_OPTIONS.map((option) => ({
                      value: option.value,
                      label: labelForLocale(option.label, locale),
                    }))}
                  />
                </SettingsGroup>
              </div>
            ) : null}
            {activeSettingsSubTab === "shortcuts" ? (
              <SettingsGroup title={t(locale, "settingsGroupShortcuts")} className="settings-group-wide">
              <div className="shortcut-settings-list">
                {shortcutGroups.map((group) => (
                  <section className={`shortcut-section ${group.scope}`} key={group.scope}>
                    <div className="shortcut-section-header">
                      <div>
                        <strong>{group.title}</strong>
                        <span>{group.description}</span>
                      </div>
                      <div className="shortcut-section-tools">
                        <span className={`shortcut-scope-badge ${group.scope}`}>
                          {group.scope === "global" ? t(locale, "shortcutGlobal") : t(locale, "shortcutWindow")}
                        </span>
                        <label className="shortcut-group-toggle">
                          <span>
                            {group.actions.some((definition) => shortcuts[definition.action].enabled)
                              ? t(locale, "enabled")
                              : t(locale, "shortcutDisabled")}
                          </span>
                          <input
                            type="checkbox"
                            checked={group.actions.some((definition) => shortcuts[definition.action].enabled)}
                            onChange={(event) => {
                              const enabled = event.target.checked;
                              updateImmediateState((draft) => {
                                for (const definition of group.actions) {
                                  draft.panelSettings.shortcuts[definition.action].enabled = enabled
                                    && draft.panelSettings.shortcuts[definition.action].accelerator.trim().length > 0;
                                }
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="shortcut-section-list">
                      {group.actions.map((definition) => {
                        const binding = shortcuts[definition.action];
                        const isConflicting = shortcutConflictActions.has(definition.action);
                        const conflict = shortcutConflicts.find((entry) => entry.actions.includes(definition.action));
                        const conflictText = conflict
                          ? formatMessage(t(locale, "shortcutConflict"), {
                              actions: conflict.actions.map((action) => shortcutLabels[action]).join(" / "),
                            })
                          : "";

                        return (
                          <div
                            key={definition.action}
                            className={isConflicting ? "shortcut-row has-conflict" : "shortcut-row"}
                          >
                            <div className="shortcut-row-copy">
                              <strong>{labelForLocale(definition.label, locale)}</strong>
                              {isConflicting ? <em>{conflictText}</em> : <span>{definition.action}</span>}
                            </div>
                            <div className="shortcut-row-actions">
                              <ShortcutRecorderField
                                label={labelForLocale(definition.label, locale)}
                                displayValue={formatAcceleratorForPlatform(binding.accelerator, shortcutPlatform)}
                                placeholder={t(locale, "shortcutClickToRecord")}
                                recordingHint={t(locale, "shortcutRecorderHint")}
                                disabledText={t(locale, "shortcutDisabled")}
                                onChange={(accelerator) =>
                                  updateImmediateState((draft) => {
                                    draft.panelSettings.shortcuts[definition.action].accelerator = accelerator;
                                    draft.panelSettings.shortcuts[definition.action].enabled = Boolean(accelerator.trim());
                                  })
                                }
                              />
                              <button
                                className="shortcut-icon-button"
                                type="button"
                                title={t(locale, "shortcutReset")}
                                aria-label={t(locale, "shortcutReset")}
                                onClick={() =>
                                  updateImmediateState((draft) => {
                                    draft.panelSettings.shortcuts[definition.action] = resetShortcutBinding(definition.action);
                                  })
                                }
                              >
                                <RotateCcw size={15} />
                              </button>
                              <label className="shortcut-enable">
                                <input
                                  type="checkbox"
                                  checked={binding.enabled}
                                  onChange={(event) =>
                                    updateImmediateState((draft) => {
                                      draft.panelSettings.shortcuts[definition.action].enabled = event.target.checked;
                                    })
                                  }
                                />
                                <span>{binding.enabled ? t(locale, "enabled") : t(locale, "shortcutDisabled")}</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <div className="button-row settings-action-row">
                <button
                  className="action-button"
                  type="button"
                  onClick={() =>
                    updateImmediateState((draft) => {
                      for (const definition of SHORTCUT_ACTIONS) {
                        draft.panelSettings.shortcuts[definition.action] = resetShortcutBinding(definition.action);
                      }
                    })
                  }
                >
                  {t(locale, "shortcutResetAll")}
                </button>
              </div>
              </SettingsGroup>
            ) : null}
            {activeSettingsSubTab === "doctor" ? (
              <SettingsGroup title={t(locale, "settingsGroupDoctor")} className="settings-group-wide">
              <DoctorReportPanel locale={locale} report={doctorReport} />
              <div className="button-row settings-action-row">
                <button
                  className="action-button action-button-primary"
                  type="button"
                  onClick={() => runDoctor(state)}
                >
                  <Bug size={16} />
                  <span>{t(locale, "doctorRun")}</span>
                </button>
              </div>
              </SettingsGroup>
            ) : null}
            {activeSettingsSubTab === "backup" ? (
              <>
                <SettingsGroup title={t(locale, "settingsGroupExportImport")} className="settings-group-export-import">
                  <div className="button-row settings-action-row">
                    <button
                      className="action-button"
                      type="button"
                      onClick={async () => {
                        const bundle = exportConfig(state);
                        const json = JSON.stringify(bundle, null, 2);
                        const api = getApi();
                        if (!api) { setError(t(locale, "openInTerminalUnavailable")); return; }
                        const result = await api.saveFile(json, { defaultPath: "kimi-config-export.json" });
                        if (!result.canceled) { setNotice(t(locale, "exportSuccess")); }
                      }}
                    >
                      <Download size={16} />
                      <span>{t(locale, "exportConfig")}</span>
                    </button>
                    <button
                      className="action-button"
                      type="button"
                      onClick={async () => {
                        const api = getApi();
                        if (!api) { setError(t(locale, "openInTerminalUnavailable")); return; }
                        const fileResult = await api.pickFile({ filters: [{ name: "JSON", extensions: ["json"] }] });
                        if (fileResult.canceled || !fileResult.filePath) return;
                        try {
                          const readResult = await api.readFile(fileResult.filePath);
                          if (!readResult.ok || !readResult.content) { setError(readResult.error ?? t(locale, "importInvalidFile")); return; }
                          const parsed = JSON.parse(readResult.content);
                          const validation = validateImportData(parsed);
                          if (!validation.valid) { setError(validation.errors.join(" ")); return; }
                          const data = parsed as ExportBundle;
                          const preview = getImportPreview(state, data);
                          if (preview.conflicts.length === 0 && preview.newItems.length === 0) { setNotice(t(locale, "importNoItems")); return; }
                          setImportDialog({ open: true, preview, data, strategy: "skip" });
                        } catch { setError(t(locale, "importInvalidFile")); }
                      }}
                    >
                      <Upload size={16} />
                      <span>{t(locale, "importConfig")}</span>
                    </button>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t(locale, "settingsGroupBackup")} className="settings-group-wide">
              <SelectField
                label={t(locale, "backupStrategy")}
                value={state.panelSettings.backup_strategy}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_strategy = value as BackupStrategy;
                  })
                }
                options={BACKUP_STRATEGY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(locale, option.labelKey),
                }))}
              />
              {state.panelSettings.backup_strategy === "scheduled" ? (
                <SelectField
                  label={t(locale, "backupFrequency")}
                  value={state.panelSettings.backup_frequency}
                  onChange={(value) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.backup_frequency = value as BackupFrequency;
                    })
                  }
                  options={BACKUP_FREQUENCY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(locale, option.labelKey),
                  }))}
                />
              ) : null}
              <Field
                label={t(locale, "backupRetentionCount")}
                value={String(state.panelSettings.backup_retention_count)}
                onChange={(value) => {
                  const nextCount = Number.parseInt(value, 10);
                  if (Number.isNaN(nextCount)) {
                    return;
                  }
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_retention_count = Math.max(1, Math.min(99, nextCount));
                  });
                }}
                inputMode="numeric"
              />
              <SelectField
                label={t(locale, "backupDestinationType")}
                value={state.panelSettings.backup_destination_type}
                onChange={(value) =>
                  updateImmediateState((draft) => {
                    draft.panelSettings.backup_destination_type = value as BackupDestinationType;
                  })
                }
                options={BACKUP_DESTINATION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(locale, option.labelKey),
                }))}
              />
              {state.panelSettings.backup_destination_type === "local" ? (
                <PathField
                  locale={locale}
                  label={t(locale, "backupLocalPath")}
                  value={state.panelSettings.backup_local_path}
                  pickerProperties={["openDirectory", "createDirectory"]}
                  onChange={(value) =>
                    updateImmediateState((draft) => {
                      draft.panelSettings.backup_local_path = value;
                    })
                  }
                />
              ) : (
                <>
                  <Field
                    label={t(locale, "backupWebdavUrl")}
                    value={state.panelSettings.backup_webdav_url}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_url = value;
                      })
                    }
                  />
                  <Field
                    label={t(locale, "backupWebdavUsername")}
                    value={state.panelSettings.backup_webdav_username}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_username = value;
                      })
                    }
                  />
                  <SecretField
                    label={t(locale, "backupWebdavPassword")}
                    value={state.panelSettings.backup_webdav_password}
                    visible={isBackupPasswordVisible}
                    onToggleVisible={() => setIsBackupPasswordVisible((current) => !current)}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_password = value;
                      })
                    }
                    showLabel={t(locale, "showSecret")}
                    hideLabel={t(locale, "hideSecret")}
                  />
                  <Field
                    label={t(locale, "backupWebdavPath")}
                    value={state.panelSettings.backup_webdav_path}
                    onChange={(value) =>
                      updateImmediateState((draft) => {
                        draft.panelSettings.backup_webdav_path = value;
                      })
                    }
                  />
                </>
              )}
              <div className="button-row settings-action-row">
                <button
                  className={isBackupRunning ? "action-button action-button-primary is-loading" : "action-button action-button-primary"}
                  type="button"
                  disabled={isBackupRunning}
                  onClick={runManualBackup}
                >
                  {isBackupRunning ? <LoaderCircle size={16} className="button-spinner" /> : <History size={16} />}
                  <span>{isBackupRunning ? t(locale, "backupRunning") : t(locale, "backupNow")}</span>
                </button>
                <button
                  className={
                    backupRecordsDialog?.isLoading ? "action-button is-loading" : "action-button"
                  }
                  type="button"
                  disabled={backupRecordsDialog?.isLoading}
                  onClick={openBackupRecords}
                >
                  {backupRecordsDialog?.isLoading ? <LoaderCircle size={16} className="button-spinner" /> : <FolderOpen size={16} />}
                  <span>{t(locale, "backupViewRecords")}</span>
                </button>
                {state.panelSettings.backup_destination_type === "webdav" ? (
                  <button
                    className={isWebDavTesting ? "action-button is-loading" : "action-button"}
                    type="button"
                    disabled={isWebDavTesting}
                    onClick={runWebDavTest}
                  >
                    {isWebDavTesting ? <LoaderCircle size={16} className="button-spinner" /> : <Bug size={16} />}
                    <span>{isWebDavTesting ? t(locale, "backupWebdavTesting") : t(locale, "backupWebdavTest")}</span>
                  </button>
                ) : null}
              </div>
                </SettingsGroup>
              </>
            ) : null}
            {activeSettingsSubTab === "history" ? (
              <SettingsGroup title={t(locale, "historyTitle")} className="settings-group-wide">
                <HistoryPanel locale={locale} state={state} updateState={updateState} />
              </SettingsGroup>
            ) : null}
            {activeSettingsSubTab === "insights" ? (
              <InsightsSettingsPanel locale={locale} onStateChange={() => void loadState()} />
            ) : null}
          </section>
          </SplitLayout>
        ) : null}

        {activeTab === "about" ? (
          <AboutPage locale={locale} />
        ) : null}
        {importDialog.open && importDialog.preview && importDialog.data ? (
          <ImportPreviewDialog
            locale={locale}
            preview={importDialog.preview}
            data={importDialog.data}
            strategy={importDialog.strategy}
            onStrategyChange={(strategy) => setImportDialog((prev) => ({ ...prev, strategy }))}
            onConfirm={() => {
              const next = importConfig(state, importDialog.data!, importDialog.strategy);
              const hasPanelSettings = Boolean(importDialog.data?.panelSettings);

              updateState((draft) => {
                draft.mainConfig.providers = next.mainConfig.providers;
                draft.mainConfig.models = next.mainConfig.models;
                draft.profiles = next.profiles;
                draft.mcpConfig.mcpServers = next.mcpConfig.mcpServers;
                // 导入面板设置
                if (next.panelSettings) {
                  draft.panelSettings = next.panelSettings;
                }
              }, {
                persist: true,
                historySummary: t(locale, "historyImportConfig"),
              });
              setImportDialog({ open: false, preview: null, data: null, strategy: "skip" });

              // 如果导入了面板设置，提示重启生效
              if (hasPanelSettings) {
                setNotice(t(locale, "importSuccessWithPanelSettings"));
              } else {
                setNotice(t(locale, "importSuccess"));
              }
            }}
            onCancel={() => setImportDialog({ open: false, preview: null, data: null, strategy: "skip" })}
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}

function DoctorReportPanel(props: {
  locale: Locale;
  report: ConfigDoctorReport | null;
}): JSX.Element {
  const report = props.report;
  if (!report) {
    return (
      <div className="doctor-panel">
        <div className="doctor-summary muted">
          <strong>{t(props.locale, "doctorNotRun")}</strong>
          <span>{t(props.locale, "doctorNotRunHint")}</span>
        </div>
      </div>
    );
  }

  const visibleIssues = report.issues.slice(0, 8);
  return (
    <div className="doctor-panel">
      <div className={report.ok ? "doctor-summary ok" : "doctor-summary warning"}>
        <strong>
          {report.ok ? t(props.locale, "doctorStatusOk") : t(props.locale, "doctorStatusNeedsAttention")}
        </strong>
        <span>
          {formatMessage(t(props.locale, "doctorSummary"), {
            errors: report.errorCount,
            warnings: report.warningCount,
            infos: report.infoCount,
          })}
        </span>
      </div>
      {visibleIssues.length ? (
        <div className="doctor-issues">
          {visibleIssues.map((issue) => (
            <div key={issue.id} className={`doctor-issue ${issue.severity}`}>
              <span>{issue.severity}</span>
              <div>
                <strong>{issue.scope}</strong>
                <p>{issue.message}</p>
                {issue.suggestedAction ? <em>{issue.suggestedAction}</em> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <DoctorDriftList locale={props.locale} drift={report.drift} />
    </div>
  );
}


function ImportPreviewDialog(props: {
  locale: Locale;
  preview: ImportPreview;
  data: ExportBundle;
  strategy: ImportConflictStrategy;
  onStrategyChange: (strategy: ImportConflictStrategy) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const { locale, preview, strategy, onStrategyChange, onConfirm, onCancel } = props;
  const typeLabels: Record<string, string> = {
    provider: "Provider",
    model: "Model",
    profile: "Profile",
    mcp_server: "MCP",
  };
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog import-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{t(locale, "importPreview")}</h3>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t(locale, "close")}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body import-preview-body">
          {preview.conflicts.length > 0 ? (
            <div className="import-preview-section conflict-section">
              <div className="section-header">
                <h4>{t(locale, "importConflict")} ({preview.conflicts.length})</h4>
                <div className="import-preview-strategy-inline">
                  <label>{t(locale, "importStrategy")}</label>
                  <select
                    value={strategy}
                    onChange={(e) => onStrategyChange(e.target.value as ImportConflictStrategy)}
                  >
                    <option value="skip">{t(locale, "importStrategySkip")}</option>
                    <option value="overwrite">{t(locale, "importStrategyOverwrite")}</option>
                    <option value="rename">{t(locale, "importStrategyRename")}</option>
                  </select>
                </div>
              </div>
              <div className="import-preview-list">
                {preview.conflicts.map((item) => (
                  <div key={`${item.type}-${item.name}`} className="import-preview-item conflict">
                    <span className="import-preview-type">{typeLabels[item.type] ?? item.type}</span>
                    <span className="import-preview-name">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {preview.newItems.length > 0 ? (
            <div className="import-preview-section new-section">
              <h4>{t(locale, "importNew")} ({preview.newItems.length})</h4>
              <div className="import-preview-list">
                {preview.newItems.map((item) => (
                  <div key={`${item.type}-${item.name}`} className="import-preview-item new">
                    <span className="import-preview-type">{typeLabels[item.type] ?? item.type}</span>
                    <span className="import-preview-name">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button className="action-button secondary" type="button" onClick={onCancel}>
            {t(locale, "cancel")}
          </button>
          <button className="action-button primary" type="button" onClick={onConfirm}>
            {t(locale, "importConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel(props: {
  locale: Locale;
  state: AppState;
  updateState: (updater: (draft: AppState) => void, options?: { persist?: boolean; recordHistory?: boolean; historySummary?: string }) => void;
}): JSX.Element {
  const [, forceUpdate] = useState(0);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const history = getHistory(props.state);

  const handleUndo = (entryId: string): void => {
    const previous = restoreHistoryEntry(entryId);
    if (previous) {
      props.updateState((draft) => {
        Object.assign(draft, previous);
      }, { persist: true, recordHistory: false });
      setExpandedEntryId(null);
      forceUpdate((n) => n + 1);
    }
  };

  if (history.length === 0) {
    return <div className="command-palette-empty">{t(props.locale, "historyNoHistory")}</div>;
  }

  return (
    <div className="history-panel">
      {history.map((entry) => (
        <div key={entry.id} className="history-entry">
          <div className="history-entry-main">
            <button
              type="button"
              className="history-entry-info"
              onClick={() => setExpandedEntryId((current) => current === entry.id ? null : entry.id)}
              aria-expanded={expandedEntryId === entry.id}
            >
              <span className="history-entry-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className="history-entry-summary">{entry.summary}</span>
              <span className="history-entry-count">
                {formatMessage(t(props.locale, "historyChangesCount"), {
                  count: entry.details.reduce((total, detail) => total + detail.changeCount, 0),
                })}
              </span>
              <span className="history-entry-view">
                {expandedEntryId === entry.id ? t(props.locale, "historyHideDetails") : t(props.locale, "historyViewDetails")}
              </span>
            </button>
            <button type="button" className="action-button compact" onClick={() => handleUndo(entry.id)}>
              <RotateCcw size={14} />
              <span>{t(props.locale, "historyUndo")}</span>
            </button>
          </div>
          {expandedEntryId === entry.id ? (
            <div className="history-entry-details">
              {entry.details.length > 0 ? entry.details.map((detail) => (
                <section className="history-detail" key={detail.id}>
                  <div className="history-detail-title">
                    <span>{detail.title}</span>
                    <small>
                      {formatMessage(t(props.locale, "historyChangesCount"), { count: detail.changeCount })}
                    </small>
                  </div>
                  <div className="history-detail-diff" role="table" aria-label={detail.title}>
                    {renderHistoryDiffLines(detail.diff)}
                  </div>
                </section>
              )) : (
                <div className="command-palette-empty">{t(props.locale, "historyNoDetails")}</div>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderHistoryDiffLines(diff: string): JSX.Element[] {
  return (diff ? diff.split("\n") : []).map((line, index) => {
    const kind = line.startsWith("+ ")
      ? "added"
      : line.startsWith("- ")
        ? "removed"
        : "context";
    const marker = kind === "added" ? "+" : kind === "removed" ? "-" : "";
    const content = line.startsWith("+ ") || line.startsWith("- ") || line.startsWith("  ")
      ? line.slice(2)
      : line;
    return (
      <div className={`history-diff-line ${kind}`} role="row" key={`${index}-${line}`}>
        <span className="history-diff-gutter" role="cell">{marker}</span>
        <code className="history-diff-code" role="cell">{content || " "}</code>
      </div>
    );
  });
}
