import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, ChevronDown, ChevronsLeft, ChevronsRight, RefreshCw, Terminal, X } from "lucide-react";

import type { KimiCodeEnvironment, McpServerConfig, ShortcutAction, ShortcutBinding } from "@shared/types";
import { applyProfile, normalizeKimiCodeEnvironments } from "@shared/configStore";
import type { SearchResult } from "@shared/configStore";
import { parseMcpConfigStrict } from "@shared/mcpStore";
import { formatAcceleratorForPlatform, getBrowserShortcutPlatform, normalizeShortcuts } from "@shared/shortcutStore";

import { CommandPalette } from "./commandPalette";
import { QuickProfileSwitcher } from "./quickProfileSwitcher";
import { TabPanels } from "./tabs/TabPanels";
import { ProfileCentricView } from "./views/ProfileCentricView";
import { AddAssistantWizard } from "./wizards/AddAssistantWizard";
import { CascadeDeleteDialog } from "./dialogs/CascadeDeleteDialog";
import { getCascadePreview } from "@shared/configRelations";
import type { CascadeImpact } from "@shared/configRelations";
import { deleteProvider, deleteModel, deleteProfile } from "@shared/configStore";
import { useAppHandlers } from "./useAppHandlers";
import { maybeRunScheduledBackup } from "./backupAuto";
import { useShortcuts } from "./useShortcuts";
import { TAB_ITEMS, LOCALE_OPTIONS, THEME_OPTIONS, ASSISTANT_SUB_ITEMS } from "./appOptions";
import type { TabId } from "./appOptions";
import {
  BackupRecordsDialog,
  ConfirmDialog,
  DocumentViewerDialog,
} from "./dialogs";
import { t } from "./i18n";
import { McpImportDialog, formatMessage } from "./tabComponents";
import { SummaryCard } from "./overviewDashboard";
import { TopbarControls } from "./topbarControls";
import { ToastContainer } from "./Toast";
import { useToast } from "./useToast";
import { getApi } from "./appHelpers";
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

