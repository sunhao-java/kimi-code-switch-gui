import { useState } from "react";
import { Bug, FileInput, FolderOpen, History, LoaderCircle, Plus, Power, RefreshCw, RotateCcw, Terminal, Trash2 } from "lucide-react";
import { applyProfile, cloneProfile, deleteModel, deleteProfile, deleteProvider, upsertModel, upsertProfile, upsertProvider } from "@shared/configStore";
import { buildModelName, ensureUniqueEntryName, normalizeEntryName } from "@shared/nameRules";
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
  BackupDestinationType,
  BackupFrequency,
  BackupStrategy,
  CloseBehavior,
  DisplayOpenMode,
  Locale,
  ShortcutAction,
  ShortcutBinding,
  ConfigDoctorReport,
  TerminalApp,
} from "@shared/types";

import { AboutPage } from "../aboutPage";
import { getApi, getMcpAction, getMcpActionNotice, getResourceLabel, createUniqueName, renameModelInState, renameProviderInState } from "../appHelpers";
import {
  APPEARANCE_THEME_OPTIONS,
  BACKUP_DESTINATION_OPTIONS, BACKUP_FREQUENCY_OPTIONS, BACKUP_STRATEGY_OPTIONS,
  CLOSE_BEHAVIOR_OPTIONS, DISPLAY_OPEN_OPTIONS, labelForLocale, LOCALE_OPTIONS, TERMINAL_APP_OPTIONS, THEME_OPTIONS, UI_FONT_SIZE_OPTIONS,
} from "../appOptions";
import { ErrorBoundary } from "../ErrorBoundary";
import { Field, FontSizeSliderField, SelectField, SettingsGroup, ShortcutRecorderField } from "../formControls";
import { t, translateError } from "../i18n";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { OverviewDashboard } from "../overviewDashboard";
import { SkillsWorkspace } from "../skillsWorkspace";
import type { AppContext } from "./appContext";
import {
  ProviderForm, ModelForm, ProfileForm, McpServerForm,
  SecretField, PathField, createCopyName, createLocalizedCopyName, createDefaultMcpServer,
  formatMessage, formatSkillPathLabel, renderSkillPathLabel,
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
> & {
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
};

type SettingsSubTab = "general" | "shortcuts" | "backup" | "doctor";

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
    shortcuts,
  } = props;
  const shortcutConflicts = getShortcutConflicts(shortcuts);
  const shortcutPlatform = getBrowserShortcutPlatform();
  const shortcutConflictActions = new Set(shortcutConflicts.flatMap((conflict) => conflict.actions));
  const shortcutLabels = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [definition.action, labelForLocale(definition.label, locale)]),
  ) as Record<ShortcutAction, string>;
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
  const [activeSettingsSubTab, setActiveSettingsSubTab] = useState<SettingsSubTab>("general");
  const settingsSubTabs: Array<{ id: SettingsSubTab; label: string; description: string }> = [
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
              }, { persist: true })
            }
            onNavigate={(tab) => runAfterUnsavedHandled(() => setActiveTab(tab))}
          />
        ) : null}

        {activeTab === "providers" ? (
          <SplitLayout
            listTitle={t(locale, "providers")}
            listItems={providerEntries.map(([name]) => name)}
            dirtyItems={dirtyProviders}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProvider}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedProvider(item))}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const provider = draft.mainConfig.providers[name];
                if (!provider) return;
                const copyName = createCopyName(name, draft.mainConfig.providers);
                draft.mainConfig.providers[copyName] = { ...provider };
                setSelectedProvider(copyName);
              }, { persist: false })
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
              }, { persist: false })
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
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "provider"), selectedProviderName))) return;
                    updateState((draft) => {
                      deleteProvider(draft, selectedProviderName);
                      setSelectedProvider(Object.keys(draft.mainConfig.providers)[0] ?? "");
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
            selectedItem={selectedModel}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedModel(item))}
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
              }, { persist: false })
            }
            addLabel={t(locale, "newModel")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newModel")}
            addButtonContent={<Plus size={15} />}
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
              }, { persist: false })
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
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "model"), selectedModelName))) return;
                    updateState((draft) => {
                      deleteModel(draft, selectedModelName);
                      setSelectedModel(Object.keys(draft.mainConfig.models)[0] ?? "");
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
            listTitle={t(locale, "profiles")}
            listItems={profileEntries.map(([name]) => name)}
            dirtyItems={dirtyProfiles}
            dirtyLabel={t(locale, "editedBadge")}
            selectedItem={selectedProfile}
            highlightedItem={state.activeProfile}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedProfile(item))}
            copyLabel={t(locale, "clone")}
            onCopy={(name) =>
              updateState((draft) => {
                const profile = draft.profiles[name];
                if (!profile) return;
                const copyName = createLocalizedCopyName(name, draft.profiles, t(locale, "copySuffix"));
                cloneProfile(draft, name, copyName, `${profile.label} ${t(locale, "copySuffix")}`);
                setSelectedProfile(copyName);
              }, { persist: false })
            }
            addLabel={t(locale, "newProfile")}
            addButtonClassName="action-button compact icon-only"
            addButtonTitle={t(locale, "newProfile")}
            addButtonContent={<Plus size={15} />}
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
              }, { persist: false })
            }
            renderItemAction={(name) =>
              (
                <>
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
                  {name === state.activeProfile ? (
                    <span className="list-current-badge" aria-label={t(locale, "summaryActive")} title={t(locale, "summaryActive")}>
                      {t(locale, "active")}
                    </span>
                  ) : (
                    <button
                      className="list-activate-button"
                      type="button"
                      aria-label={`${t(locale, "activate")} ${name}`}
                      title={t(locale, "activate")}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateState((draft) => {
                          applyProfile(draft, name);
                        });
                      }}
                    >
                      {t(locale, "activate")}
                    </button>
                  )}
                </>
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
                  })
                }
                onClone={() =>
                  updateState((draft) => {
                    const source = selectedProfileName;
                    cloneProfile(draft, source, `${source}-copy`, `${selectedProfileData.label} ${t(locale, "copySuffix")}`);
                    setSelectedProfile(`${source}-copy`);
                  }, { persist: false })
                }
                onDelete={() => {
                  void (async () => {
                    if (!(await confirmDeleteResource(getResourceLabel(locale, "profile"), selectedProfileName))) return;
                    updateState((draft) => {
                      deleteProfile(draft, selectedProfileName);
                      setSelectedProfile(Object.keys(draft.profiles)[0] ?? "");
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
            selectedItem={selectedMcpServer}
            onSelect={(item) => runAfterUnsavedHandled(() => setSelectedMcpServer(item))}
            addLabel={t(locale, "newMcpServer")}
            onAdd={() =>
              updateState((draft) => {
                const name = createUniqueName("mcp", Object.keys(draft.mcpConfig.mcpServers));
                draft.mcpConfig.mcpServers[name] = createDefaultMcpServer();
                setSelectedMcpServer(name);
              }, { persist: false })
            }
            headerActions={
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
                        label: labelForLocale(option.label, locale),
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
                    label={t(locale, "panelSettingsPath")}
                    value={state.panelSettingsPath}
                    readOnly
                    onView={() => openDocumentViewer("panel")}
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
            ) : null}
          </section>
          </SplitLayout>
        ) : null}

        {activeTab === "about" ? (
          <AboutPage locale={locale} />
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
    </div>
  );
}
