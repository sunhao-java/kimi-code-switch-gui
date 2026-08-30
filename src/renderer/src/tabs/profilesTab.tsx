import { Copy, Plus, Star, Terminal } from "lucide-react";

import { applyProfile, cloneProfile, deleteProfile, toggleFavorite, upsertProfile } from "@shared/configStore";
import { ensureUniqueEntryName } from "@shared/nameRules";

import { createUniqueName, getApi, getResourceLabel } from "../appHelpers";
import { t, translateError } from "../i18n";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { ProfileForm } from "../profileForm";
import { createLocalizedCopyName, formatMessage } from "../tabComponents";
import type { TabPanelsProps } from "./TabPanels";

type ProfilesTabProps = Pick<
  TabPanelsProps,
  | "state"
  | "locale"
  | "profileEntries"
  | "dirtyProfiles"
  | "selectedProfileName"
  | "selectedProfileData"
  | "isProfileNameEditable"
  | "setSelectedProfile"
  | "updateState"
  | "updateImmediateState"
  | "onSave"
  | "profileTestingName"
  | "setProfileTestingName"
  | "confirmDeleteResource"
  | "openKimiInTerminal"
  | "setNotice"
  | "setError"
>;

export function ProfilesTab(props: ProfilesTabProps): JSX.Element {
  const {
    state,
    locale,
    profileEntries,
    dirtyProfiles,
    selectedProfileName,
    selectedProfileData,
    isProfileNameEditable,
    setSelectedProfile,
    updateState,
    updateImmediateState,
    onSave,
    profileTestingName,
    setProfileTestingName,
    confirmDeleteResource,
    openKimiInTerminal,
    setNotice,
    setError,
  } = props;
  const hasModels = Object.keys(state.mainConfig.models).length > 0;

  return (
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
  );
}
