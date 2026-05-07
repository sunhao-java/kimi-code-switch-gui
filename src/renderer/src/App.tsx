import { X } from "lucide-react";

import type { McpServerConfig, ShortcutAction, ShortcutBinding } from "@shared/types";
import { parseMcpConfigStrict } from "@shared/mcpStore";
import { formatAcceleratorForPlatform, getBrowserShortcutPlatform, normalizeShortcuts } from "@shared/shortcutStore";

import { TabPanels } from "./tabs/TabPanels";
import { useAppHandlers } from "./useAppHandlers";
import { useShortcuts } from "./useShortcuts";
import { TAB_ITEMS, ABOUT_TAB, LOCALE_OPTIONS, THEME_OPTIONS } from "./appOptions";
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
    error, setError, notice, setNotice,
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
    runManualBackup, runWebDavTest,
    runDoctor,
    openBackupRecords, deleteBackupRecord, restoreBackupRecord,
  } = app;
  const shortcuts = normalizeShortcuts(state.panelSettings.shortcuts);
  const shortcutPlatform = getBrowserShortcutPlatform();
  const tabShortcutLabels = createTabShortcutLabels(shortcuts, shortcutPlatform);

  useShortcuts({
    shortcuts,
    onSave: () => void onSave(),
    onReload: () => void loadState(),
    onNavigate: (tab) => runAfterUnsavedHandled(() => setActiveTab(tab)),
  });

  return (
    <div className="shell">
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
      {!error && notice ? (
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
          <div>
            <h1>{title}</h1>
            <p>{t(locale, "appSubtitle")}</p>
          </div>
        </div>
        <nav className="nav">
          {TAB_ITEMS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              className={id === activeTab ? "nav-item active" : "nav-item"}
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
        <nav className="nav nav-bottom">
          <button
            className={ABOUT_TAB.id === activeTab ? "nav-item active" : "nav-item"}
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
            <SummaryCard label={t(locale, "summaryProfiles")} value={String(profileEntries.length)} />
            <SummaryCard label={t(locale, "summaryProviders")} value={String(providerEntries.length)} />
            <SummaryCard label={t(locale, "summaryModels")} value={String(modelEntries.length)} />
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
            />
            <SummaryCard label={t(locale, "summaryActive")} value={state.activeProfile || "-"} accent />
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
          runDoctor={runDoctor}
          openBackupRecords={openBackupRecords}
          setActiveTab={setActiveTab}
          setError={setError}
          setNotice={setNotice}
        />
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
              }, { persist: false });

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