export function App(): JSX.Element {
  const app = useAppHandlers();
  const { toasts, showToast, removeToast } = useToast();
  const {
    state,
    activeTab, setActiveTab,
    locale, title, diagnostics,
    loadState,
    closeConfirmDialog,
    selectedProvider, setSelectedProvider,
    selectedModel, setSelectedModel,
    selectedProfile, setSelectedProfile,
    selectedMcpServer, setSelectedMcpServer,
    setSelectedSkill,
    setSelectedSkillPath,
    skillsViewMode, setSkillsViewMode,
    skillsReport,
    isSkillsLoading,
    documentViewer, setDocumentViewer,
    backupRecordsDialog, setBackupRecordsDialog,
    doctorReport,
    setFileSnapshot,
    error, setError, notice, setNotice, externalChange, setExternalChange,
    isMcpImportOpen, setIsMcpImportOpen,
    mcpImportDraft, setMcpImportDraft,
    mcpImportInitialDraft, setMcpImportInitialDraft,
    mcpTestingName, setMcpTestingName,
    profileTestingName, setProfileTestingName,
    isBackupRunning,
    isWebDavTesting,
    isBackupPasswordVisible, setIsBackupPasswordVisible,
    confirmDialog,
    dirtyProviders, dirtyModels, dirtyProfiles, dirtyMcpServers,
    providerEntries, modelEntries, profileEntries, mcpEntries,
    skillPathEntries, skillEntries, sortedSkillPathEntries,
    visibleSkillEntries,
    selectedProviderName, selectedModelName,
    selectedProfileName, selectedMcpServerName,
    selectedSkillPathId, selectedSkillData, selectedSkillPathData,
    selectedProviderData, selectedModelData,
    selectedProfileData, selectedMcpServerData,
    isProviderNameEditable, isProfileNameEditable, isMcpServerNameEditable,
    updateState, updateImmediateState,
    runAfterUnsavedHandled, onSave, persistState,
    confirmDeleteResource, requestConfirm,
    closeMcpImportDialog, requestCloseMcpImportDialog,
    refreshSkills, openDocumentViewer,
    runManualBackup, runWebDavTest, openKimiInTerminal,
    runDoctor,
    openBackupRecords, deleteBackupRecord, restoreBackupRecord,
  } = app;
  const shortcuts = normalizeShortcuts(state.panelSettings.shortcuts);
  const shortcutPlatform = getBrowserShortcutPlatform();
  const tabShortcutLabels = createTabShortcutLabels(shortcuts, shortcutPlatform);
  const isSidebarCollapsed = state.panelSettings.sidebar_collapsed;
  const kimiCodeEnvironments = normalizeKimiCodeEnvironments(state.panelSettings.kimi_code_environments);
  const activeKimiCodeEnvironmentId = state.panelSettings.active_kimi_code_environment_id
    ?? kimiCodeEnvironments[0]?.id
    ?? "default";
  const environmentOptions = kimiCodeEnvironments.map((environment: KimiCodeEnvironment) => ({
    value: environment.id,
    label: environment.name || environment.id,
    description: environment.description || environment.id,
  }));
  const toggleSidebar = useCallback(() => {
    updateImmediateState((draft) => {
      draft.panelSettings.sidebar_collapsed = !draft.panelSettings.sidebar_collapsed;
    });
  }, [updateImmediateState]);
  const switchKimiCodeEnvironment = useCallback((environmentId: string): void => {
    if (!environmentId || environmentId === activeKimiCodeEnvironmentId) {
      return;
    }
    runAfterUnsavedHandled(() => {
      void (async () => {
        const api = getApi();
        if (!api?.saveKimiCodeEnvironmentPreference) {
          setError("Kimi Switch API does not support Kimi Code environment management.");
          return;
        }
        try {
          setExternalChange(null);
          setFileSnapshot(null);
          const result = await api.saveKimiCodeEnvironmentPreference(kimiCodeEnvironments, environmentId);
          setFileSnapshot(result.snapshot);
          await loadState();
          setNotice(t(locale, "kimiCodeEnvironmentActivated"));
        } catch (switchError) {
          setError(switchError instanceof Error ? switchError.message : String(switchError));
        }
      })();
    });
  }, [
    activeKimiCodeEnvironmentId,
    kimiCodeEnvironments,
    loadState,
    locale,
    runAfterUnsavedHandled,
    setError,
    setExternalChange,
    setFileSnapshot,
    setNotice,
  ]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [cascadeTarget, setCascadeTarget] = useState<{ type: "provider" | "model"; name: string; impact: CascadeImpact } | null>(null);
  const requestCascadeDelete = (type: "provider" | "model", name: string): void => {
    setCascadeTarget({ type, name, impact: getCascadePreview(state, { type, name }) });
  };

  useShortcuts({
    shortcuts,
    onSave: () => void onSave(),
    onReload: () => void loadState(),
    onRefresh: () => {
      window.dispatchEvent(new CustomEvent("kimi-refresh"));
    },
    onNavigate: (tab) => runAfterUnsavedHandled(() => setActiveTab(tab)),
    onGlobalSearch: () => setCommandPaletteOpen((v) => !v),
  });

  // 将 error 和 notice 转换为 Toast
  useEffect(() => {
    if (error) {
      showToast(error, "error");
      setError("");
    }
  }, [error, showToast, setError]);

  useEffect(() => {
    if (notice) {
      showToast(notice, "success");
      setNotice("");
    }
  }, [notice, showToast, setNotice]);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "p") {
        event.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // 托盘动作（切换语言/主题/Profile）已写盘，重新加载状态以实时刷新 UI
  useEffect(() => {
    function handleTrayReload(): void {
      void loadState();
    }
    window.addEventListener("kimi-tray-reload", handleTrayReload);
    return () => window.removeEventListener("kimi-tray-reload", handleTrayReload);
  }, [loadState]);

  // 托盘「用量洞察」入口：显示窗口后切到 Insights 子页
  useEffect(() => {
    function handleOpenInsights(): void {
      runAfterUnsavedHandled(() => setActiveTab("insights"));
    }
    window.addEventListener("kimi-open-insights", handleOpenInsights);
    return () => window.removeEventListener("kimi-open-insights", handleOpenInsights);
  }, [runAfterUnsavedHandled, setActiveTab]);

  // 定时备份（scheduled 策略）：每 5 分钟检查一次是否到期，到期则补做。
  // 用 ref 持有最新 state，避免把 state 放进 effect 依赖导致定时器反复重建。
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  useEffect(() => {
    const timer = window.setInterval(() => {
      void maybeRunScheduledBackup(latestStateRef.current);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleCommandPaletteSelect = useCallback((result: SearchResult): void => {
    setCommandPaletteOpen(false);
    runAfterUnsavedHandled(() => {
      setActiveTab(result.tabId as TabId);
      if (result.type === "provider") setSelectedProvider(result.name);
      else if (result.type === "model") setSelectedModel(result.name);
      else if (result.type === "profile") setSelectedProfile(result.name);
      else if (result.type === "mcp") setSelectedMcpServer(result.name);
    });
  }, [runAfterUnsavedHandled, setActiveTab, setSelectedProvider, setSelectedModel, setSelectedProfile, setSelectedMcpServer]);

  const handleQuickSwitchActivate = useCallback((profileName: string): void => {
    setQuickSwitcherOpen(false);
    updateState((draft) => {
      applyProfile(draft, profileName);
    }, {
      historySummary: formatMessage(t(locale, "historyActivateProfile"), { name: profileName }),
    });
  }, [locale, updateState]);

  const [isAssistantGroupOpen, setIsAssistantGroupOpen] = useState(true);

  // 通过快捷键或命令面板导航到子菜单时自动展开分组
  useEffect(() => {
    if (ASSISTANT_SUB_ITEMS.some((item) => item.id === activeTab)) {
      setIsAssistantGroupOpen(true);
    }
  }, [activeTab]);

  const tabListRef = useRef<HTMLDivElement>(null);
  const visibleTabItems = TAB_ITEMS.filter((item) => item.id !== "about");
  const bottomTabItems = TAB_ITEMS.filter((item) => item.id === "about");
  const profilesIdx = TAB_ITEMS.findIndex((i) => i.id === "profiles");
  const mainTabIds = [
    ...visibleTabItems.slice(0, profilesIdx + 1).map((i) => i.id),
    ...ASSISTANT_SUB_ITEMS.map((i) => i.id),
    ...visibleTabItems.slice(profilesIdx + 1).map((i) => i.id),
    ...bottomTabItems.map((i) => i.id),
  ];

  const focusTab = useCallback((tabId: string): void => {
    const button = document.getElementById(`tab-${tabId}`);
    if (button instanceof HTMLElement) {
      button.focus();
    }
  }, []);

  const activeProfileDisplayName = state.profiles[state.activeProfile]?.label?.trim() || state.activeProfile || "-";

  const handleMainTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      const currentIndex = mainTabIds.indexOf(activeTab);
      if (currentIndex === -1) {
        return;
      }

      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % mainTabIds.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + mainTabIds.length) % mainTabIds.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = mainTabIds.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = mainTabIds[nextIndex];
      if (nextTab) {
        runAfterUnsavedHandled(() => {
          setActiveTab(nextTab);
          focusTab(nextTab);
        });
      }
    },
    [activeTab, mainTabIds, runAfterUnsavedHandled, setActiveTab, focusTab],
  );

  return (
    <div className={isSidebarCollapsed ? "shell sidebar-collapsed" : "shell"}>
      <div className="window-titlebar drag-region" aria-hidden="true" data-tauri-drag-region>
        <div className="window-titlebar-safe" data-tauri-drag-region />
      </div>
      {externalChange ? (
        <div className="app-tip-layer" role="status" aria-live="polite">
          <div className="app-tip app-tip-warning">
            <AlertTriangle size={18} className="app-tip-icon" />
            <span className="app-tip-message">
              {t(locale, "fileWatchExternalChange").replace("{files}", externalChange.changedFileNames.join(", "))}
            </span>
            <button
              type="button"
              className="app-tip-action"
              onClick={() => {
                setExternalChange(null);
                void loadState();
              }}
            >
              <RefreshCw size={13} />
              {t(locale, "fileWatchReload")}
            </button>
            <button
              type="button"
              className="app-tip-close"
              aria-label={t(locale, "close")}
              onClick={() => setExternalChange(null)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      <div className="background-grid" />
      <aside className="sidebar glass-panel">
        <div className="brand drag-region" data-tauri-drag-region>
          <div className="brand-mark" data-tauri-drag-region>
            <img className="brand-logo brand-logo-light" src={logoLight} alt="Kimi Code Switch" />
            <img className="brand-logo brand-logo-dark" src={logoDark} alt="Kimi Code Switch" />
          </div>
          <div className="brand-copy" data-tauri-drag-region>
            <h1 title={title}>{title}</h1>
            <p>{t(locale, "appSubtitle")}</p>
          </div>
          <button
            type="button"
            className="sidebar-collapse-button no-drag"
            aria-label={t(locale, isSidebarCollapsed ? "expandSidebar" : "collapseSidebar")}
            title={t(locale, isSidebarCollapsed ? "expandSidebar" : "collapseSidebar")}
            onClick={toggleSidebar}
          >
            {isSidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        <nav className="nav" role="tablist" ref={tabListRef} onKeyDown={handleMainTabKeyDown}>
          {visibleTabItems.map(({ id, icon: Icon, labelKey }) => {
            if (id === "profiles") {
              const isGroupActive = ["profiles", "providers", "models"].includes(activeTab);
              return (
                <div key={id} className="nav-group">
                  <div className="nav-group-header">
                    <button
                      id={`tab-${id}`}
                      role="tab"
                      aria-selected={isGroupActive}
                      className={isGroupActive ? "nav-item active" : "nav-item"}
                      title={t(locale, labelKey)}
                      aria-label={t(locale, labelKey)}
                      tabIndex={isGroupActive ? 0 : -1}
                      onClick={() => {
                        setIsAssistantGroupOpen(true);
                        if (activeTab !== "profiles") {
                          runAfterUnsavedHandled(() => setActiveTab("profiles"));
                        }
                      }}
                    >
                      <Icon size={18} />
                      <span>{t(locale, labelKey)}</span>
                      {tabShortcutLabels[id] ? <kbd className="nav-shortcut">{tabShortcutLabels[id]}</kbd> : null}
                    </button>
                    {!isSidebarCollapsed && (
                      <button
                        type="button"
                        className={isAssistantGroupOpen ? "nav-group-toggle is-open" : "nav-group-toggle"}
                        aria-label={isAssistantGroupOpen ? t(locale, "collapseSidebar") : t(locale, "expandSidebar")}
                        onClick={() => setIsAssistantGroupOpen((v) => !v)}
                      >
                        <ChevronDown size={13} />
                      </button>
                    )}
                  </div>
                  {!isSidebarCollapsed && (
                    <div className={isAssistantGroupOpen ? "nav-subitems-wrapper" : "nav-subitems-wrapper is-collapsed"}>
                      <div className="nav-subitems">
                        {ASSISTANT_SUB_ITEMS.map(({ id: subId, icon: SubIcon, labelKey: subLabelKey }) => (
                          <button
                            key={subId}
                            id={`tab-${subId}`}
                            role="tab"
                            aria-selected={activeTab === subId}
                            className={activeTab === subId ? "nav-item nav-subitem active" : "nav-item nav-subitem"}
                            title={t(locale, subLabelKey)}
                            aria-label={t(locale, subLabelKey)}
                            tabIndex={activeTab === subId ? 0 : -1}
                            onClick={() => {
                              if (subId === activeTab) return;
                              runAfterUnsavedHandled(() => setActiveTab(subId));
                            }}
                          >
                            <SubIcon size={16} />
                            <span>{t(locale, subLabelKey)}</span>
                            {tabShortcutLabels[subId] ? <kbd className="nav-shortcut">{tabShortcutLabels[subId]}</kbd> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={activeTab === id}
                className={id === activeTab ? "nav-item active" : "nav-item"}
                title={t(locale, labelKey)}
                aria-label={t(locale, labelKey)}
                tabIndex={id === activeTab ? 0 : -1}
                onClick={() => {
                  if (id === activeTab) return;
                  runAfterUnsavedHandled(() => setActiveTab(id));
                }}
              >
                <Icon size={18} />
                <span>{t(locale, labelKey)}</span>
                {tabShortcutLabels[id] ? <kbd className="nav-shortcut">{tabShortcutLabels[id]}</kbd> : null}
              </button>
            );
          })}
        </nav>
        <nav className="nav nav-bottom" role="tablist" aria-label={t(locale, "about")}>
          {bottomTabItems.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={activeTab === id}
              className={id === activeTab ? "nav-item active" : "nav-item"}
              title={t(locale, labelKey)}
              aria-label={t(locale, labelKey)}
              tabIndex={id === activeTab ? 0 : -1}
              onClick={() => {
                if (id === activeTab) return;
                runAfterUnsavedHandled(() => setActiveTab(id));
              }}
            >
              <Icon size={18} />
              <span>{t(locale, labelKey)}</span>
              {tabShortcutLabels[id] ? <kbd className="nav-shortcut">{tabShortcutLabels[id]}</kbd> : null}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="summary-grid">
            <SummaryCard
              label={t(locale, "summaryProfiles")}
              value={String(profileEntries.length)}
              active={activeTab === "profiles"}
              onClick={() => {
                if (activeTab === "profiles") return;
                runAfterUnsavedHandled(() => setActiveTab("profiles"));
              }}
            />
            <SummaryCard
              label={t(locale, "summaryProviders")}
              value={String(providerEntries.length)}
              active={activeTab === "providers"}
              onClick={() => {
                if (activeTab === "providers") return;
                runAfterUnsavedHandled(() => setActiveTab("providers"));
              }}
            />
            <SummaryCard
              label={t(locale, "summaryModels")}
              value={String(modelEntries.length)}
              active={activeTab === "models"}
              onClick={() => {
                if (activeTab === "models") return;
                runAfterUnsavedHandled(() => setActiveTab("models"));
              }}
            />
            <SummaryCard
              label={t(locale, "summaryMcp")}
              value={formatMessage(t(locale, "summaryMcpCompact"), {
                total: mcpEntries.length,
                enabled: mcpEntries.filter(([, server]: [string, McpServerConfig]) => server.enabled !== false).length,
              })}
              title={`${formatMessage(t(locale, "summaryMcpTotal"), { count: mcpEntries.length })} · ${formatMessage(
                t(locale, "summaryMcpEnabled"),
                { count: mcpEntries.filter(([, server]: [string, McpServerConfig]) => server.enabled !== false).length },
              )}`}
              active={activeTab === "mcp"}
              onClick={() => {
                if (activeTab === "mcp") return;
                runAfterUnsavedHandled(() => setActiveTab("mcp"));
              }}
            />
            <SummaryCard
              label={t(locale, "summarySkills")}
              value={
                skillsReport
                  ? formatMessage(t(locale, "summarySkillsCompact"), {
                      total: skillsReport.summary.total,
                      effective: skillsReport.summary.effective,
                    })
                  : "-"
              }
              title={
                skillsReport
                  ? `${formatMessage(t(locale, "summarySkillsTotal"), { count: skillsReport.summary.total })} · ${formatMessage(
                      t(locale, "summarySkillsEffective"),
                      { count: skillsReport.summary.effective },
                    )}`
                  : undefined
              }
              active={activeTab === "skills"}
              onClick={() => {
                if (activeTab === "skills") return;
                runAfterUnsavedHandled(() => setActiveTab("skills"));
              }}
            />
            <div className="summary-card accent summary-active-card" title={state.activeProfile || undefined}>
              <div className="summary-active-copy">
                <span>{t(locale, "summaryActive")}</span>
                <strong>{activeProfileDisplayName}</strong>
              </div>
              <button
                className="summary-terminal-button no-drag"
                type="button"
                aria-label={t(locale, "openActiveProfileInTerminal")}
                title={t(locale, "openActiveProfileInTerminal")}
                disabled={!state.activeProfile}
                onClick={() => void openKimiInTerminal(state.activeProfile)}
              >
                <Terminal size={15} />
              </button>
            </div>
          </div>
          <div className="toolbar">
            <TopbarControls
              locale={locale}
              theme={state.panelSettings.theme}
              localeOptions={LOCALE_OPTIONS}
              themeOptions={THEME_OPTIONS}
              environmentId={activeKimiCodeEnvironmentId}
              environmentOptions={environmentOptions}
              onEnvironmentChange={switchKimiCodeEnvironment}
              onLocaleChange={(value) =>
                updateImmediateState((draft) => {
                  draft.panelSettings.locale = value;
                })
              }
              onThemeChange={(value) =>
                updateImmediateState((draft) => {
                  draft.panelSettings.theme = value;
                })
              }
            />
          </div>
        </header>

        <div className="content-scroll" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "profiles" ? (
            <ProfileCentricView
              state={state}
              locale={locale}
              selectedProfile={selectedProfileName}
              dirtyProfiles={dirtyProfiles}
              onSelect={(name) => runAfterUnsavedHandled(() => setSelectedProfile(name))}
              onSwitch={(profileName) =>
                updateState((draft) => {
                  applyProfile(draft, profileName);
                }, {
                  historySummary: formatMessage(t(locale, "historyActivateProfile"), { name: profileName }),
                })
              }
              onAddNew={() => setShowWizard(true)}
              onOpenTerminal={(profileName) => void openKimiInTerminal(profileName)}
            />
          ) : null}
          <TabPanels
            state={state}
            shortcuts={shortcuts}
            activeTab={activeTab}
            locale={locale}
            diagnostics={diagnostics}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onRequestCascadeDelete={requestCascadeDelete}
            selectedProfile={selectedProfile}
            setSelectedProfile={setSelectedProfile}
            selectedMcpServer={selectedMcpServer}
            setSelectedMcpServer={setSelectedMcpServer}
            setSelectedSkill={setSelectedSkill}
            setSelectedSkillPath={setSelectedSkillPath}
            skillsViewMode={skillsViewMode}
            setSkillsViewMode={setSkillsViewMode}
            skillsReport={skillsReport}
            isSkillsLoading={isSkillsLoading}
            providerEntries={providerEntries}
            modelEntries={modelEntries}
            profileEntries={profileEntries}
            mcpEntries={mcpEntries}
            skillPathEntries={skillPathEntries}
            skillEntries={skillEntries}
            sortedSkillPathEntries={sortedSkillPathEntries}
            visibleSkillEntries={visibleSkillEntries}
            selectedProviderName={selectedProviderName}
            selectedModelName={selectedModelName}
            selectedProfileName={selectedProfileName}
            selectedMcpServerName={selectedMcpServerName}
            selectedSkillPathId={selectedSkillPathId}
            selectedSkillData={selectedSkillData}
            selectedSkillPathData={selectedSkillPathData}
            selectedProviderData={selectedProviderData}
            selectedModelData={selectedModelData}
            selectedProfileData={selectedProfileData}
            selectedMcpServerData={selectedMcpServerData}
            isProviderNameEditable={isProviderNameEditable}
            isProfileNameEditable={isProfileNameEditable}
            isMcpServerNameEditable={isMcpServerNameEditable}
            dirtyProviders={dirtyProviders}
            dirtyModels={dirtyModels}
            dirtyProfiles={dirtyProfiles}
            dirtyMcpServers={dirtyMcpServers}
            setIsMcpImportOpen={setIsMcpImportOpen}
            setMcpImportDraft={setMcpImportDraft}
            setMcpImportInitialDraft={setMcpImportInitialDraft}
            mcpTestingName={mcpTestingName}
            setMcpTestingName={setMcpTestingName}
            profileTestingName={profileTestingName}
            setProfileTestingName={setProfileTestingName}
            backupRecordsDialog={backupRecordsDialog}
            doctorReport={doctorReport}
            isBackupRunning={isBackupRunning}
            isWebDavTesting={isWebDavTesting}
            isBackupPasswordVisible={isBackupPasswordVisible}
            setIsBackupPasswordVisible={setIsBackupPasswordVisible}
            updateState={updateState}
            updateImmediateState={updateImmediateState}
            runAfterUnsavedHandled={runAfterUnsavedHandled}
            onSave={onSave}
            persistState={persistState}
            confirmDeleteResource={confirmDeleteResource}
            requestConfirm={requestConfirm}
            refreshSkills={refreshSkills}
            openDocumentViewer={openDocumentViewer}
            runManualBackup={runManualBackup}
            runWebDavTest={runWebDavTest}
            openKimiInTerminal={openKimiInTerminal}
            runDoctor={runDoctor}
            openBackupRecords={openBackupRecords}
            setActiveTab={setActiveTab}
            setError={setError}
            setNotice={setNotice}
            setExternalChange={setExternalChange}
            setFileSnapshot={setFileSnapshot}
            loadState={loadState}
          />
        </div>
      </main>
      {confirmDialog ? (
        <ConfirmDialog
          {...confirmDialog}
          onConfirm={() => closeConfirmDialog(true)}
          onCancel={() => closeConfirmDialog(false)}
        />
      ) : null}
      {documentViewer ? (
        <DocumentViewerDialog
          locale={locale}
          {...documentViewer}
          onClose={() => setDocumentViewer(null)}
        />
      ) : null}
      {backupRecordsDialog ? (
        <BackupRecordsDialog
          locale={locale}
          {...backupRecordsDialog}
          onDelete={deleteBackupRecord}
          onRestore={restoreBackupRecord}
          onClose={() => setBackupRecordsDialog(null)}
        />
      ) : null}
      {isMcpImportOpen ? (
        <McpImportDialog
          locale={locale}
          value={mcpImportDraft}
          onChange={setMcpImportDraft}
          onCancel={requestCloseMcpImportDialog}
          onImport={() => {
            try {
              const imported = parseMcpConfigStrict(mcpImportDraft);
              const importedNames = Object.keys(imported.mcpServers);
              if (!importedNames.length) {
                setNotice("");
                setError(t(locale, "mcpImportInvalid"));
                return;
              }

              updateState((draft) => {
                draft.mcpConfig.mcpServers = {
                  ...draft.mcpConfig.mcpServers,
                  ...imported.mcpServers,
                };
              }, {
                persist: false,
                recordHistory: true,
                historySummary: t(locale, "mcpImportApply"),
              });
              setSelectedMcpServer(importedNames[0] ?? "");

              closeMcpImportDialog();
              setError("");
              setNotice(t(locale, "mcpImportSuccess"));
            } catch (importError) {
              const message = importError instanceof Error ? importError.message : String(importError);
              setNotice("");
              setError(`${t(locale, "mcpImportInvalid")} ${message}`);
            }
          }}
        />
      ) : null}
      {commandPaletteOpen ? (
        <CommandPalette
          state={state}
          locale={locale}
          onSelect={handleCommandPaletteSelect}
          onClose={() => setCommandPaletteOpen(false)}
        />
      ) : null}
      {quickSwitcherOpen ? (
        <QuickProfileSwitcher
          state={state}
          locale={locale}
          onActivate={handleQuickSwitchActivate}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      ) : null}
      {showWizard ? (
        <AddAssistantWizard
          locale={locale}
          state={state}
          onComplete={(updater, profileName) => {
            updateState(updater, {
              persist: true,
              recordHistory: true,
              historySummary: formatMessage(t(locale, "historyWizardCreate"), { name: profileName }),
            });
            setShowWizard(false);
          }}
          onCancel={() => setShowWizard(false)}
        />
      ) : null}
      {cascadeTarget ? (
        <CascadeDeleteDialog
          locale={locale}
          targetType={cascadeTarget.type}
          targetName={cascadeTarget.name}
          impact={cascadeTarget.impact}
          onConfirm={(strategy) => {
            let newFirstProvider = "";
            let newFirstModel = "";
            let newFirstProfile = "";
            updateState((draft) => {
              if (strategy === "cascade") {
                for (const m of cascadeTarget.impact.affectedModels) {
                  deleteModel(draft, m.name);
                }
                for (const p of cascadeTarget.impact.affectedProfiles) {
                  deleteProfile(draft, p.name);
                }
              }
              if (cascadeTarget.type === "provider") {
                deleteProvider(draft, cascadeTarget.name);
              } else {
                deleteModel(draft, cascadeTarget.name);
              }
              if (cascadeTarget.impact.isCurrentActive && cascadeTarget.impact.suggestedFallbackProfile) {
                applyProfile(draft, cascadeTarget.impact.suggestedFallbackProfile);
              }
              newFirstProvider = Object.keys(draft.mainConfig.providers)[0] ?? "";
              newFirstModel = Object.keys(draft.mainConfig.models)[0] ?? "";
              newFirstProfile = Object.keys(draft.profiles)[0] ?? "";
            }, {
              persist: true,
              recordHistory: true,
              historySummary: formatMessage(t(locale, "historyCascadeDelete"), { name: cascadeTarget.name }),
            });
            setSelectedProvider(newFirstProvider);
            setSelectedModel(newFirstModel);
            setSelectedProfile(newFirstProfile);
            setCascadeTarget(null);
          }}
          onCancel={() => setCascadeTarget(null)}
        />
      ) : null}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function createTabShortcutLabels(
  shortcuts: Record<ShortcutAction, ShortcutBinding>,
  platform: string,
): Partial<Record<string, string>> {
  const labels: Partial<Record<string, string>> = {};
  for (const [action, tab] of Object.entries(TAB_SHORTCUT_ACTIONS)) {
    const binding = shortcuts[action as ShortcutAction];
    if (!binding?.enabled || !binding.accelerator.trim()) {
      continue;
    }
    labels[tab] = formatAcceleratorForPlatform(binding.accelerator, platform);
  }
  return labels;
}

const TAB_SHORTCUT_ACTIONS: Record<string, string> = {
  "tab.overview": "overview",
  "tab.profiles": "profiles",
  "tab.providers": "providers",
  "tab.models": "models",
  "tab.mcp": "mcp",
  "tab.skills": "skills",
  "tab.insights": "insights",
  "tab.settings": "settings",
};
