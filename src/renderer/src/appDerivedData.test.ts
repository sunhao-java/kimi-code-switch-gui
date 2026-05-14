import type { AppState } from "@shared/types";
import type { SkillsScanReport } from "@shared/skillsStore";
import { getAppDerivedData } from "./appDerivedData";
import type { AppSelections } from "./appDerivedData";

function createState(): AppState {
  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
    mainConfig: {
      default_model: "provider-a/model-a",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "provider-a/model-a": {
          provider: "provider-a",
          model: "model-a",
          max_context_size: 1,
          capabilities: [],
        },
      },
      providers: {
        "provider-a": {
          type: "kimi",
          base_url: "https://a.test",
          api_key: "sk-a",
        },
        "provider-b": {
          type: "openai",
          base_url: "https://b.test",
          api_key: "sk-b",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: {
      default: {
        name: "default",
        label: "Default",
        default_model: "provider-a/model-a",
        default_thinking: true,
        default_yolo: false,
        default_plan_mode: false,
        default_editor: "",
        theme: "dark",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
      work: {
        name: "work",
        label: "Work",
        default_model: "provider-a/model-a",
        default_thinking: false,
        default_yolo: false,
        default_plan_mode: false,
        default_editor: "",
        theme: "light",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      },
    },
    activeProfile: "default",
    panelSettings: {
      version: 1,
      config_path: "/tmp/config.toml",
      profiles_path: "",
      follow_config_profiles: true,
      theme: "dark",
      appearance_theme: "aurora",
      ui_font_size: "standard",
      locale: "zh-CN",
      tray_icon: false,
      sidebar_collapsed: false,
      display_open_mode: "remember-last",
      close_behavior: "quit",
      terminal_app: "system-terminal",
      backup_strategy: "manual",
      backup_frequency: "daily",
      backup_retention_count: 10,
      backup_destination_type: "local",
      backup_local_path: "/tmp/backups",
      backup_webdav_url: "",
      backup_webdav_username: "",
      backup_webdav_password: "",
      backup_webdav_path: "",
      shortcuts: {} as AppState["panelSettings"]["shortcuts"],
      mcp_servers: {},
    },
    mcpConfig: {
      mcpServers: {
        serverA: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.a.test",
          headers: {},
          command: "",
          args: [],
          env: {},
        },
        serverB: {
          enabled: false,
          transport: "stdio",
          url: "",
          headers: {},
          command: "node",
          args: ["server.js"],
          env: {},
        },
      },
    },
  };
}

function emptySelections(): AppSelections {
  return { provider: "", model: "", profile: "", mcpServer: "", skillPath: "", skill: "" };
}

function makeSkillPath(
  id: string,
  group: "builtin" | "user-brand" | "user-common",
  overrides: Partial<{
    label: string;
    exists: boolean;
    selected: boolean;
    priority: number;
  }> = {},
) {
  return {
    id,
    group,
    label: overrides.label ?? id,
    path: `/tmp/${id}`,
    exists: overrides.exists ?? true,
    selected: overrides.selected ?? false,
    priority: overrides.priority ?? 0,
    reason: "",
  };
}

describe("getAppDerivedData", () => {
  it("returns empty entries and names when state has no items", () => {
    const emptyState: AppState = {
      ...createState(),
      mainConfig: { ...createState().mainConfig, providers: {}, models: {} },
      profiles: {},
      mcpConfig: { mcpServers: {} },
    };

    const result = getAppDerivedData(emptyState, null, null, emptySelections());

    expect(result.providerEntries).toEqual([]);
    expect(result.modelEntries).toEqual([]);
    expect(result.profileEntries).toEqual([]);
    expect(result.mcpEntries).toEqual([]);
    expect(result.selectedProviderName).toBe("");
    expect(result.selectedModelName).toBe("");
    expect(result.selectedProfileName).toBe("");
    expect(result.selectedMcpServerName).toBe("");
    expect(result.selectedProviderData).toBeNull();
    expect(result.selectedModelData).toBeNull();
    expect(result.selectedProfileData).toBeNull();
    expect(result.selectedMcpServerData).toBeNull();
  });

  it("uses provided selections when given", () => {
    const state = createState();
    const selections: AppSelections = {
      provider: "provider-b",
      model: "provider-a/model-a",
      profile: "work",
      mcpServer: "serverB",
      skillPath: "",
      skill: "",
    };

    const result = getAppDerivedData(state, null, null, selections);

    expect(result.selectedProviderName).toBe("provider-b");
    expect(result.selectedModelName).toBe("provider-a/model-a");
    expect(result.selectedProfileName).toBe("work");
    expect(result.selectedMcpServerName).toBe("serverB");
    expect(result.selectedProviderData).toEqual(state.mainConfig.providers["provider-b"]);
    expect(result.selectedModelData).toEqual(state.mainConfig.models["provider-a/model-a"]);
    expect(result.selectedProfileData).toEqual(state.profiles.work);
    expect(result.selectedMcpServerData).toEqual(state.mcpConfig.mcpServers.serverB);
  });

  it("falls back to first entry when selections are empty", () => {
    const state = createState();
    const result = getAppDerivedData(state, null, null, emptySelections());

    // Object.entries returns insertion order; first entry
    expect(result.selectedProviderName).toBe("provider-a");
    expect(result.selectedModelName).toBe("provider-a/model-a");
    expect(result.selectedProfileName).toBe("default");
    expect(result.selectedMcpServerName).toBe("serverA");
  });

  it("falls back to the first entry when selection no longer exists in state", () => {
    const state = createState();
    const selections: AppSelections = {
      provider: "missing",
      model: "missing",
      profile: "missing",
      mcpServer: "missing",
      skillPath: "",
      skill: "",
    };

    const result = getAppDerivedData(state, null, null, selections);

    expect(result.selectedProviderName).toBe("provider-a");
    expect(result.selectedModelName).toBe("provider-a/model-a");
    expect(result.selectedProfileName).toBe("default");
    expect(result.selectedMcpServerName).toBe("serverA");
    expect(result.selectedProviderData).toEqual(state.mainConfig.providers["provider-a"]);
    expect(result.selectedModelData).toEqual(state.mainConfig.models["provider-a/model-a"]);
    expect(result.selectedProfileData).toEqual(state.profiles.default);
    expect(result.selectedMcpServerData).toEqual(state.mcpConfig.mcpServers.serverA);
  });

  it("returns skill path entries from skillsReport", () => {
    const state = createState();
    const paths = [makeSkillPath("p1", "user-brand"), makeSkillPath("p2", "user-common")];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.skillPathEntries).toHaveLength(2);
    expect(result.skillPathEntries[0].id).toBe("p1");
  });

  it("returns empty skill entries when skillsReport is null", () => {
    const state = createState();
    const result = getAppDerivedData(state, null, null, emptySelections());

    expect(result.skillPathEntries).toEqual([]);
    expect(result.skillEntries).toEqual([]);
    expect(result.selectedSkillPathId).toBe("");
    expect(result.selectedSkillData).toBeNull();
    expect(result.selectedSkillPathData).toBeNull();
  });
});

