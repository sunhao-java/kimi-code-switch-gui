import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { applyProfile, createDefaultKimiCodeEnvironment, getKimiCodeEnvironmentHomePath, normalizeKimiCodeEnvironments } from "@shared/configStore";
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
  FullBackupBundle,
  KimiCodeInstallSource,
  KimiCodeEnvironment,
  Locale,
  OfficialAccount,
  ShortcutAction,
  ShortcutBinding,
} from "@shared/types";

import { getApi } from "../appHelpers";
import {
  APPEARANCE_THEME_OPTIONS,
  BACKUP_DESTINATION_OPTIONS, BACKUP_FREQUENCY_OPTIONS, BACKUP_STRATEGY_OPTIONS,
  CLOSE_BEHAVIOR_OPTIONS, DISPLAY_OPEN_OPTIONS, labelForLocale, LOCALE_OPTIONS, TERMINAL_APP_OPTIONS, THEME_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "../appOptions";
import { useDialogEscape, useFocusTrap } from "../dialogs";
import { ErrorBoundary } from "../ErrorBoundary";
import { CompactSelect, Field, FontSizeSliderField, SelectField, SettingsGroup, ShortcutRecorderField } from "../formControls";
import { t, translateError } from "../i18n";
import { SplitLayout } from "../layoutComponents";
import type { KimiOAuthLoginEvent, ProviderHealthResult } from "../tauri/cli";
import { getEnvConfig, saveEnvConfig } from "../tauri/envConfigStore";
import { copyDir, removeDir } from "../tauri/fileAccess";
import type { AppContext } from "./appContext";
import type { CreateEnvironmentDraft } from "./tabPanelOverlays";
import { formatMessage, formatSkillPathLabel, renderSkillPathLabel } from "../tabComponents";

// 洞察页面依赖较多图表与数据访问逻辑，仅在用户打开时加载。
const InsightsDashboard = lazy(async () => {
  const module = await import("../insightsComponents");
  return { default: module.InsightsDashboard };
});
const AboutPage = lazy(async () => {
  const module = await import("../aboutPage");
  return { default: module.AboutPage };
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

const ProvidersTab = lazy(async () => {
  const module = await import("./providersTab");
  return { default: module.ProvidersTab };
});
const ModelsTab = lazy(async () => {
  const module = await import("./modelsTab");
  return { default: module.ModelsTab };
});

const ProfilesTab = lazy(async () => {
  const module = await import("./profilesTab");
  return { default: module.ProfilesTab };
});
const McpTab = lazy(async () => {
  const module = await import("./mcpTab");
  return { default: module.McpTab };
});
const SettingsTab = lazy(async () => {
  const module = await import("./settingsTab");
  return { default: module.SettingsTab };
});
const FullBackupImportDialog = lazy(async () => {
  const module = await import("./tabPanelOverlays");
  return { default: module.FullBackupImportDialog };
});
const CreateKimiCodeEnvironmentDialog = lazy(async () => {
  const module = await import("./tabPanelOverlays");
  return { default: module.CreateKimiCodeEnvironmentDialog };
});

export type TabPanelsProps = Pick<
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
  const shortcutConflicts = useMemo(() => getShortcutConflicts(shortcuts), [shortcuts]);
  const shortcutPlatform = getBrowserShortcutPlatform();
  const shortcutConflictActions = useMemo(
    () => new Set(shortcutConflicts.flatMap((conflict) => conflict.actions)),
    [shortcutConflicts],
  );
  const shortcutLabels = useMemo(
    () => Object.fromEntries(
      SHORTCUT_ACTIONS.map((definition) => [definition.action, labelForLocale(definition.label, locale)]),
    ) as Record<ShortcutAction, string>,
    [locale],
  );
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
  const kimiCodeEnvironments = useMemo(
    () => normalizeKimiCodeEnvironments(state.panelSettings.kimi_code_environments),
    [state.panelSettings.kimi_code_environments],
  );
  const activeKimiCodeEnvironment = useMemo(
    () => kimiCodeEnvironments.find((environment) => environment.id === state.panelSettings.active_kimi_code_environment_id)
      ?? kimiCodeEnvironments[0]
      ?? createDefaultKimiCodeEnvironment(),
    [kimiCodeEnvironments, state.panelSettings.active_kimi_code_environment_id],
  );
  const selectedKimiCodeEnvironment = useMemo(
    () => kimiCodeEnvironments.find((environment) => environment.id === selectedKimiCodeEnvironmentId)
      ?? activeKimiCodeEnvironment,
    [activeKimiCodeEnvironment, kimiCodeEnvironments, selectedKimiCodeEnvironmentId],
  );
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
  const shortcutGroups = useMemo(() => [
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
  ], [locale]);
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
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <ProvidersTab
              {...props}
              providerHealthResults={providerHealthResults}
              setProviderHealthResults={setProviderHealthResults}
              isProviderHealthChecking={isProviderHealthChecking}
              setIsProviderHealthChecking={setIsProviderHealthChecking}
              providerHealthBannerOpen={providerHealthBannerOpen}
              setProviderHealthBannerOpen={setProviderHealthBannerOpen}
              providerHealthBannerKey={providerHealthBannerKey}
              setProviderHealthBannerKey={setProviderHealthBannerKey}
            />
          </Suspense>
        ) : null}

        {activeTab === "models" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <ModelsTab {...props} officialAccounts={officialAccounts} />
          </Suspense>
        ) : null}

        {activeTab === "profiles" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <ProfilesTab {...props} />
          </Suspense>
        ) : null}

        {activeTab === "mcp" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <McpTab
              {...props}
              isMcpJsonViewerOpen={isMcpJsonViewerOpen}
              setIsMcpJsonViewerOpen={setIsMcpJsonViewerOpen}
            />
          </Suspense>
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
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <SettingsTab
              {...props}
              settingsSubTabs={settingsSubTabs}
              activeSettingsSubTab={activeSettingsSubTab}
              setActiveSettingsSubTab={setActiveSettingsSubTab}
              kimiCodeSubTab={kimiCodeSubTab}
              setKimiCodeSubTab={setKimiCodeSubTab}
              kimiCodeOAuthLogin={kimiCodeOAuthLogin}
              currentConfigTargetLabel={currentConfigTargetLabel}
              targetDetection={targetDetection}
              targetDetectionStatusLabel={targetDetectionStatusLabel}
              targetDetectionStatusClass={targetDetectionStatusClass}
              installSourceLabel={installSourceLabel}
              renderInlineCodeMessage={renderInlineCodeMessage}
              officialAccounts={officialAccounts}
              officialAccountsLoading={officialAccountsLoading}
              startKimiOAuthLogin={startKimiOAuthLogin}
              activateOfficialAccount={activateOfficialAccount}
              deleteOfficialAccount={deleteOfficialAccount}
              kimiCodeEnvironments={kimiCodeEnvironments}
              activeKimiCodeEnvironment={activeKimiCodeEnvironment}
              selectedKimiCodeEnvironment={selectedKimiCodeEnvironment}
              selectedKimiCodeEnvironmentId={selectedKimiCodeEnvironmentId}
              setSelectedKimiCodeEnvironmentId={setSelectedKimiCodeEnvironmentId}
              environmentDraftFor={environmentDraftFor}
              updateEnvironmentDraft={updateEnvironmentDraft}
              addKimiCodeEnvironment={addKimiCodeEnvironment}
              saveKimiCodeEnvironment={saveKimiCodeEnvironment}
              activateKimiCodeEnvironment={activateKimiCodeEnvironment}
              deleteKimiCodeEnvironment={deleteKimiCodeEnvironment}
              shortcutConflicts={shortcutConflicts}
              shortcutPlatform={shortcutPlatform}
              shortcutConflictActions={shortcutConflictActions}
              shortcutLabels={shortcutLabels}
              shortcutGroups={shortcutGroups}
              isBackupPasswordVisible={isBackupPasswordVisible}
              setIsBackupPasswordVisible={setIsBackupPasswordVisible}
              fullBackupImportDialog={fullBackupImportDialog}
              setFullBackupImportDialog={setFullBackupImportDialog}
            />
          </Suspense>
        ) : null}

        {activeTab === "about" ? (
          <Suspense fallback={<LoaderCircle size={24} className="button-spinner" aria-label={t(locale, "loading")} />}>
            <AboutPage locale={locale} />
          </Suspense>
        ) : null}
        {fullBackupImportDialog.open && fullBackupImportDialog.data ? (
          <Suspense fallback={null}>
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
          </Suspense>
        ) : null}
        </div>
        {createEnvironmentDraft ? (
          <Suspense fallback={null}>
            <CreateKimiCodeEnvironmentDialog
              locale={locale}
              environments={kimiCodeEnvironments}
              draft={createEnvironmentDraft}
              onChange={setCreateEnvironmentDraft}
              onCancel={() => setCreateEnvironmentDraft(null)}
              onCreate={createKimiCodeEnvironment}
            />
          </Suspense>
        ) : null}
      </>
    </ErrorBoundary>
  );
}
