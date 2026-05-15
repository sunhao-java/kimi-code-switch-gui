import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, ChevronsLeft, ChevronsRight, RefreshCw, Terminal, X } from "lucide-react";

import type { McpServerConfig, ShortcutAction, ShortcutBinding } from "@shared/types";
import { applyProfile } from "@shared/configStore";
import type { SearchResult } from "@shared/configStore";
import { parseMcpConfigStrict } from "@shared/mcpStore";
import { formatAcceleratorForPlatform, getBrowserShortcutPlatform, normalizeShortcuts } from "@shared/shortcutStore";

import { CommandPalette } from "./commandPalette";
import { QuickProfileSwitcher } from "./quickProfileSwitcher";
import { TabPanels } from "./tabs/TabPanels";
import { useAppHandlers } from "./useAppHandlers";
import { useShortcuts } from "./useShortcuts";
import { TAB_ITEMS, ABOUT_TAB, LOCALE_OPTIONS, THEME_OPTIONS } from "./appOptions";
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
import logoLight from "./assets/logo-light.png";
import logoDark from "./assets/logo-dark.png";

export function App(): JSX.Element {
  const app = useAppHandlers();
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
    confirmDeleteResource,
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
  const toggleSidebar = useCallback(() => {
    updateImmediateState((draft) => {
      draft.panelSettings.sidebar_collapsed = !draft.panelSettings.sidebar_collapsed;
    });
  }, [updateImmediateState]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  useShortcuts({
    shortcuts,
    onSave: () => void onSave(),
    onReload: () => void loadState(),
    onNavigate: (tab) => runAfterUnsavedHandled(() => setActiveTab(tab)),
    onGlobalSearch: () => setCommandPaletteOpen((v) => !v),
  });

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

  const tabListRef = useRef<HTMLDivElement>(null);
  const mainTabIds = TAB_ITEMS.map((item) => item.id);

  const focusTab = useCallback((tabId: string): void => {
    const button = document.getElementById(`tab-${tabId}`);
    if (button instanceof HTMLElement) {
      button.focus();
    }
  }, []);

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

  const handleAboutTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp"
        || event.key === "ArrowLeft" || event.key === "ArrowRight"
        || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        runAfterUnsavedHandled(() => {
          setActiveTab(ABOUT_TAB.id);
          focusTab(ABOUT_TAB.id);
        });
      }
    },
    [runAfterUnsavedHandled, setActiveTab, focusTab],
  );

  return (
    <div className={isSidebarCollapsed ? "shell sidebar-collapsed" : "shell"}>
      <div className="window-titlebar drag-region" aria-hidden="true">
        <div className="window-titlebar-safe" />
      </div>
      {error ? (
        <div className="app-tip-layer" role="status" aria-live="polite">
          <div className="app-tip app-tip-error">
            <span className="app-tip-message">{error}</span>
            <button
              type="button"
              className="app-tip-close"
              aria-label={t(locale, "close")}
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {!error && externalChange ? (
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
      {!error && !externalChange && notice ? (
        <div className="app-tip-layer" role="status" aria-live="polite">
          <div className="app-tip app-tip-success">
            <span className="app-tip-message">{notice}</span>
            <button
              type="button"
              className="app-tip-close"
              aria-label={t(locale, "close")}
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      <div className="background-grid" />
      <aside className="sidebar glass-panel">
        <div className="brand drag-region">
          <div className="brand-mark">
            <img className="brand-logo brand-logo-light" src={logoLight} alt="Kimi Code Switch" />
            <img className="brand-logo brand-logo-dark" src={logoDark} alt="Kimi Code Switch" />
          </div>
          <div className="brand-copy">
            <h1>{title}</h1>
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
          {TAB_ITEMS.map(({ id, icon: Icon, labelKey }) => (
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
        <nav className="nav nav-bottom" role="tablist" onKeyDown={handleAboutTabKeyDown}>
          <button
            id={`tab-${ABOUT_TAB.id}`}
            role="tab"
            aria-selected={activeTab === ABOUT_TAB.id}
            className={ABOUT_TAB.id === activeTab ? "nav-item active" : "nav-item"}
            title={t(locale, ABOUT_TAB.labelKey)}
            aria-label={t(locale, ABOUT_TAB.labelKey)}
            tabIndex={activeTab === ABOUT_TAB.id ? 0 : -1}
            onClick={() => {
              if (ABOUT_TAB.id === activeTab) return;
              runAfterUnsavedHandled(() => setActiveTab(ABOUT_TAB.id));
            }}
          >
            <ABOUT_TAB.icon size={18} />
            <span>{t(locale, ABOUT_TAB.labelKey)}</span>
          </button>
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
                <strong>{state.activeProfile || "-"}</strong>
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
                setSelectedMcpServer(importedNames[0] ?? "");
              }, {
                persist: false,
                recordHistory: true,
                historySummary: t(locale, "mcpImportApply"),
              });

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
  "tab.settings": "settings",
};