describe("sortedSkillPathEntries", () => {
  it("sorts builtin entries to the end", () => {
    const state = createState();
    const paths = [
      makeSkillPath("builtin", "builtin"),
      makeSkillPath("user1", "user-brand"),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.sortedSkillPathEntries[0].id).toBe("user1");
    expect(result.sortedSkillPathEntries[1].id).toBe("builtin");
  });

  it("sorts selected entries before non-selected", () => {
    const state = createState();
    const paths = [
      makeSkillPath("a", "user-brand", { selected: false, priority: 0 }),
      makeSkillPath("b", "user-brand", { selected: true, priority: 1 }),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.sortedSkillPathEntries[0].id).toBe("b");
    expect(result.sortedSkillPathEntries[1].id).toBe("a");
  });

  it("sorts existing entries before non-existing entries", () => {
    const state = createState();
    const paths = [
      makeSkillPath("a", "user-brand", { exists: false, priority: 0 }),
      makeSkillPath("b", "user-brand", { exists: true, priority: 1 }),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.sortedSkillPathEntries[0].id).toBe("b");
    expect(result.sortedSkillPathEntries[1].id).toBe("a");
  });

  it("sorts by priority ascending among equal conditions", () => {
    const state = createState();
    const paths = [
      makeSkillPath("high", "user-brand", { priority: 10 }),
      makeSkillPath("low", "user-brand", { priority: 1 }),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.sortedSkillPathEntries[0].id).toBe("low");
    expect(result.sortedSkillPathEntries[1].id).toBe("high");
  });

  it("sorts by label as final tiebreaker", () => {
    const state = createState();
    const paths = [
      makeSkillPath("z-entry", "user-brand", { priority: 0, label: "Zebra" }),
      makeSkillPath("a-entry", "user-brand", { priority: 0, label: "Alpha" }),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.sortedSkillPathEntries[0].id).toBe("a-entry");
    expect(result.sortedSkillPathEntries[1].id).toBe("z-entry");
  });
});

