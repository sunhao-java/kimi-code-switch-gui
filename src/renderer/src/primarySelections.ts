import type { Dispatch, SetStateAction } from "react";

import type { AppState } from "@shared/types";

export interface PrimarySelections {
  provider: string;
  model: string;
  profile: string;
  mcpServer: string;
}

export interface PrimarySelectionSetters {
  setSelectedProvider: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  setSelectedMcpServer: Dispatch<SetStateAction<string>>;
}

export function getDefaultPrimarySelections(state: AppState): PrimarySelections {
  return {
    provider: Object.keys(state.mainConfig.providers)[0] ?? "",
    model: Object.keys(state.mainConfig.models)[0] ?? "",
    profile: state.activeProfile,
    mcpServer: Object.keys(state.mcpConfig.mcpServers)[0] ?? "",
  };
}

export function getRetainedPrimarySelections(
  state: AppState,
  current: Partial<PrimarySelections>,
): PrimarySelections {
  return {
    provider: pickExistingKey(current.provider ?? "", state.mainConfig.providers),
    model: pickExistingKey(current.model ?? "", state.mainConfig.models),
    profile: pickProfileKey(current.profile ?? "", state),
    mcpServer: pickExistingKey(current.mcpServer ?? "", state.mcpConfig.mcpServers),
  };
}

export function applyPrimarySelections(
  selections: PrimarySelections,
  setters: PrimarySelectionSetters,
): void {
  setters.setSelectedProvider(selections.provider);
  setters.setSelectedModel(selections.model);
  setters.setSelectedProfile(selections.profile);
  setters.setSelectedMcpServer(selections.mcpServer);
}

function pickExistingKey(current: string, entries: Record<string, unknown>): string {
  return current && entries[current] ? current : Object.keys(entries)[0] ?? "";
}

function pickProfileKey(current: string, state: AppState): string {
  if (current && state.profiles[current]) {
    return current;
  }
  return state.activeProfile || Object.keys(state.profiles)[0] || "";
}
