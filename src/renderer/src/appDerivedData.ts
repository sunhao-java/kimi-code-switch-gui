import type { SkillDiscoveryPath, SkillEntry, SkillsScanReport } from "@shared/skillsStore";
import type { AppState, McpServerConfig, ModelConfig, Profile, ProviderConfig } from "@shared/types";
import { isDraftEntry } from "./appHelpers";

export interface AppSelections {
  provider: string;
  model: string;
  profile: string;
  mcpServer: string;
  skillPath: string;
  skill: string;
}

export interface AppDerivedData {
  providerEntries: Array<[string, ProviderConfig]>;
  modelEntries: Array<[string, ModelConfig]>;
  profileEntries: Array<[string, Profile]>;
  mcpEntries: Array<[string, McpServerConfig]>;
  skillPathEntries: SkillDiscoveryPath[];
  skillEntries: SkillEntry[];
  sortedSkillPathEntries: SkillDiscoveryPath[];
  visibleSkillEntries: SkillEntry[];
  selectedProviderName: string;
  selectedModelName: string;
  selectedProfileName: string;
  selectedMcpServerName: string;
  selectedSkillPathId: string;
  selectedSkillData: SkillEntry | null;
  selectedSkillPathData: SkillDiscoveryPath | null;
  selectedProviderData: ProviderConfig | null;
  selectedModelData: ModelConfig | null;
  selectedProfileData: Profile | null;
  selectedMcpServerData: McpServerConfig | null;
  isProviderNameEditable: boolean;
  isProfileNameEditable: boolean;
  isMcpServerNameEditable: boolean;
}

export function getAppDerivedData(
  state: AppState,
  savedState: AppState | null,
  skillsReport: SkillsScanReport | null,
  selections: AppSelections,
): AppDerivedData {
  const favoriteProviders = new Set(state.panelSettings.favorites?.providers ?? []);
  const favoriteProfiles = new Set(state.panelSettings.favorites?.profiles ?? []);
  const providerEntries = Object.entries(state.mainConfig.providers).sort(
    (a, b) => (favoriteProviders.has(b[0]) ? 1 : 0) - (favoriteProviders.has(a[0]) ? 1 : 0),
  );
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles).sort(
    (a, b) => (favoriteProfiles.has(b[0]) ? 1 : 0) - (favoriteProfiles.has(a[0]) ? 1 : 0),
  );
  const mcpEntries = Object.entries(state.mcpConfig.mcpServers);
  const skillPathEntries = skillsReport?.paths ?? [];
  const skillEntries = skillsReport?.skills ?? [];
  const sortedSkillPathEntries = [...skillPathEntries].sort((left, right) => {
    if (left.group === "builtin" && right.group !== "builtin") {
      return 1;
    }
    if (right.group === "builtin" && left.group !== "builtin") {
      return -1;
    }
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }
    if (left.exists !== right.exists) {
      return left.exists ? -1 : 1;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.label.localeCompare(right.label);
  });
  const selectedProviderName = pickEntryName(selections.provider, providerEntries);
  const selectedModelName = pickEntryName(selections.model, modelEntries);
  const selectedProfileName = pickEntryName(selections.profile, profileEntries);
  const selectedMcpServerName = pickEntryName(selections.mcpServer, mcpEntries);
  const selectedSkillPathId =
    selections.skillPath || skillPathEntries.find((path) => path.selected)?.id || skillPathEntries[0]?.id || "";
  const visibleSkillEntries = skillEntries.filter((skill) => skill.sourcePathId === selectedSkillPathId);
  const selectedSkillId = selections.skill;

  const selectedProviderData = selectedProviderName ? state.mainConfig.providers[selectedProviderName] ?? null : null;
  const selectedModelData = selectedModelName ? state.mainConfig.models[selectedModelName] ?? null : null;
  const selectedProfileData = selectedProfileName ? state.profiles[selectedProfileName] ?? null : null;
  const selectedMcpServerData = selectedMcpServerName ? state.mcpConfig.mcpServers[selectedMcpServerName] ?? null : null;
  const selectedSkillPathData =
    (selectedSkillPathId && skillPathEntries.find((path) => path.id === selectedSkillPathId)) ||
    skillPathEntries[0] ||
    null;
  const selectedSkillData =
    (selectedSkillId && visibleSkillEntries.find((skill) => skill.id === selectedSkillId)) ||
    null;
  const isProviderNameEditable = isDraftEntry(savedState?.mainConfig.providers, selectedProviderName);
  const isProfileNameEditable = isDraftEntry(savedState?.profiles, selectedProfileName);
  const isMcpServerNameEditable = isDraftEntry(savedState?.mcpConfig.mcpServers, selectedMcpServerName);

  return {
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
  };
}

function pickEntryName<T>(selection: string, entries: Array<[string, T]>): string {
  if (selection && entries.some(([name]) => name === selection)) {
    return selection;
  }
  return entries[0]?.[0] ?? "";
}
