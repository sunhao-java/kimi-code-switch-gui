import type { Dispatch, SetStateAction } from "react";
import { Braces, FileInput, Plus, Power, Trash2 } from "lucide-react";

import { buildMcpConfigDocument } from "@shared/mcpStore";
import { ensureUniqueEntryName } from "@shared/nameRules";

import {
  createUniqueName,
  getApi,
  getMcpAction,
  getMcpActionNotice,
  getResourceLabel,
} from "../appHelpers";
import { t, translateError } from "../i18n";
import { EmptyState, SplitLayout } from "../layoutComponents";
import { McpServerForm } from "../mcpComponents";
import { createDefaultMcpServer, formatMessage, McpJsonViewerDialog } from "../tabComponents";
import type { TabPanelsProps } from "./TabPanels";

type McpTabProps = Pick<
  TabPanelsProps,
  | "state"
  | "locale"
  | "mcpEntries"
  | "dirtyMcpServers"
  | "selectedMcpServer"
  | "selectedMcpServerName"
  | "selectedMcpServerData"
  | "isMcpServerNameEditable"
  | "setSelectedMcpServer"
  | "setIsMcpImportOpen"
  | "setMcpImportDraft"
  | "setMcpImportInitialDraft"
  | "mcpTestingName"
  | "setMcpTestingName"
  | "updateState"
  | "onSave"
  | "persistState"
  | "confirmDeleteResource"
  | "setError"
  | "setNotice"
>;

type McpViewerStateProps = {
  isMcpJsonViewerOpen: boolean;
  setIsMcpJsonViewerOpen: Dispatch<SetStateAction<boolean>>;
};

export function McpTab(props: McpTabProps & McpViewerStateProps): JSX.Element {
  const {
    state,
    locale,
    mcpEntries,
    dirtyMcpServers,
    selectedMcpServer,
    selectedMcpServerName,
    selectedMcpServerData,
    isMcpServerNameEditable,
    setSelectedMcpServer,
    setIsMcpImportOpen,
    setMcpImportDraft,
    setMcpImportInitialDraft,
    mcpTestingName,
    setMcpTestingName,
    updateState,
    onSave,
    persistState,
    confirmDeleteResource,
    setError,
    setNotice,
    isMcpJsonViewerOpen,
    setIsMcpJsonViewerOpen,
  } = props;

  return (
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
  );
}
