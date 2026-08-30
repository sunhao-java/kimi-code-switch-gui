import type { Dispatch, SetStateAction } from "react";
import { Activity, LoaderCircle, Plus, Power } from "lucide-react";

import { deleteProvider, setProviderEnabled, upsertProvider } from "@shared/configStore";
import { getCascadePreview } from "@shared/configRelations";

import { createUniqueName, getApi, getResourceLabel, renameProviderInState } from "../appHelpers";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { ProviderForm } from "../providerForm";
import { ProviderHealthBanner } from "../providerHealthBanner";
import type { ProviderHealthResult } from "../tauri/cli";
import { createCopyName, formatMessage } from "../tabComponents";
import { t } from "../i18n";
import type { TabPanelsProps } from "./TabPanels";

type ProvidersTabProps = Pick<
  TabPanelsProps,
  | "state"
  | "locale"
  | "providerEntries"
  | "dirtyProviders"
  | "selectedProviderName"
  | "selectedProviderData"
  | "isProviderNameEditable"
  | "setSelectedProvider"
  | "updateState"
  | "onSave"
  | "onRequestCascadeDelete"
  | "confirmDeleteResource"
>;

type ProviderHealthStateProps = {
  providerHealthResults: ProviderHealthResult[] | null;
  setProviderHealthResults: Dispatch<SetStateAction<ProviderHealthResult[] | null>>;
  isProviderHealthChecking: boolean;
  setIsProviderHealthChecking: Dispatch<SetStateAction<boolean>>;
  providerHealthBannerOpen: boolean;
  setProviderHealthBannerOpen: Dispatch<SetStateAction<boolean>>;
  providerHealthBannerKey: number;
  setProviderHealthBannerKey: Dispatch<SetStateAction<number>>;
};

export function ProvidersTab(props: ProvidersTabProps & ProviderHealthStateProps): JSX.Element {
  const {
    state,
    locale,
    providerEntries,
    dirtyProviders,
    selectedProviderName,
    selectedProviderData,
    isProviderNameEditable,
    setSelectedProvider,
    updateState,
    onSave,
    onRequestCascadeDelete,
    confirmDeleteResource,
    providerHealthResults,
    setProviderHealthResults,
    isProviderHealthChecking,
    setIsProviderHealthChecking,
    providerHealthBannerOpen,
    setProviderHealthBannerOpen,
    providerHealthBannerKey,
    setProviderHealthBannerKey,
  } = props;

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

  return (
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
  );
}
