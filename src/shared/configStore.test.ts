import {
  DEFAULT_PROFILE_NAME,
  applyProfile,
  bootstrapProfiles,
  buildConfigDocument,
  buildPanelSettingsDocument,
  buildProfilesDocument,
  buildPreviewBundle,
  cloneProfile,
  cloneState,
  createDefaultPanelSettings,
  createLineDiff,
  deleteModel,
  deleteProfile,
  deleteProvider,
  formatMissingModelError,
  loadAppState,
  loadPanelSettings,
  normalizeStatePaths,
  saveAppState,
  upsertModel,
  upsertProfile,
  upsertProvider,
} from "./configStore";
import type { AppState } from "./types";

function createState(): AppState {
  return {
    configPath: "/tmp/config.toml",
    profilesPath: "/tmp/config.profiles.toml",
    panelSettingsPath: "/tmp/config.panel.toml",
    mainConfig: {
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "kimi_gateway/kimi-k2.5": {
          provider: "kimi_gateway",
          model: "kimi-k2.5",
          max_context_size: 262144,
          capabilities: ["thinking"],
        },
      },
      providers: {
        kimi_gateway: {
          type: "kimi",
          base_url: "https://example.test/v1",
          api_key: "sk-test",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    },
    profiles: bootstrapProfiles({
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "",
      theme: "dark",
      show_thinking_stream: false,
      merge_all_available_skills: false,
      hooks: [],
      models: {
        "kimi_gateway/kimi-k2.5": {
          provider: "kimi_gateway",
          model: "kimi-k2.5",
          max_context_size: 262144,
          capabilities: ["thinking"],
        },
      },
      providers: {
        kimi_gateway: {
          type: "kimi",
          base_url: "https://example.test/v1",
          api_key: "sk-test",
        },
      },
      loop_control: {},
      background: {},
      notifications: {},
      services: {},
      mcp: {},
    }),
    activeProfile: DEFAULT_PROFILE_NAME,
    panelSettings: createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
  };
}

describe("configStore", () => {
  it("bootstraps a default profile from main config", () => {
    const state = createState();
    expect(state.profiles.default.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("applies profile values into main config", () => {
    const state = createState();
    upsertProvider(state, "alt_gateway", {
      type: "openai",
      base_url: "https://alt.example/v1",
      api_key: "sk-alt",
    });
    upsertModel(state, "alt_gateway/gpt-4.1", {
      provider: "alt_gateway",
      model: "gpt-4.1",
      max_context_size: 128000,
      capabilities: ["thinking"],
    });
    upsertProfile(state, {
      name: "work",
      label: "Work",
      default_model: "alt_gateway/gpt-4.1",
      default_thinking: false,
      default_yolo: true,
      default_plan_mode: true,
      default_editor: "vim",
      theme: "light",
      show_thinking_stream: true,
      merge_all_available_skills: true,
    });

    applyProfile(state, "work");

    expect(state.mainConfig.default_model).toBe("alt_gateway/gpt-4.1");
    expect(state.mainConfig.default_yolo).toBe(true);
    expect(state.activeProfile).toBe("work");
  });

  it("blocks deleting provider that is still referenced", () => {
    const state = createState();
    expect(() => deleteProvider(state, "kimi_gateway")).toThrow(/still used by model/);
  });

  it("blocks deleting model that is still used by profile", () => {
    const state = createState();
    expect(() => deleteModel(state, "kimi_gateway/kimi-k2.5")).toThrow(/still used by profile/);
  });

  it("blocks deleting active profile", () => {
    const state = createState();
    expect(() => deleteProfile(state, "default")).toThrow(/Cannot delete the active profile/);
  });

  it("clones profiles", () => {
    const state = createState();
    cloneProfile(state, "default", "default-copy", "Default Copy");
    expect(state.profiles["default-copy"].label).toBe("Default Copy");
    expect(state.profiles["default-copy"].default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("renders config document", () => {
    const document = buildConfigDocument(createState());
    expect(document).toContain('default_model = "kimi_gateway/kimi-k2.5"');
    expect(document).toContain("[providers.kimi_gateway]");
  });

  it("formats actionable missing model error", () => {
    const message = formatMissingModelError("kimi-k2.5", { "kimi_gateway/kimi-k2.5": {} }, {
      context: "配置Profile default",
    });
    expect(message).toContain("这里需要填写 [models] 下的模型 key");
    expect(message).toContain("可用模型 key：kimi_gateway/kimi-k2.5");
  });

  it("formats empty model hint when there are no models", () => {
    const message = formatMissingModelError("", {}, { context: "配置Profile broken" });
    expect(message).toContain("当前还没有任何模型");
  });

  it("builds preview bundle with diff", () => {
    const preview = buildPreviewBundle(createState(), {
      configDocument: "",
      profilesDocument: "",
      panelSettingsDocument: "",
    });
    expect(preview.configDocument).toContain("default_model");
    expect(preview.configDiff).toContain("+ default_model");
  });

  it("creates simple line diff", () => {
    expect(createLineDiff("alpha\nbeta\n", "alpha\ngamma\n")).toContain("- beta");
    expect(createLineDiff("alpha\nbeta\n", "alpha\ngamma\n")).toContain("+ gamma");
  });

  it("clones state deeply", () => {
    const state = createState();
    const cloned = cloneState(state);
    cloned.mainConfig.default_model = "changed";
    expect(state.mainConfig.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("loads app state from in-memory files", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(
        createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      ),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
    });

    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
    });

    expect(loaded.activeProfile).toBe("default");
    expect(loaded.mainConfig.providers.kimi_gateway.type).toBe("kimi");
  });

  it("loads panel settings with defaults", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'locale = "en-US"\ntheme = "dark"\nconfig_path = "/tmp/custom.toml"\ntray_icon = true\ndisplay_open_mode = "active-display"\nlast_display_id = 2\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.locale).toBe("en-US");
    expect(loaded.theme).toBe("dark");
    expect(loaded.config_path).toBe("/tmp/custom.toml");
    expect(loaded.display_open_mode).toBe("active-display");
    expect(loaded.close_behavior).toBe("keep-in-tray");
    expect(loaded.last_display_id).toBe(2);
  });

  it("forces quit behavior when tray icon is disabled", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'tray_icon = false\nclose_behavior = "keep-in-tray"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.tray_icon).toBe(false);
    expect(loaded.close_behavior).toBe("quit");
  });

  it("falls back to remember-last display mode for invalid panel setting", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'display_open_mode = "nearest"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.display_open_mode).toBe("remember-last");
    expect(loaded.close_behavior).toBe("quit");
  });

  it("saves app state into three files", async () => {
    const state = createState();
    const files = createMemoryFs({});

    await saveAppState(files, state);

    expect(files.store["/tmp/config.toml"]).toContain("default_model");
    expect(files.store["/tmp/config.profiles.toml"]).toContain("active_profile");
    expect(files.store["/tmp/config.panel.toml"]).toContain("follow_config_profiles");
  });

  it("rejects saving when config and profiles paths match", async () => {
    const state = createState();
    state.profilesPath = state.configPath;

    await expect(saveAppState(createMemoryFs({}), state)).rejects.toThrow(/must be different/);
  });

  it("falls back to bootstrap profile when profiles file is missing", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(
        createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      ),
    });

    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
    });

    expect(loaded.profiles.default).toBeDefined();
  });

  it("falls back to first profile when active profile is invalid", async () => {
    const state = createState();
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(state),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(
        createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml"),
      ),
      "/tmp/config.profiles.toml":
        'version = 1\nactive_profile = "missing"\n\n[profiles.default]\nlabel = "Default"\ndefault_model = "kimi_gateway/kimi-k2.5"\ndefault_thinking = true\ndefault_yolo = false\ndefault_plan_mode = false\ndefault_editor = ""\ntheme = "dark"\nshow_thinking_stream = false\nmerge_all_available_skills = false\n',
    });

    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
    });

    expect(loaded.activeProfile).toBe("default");
  });

  it("normalizes empty paths before save", async () => {
    const state = createState();
    state.profilesPath = "";
    state.panelSettingsPath = "";
    state.panelSettings.follow_config_profiles = false;
    state.panelSettings.profiles_path = "";

    const normalized = normalizeStatePaths(state);

    expect(normalized.profilesPath).toBe("/tmp/config.profiles.toml");
    expect(normalized.panelSettingsPath).toBe("/tmp/config.panel.toml");
  });

  it("saves with derived profile path when explicit path is blank", async () => {
    const state = createState();
    state.profilesPath = "";
    state.panelSettings.follow_config_profiles = false;
    state.panelSettings.profiles_path = "";
    const files = createMemoryFs({});

    await saveAppState(files, state);

    expect(files.store["/tmp/config.profiles.toml"]).toContain("active_profile");
  });

  it("rejects unknown model provider on upsert", () => {
    const state = createState();
    expect(() =>
      upsertModel(state, "missing/gpt", {
        provider: "missing",
        model: "gpt",
        max_context_size: 1,
        capabilities: [],
      }),
    ).toThrow(/Provider not found/);
  });

  it("rejects duplicate and missing profile clone requests", () => {
    const state = createState();
    expect(() => cloneProfile(state, "missing", "target", "Target")).toThrow(/Profile not found/);
    expect(() => cloneProfile(state, "default", "default", "Default")).toThrow(/already exists/);
  });
});

function createMemoryFs(initial: Record<string, string>) {
  const store = { ...initial };
  const ensured: string[] = [];
  return {
    store,
    ensured,
    async readText(path: string): Promise<string | null> {
      return store[path] ?? null;
    },
    async writeText(path: string, content: string): Promise<void> {
      store[path] = content;
    },
    async ensureDir(path: string): Promise<void> {
      ensured.push(path);
    },
  };
}
