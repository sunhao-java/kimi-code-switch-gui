import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Activity, Braces, Bug, CircleCheckBig, Copy, Download, ExternalLink, FileInput, FolderOpen, History, LoaderCircle, LogIn, Plus, Power, RefreshCw, RotateCcw, Save, Star, Terminal, Trash2, Upload } from "lucide-react";
import { applyProfile, cloneProfile, createDefaultKimiCodeEnvironment, deleteModel, deleteProfile, deleteProvider, fullBackupContainsRedactedSecrets, getKimiCodeConfigPath, getKimiCodeMcpConfigPath, getKimiCodeSkillsPath, getKimiCodeEnvironmentHomePath, normalizeKimiCodeEnvironments, setModelEnabled, setProviderEnabled, toggleFavorite, validateFullBackup, upsertModel, upsertProfile, upsertProvider } from "@shared/configStore";
import { buildMcpConfigDocument } from "@shared/mcpStore";
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
  DisplayOpenMode,
  FullBackupBundle,
  KimiCodeInstallSource,
  KimiCodeEnvironment,
  Locale,
  OfficialAccount,
  ShortcutAction,
  ShortcutBinding,
  TerminalApp,
} from "@shared/types";

import { AboutPage } from "../aboutPage";
import { getApi, getMcpAction, getMcpActionNotice, getResourceLabel, createUniqueName, renameModelInState, renameProviderInState } from "../appHelpers";
import {
  APPEARANCE_THEME_OPTIONS,
  BACKUP_DESTINATION_OPTIONS, BACKUP_FREQUENCY_OPTIONS, BACKUP_STRATEGY_OPTIONS,
  CLOSE_BEHAVIOR_OPTIONS, DISPLAY_OPEN_OPTIONS, labelForLocale, LOCALE_OPTIONS, TERMINAL_APP_OPTIONS, THEME_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "../appOptions";
import { useDialogEscape, useFocusTrap } from "../dialogs";
import { ErrorBoundary } from "../ErrorBoundary";
import { CompactSelect, Field, FontSizeSliderField, SelectField, SettingsGroup, ShortcutRecorderField } from "../formControls";
import { t, translateError } from "../i18n";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { ProviderHealthBanner } from "../providerHealthBanner";
import type { KimiOAuthLoginEvent, ProviderHealthResult } from "../tauri/cli";
import type { AppContext } from "./appContext";
import {
  CreateKimiCodeEnvironmentDialog,
  type CreateEnvironmentDraft,
  DoctorReportPanel,
  FullBackupImportDialog,
  HistoryPanel,
} from "./tabPanelOverlays";
import {
  ProviderForm, ModelForm, ProfileForm, McpServerForm,
  SecretField, PathField, createCopyName, createLocalizedCopyName, createDefaultMcpServer,
  formatMessage, formatSkillPathLabel, renderSkillPathLabel, McpJsonViewerDialog,
} from "../tabComponents";

// 洞察页面依赖较多图表与数据访问逻辑，仅在用户打开时加载。
const InsightsDashboard = lazy(async () => {
  const module = await import("../insightsComponents");
  return { default: module.InsightsDashboard };
});
const InsightsSettingsPanel = lazy(async () => {
  const module = await import("../insightsComponents");
  return { default: module.InsightsSettingsPanel };
});
const OverviewDashboard = lazy(async () => {
  const module = await import("../overviewDashboard");
  return { default: module.OverviewDashboard };
});
const SkillsWorkspace = lazy(async () => {
  const module = await import("../skillsWorkspace");
  return { default: module.SkillsWorkspace };
});

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
  | "confirmDeleteResource"
  | "requestConfirm"
  | "refreshSkills"
  | "openDocumentViewer"
  | "runManualBackup"
  | "runWebDavTest"
  | "runDoctor"
  | "openBackupRecords"
  | "setActiveTab"
  | "setError"
  | "setNotice"
  | "setExternalChange"
  | "setFileSnapshot"
  | "openKimiInTerminal"
  | "loadState"
> & {
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  onRequestCascadeDelete: (type: "provider" | "model", name: string) => void;
};

type SettingsSubTab = "general" | "kimi-code" | "shortcuts" | "backup" | "doctor" | "insights" | "history";
type KimiCodeSubTab = "instance" | "accounts" | "environment";

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

const ENVIRONMENT_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function buildKimiCodeEnvironmentId(environments: KimiCodeEnvironment[]): string {
  const usedIds = new Set(environments.map((environment) => environment.id));
  let attempts = 0;
  while (attempts < 100) {
    const id = Array.from({ length: 5 }, () => ENVIRONMENT_ID_ALPHABET[Math.floor(Math.random() * ENVIRONMENT_ID_ALPHABET.length)]).join("");
    if (!usedIds.has(id)) {
      return id;
    }
    attempts += 1;
  }
  throw new Error("Unable to generate a unique Kimi Code environment identifier.");
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
    persistState,
    confirmDeleteResource,
    requestConfirm,
    refreshSkills,
    openDocumentViewer,
    runManualBackup,
    runWebDavTest,
    runDoctor,
    openBackupRecords,
    setActiveTab,
    setError,
    setNotice,
    setExternalChange,
    setFileSnapshot,
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
  const currentConfigTarget = "kimi-code" as const;
  const currentConfigTargetLabel = "Kimi Code";
  const targetDetection = state.kimiTargetDetection;
  const targetDetectionStatusLabel = targetDetection?.status === "checking"
    ? t(locale, "configTargetDetecting")
    : targetDetection?.status === "detected"
      ? t(locale, "configTargetDetected")
      : t(locale, "configTargetNotDetected");
  const targetDetectionStatusClass = targetDetection?.status === "checking"
    ? "is-pending"
    : targetDetection?.status === "detected"
      ? "is-ok"
      : "is-danger";
  const installSourceLabel = (source?: KimiCodeInstallSource): string => {
    switch (source) {
      case "homebrew":
        return t(locale, "configTargetInstallSourceHomebrew");
      case "official-script":
        return t(locale, "configTargetInstallSourceOfficialScript");
      case "npm":
        return t(locale, "configTargetInstallSourceNpm");
      case "pnpm":
        return t(locale, "configTargetInstallSourcePnpm");
      case "unknown":
      case undefined:
        return targetDetection?.installed ? t(locale, "configTargetInstallSourceUnknown") : t(locale, "overviewCliNotFound");
    }
  };
  const [environmentDrafts, setEnvironmentDrafts] = useState<Record<string, Pick<KimiCodeEnvironment, "name" | "homePath" | "description">>>({});
  const [createEnvironmentDraft, setCreateEnvironmentDraft] = useState<CreateEnvironmentDraft | null>(null);
  const [selectedKimiCodeEnvironmentId, setSelectedKimiCodeEnvironmentId] = useState<string | null>(null);
  const kimiCodeEnvironments = normalizeKimiCodeEnvironments(state.panelSettings.kimi_code_environments);
  const activeKimiCodeEnvironment = kimiCodeEnvironments.find((environment) => environment.id === state.panelSettings.active_kimi_code_environment_id)
    ?? kimiCodeEnvironments[0]
    ?? createDefaultKimiCodeEnvironment();
  const selectedKimiCodeEnvironment = kimiCodeEnvironments.find((environment) => environment.id === selectedKimiCodeEnvironmentId)
    ?? activeKimiCodeEnvironment;
  const saveKimiCodeEnvironments = async (
    environments: KimiCodeEnvironment[],
    activeEnvironmentId = activeKimiCodeEnvironment.id,
  ): Promise<void> => {
    const api = getApi();
    if (!api?.saveKimiCodeEnvironmentPreference) {
      throw new Error("Kimi Switch API does not support Kimi Code environment management.");
    }
    const normalized = normalizeKimiCodeEnvironments(environments);
    setExternalChange(null);
    setFileSnapshot(null);
    const result = await api.saveKimiCodeEnvironmentPreference(normalized, activeEnvironmentId);
    setFileSnapshot(result.snapshot);
    await loadState();
  };
  const buildNextEnvironmentSeed = (): CreateEnvironmentDraft => {
    const nextIndex = kimiCodeEnvironments.length + 1;
    let suffix = nextIndex;
    const usedIds = new Set(kimiCodeEnvironments.map((environment) => environment.id));
    while (usedIds.has(`env-${suffix}`)) {
      suffix += 1;
    }
    return {
      id: buildKimiCodeEnvironmentId(kimiCodeEnvironments),
      name: formatMessage(t(locale, "kimiCodeEnvironmentDefaultName"), { index: suffix }),
      description: "",
      sourceEnvironmentId: "",
    };
  };
  const addKimiCodeEnvironment = (): void => {
    setCreateEnvironmentDraft(buildNextEnvironmentSeed());
  };
  const createKimiCodeEnvironment = (draft: CreateEnvironmentDraft): void => {
    void (async () => {
      if (!draft.name.trim()) {
        setError(t(locale, "kimiCodeEnvironmentRequired"));
        return;
      }
      const timestamp = new Date().toISOString();
      const id = draft.id;
      if (!id || kimiCodeEnvironments.some((environment) => environment.id === id)) {
        setError(t(locale, "kimiCodeEnvironmentIdentifierConflict"));
        return;
      }
      const homePath = getKimiCodeEnvironmentHomePath(id);
      const sourceEnvironment = draft.sourceEnvironmentId
        ? kimiCodeEnvironments.find((environment) => environment.id === draft.sourceEnvironmentId)
        : undefined;
      if (sourceEnvironment) {
        const { copyDir } = await import("../tauri/fileAccess");
        await copyDir(sourceEnvironment.homePath, homePath);
      }
      const sourceSnapshot = sourceEnvironment?.id === activeKimiCodeEnvironment.id
        ? {
            mainConfig: state.mainConfig,
            profiles: state.profiles,
            activeProfile: state.activeProfile,
            mcpServers: state.mcpConfig.mcpServers,
          }
        : sourceEnvironment;
      // Provider/Model 以 SQLite 为唯一真源：复制环境时必须显式复制 DB 行，
      // 否则新环境的 env_config 为空（copyDir 只搬运文件投影，不含 DB）。
      if (sourceEnvironment) {
        const { getEnvConfig, saveEnvConfig } = await import("../tauri/envConfigStore");
        let providers = sourceSnapshot?.mainConfig?.providers;
        let models = sourceSnapshot?.mainConfig?.models;
        // 来源非激活环境：内存快照可能为空，回退读取来源环境的 DB 行。
        if (!providers || Object.keys(providers).length === 0) {
          const sourceDb = await getEnvConfig(sourceEnvironment.id);
          if (sourceDb) {
            providers = sourceDb.providers;
            models = sourceDb.models;
          }
        }
        await saveEnvConfig(id, {
          providers: providers ? structuredClone(providers) : {},
          models: models ? structuredClone(models) : {},
        });
      }
      const nextEnvironment: KimiCodeEnvironment = {
        id,
        name: draft.name.trim(),
        homePath,
        description: draft.description.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
        sourceEnvironmentId: sourceEnvironment?.id,
        mainConfig: sourceSnapshot?.mainConfig ? structuredClone(sourceSnapshot.mainConfig) : undefined,
        profiles: sourceSnapshot?.profiles ? structuredClone(sourceSnapshot.profiles) : {},
        activeProfile: sourceSnapshot?.activeProfile ?? "",
        mcpServers: sourceSnapshot?.mcpServers ? structuredClone(sourceSnapshot.mcpServers) : {},
      };
      await saveKimiCodeEnvironments([...kimiCodeEnvironments, nextEnvironment], nextEnvironment.id);
      setCreateEnvironmentDraft(null);
      setNotice(t(locale, "kimiCodeEnvironmentSaved"));
    })().catch((error) => setError(error instanceof Error ? error.message : String(error)));
  };
  const environmentDraftFor = (environment: KimiCodeEnvironment): Pick<KimiCodeEnvironment, "name" | "homePath" | "description"> => (
    environmentDrafts[environment.id] ?? {
      name: environment.name,
      homePath: environment.homePath,
      description: environment.description ?? "",
    }
  );
  const updateEnvironmentDraft = (id: string, patch: Partial<Pick<KimiCodeEnvironment, "name" | "homePath" | "description">>): void => {
    setEnvironmentDrafts((current) => {
      const environment = kimiCodeEnvironments.find((item) => item.id === id);
      if (!environment) {
        return current;
      }
      return {
        ...current,
        [id]: {
          name: environment.name,
          homePath: environment.homePath,
          description: environment.description ?? "",
          ...current[id],
          ...patch,
        },
      };
    });
  };
  const saveKimiCodeEnvironment = (id: string): void => {
    void (async () => {
      const draft = environmentDrafts[id];
      if (!draft) {
        return;
      }
      if (!draft.name.trim() || !draft.homePath.trim()) {
        setError(t(locale, "kimiCodeEnvironmentRequired"));
        return;
      }
      const next = kimiCodeEnvironments.map((environment) => environment.id === id
        ? {
          ...environment,
          name: draft.name.trim(),
          description: draft.description?.trim() ?? "",
          updatedAt: new Date().toISOString(),
        }
        : environment);
      await saveKimiCodeEnvironments(next, activeKimiCodeEnvironment.id);
      setEnvironmentDrafts((current) => {
        const { [id]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setNotice(t(locale, "kimiCodeEnvironmentSaved"));
    })().catch((error) => setError(error instanceof Error ? error.message : String(error)));
  };
  const activateKimiCodeEnvironment = (id: string): void => {
    void (async () => {
      await saveKimiCodeEnvironments(kimiCodeEnvironments, id);
      // 切换环境后自动刷新界面（saveKimiCodeEnvironments 内部已 loadState），并跳转到总览页。
      setActiveTab("overview");
      setNotice(t(locale, "kimiCodeEnvironmentActivated"));
    })().catch((error) => setError(error instanceof Error ? error.message : String(error)));
  };
  const deleteKimiCodeEnvironment = (environment: KimiCodeEnvironment): void => {
    void (async () => {
      if (environment.id === "default" || kimiCodeEnvironments.length <= 1) {
        setError(t(locale, "kimiCodeEnvironmentCannotDelete"));
        return;
      }
      const shouldDelete = await requestConfirm({
        title: formatMessage(t(locale, "kimiCodeEnvironmentDeleteTitle"), {
          name: environment.name || environment.id,
        }),
        description: formatMessage(t(locale, "kimiCodeEnvironmentDeleteDescription"), {
          path: environment.homePath,
        }),
        confirmLabel: t(locale, "delete"),
        cancelLabel: t(locale, "cancel"),
        tone: "danger",
        kind: "delete",
      });
      if (!shouldDelete) {
        return;
      }
      const next = kimiCodeEnvironments.filter((item) => item.id !== environment.id);
      const nextActiveId = activeKimiCodeEnvironment.id === environment.id
        ? (next[0]?.id ?? "default")
        : activeKimiCodeEnvironment.id;
      await saveKimiCodeEnvironments(next, nextActiveId);
      const { removeDir } = await import("../tauri/fileAccess");
      await removeDir(environment.homePath);
      setNotice(t(locale, "kimiCodeEnvironmentDeleted"));
    })().catch((error) => setError(error instanceof Error ? error.message : String(error)));
  };
  const renderInlineCodeMessage = (template: string, values: Record<string, string | number> = {}): JSX.Element => {
    const message = formatMessage(template, values);
    const parts = message.split(/(`[^`]+`)/g).filter(Boolean);
    return (
      <>
        {parts.map((part, index) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
          }
          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </>
    );
  };
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

  const [activeSettingsSubTab, setActiveSettingsSubTab] = useState<SettingsSubTab>("kimi-code");
  const [kimiCodeSubTab, setKimiCodeSubTab] = useState<KimiCodeSubTab>("instance");
  const [fullBackupImportDialog, setFullBackupImportDialog] = useState<{ open: boolean; data: FullBackupBundle | null; envCount: number; hasRedactedSecrets: boolean }>({ open: false, data: null, envCount: 0, hasRedactedSecrets: false });
  const [isImportingFullBackup, setIsImportingFullBackup] = useState(false);
  const [isMcpJsonViewerOpen, setIsMcpJsonViewerOpen] = useState(false);
  const [providerHealthResults, setProviderHealthResults] = useState<ProviderHealthResult[] | null>(null);
  const [isProviderHealthChecking, setIsProviderHealthChecking] = useState(false);
  const [providerHealthBannerOpen, setProviderHealthBannerOpen] = useState(false);
  const [providerHealthBannerKey, setProviderHealthBannerKey] = useState(0);
  const [officialAccounts, setOfficialAccounts] = useState<OfficialAccount[]>([]);
  const [officialAccountsLoading, setOfficialAccountsLoading] = useState(false);

  const refreshOfficialAccounts = (): void => {
    const api = getApi();
    if (!api?.listOfficialAccounts) return;
    setOfficialAccountsLoading(true);
    void api.listOfficialAccounts()
      .then((accounts) => setOfficialAccounts(accounts))
      .catch(() => setOfficialAccounts([]))
      .finally(() => setOfficialAccountsLoading(false));
  };

  useEffect(() => {
    // 仅在挂载时拉取一次官方账号列表；后续变更由各操作显式调用 refreshOfficialAccounts。
    refreshOfficialAccounts();
  }, []);

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
        refreshOfficialAccounts();
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

  const activateOfficialAccount = (id: string): void => {
    const api = getApi();
    if (!api?.activateOfficialAccount) return;
    void api.activateOfficialAccount(id)
      .then(async () => {
        setNotice(t(locale, "officialAccountActivated"));
        refreshOfficialAccounts();
        await loadState();
      })
      .catch((error) => setError(error instanceof Error ? error.message : String(error)));
  };

  const deleteOfficialAccount = (account: OfficialAccount): void => {
    const api = getApi();
    if (!api?.deleteOfficialAccount) return;
    void (async () => {
      if (!(await confirmDeleteResource(t(locale, "officialAccount"), account.display_name))) return;
      await api.deleteOfficialAccount(account.id);
      setNotice(t(locale, "officialAccountDeleted"));
      refreshOfficialAccounts();
      await loadState();
    })().catch((error) => setError(error instanceof Error ? error.message : String(error)));
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
      id: "kimi-code",
      label: t(locale, "settingsTabKimiCode"),
      description: t(locale, "settingsTabKimiCodeDescription"),
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
  const isSplitLayoutTab = activeTab === "providers"
    || activeTab === "models"
    || activeTab === "profiles"
    || activeTab === "mcp"
    || activeTab === "skills"
    || activeTab === "settings";

  return (
    <ErrorBoundary locale={locale}>
      <>
        <div className={isSplitLayoutTab ? "tab-panel-shell tab-panel-shell-split" : "tab-panel-shell"}>
        {activeTab === "overview" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
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
          </Suspense>
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
            itemClassName={(name) =>
              state.mainConfig.providers[name]?.enabled === false ? "provider-list-row disabled" : "provider-list-row"
            }
            renderItemAction={(name) => {
              const provider = state.mainConfig.providers[name];
              if (!provider) return null;
              const isEnabled = provider.enabled !== false;
              return (
                <button
                  className={isEnabled ? "list-toggle-button" : "list-toggle-button disabled"}
                  type="button"
                  aria-label={isEnabled ? t(locale, "disableProvider") : t(locale, "enableProvider")}
                  title={isEnabled ? t(locale, "disableProvider") : t(locale, "enableProvider")}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateState((draft) => {
                      setProviderEnabled(draft, name, !isEnabled);
                    }, {
                      historySummary: formatMessage(
                        t(locale, isEnabled ? "historyDisableProvider" : "historyEnableProvider"),
                        { name },
                      ),
                    });
                  }}
                >
                  <Power size={15} />
                </button>
              );
            }}
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
            itemClassName={(name) => {
              const model = state.mainConfig.models[name];
              if (!model) return null;
              const providerEnabled = state.mainConfig.providers[model.provider]?.enabled !== false;
              return model.enabled === false || !providerEnabled ? "disabled" : null;
            }}
            renderItemAction={(name) => {
              const model = state.mainConfig.models[name];
              if (!model) return null;
              const providerEnabled = state.mainConfig.providers[model.provider]?.enabled !== false;
              const isEnabled = model.enabled !== false;
              const title = !providerEnabled
                ? t(locale, "modelProviderDisabled")
                : isEnabled ? t(locale, "disableModel") : t(locale, "enableModel");
              return (
                <button
                  className={isEnabled && providerEnabled ? "list-toggle-button" : "list-toggle-button disabled"}
                  type="button"
                  disabled={!providerEnabled}
                  aria-label={title}
                  title={title}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!providerEnabled) return;
                    updateState((draft) => {
                      setModelEnabled(draft, name, !isEnabled);
                    }, {
                      historySummary: formatMessage(
                        t(locale, isEnabled ? "historyDisableModel" : "historyEnableModel"),
                        { name },
                      ),
                    });
                  }}
                >
                  <Power size={15} />
                </button>
              );
            }}
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
                officialAccounts={officialAccounts}
                activeOfficialAccountId={state.panelSettings.active_official_account_id}
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
                    if (nextModel.auth_mode !== "official-account") {
                      delete nextModel.official_account_scope;
                    }
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
                  aria-label={t(locale, "mcpViewFullJson")}
                  title={t(locale, "mcpViewFullJson")}
                  onClick={() => setIsMcpJsonViewerOpen(true)}
                >
                  <Braces size={15} />
                </button>
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
              {isMcpJsonViewerOpen ? (
                <McpJsonViewerDialog
                  locale={locale}
                  value={buildMcpConfigDocument(state.mcpConfig)}
                  onClose={() => setIsMcpJsonViewerOpen(false)}
                />
              ) : null}
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
            <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
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
            </Suspense>
          </SplitLayout>
        ) : null}

        {activeTab === "insights" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <InsightsDashboard
              locale={locale}
              onStateChange={() => void loadState()}
              onOpenSettings={() => runAfterUnsavedHandled(() => {
                setActiveSettingsSubTab("insights");
                setActiveTab("settings");
              })}
            />
          </Suspense>
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
            {activeSettingsSubTab === "kimi-code" ? (
              <div className="settings-tab-panel">
                <div className="settings-inner-tabs-nav">
                  {([["instance", "settingsGroupConfigTarget"], ["accounts", "officialAccountsTitle"], ["environment", "kimiCodeEnvironmentTitle"]] as const).map(([tab, key]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setKimiCodeSubTab(tab)}
                      className={`settings-inner-tab-button ${kimiCodeSubTab === tab ? "active" : ""}`}
                    >
                      {t(locale, key)}
                    </button>
                  ))}
                </div>
                <p className="settings-inner-tab-desc">
                  {renderInlineCodeMessage(t(locale, kimiCodeSubTab === "instance"
                    ? "kimiCodeSubTabInstanceDesc"
                    : kimiCodeSubTab === "accounts"
                      ? "kimiCodeSubTabAccountsDesc"
                      : "kimiCodeSubTabEnvironmentDesc"))}
                </p>
                {kimiCodeSubTab === "instance" ? (
                <SettingsGroup>
                  <div className="config-target-detection">
                    <div className="config-target-detection-main">
                      <div>
                        <span>{t(locale, "configTargetLabel")}</span>
                        <strong>{currentConfigTargetLabel}</strong>
                      </div>
                      <span className={`config-target-status ${targetDetectionStatusClass}`}>
                        {targetDetectionStatusLabel}
                      </span>
                    </div>
                    <div className="config-target-detection-grid">
                      <div className="config-target-metric">
                        <span>{t(locale, "configTargetVersion")}</span>
                        <code>{targetDetection?.version || t(locale, "overviewCliNotFound")}</code>
                      </div>
                      <div className="config-target-metric">
                        <span>{t(locale, "configTargetInstallSource")}</span>
                        <code>{installSourceLabel(targetDetection?.installSource)}</code>
                      </div>
                      <div className="config-target-path">
                        <span>{t(locale, "configTargetExecutable")}</span>
                        <code>{targetDetection?.executablePath || "-"}</code>
                      </div>
                      <div className="config-target-path config-target-resolved-path">
                        <span>{t(locale, "configTargetResolvedPath")}</span>
                        <code>{targetDetection?.resolvedPath || "-"}</code>
                      </div>
                    </div>
                    <p className="config-target-detection-note">
                      {renderInlineCodeMessage(t(locale, "configTargetAutoDescription"))}
                    </p>
                    {targetDetection?.installed === false ? (
                      <p className="config-target-install-warning">
                        {formatMessage(t(locale, "configTargetInstallRequired"), {
                          name: currentConfigTargetLabel,
                          command: "brew install kimi-code",
                        })}
                      </p>
                    ) : null}
                  </div>
                </SettingsGroup>
                ) : null}
                {kimiCodeSubTab === "accounts" ? (
                <>
                <div className={`oauth-login-panel oauth-login-${kimiCodeOAuthLogin.status}`}>
                  <div className="oauth-login-copy">
                    <strong>{formatMessage(t(locale, "kimiOauthTitle"), { target: currentConfigTargetLabel })}</strong>
                    <span>{renderInlineCodeMessage(t(locale, "kimiOauthDescription"), { target: currentConfigTargetLabel })}</span>
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
                <SettingsGroup>
                  <div className="official-account-panel">
                    <div className="official-account-toolbar">
                      <div>
                        <strong>{t(locale, "officialAccountsCurrent")}</strong>
                        <span>
                          {officialAccounts.find((account) => account.id === state.panelSettings.active_official_account_id)?.display_name
                            || t(locale, "officialAccountNoneActive")}
                        </span>
                      </div>
                    </div>
                    <div className="official-account-list">
                      {officialAccountsLoading ? (
                        <div className="official-account-empty">
                          <LoaderCircle size={14} className="button-spinner" />
                          <span>{t(locale, "loading")}</span>
                        </div>
                      ) : officialAccounts.length === 0 ? (
                        <div className="official-account-empty">{t(locale, "officialAccountEmpty")}</div>
                      ) : officialAccounts.map((account) => (
                        <div className={account.is_active ? "official-account-card active" : "official-account-card"} key={account.id}>
                          <div className="official-account-main">
                            <strong>{account.display_name}</strong>
                            <span>{account.credentials_slot_path}</span>
                          </div>
                          <div className="official-account-meta">
                            <span className={account.status === "logged-in" ? "config-target-status is-ok" : "config-target-status is-danger"}>
                              {account.status === "logged-in" ? t(locale, "officialAccountLoggedIn") : t(locale, "officialAccountEmptyStatus")}
                            </span>
                            {account.is_active ? <span className="config-target-status is-ok">{t(locale, "officialAccountActive")}</span> : null}
                          </div>
                          <div className="official-account-actions">
                            <button
                              className="action-button compact secondary"
                              type="button"
                              disabled={account.is_active || kimiCodeOAuthLogin.status === "running"}
                              onClick={() => activateOfficialAccount(account.id)}
                            >
                              <Power size={13} />
                              <span>{t(locale, "officialAccountActivate")}</span>
                            </button>
                            <button
                              className="action-button compact danger"
                              type="button"
                              disabled={kimiCodeOAuthLogin.status === "running"}
                              aria-label={t(locale, "delete")}
                              title={t(locale, "delete")}
                              onClick={() => deleteOfficialAccount(account)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SettingsGroup>
                </>
                ) : null}
                {kimiCodeSubTab === "environment" ? (
                <SettingsGroup>
                  <div className="kimi-environment-panel">
                    <div className="kimi-environment-summary">
                      <div>
                        <span>{t(locale, "kimiCodeEnvironmentActive")}</span>
                        <strong>{activeKimiCodeEnvironment.name || activeKimiCodeEnvironment.id}</strong>
                      </div>
                      <button className="action-button compact" type="button" onClick={addKimiCodeEnvironment}>
                        <Plus size={13} />
                        <span>{t(locale, "kimiCodeEnvironmentAdd")}</span>
                      </button>
                    </div>
                    <div className="kimi-environment-table-wrap">
                      <table className="kimi-environment-table">
                        <thead>
                          <tr>
                            <th>{t(locale, "kimiCodeEnvironmentIdentifier")}</th>
                            <th>{t(locale, "kimiCodeEnvironmentName")}</th>
                            <th>{t(locale, "actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kimiCodeEnvironments.map((environment) => {
                            const draft = environmentDraftFor(environment);
                            const isActive = environment.id === activeKimiCodeEnvironment.id;
                            const isSelected = environment.id === selectedKimiCodeEnvironment.id;
                            const isDirty = draft.name !== environment.name
                              || (draft.description ?? "") !== (environment.description ?? "");
                            return (
                              <tr
                                className={`${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`.trim()}
                                key={environment.id}
                                onClick={() => setSelectedKimiCodeEnvironmentId(environment.id)}
                              >
                                <td>
                                  <code className="kimi-environment-identifier" title={environment.id}>{environment.id}</code>
                                </td>
                                <td>
                                  <div className="kimi-environment-name-cell">
                                    <div className="kimi-environment-name-line">
                                      <span className={isActive ? "status-dot active" : "status-dot"} />
                                      <strong>{draft.name || environment.id}</strong>
                                      {isDirty ? <span className="kimi-environment-dirty-dot" title={t(locale, "unsavedChanges")} /> : null}
                                    </div>
                                    <div className="kimi-environment-meta-line">
                                      <span>{draft.description || t(locale, "kimiCodeEnvironmentDescription")}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="kimi-environment-row-actions">
                                    {isDirty ? (
                                      <button
                                        className="icon-button is-dirty"
                                        type="button"
                                        aria-label={t(locale, "saveProvider")}
                                        title={t(locale, "saveProvider")}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          saveKimiCodeEnvironment(environment.id);
                                        }}
                                      >
                                        <Save size={15} />
                                      </button>
                                    ) : null}
                                    <button
                                      className={isActive ? "icon-button is-active" : "icon-button"}
                                      type="button"
                                      disabled={isActive}
                                      aria-label={t(locale, "activate")}
                                      title={t(locale, "activate")}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        activateKimiCodeEnvironment(environment.id);
                                      }}
                                    >
                                      <CircleCheckBig size={15} />
                                    </button>
                                    <button
                                      className="icon-button danger"
                                      type="button"
                                      disabled={environment.id === "default" || kimiCodeEnvironments.length <= 1}
                                      aria-label={t(locale, "delete")}
                                      title={t(locale, "delete")}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        deleteKimiCodeEnvironment(environment);
                                      }}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="kimi-environment-editor">
                      <div className="kimi-environment-editor-head">
                        <div>
                          <span>{selectedKimiCodeEnvironment.id === activeKimiCodeEnvironment.id ? t(locale, "kimiCodeEnvironmentActive") : t(locale, "kimiCodeEnvironment")}</span>
                          <strong>{selectedKimiCodeEnvironment.name || selectedKimiCodeEnvironment.id}</strong>
                        </div>
                        {(() => {
                          const draft = environmentDraftFor(selectedKimiCodeEnvironment);
                          const isActiveSelected = selectedKimiCodeEnvironment.id === activeKimiCodeEnvironment.id;
                          const isDirty = draft.name !== selectedKimiCodeEnvironment.name
                            || (draft.description ?? "") !== (selectedKimiCodeEnvironment.description ?? "");
                          return isDirty && !isActiveSelected ? (
                            <button className="action-button compact" type="button" onClick={() => saveKimiCodeEnvironment(selectedKimiCodeEnvironment.id)}>
                              <Save size={13} />
                              <span>{t(locale, "saveProvider")}</span>
                            </button>
                          ) : null;
                        })()}
                      </div>
                      {(() => {
                        const draft = environmentDraftFor(selectedKimiCodeEnvironment);
                        const isActiveSelected = selectedKimiCodeEnvironment.id === activeKimiCodeEnvironment.id;
                        return (
                          <>
                            <div className="settings-inline-fields">
                              <Field
                                label={t(locale, "kimiCodeEnvironmentName")}
                                value={draft.name}
                                readOnly={isActiveSelected}
                                onChange={(value) => updateEnvironmentDraft(selectedKimiCodeEnvironment.id, { name: value })}
                              />
                              <Field
                                label={t(locale, "kimiCodeEnvironmentHomePath")}
                                value={draft.homePath}
                                readOnly
                                onChange={() => {}}
                              />
                            </div>
                            <Field
                              label={t(locale, "kimiCodeEnvironmentDescription")}
                              value={draft.description ?? ""}
                              readOnly={isActiveSelected}
                              onChange={(value) => updateEnvironmentDraft(selectedKimiCodeEnvironment.id, { description: value })}
                            />
                            <div className="kimi-environment-path-grid">
                              <div>
                                <span>{t(locale, "configPath")}</span>
                                <code title={getKimiCodeConfigPath(draft.homePath)}>{getKimiCodeConfigPath(draft.homePath)}</code>
                              </div>
                              <div>
                                <span>{t(locale, "mcpConfigPathLabel")}</span>
                                <code title={getKimiCodeMcpConfigPath(draft.homePath)}>{getKimiCodeMcpConfigPath(draft.homePath)}</code>
                              </div>
                              <div>
                                <span>{t(locale, "kimiCodeEnvironmentSkillsPath")}</span>
                                <code title={getKimiCodeSkillsPath(draft.homePath)}>{getKimiCodeSkillsPath(draft.homePath)}</code>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </SettingsGroup>
                ) : null}
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
                  <p className="settings-group-description">{t(locale, "exportImportSecretsHint")}</p>
                  <div className="button-row settings-action-row">
                    <button
                      className="action-button"
                      type="button"
                      onClick={async () => {
                        const api = getApi();
                        if (!api) { setError(t(locale, "openInTerminalUnavailable")); return; }
                        if (typeof api.exportFullBackup !== "function") { setError(t(locale, "backupRuntimeOutdated")); return; }
                        try {
                          const bundle = await api.exportFullBackup(state);
                          const json = JSON.stringify(bundle, null, 2);
                          const result = await api.saveFile(json, { defaultPath: "kimi-full-backup.json" });
                          if (!result.canceled) { setError(""); setNotice(t(locale, "exportSuccessWithSecrets")); }
                        } catch (err) {
                          setNotice("");
                          setError(err instanceof Error ? err.message : String(err));
                        }
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
                        if (typeof api.importFullBackup !== "function") { setError(t(locale, "backupRuntimeOutdated")); return; }
                        const fileResult = await api.pickFile({ filters: [{ name: "JSON", extensions: ["json"] }] });
                        if (fileResult.canceled || !fileResult.filePath) return;
                        try {
                          const readResult = await api.readFile(fileResult.filePath);
                          if (!readResult.ok || !readResult.content) { setError(readResult.error ?? t(locale, "importInvalidFile")); return; }
                          const parsed = JSON.parse(readResult.content);
                          const validation = validateFullBackup(parsed);
                          if (!validation.valid) { setError(validation.errors.join(" ")); return; }
                          const data = parsed as FullBackupBundle;
                          setFullBackupImportDialog({
                            open: true,
                            data,
                            envCount: data.environments.length,
                            hasRedactedSecrets: fullBackupContainsRedactedSecrets(data),
                          });
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
              <Suspense fallback={<LoaderCircle size={20} className="button-spinner" aria-label={t(locale, "loading")} />}>
                <InsightsSettingsPanel locale={locale} onStateChange={() => void loadState()} />
              </Suspense>
            ) : null}
          </section>
          </SplitLayout>
        ) : null}
        {activeTab === "about" ? <AboutPage locale={locale} /> : null}
        {fullBackupImportDialog.open && fullBackupImportDialog.data ? (
          <FullBackupImportDialog
            locale={locale}
            envCount={fullBackupImportDialog.envCount}
            hasRedactedSecrets={fullBackupImportDialog.hasRedactedSecrets}
            isImporting={isImportingFullBackup}
            onConfirm={() => {
              void (async () => {
                const api = getApi();
                if (!api || typeof api.importFullBackup !== "function") {
                  setError(t(locale, "backupRuntimeOutdated"));
                  return;
                }
                setIsImportingFullBackup(true);
                try {
                  await api.importFullBackup(fullBackupImportDialog.data!);
                  setFullBackupImportDialog({ open: false, data: null, envCount: 0, hasRedactedSecrets: false });
                  setError("");
                  setNotice(t(locale, "importSuccessWithPanelSettings"));
                  await loadState();
                } catch (err) {
                  setNotice("");
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setIsImportingFullBackup(false);
                }
              })();
            }}
            onCancel={() => {
              if (isImportingFullBackup) return;
              setFullBackupImportDialog({ open: false, data: null, envCount: 0, hasRedactedSecrets: false });
            }}
          />
        ) : null}
        </div>
        {createEnvironmentDraft ? (
          <CreateKimiCodeEnvironmentDialog
            locale={locale}
            environments={kimiCodeEnvironments}
            draft={createEnvironmentDraft}
            onChange={setCreateEnvironmentDraft}
            onCancel={() => setCreateEnvironmentDraft(null)}
            onCreate={createKimiCodeEnvironment}
          />
        ) : null}
      </>
    </ErrorBoundary>
  );
}
