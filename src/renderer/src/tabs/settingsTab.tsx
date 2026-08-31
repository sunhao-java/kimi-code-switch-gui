import { lazy, Suspense } from "react";
import {
  Bug, CircleCheckBig, Download, ExternalLink, FolderOpen, History, LoaderCircle,
  LogIn, Plus, Power, RotateCcw, Save, Trash2, Upload, X,
} from "lucide-react";

import {
  fullBackupContainsRedactedSecrets,
  getKimiCodeConfigPath,
  getKimiCodeMcpConfigPath,
  getKimiCodeSkillsPath,
  validateFullBackup,
} from "@shared/configStore";
import {
  formatAcceleratorForPlatform,
  getBrowserShortcutPlatform,
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
  KimiCodeEnvironment,
  KimiCodeInstallSource,
  Locale,
  OfficialAccount,
  ShortcutAction,
  TerminalApp,
} from "@shared/types";

import { getApi } from "../appHelpers";
import {
  BACKUP_DESTINATION_OPTIONS,
  BACKUP_FREQUENCY_OPTIONS,
  BACKUP_STRATEGY_OPTIONS,
  CLOSE_BEHAVIOR_OPTIONS,
  DISPLAY_OPEN_OPTIONS,
  LOCALE_OPTIONS,
  TERMINAL_APP_OPTIONS,
  THEME_OPTIONS,
  APPEARANCE_THEME_OPTIONS,
  labelForLocale,
  UI_FONT_SIZE_OPTIONS,
} from "../appOptions";
import { Field, FontSizeSliderField, SelectField, SettingsGroup, ShortcutRecorderField } from "../formControls";
import { t, translateError } from "../i18n";
import { SplitLayout } from "../layoutComponents";
import { SecretField, PathField, formatMessage } from "../tabComponents";
import {
  DoctorReportPanel,
  HistoryPanel,
} from "./tabPanelOverlays";
import type { TabPanelsProps } from "./TabPanels";

const InsightsSettingsPanel = lazy(async () => {
  const module = await import("../insightsComponents");
  return { default: module.InsightsSettingsPanel };
});

type SettingsSubTab = "general" | "kimi-code" | "shortcuts" | "backup" | "doctor" | "insights" | "history";
type KimiCodeSubTab = "instance" | "accounts" | "environment";

type SettingsTabProps = TabPanelsProps & {
  settingsSubTabs: Array<{ id: SettingsSubTab; label: string; description: string }>;
  activeSettingsSubTab: SettingsSubTab;
  setActiveSettingsSubTab: (value: SettingsSubTab) => void;
  kimiCodeSubTab: KimiCodeSubTab;
  setKimiCodeSubTab: (value: KimiCodeSubTab) => void;
  kimiCodeOAuthLogin: {
    status: "idle" | "running" | "cancelling" | "cancelled" | "success" | "failed" | "account-required";
    url: string;
    userCode: string;
    expiresIn: number | null;
    message: string;
    messageKey: string;
  };
  currentConfigTargetLabel: string;
  targetDetection: AppState["kimiTargetDetection"];
  targetDetectionStatusLabel: string;
  targetDetectionStatusClass: string;
  installSourceLabel: (source?: KimiCodeInstallSource) => string;
  renderInlineCodeMessage: (template: string, values?: Record<string, string | number>) => JSX.Element;
  officialAccounts: OfficialAccount[];
  officialAccountsLoading: boolean;
  startKimiOAuthLogin: () => void;
  cancelKimiOAuthLogin: () => void;
  activateOfficialAccount: (id: string) => void;
  deleteOfficialAccount: (account: OfficialAccount) => void;
  kimiCodeEnvironments: KimiCodeEnvironment[];
  activeKimiCodeEnvironment: KimiCodeEnvironment;
  selectedKimiCodeEnvironment: KimiCodeEnvironment;
  selectedKimiCodeEnvironmentId: string | null;
  setSelectedKimiCodeEnvironmentId: (value: string | null) => void;
  environmentDraftFor: (environment: KimiCodeEnvironment) => { name: string; homePath: string; description: string };
  updateEnvironmentDraft: (id: string, patch: Partial<{ name: string; homePath: string; description: string }>) => void;
  addKimiCodeEnvironment: () => void;
  saveKimiCodeEnvironment: (id: string) => void;
  activateKimiCodeEnvironment: (id: string) => void;
  deleteKimiCodeEnvironment: (environment: KimiCodeEnvironment) => void;
  shortcutConflicts: Array<{ actions: ShortcutAction[] }>;
  shortcutPlatform: string;
  shortcutConflictActions: Set<ShortcutAction>;
  shortcutLabels: Record<ShortcutAction, string>;
  shortcutGroups: Array<{
    scope: "global" | "window";
    title: string;
    description: string;
    actions: Array<(typeof SHORTCUT_ACTIONS)[number]>;
  }>;
  isBackupPasswordVisible: boolean;
  setIsBackupPasswordVisible: (value: boolean | ((current: boolean) => boolean)) => void;
  fullBackupImportDialog: { open: boolean; data: FullBackupBundle | null; envCount: number; hasRedactedSecrets: boolean };
  setFullBackupImportDialog: (value: { open: boolean; data: FullBackupBundle | null; envCount: number; hasRedactedSecrets: boolean }) => void;
};