describe("isProviderNameEditable / isProfileNameEditable / isMcpServerNameEditable", () => {
  it("returns true for draft entries (not in savedState)", () => {
    const state = createState();
    const savedState = createState();
    // Remove provider-b and profile 'work' from saved state
    delete savedState.mainConfig.providers["provider-b"];
    delete savedState.profiles.work;
    delete savedState.mcpConfig.mcpServers.serverB;

    const selections: AppSelections = {
      provider: "provider-b",
      model: "provider-a/model-a",
      profile: "work",
      mcpServer: "serverB",
      skillPath: "",
      skill: "",
    };

    const result = getAppDerivedData(state, savedState, null, selections);

    expect(result.isProviderNameEditable).toBe(true);
    expect(result.isProfileNameEditable).toBe(true);
    expect(result.isMcpServerNameEditable).toBe(true);
  });

  it("returns false for entries that exist in savedState", () => {
    const state = createState();
    const savedState = createState();

    const selections: AppSelections = {
      provider: "provider-a",
      model: "provider-a/model-a",
      profile: "default",
      mcpServer: "serverA",
      skillPath: "",
      skill: "",
    };

    const result = getAppDerivedData(state, savedState, null, selections);

    expect(result.isProviderNameEditable).toBe(false);
    expect(result.isProfileNameEditable).toBe(false);
    expect(result.isMcpServerNameEditable).toBe(false);
  });

  it("returns true for draft when savedState is null", () => {
    const state = createState();
    // Provider "provider-a" exists in state, but savedState is null
    const selections: AppSelections = {
      provider: "provider-a",
      model: "provider-a/model-a",
      profile: "default",
      mcpServer: "serverA",
      skillPath: "",
      skill: "",
    };

    const result = getAppDerivedData(state, null, null, selections);

    expect(result.isProviderNameEditable).toBe(true);
    expect(result.isProfileNameEditable).toBe(true);
    expect(result.isMcpServerNameEditable).toBe(true);
  });
});

describe("selectedSkillPathId", () => {
  it("uses selections.skillPath when provided", () => {
    const state = createState();
    const paths = [makeSkillPath("p1", "user-brand"), makeSkillPath("p2", "user-common")];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const selections: AppSelections = { ...emptySelections(), skillPath: "p2" };
    const result = getAppDerivedData(state, null, report, selections);

    expect(result.selectedSkillPathId).toBe("p2");
  });

  it("falls back to first selected path when skillPath is empty", () => {
    const state = createState();
    const paths = [
      makeSkillPath("p1", "user-brand", { selected: false }),
      makeSkillPath("p2", "user-brand", { selected: true }),
    ];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.selectedSkillPathId).toBe("p2");
  });

  it("falls back to first path when no path is selected", () => {
    const state = createState();
    const paths = [makeSkillPath("p1", "user-brand", { selected: false })];
    const report: SkillsScanReport = {
      builtinNotice: "",
      discoveryMode: "auto",
      mergeAllAvailableSkills: false,
      paths,
      skills: [],
      summary: { total: 0, effective: 0, overrides: 0, warnings: 0, errors: 0, flow: 0 },
    };

    const result = getAppDerivedData(state, null, report, emptySelections());

    expect(result.selectedSkillPathId).toBe("p1");
  });
});
