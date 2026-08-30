import { Plus, Power } from "lucide-react";

import { deleteModel, setModelEnabled, upsertModel } from "@shared/configStore";
import { getCascadePreview } from "@shared/configRelations";
import { buildModelName, normalizeEntryName } from "@shared/nameRules";
import type { OfficialAccount } from "@shared/types";

import { createUniqueName, getResourceLabel, renameModelInState } from "../appHelpers";
import { t } from "../i18n";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { ModelForm } from "../modelForm";
import { formatMessage } from "../tabComponents";
import type { TabPanelsProps } from "./TabPanels";

type ModelsTabProps = Pick<
  TabPanelsProps,
  | "state"
  | "locale"
  | "modelEntries"
  | "dirtyModels"
  | "selectedModelName"
  | "selectedModelData"
  | "setSelectedModel"
  | "updateState"
  | "onSave"
  | "onRequestCascadeDelete"
  | "confirmDeleteResource"
> & {
  officialAccounts: OfficialAccount[];
};

export function ModelsTab(props: ModelsTabProps): JSX.Element {
  const {
    state,
    locale,
    modelEntries,
    dirtyModels,
    selectedModelName,
    selectedModelData,
    setSelectedModel,
    updateState,
    onSave,
    onRequestCascadeDelete,
    confirmDeleteResource,
    officialAccounts,
  } = props;
  const hasProviders = Object.keys(state.mainConfig.providers).length > 0;

  return (
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
  );
}
