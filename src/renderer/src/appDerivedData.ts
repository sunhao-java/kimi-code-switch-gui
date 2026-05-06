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
  const providerEntries = Object.entries(state.mainConfig.providers);
  const modelEntries = Object.entries(state.mainConfig.models);
  const profileEntries = Object.entries(state.profiles);
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
  const selectedProviderName = selections.provider || providerEntries[0]?.[0] || "";
  const selectedModelName = selections.model || modelEntries[0]?.[0] || "";
  const selectedProfileName = selections.profile || profileEntries[0]?.[0] || "";
  const selectedMcpServerName = selections.mcpServer || mcpEntries[0]?.[0] || "";
  const selectedSkillPathId =
    selections.skillPath || skillPathEntries.find((path) => path.selected)?.id || skillPathEntries[0]?.id || "";
  const visibleSkillEntries = skillEntries.filter((skill) => skill.sourcePathId === selectedSkillPathId);
  const selectedSkillId = selections.skill;

  const selectedProviderData =
    (selections.provider && state.mainConfig.providers[selections.provider]) ||
    providerEntries[0]?.[1] ||
    null;
  const selectedModelData =
    (selections.model && state.mainConfig.models[selections.model]) || modelEntries[0]?.[1] || null;
  const selectedProfileData =
    (selections.profile && state.profiles[selections.profile]) || profileEntries[0]?.[1] || null;
  const selectedMcpServerData =
    (selections.mcpServer && state.mcpConfig.mcpServers[selections.mcpServer]) || mcpEntries[0]?.[1] || null;
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