export function SettingsTab(props: SettingsTabProps): JSX.Element {
  const {
    state,
    locale,
    settingsSubTabs,
    activeSettingsSubTab,
    setActiveSettingsSubTab,
    kimiCodeSubTab,
    setKimiCodeSubTab,
    kimiCodeOAuthLogin,
    currentConfigTargetLabel,
    targetDetection,
    targetDetectionStatusLabel,
    targetDetectionStatusClass,
    installSourceLabel,
    renderInlineCodeMessage,
    officialAccounts,
    officialAccountsLoading,
    startKimiOAuthLogin,
    cancelKimiOAuthLogin,
    activateOfficialAccount,
    deleteOfficialAccount,
    kimiCodeEnvironments,
    activeKimiCodeEnvironment,
    selectedKimiCodeEnvironment,
    setSelectedKimiCodeEnvironmentId,
    environmentDraftFor,
    updateEnvironmentDraft,
    addKimiCodeEnvironment,
    saveKimiCodeEnvironment,
    activateKimiCodeEnvironment,
    deleteKimiCodeEnvironment,
    shortcutConflicts,
    shortcutPlatform,
    shortcutConflictActions,
    shortcutLabels,
    shortcutGroups,
    isBackupPasswordVisible,
    setIsBackupPasswordVisible,
    fullBackupImportDialog,
    setFullBackupImportDialog,
    isBackupRunning,
    isWebDavTesting,
    backupRecordsDialog,
    updateState,
    updateImmediateState,
    runDoctor,
    runManualBackup,
    runWebDavTest,
    openBackupRecords,
    loadState,
    setError,
    setNotice,
  } = props;

  return (
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
                          className={kimiCodeOAuthLogin.status === "running" || kimiCodeOAuthLogin.status === "cancelling" ? "action-button is-loading" : "action-button"}
                          type="button"
                          disabled={kimiCodeOAuthLogin.status === "running" || kimiCodeOAuthLogin.status === "cancelling"}
                          onClick={startKimiOAuthLogin}
                        >
                          {kimiCodeOAuthLogin.status === "running" || kimiCodeOAuthLogin.status === "cancelling" ? <LoaderCircle size={14} className="button-spinner" /> : <LogIn size={14} />}
                          <span>{formatMessage(t(locale, kimiCodeOAuthLogin.status === "cancelling" ? "kimiOauthCancelling" : kimiCodeOAuthLogin.status === "running" ? "kimiOauthRunning" : "kimiOauthLogin"), { target: currentConfigTargetLabel })}</span>
                        </button>
                        {kimiCodeOAuthLogin.status === "running" || kimiCodeOAuthLogin.status === "cancelling" ? (
                          <button
                            className="action-button secondary"
                            type="button"
                            disabled={kimiCodeOAuthLogin.status === "cancelling"}
                            onClick={cancelKimiOAuthLogin}
                          >
                            <X size={14} />
                            <span>{t(locale, "kimiOauthCancel")}</span>
                          </button>
                        ) : null}
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
  );
}
