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
  compareProfiles,
  copyProfileField,
  createDefaultPanelSettings,
  createLineDiff,
  deleteModel,
  deleteProfile,
  deleteProvider,
  exportConfig,
  getKimiCodeEnvironmentHomePath,
  formatMissingModelError,
  getImportPreview,
  importConfig,
  normalizeKimiCodeEnvironments,
  searchConfig,
  toggleFavorite,
  validateImportData,
  loadAppState,
  loadPanelSettings,
  normalizeStatePaths,
  parsePanelSettingsDocument,
  saveAppState,
  upsertModel,
  upsertProfile,
  upsertProvider,
} from "./configStore";
import { buildMcpConfigDocument } from "./mcpStore";
import type { AppState } from "./types";

function createState(): AppState {
  return {
    configTarget: "kimi-code",
    configPath: "/tmp/config.toml",
    profilesPath: "",
    panelSettingsPath: "/tmp/config.panel.toml",
    mcpConfigPath: "/tmp/mcp.json",
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
    mcpConfig: {
      mcpServers: {
        context7: {
          enabled: true,
          transport: "streamable-http",
          url: "https://mcp.context7.com/mcp",
          headers: {
            CONTEXT7_API_KEY: "ctx-test",
          },
          command: "",
          args: [],
          env: {},
        },
        chrome_devtools: {
          enabled: true,
          transport: "stdio",
          url: "",
          headers: {},
          command: "npx",
          args: ["chrome-devtools-mcp@latest"],
          env: {
            DEBUG: "1",
          },
        },
      },
    },
  };
}

describe("configStore", () => {
  it("bootstraps a default profile from main config", () => {
    const state = createState();
    expect(state.profiles.default.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("normalizes Kimi Code environments into the managed env directory", () => {
    const environments = normalizeKimiCodeEnvironments([
      { id: "default", name: "Work Default", homePath: "~/.kimi-code" },
      { id: "team", name: "Team", homePath: "/tmp/custom-kimi-code" },
    ]);

    expect(environments[0]).toMatchObject({
      id: "default",
      name: "默认环境",
      homePath: getKimiCodeEnvironmentHomePath("default"),
    });
    expect(environments[1]).toMatchObject({
      id: "team",
      name: "Team",
      homePath: getKimiCodeEnvironmentHomePath("team"),
    });
  });

  it("bootstraps kimi-cli profile label from main config", () => {
    const profiles = bootstrapProfiles({
      ...createState().mainConfig,
      profile_label: "Work",
    });

    expect(profiles.default.label).toBe("Work");
  });

  it("does not bootstrap a profile when Kimi Code config has no models", () => {
    const profiles = bootstrapProfiles({
      ...createState().mainConfig,
      default_model: "",
      models: {},
      providers: {},
    });

    expect(profiles).toEqual({});
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

  it("preserves profile editor and theme from input", () => {
    const state = createState();
    upsertProfile(state, {
      name: "work",
      label: "Work",
      default_model: "kimi_gateway/kimi-k2.5",
      default_thinking: true,
      default_yolo: false,
      default_plan_mode: false,
      default_editor: "vim",
      theme: "light",
      show_thinking_stream: false,
      merge_all_available_skills: false,
    });

    expect(state.profiles.work.default_editor).toBe("vim");
    expect(state.profiles.work.theme).toBe("light");
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
    expect(preview.mcpDocument).toContain('"mcpServers"');
    expect(preview.mcpDiff).toContain('+   "mcpServers": {');
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
      "/tmp/mcp.json": buildMcpConfigDocument(createState().mcpConfig),
    });

    const loaded = await loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    });

    expect(loaded.activeProfile).toBe("default");
    expect(loaded.mainConfig.providers.kimi_gateway.type).toBe("kimi");
    expect(loaded.mcpConfig.mcpServers.context7.url).toBe("https://mcp.context7.com/mcp");
    expect(loaded.mcpConfig.mcpServers.chrome_devtools.command).toBe("npx");
  });

  it("loads panel settings with defaults", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'locale = "en-US"\ntheme = "dark"\nui_font_size = "large"\nconfig_path = "/tmp/custom.toml"\ntray_icon = true\ndisplay_open_mode = "active-display"\nlast_display_id = 2\nskills_project_root = "/workspace/demo"\nskills_extra_dirs = ["/tmp/skills-a", "/tmp/skills-b"]\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.locale).toBe("en-US");
    expect(loaded.theme).toBe("dark");
    expect(loaded.ui_font_size).toBe("large");
    expect(loaded.config_path).toBe("/tmp/custom.toml");
    expect(loaded.display_open_mode).toBe("active-display");
    expect(loaded.close_behavior).toBe("keep-in-tray");
    expect(loaded.terminal_app).toBe("system-terminal");
    expect(loaded.backup_local_path).toBe("~/.kimi-code-switch-gui/backups");
    expect(loaded.backup_frequency).toBe("daily");
    expect(loaded.backup_retention_count).toBe(10);
    expect(loaded.backup_strategy).toBe("manual");
    expect(loaded.backup_destination_type).toBe("local");
    expect(loaded.shortcuts["window.toggle"].accelerator).toBe("Command+Shift+H");
    expect(loaded.shortcuts["app.save"].scope).toBe("window");
    expect(loaded.last_display_id).toBe(2);
  });

  it("loads supported non-English panel locales", async () => {
    for (const locale of ["zh-TW", "ja-JP", "de-DE", "es-ES"] as const) {
      const files = createMemoryFs({
        "/tmp/config.panel.toml": `locale = "${locale}"\n`,
      });
      const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
      expect(loaded.locale).toBe(locale);
    }
  });

  it("clamps invalid backup settings to safe defaults", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'config_path = "/tmp/custom.toml"\nui_font_size = "huge"\nbackup_frequency = "monthly"\nbackup_retention_count = 0\nbackup_enabled = true\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.ui_font_size).toBe("standard");
    expect(loaded.backup_local_path).toBe("~/.kimi-code-switch-gui/backups");
    expect(loaded.backup_frequency).toBe("daily");
    expect(loaded.backup_retention_count).toBe(1);
    expect(loaded.backup_strategy).toBe("scheduled");
  });

  it("falls back to system terminal for invalid terminal app values", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": 'terminal_app = "warp"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.terminal_app).toBe("system-terminal");
  });

  it("loads explicit webdav backup settings", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml":
        'backup_destination_type = "webdav"\nbackup_strategy = "on-change"\nbackup_webdav_url = "https://dav.example.com/root"\nbackup_webdav_username = "alice"\nbackup_webdav_password = "secret"\nbackup_webdav_path = "kimi/backups"\n',
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.backup_destination_type).toBe("webdav");
    expect(loaded.backup_strategy).toBe("on-change");
    expect(loaded.backup_webdav_url).toBe("https://dav.example.com/root");
    expect(loaded.backup_webdav_username).toBe("alice");
    expect(loaded.backup_webdav_password).toBe("secret");
    expect(loaded.backup_webdav_path).toBe("kimi/backups");
  });

  it("round-trips panel MCP enabled flags without creating nested extra blocks", async () => {
    const files = createMemoryFs({
      "/tmp/config.panel.toml": `version = 1
config_path = "/tmp/config.toml"

[mcp_servers.context7]
enabled = false
transport = "streamable-http"
url = "https://mcp.context7.com/mcp"

  [mcp_servers.context7.headers]
  CONTEXT7_API_KEY = "ctx-test"

  [mcp_servers.context7.extra]
  oauth_audience = "ctx"
`,
    });
    const loaded = await loadPanelSettings(files, "/tmp/config.panel.toml");
    expect(loaded.mcp_servers.context7.enabled).toBe(false);
    expect(loaded.mcp_servers.context7.extra).toEqual({ oauth_audience: "ctx" });
    const document = buildPanelSettingsDocument(loaded);
    expect(document).toContain("[mcp_servers.context7]");
    expect(document).toContain("enabled = false");
    expect(document).toContain("[mcp_servers.context7.extra]");
    expect(document).not.toContain("[mcp_servers.context7.extra.extra]");
  });

  it("writes panel MCP nested tables without leading indentation", () => {
    const state = createState();
    state.panelSettings.mcp_servers = {
      context7: {
        enabled: true,
        transport: "streamable-http",
        url: "https://mcp.context7.com/mcp",
        headers: { CONTEXT7_API_KEY: "ctx-test" },
        command: "",
        args: [],
        env: {},
      },
    };
    const document = buildPanelSettingsDocument(state.panelSettings);
    expect(document).toContain("[mcp_servers.context7.headers]");
    expect(document).toContain('CONTEXT7_API_KEY = "ctx-test"');
    expect(document).toContain('[shortcuts."window.toggle"]');
    expect(document).not.toContain("  [mcp_servers.context7.headers]");
  });

  it("parses shortcut tables from panel settings documents", () => {
    const panelSettings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml");
    panelSettings.shortcuts["window.toggle"].accelerator = "Command+Shift+H";
    panelSettings.shortcuts["window.toggle"].enabled = true;
    const parsed = parsePanelSettingsDocument(buildPanelSettingsDocument(panelSettings), panelSettings);
    expect(parsed.shortcuts["window.toggle"].accelerator).toBe("Command+Shift+H");
    expect(parsed.shortcuts["window.toggle"].enabled).toBe(true);
  });

  it("round-trips sidebar collapsed preference in panel settings", () => {
    const panelSettings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml");
    panelSettings.sidebar_collapsed = true;
    const document = buildPanelSettingsDocument(panelSettings);
    const parsed = parsePanelSettingsDocument(document);
    expect(document).toContain("sidebar_collapsed = true");
    expect(parsed.sidebar_collapsed).toBe(true);
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
  });

  it("saves app state into Kimi files and SQLite panel state", async () => {
    const state = createState();
    const files = createMemoryFs({});
    await saveAppState(files, state);
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toContain("default_model");
    expect(files.store["/tmp/config.profiles.toml"]).toBeUndefined();
    expect(files.store["/tmp/config.panel.toml"]).toContain("follow_config_profiles");
    expect(files.store["/tmp/config.panel.toml"]).toContain("active_profile");
    expect(files.store["~/.kimi-code-switch-gui/.env/default/mcp.json"]).toContain('"mcpServers"');
  });

  it("writes model pricing tables without nested TOML indentation", async () => {
    const state = createState();
    state.mainConfig.models["kimi_gateway/kimi-k2.5"].pricing = {
      input_per_mtok: 1,
      output_per_mtok: 2,
      cache_read_per_mtok: 0.25,
    };
    const files = createMemoryFs({});

    await saveAppState(files, state);

    const document = files.store["~/.kimi-code-switch-gui/.env/default/config.toml"];
    expect(document).toContain('[models."kimi_gateway/kimi-k2.5".pricing]');
    expect(document).not.toContain('  [models."kimi_gateway/kimi-k2.5".pricing]');
    expect(document).toContain("input_per_mtok = 1");
    expect(document).not.toContain("  input_per_mtok = 1");
  });

  it("persists official account model mode and active account setting", async () => {
    const state = createState();
    state.mainConfig.models["kimi_gateway/kimi-k2.5"].auth_mode = "official-account";
    state.mainConfig.models["kimi_gateway/kimi-k2.5"].official_account_scope = "global";
    state.panelSettings.active_official_account_id = "acct-test";
    const files = createMemoryFs({});

    await saveAppState(files, state);

    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toContain('auth_mode = "official-account"');
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toContain('official_account_scope = "global"');
    expect(files.store["/tmp/config.panel.toml"]).toContain('active_official_account_id = "acct-test"');
  });

  it("does not persist redacted provider api keys into config.toml", async () => {
    const state = createState();
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/.env/default/config.toml": buildConfigDocument(state),
    });
    state.mainConfig.providers.kimi_gateway.api_key = "[REDACTED]";

    await saveAppState(files, state);

    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toContain('api_key = "sk-test"');
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).not.toContain("[REDACTED]");
  });

  it("ignores legacy profiles path collisions on save", async () => {
    const state = createState();
    state.profilesPath = state.configPath;
    await expect(saveAppState(createMemoryFs({}), state)).resolves.toBeUndefined();
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

  it("migrates legacy panel settings when the new panel settings file is absent", async () => {
    const files = createMemoryFs({
      "~/.kimi/config.toml": 'default_model = "kimi/k2"\n',
      "~/.kimi/config.profiles.toml": 'version = 1\nactive_profile = "default"\n',
      "~/.kimi/config.panel.toml": 'locale = "en-US"\ntheme = "dark"\n',
    });
    const loaded = await loadAppState(files, { configTarget: "kimi-cli" });
    expect(loaded.panelSettingsPath).toBe("~/.kimi-code-switch-gui/config.panel.toml");
    expect(loaded.panelSettings.locale).toBe("en-US");
    expect(loaded.panelSettings.theme).toBe("dark");
    expect(files.ensured).toContain("~/.kimi-code-switch-gui");
    expect(files.store["~/.kimi-code-switch-gui/config.panel.toml"]).toContain('locale = "en-US"');
  });

  it("throws when panel settings file read fails for reasons other than missing content", async () => {
    const files = createMemoryFs({});
    files.readText = async () => { throw new Error("EACCES"); };
    await expect(loadPanelSettings(files, "/tmp/config.panel.toml")).rejects.toThrow(/Failed to read panel settings/);
  });

  it("throws when config TOML is invalid instead of treating it as empty", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": "default_model = ",
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
      "/tmp/mcp.json": buildMcpConfigDocument(createState().mcpConfig),
    });
    await expect(loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    })).rejects.toThrow(/Invalid main config TOML/);
  });

  it("throws when MCP config is invalid instead of silently dropping servers", async () => {
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(createState()),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
      "/tmp/config.profiles.toml": buildProfilesDocument(createState()),
      "/tmp/mcp.json": "{invalid-json}",
    });
    await expect(loadAppState(files, {
      configPath: "/tmp/config.toml",
      profilesPath: "/tmp/config.profiles.toml",
      panelSettingsPath: "/tmp/config.panel.toml",
      mcpConfigPath: "/tmp/mcp.json",
    })).rejects.toThrow(/Invalid MCP config/);
  });

  it("falls back to first profile when active profile is invalid", async () => {
    const state = createState();
    const files = createMemoryFs({
      "/tmp/config.toml": buildConfigDocument(state),
      "/tmp/config.panel.toml": buildPanelSettingsDocument(createDefaultPanelSettings("/tmp/config.toml", "/tmp/config.panel.toml")),
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

  it("normalizes empty paths before save", () => {
    const state = createState();
    state.profilesPath = "";
    state.panelSettingsPath = "";
    const normalized = normalizeStatePaths(state);
    expect(normalized.profilesPath).toBe("");
    expect(normalized.panelSettingsPath).toBe("~/.kimi-code-switch-gui/config.panel.toml");
    expect(normalized.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/default/mcp.json");
  });

  it("saves profiles into panel settings when explicit path is blank", async () => {
    const state = createState();
    state.configTarget = "kimi-code";
    state.profilesPath = "";
    const files = createMemoryFs({});
    await saveAppState(files, state);
    expect(files.store["/tmp/config.profiles.toml"]).toBeUndefined();
    expect(files.store["/tmp/config.panel.toml"]).toContain("active_profile");
  });

  it("rejects unknown model provider on upsert", () => {
    const state = createState();
    expect(() =>
      upsertModel(state, "missing/gpt", { provider: "missing", model: "gpt", max_context_size: 1, capabilities: [] }),
    ).toThrow(/Provider not found/);
  });

  it("rejects duplicate and missing profile clone requests", () => {
    const state = createState();
    expect(() => cloneProfile(state, "missing", "target", "Target")).toThrow(/Profile not found/);
    expect(() => cloneProfile(state, "default", "default", "Default")).toThrow(/already exists/);
  });

  describe("compareProfiles", () => {
    it("reports identical profiles as all same", () => {
      const state = createState();
      const profile = state.profiles.default;
      const diff = compareProfiles(profile, profile);
      expect(diff.differences.every((d) => d.isSame)).toBe(true);
    });

    it("reports all differences when profiles differ completely", () => {
      const state = createState();
      const a = state.profiles.default;
      const b: typeof a = {
        ...a,
        name: "other",
        label: "Other",
        default_model: "kimi_gateway/kimi-k2.5",
        default_thinking: false,
        default_yolo: true,
        default_plan_mode: true,
        default_editor: "vim",
        theme: "light",
        show_thinking_stream: true,
        merge_all_available_skills: true,
      };
      const diff = compareProfiles(a, b);
      expect(diff.differences.filter((d) => !d.isSame).length).toBeGreaterThan(0);
    });

    it("reports partial differences correctly", () => {
      const state = createState();
      const a = state.profiles.default;
      const b = { ...a, label: "Changed", default_thinking: false, theme: "light" };
      const diff = compareProfiles(a, b);
      const changed = diff.differences.filter((d) => !d.isSame);
      expect(changed.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("copyProfileField", () => {
    it("copies a field from source to target profile", () => {
      const state = createState();
      upsertProfile(state, {
        name: "source",
        label: "Source",
        default_model: "kimi_gateway/kimi-k2.5",
        default_thinking: false,
        default_yolo: true,
        default_plan_mode: false,
        default_editor: "",
        theme: "light",
        show_thinking_stream: false,
        merge_all_available_skills: false,
      });
      copyProfileField(state, "default", "source", "theme");
      expect(state.profiles.source.theme).toBe("dark");
    });

    it("throws when source profile is missing", () => {
      const state = createState();
      expect(() => copyProfileField(state, "missing", "default", "theme")).toThrow(/Profile not found: missing/);
    });

    it("throws when target profile is missing", () => {
      const state = createState();
      expect(() => copyProfileField(state, "default", "missing", "theme")).toThrow(/Profile not found: missing/);
    });
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

describe("exportConfig", () => {
  it("redacts API keys in exported providers", () => {
    const state = createState();
    const bundle = exportConfig(state);
    expect(bundle.version).toBe(1);
    expect(bundle.source).toBe("kimi-code-switch-gui");
    expect(bundle.exportedAt).toBeTruthy();
    expect(bundle.providers.kimi_gateway.api_key).toBe("[REDACTED]");
    expect(bundle.providers.kimi_gateway.type).toBe("kimi");
  });

  it("includes models, profiles, and mcpServers", () => {
    const state = createState();
    const bundle = exportConfig(state);
    expect(bundle.models["kimi_gateway/kimi-k2.5"]).toBeTruthy();
    expect(bundle.profiles.default).toBeTruthy();
    expect(bundle.mcpServers.context7).toBeTruthy();
  });
});

describe("validateImportData", () => {
  it("rejects non-object data", () => {
    const result = validateImportData("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects data without version", () => {
    const result = validateImportData({ providers: {} });
    expect(result.valid).toBe(false);
  });

  it("rejects data without any data fields", () => {
    const result = validateImportData({ version: 1 });
    expect(result.valid).toBe(false);
  });

  it("accepts valid data with providers", () => {
    const result = validateImportData({ version: 1, providers: {} });
    expect(result.valid).toBe(true);
  });
});

describe("getImportPreview", () => {
  it("classifies existing items as conflicts", () => {
    const state = createState();
    const data = exportConfig(state);
    const preview = getImportPreview(state, data);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    expect(preview.conflicts.some((c) => c.name === "kimi_gateway" && c.type === "provider")).toBe(true);
  });

  it("classifies new items correctly", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { new_prov: { type: "openai", base_url: "https://x", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const preview = getImportPreview(state, data);
    expect(preview.newItems.length).toBe(1);
    expect(preview.conflicts.length).toBe(0);
  });
});

describe("importConfig", () => {
  it("skip strategy does not overwrite existing", () => {
    const state = createState();
    const data = exportConfig(state);
    const next = importConfig(state, data, "skip");
    expect(next.mainConfig.providers.kimi_gateway.type).toBe("kimi");
  });

  it("overwrite strategy replaces existing", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { kimi_gateway: { type: "anthropic", base_url: "https://r", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const next = importConfig(state, data, "overwrite");
    expect(next.mainConfig.providers.kimi_gateway.type).toBe("anthropic");
  });

  it("rename strategy appends -imported", () => {
    const state = createState();
    const data = exportConfig(state);
    const next = importConfig(state, data, "rename");
    expect(next.mainConfig.providers["kimi_gateway-imported"]).toBeTruthy();
    expect(next.mainConfig.providers.kimi_gateway).toBeTruthy();
  });

  it("adds new items regardless of strategy", () => {
    const state = createState();
    const data = { version: 1, exportedAt: "", source: "t", providers: { brand_new: { type: "openai", base_url: "https://n", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    const next = importConfig(state, data, "skip");
    expect(next.mainConfig.providers.brand_new).toBeTruthy();
  });

  it("does not mutate original state", () => {
    const state = createState();
    const origCount = Object.keys(state.mainConfig.providers).length;
    const data = { version: 1, exportedAt: "", source: "t", providers: { extra: { type: "openai", base_url: "https://e", api_key: "k" } }, models: {}, profiles: {}, mcpServers: {} };
    importConfig(state, data, "skip");
    expect(Object.keys(state.mainConfig.providers).length).toBe(origCount);
  });
});

describe("toggleFavorite", () => {
  it("adds name to favorites", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    expect(state.panelSettings.favorites?.providers).toContain("kimi_gateway");
  });

  it("removes existing favorite", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    toggleFavorite(state, "provider", "kimi_gateway");
    expect(state.panelSettings.favorites?.providers).not.toContain("kimi_gateway");
  });

  it("initializes favorites if undefined", () => {
    const state = createState();
    state.panelSettings.favorites = undefined;
    toggleFavorite(state, "profile", "default");
    expect(state.panelSettings.favorites?.profiles).toContain("default");
  });

  it("handles provider and profile independently", () => {
    const state = createState();
    toggleFavorite(state, "provider", "kimi_gateway");
    toggleFavorite(state, "profile", "default");
    expect(state.panelSettings.favorites?.providers).toContain("kimi_gateway");
    expect(state.panelSettings.favorites?.profiles).toContain("default");
  });
});

describe("searchConfig", () => {
  it("finds providers by name", () => {
    const state = createState();
    const results = searchConfig(state, "kimi");
    expect(results.some((r) => r.type === "provider" && r.name === "kimi_gateway")).toBe(true);
  });

  it("finds models by ID", () => {
    const state = createState();
    const results = searchConfig(state, "k2.5");
    expect(results.some((r) => r.type === "model" && r.name === "kimi_gateway/kimi-k2.5")).toBe(true);
  });

  it("finds profiles by name", () => {
    const state = createState();
    const results = searchConfig(state, "default");
    expect(results.some((r) => r.type === "profile")).toBe(true);
  });

  it("finds MCP servers by name", () => {
    const state = createState();
    const results = searchConfig(state, "context7");
    expect(results.some((r) => r.type === "mcp" && r.name === "context7")).toBe(true);
  });

  it("returns empty for empty query", () => {
    const state = createState();
    expect(searchConfig(state, "")).toEqual([]);
    expect(searchConfig(state, "   ")).toEqual([]);
  });

  it("is case-insensitive", () => {
    const state = createState();
    const upper = searchConfig(state, "KIMI");
    const lower = searchConfig(state, "kimi");
    expect(upper.length).toBe(lower.length);
  });

  it("returns empty for no match", () => {
    const state = createState();
    expect(searchConfig(state, "zzz_nonexistent")).toEqual([]);
  });
});

describe("kimi-code only configuration", () => {
  it("ignores historical kimi-cli target requests and loads kimi-code paths", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/.env/default/config.toml": `
profile_label = "Work"
default_model = "test-model"
default_thinking = true
[providers.test]
type = "openai"
base_url = "https://api.test.com"
api_key = "sk-test"
[models.test-model]
provider = "test"
model = "gpt-4"
max_context_size = 8192
`,
    });
    const state = await loadAppState(files, { configTarget: "kimi-cli" });
    expect(state.configTarget).toBe("kimi-code");
    expect(state.configPath).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(state.profilesPath).toBe("");
    expect(state.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/default/mcp.json");
    expect(state.activeProfile).toBe("default");
    expect(state.profiles.default.label).toBe("Work");
    expect(state.profiles.default.default_model).toBe("test-model");
    expect(state.mainConfig.providers.test).toBeDefined();
  });

  it("saves Kimi Code profiles into panel settings", async () => {
    const state = createState();
    state.configTarget = "kimi-code";
    state.configPath = "~/.kimi-code-switch-gui/.env/default/config.toml";
    state.profilesPath = "";
    state.profiles.default.label = "Personal";
    const files = createMemoryFs({});

    await saveAppState(files, state);

    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toBeDefined();
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.profiles.toml"]).toBeUndefined();
    expect(files.store["/tmp/config.panel.toml"]).toContain('label = "Personal"');
  });

  it("ignores persisted historical panel config target", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": 'config_target = "kimi-cli"\n',
      "~/.kimi-code-switch-gui/.env/default/config.toml": `
default_model = "test-model"
[providers.test]
type = "openai"
base_url = "https://api.test.com"
api_key = "sk-test"
[models.test-model]
provider = "test"
model = "gpt-4"
max_context_size = 8192
`,
    });

    const state = await loadAppState(files);

    expect(state.configTarget).toBe("kimi-code");
    expect(state.configPath).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(state.profilesPath).toBe("");
    expect(state.panelSettings.config_target).toBe("kimi-code");
  });

  it("migrates legacy kimi-code profiles file into panel state", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/.env/default/config.toml": `
[providers.test]
type = "openai"
base_url = "https://api.test.com"
api_key = "sk-test"
[models.test-model]
provider = "test"
model = "gpt-4"
max_context_size = 8192
`,
      "~/.kimi-code-switch-gui/.env/default/config.profiles.toml": `
version = 1
active_profile = "work"
[profiles.work]
default_model = "test-model"
default_thinking = false
`,
    });
    const state = await loadAppState(files, { configTarget: "kimi-code" });
    expect(state.configTarget).toBe("kimi-code");
    expect(state.configPath).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(state.profilesPath).toBe("");
    expect(state.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/default/mcp.json");
    expect(state.activeProfile).toBe("work");
    expect(state.profiles.work.default_thinking).toBe(false);
    expect(state.panelSettings.profiles.work.default_thinking).toBe(false);
  });

  it("keeps Kimi Code defaults even when historical target is present", () => {
    const state = createState();
    state.configTarget = "kimi-cli";
    state.configPath = "~/.kimi-code-switch-gui/.env/default/config.toml";
    state.profilesPath = "~/.kimi-code-switch-gui/.env/default/config.profiles.toml";
    state.mcpConfigPath = "~/.kimi-code-switch-gui/.env/default/mcp.json";

    const normalized = normalizeStatePaths(state);

    expect(normalized.configPath).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(normalized.profilesPath).toBe("");
    expect(normalized.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/default/mcp.json");
    expect(normalized.panelSettings.config_path).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(normalized.panelSettings.profiles_path).toBe("");
  });

  it("moves legacy kimi-code defaults into the kimi-code directory", () => {
    const state = createState();
    state.configTarget = "kimi-code";
    state.configPath = "~/.kimi/config.toml";
    state.profilesPath = "~/.kimi/config.profiles.toml";
    state.mcpConfigPath = "~/.kimi/mcp.json";

    const normalized = normalizeStatePaths(state);

    expect(normalized.configPath).toBe("~/.kimi-code-switch-gui/.env/default/config.toml");
    expect(normalized.profilesPath).toBe("");
    expect(normalized.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/default/mcp.json");
  });

  it("keeps custom paths when config target changes", () => {
    const state = createState();
    state.configTarget = "kimi-cli";
    state.configPath = "/custom/kimi-code/config.toml";
    state.profilesPath = "/custom/kimi-code/config.profiles.toml";
    state.mcpConfigPath = "/custom/kimi-code/mcp.json";
    state.panelSettings.kimi_code_environments = [{
      id: "custom",
      name: "Custom",
      homePath: "/custom/kimi-code",
    }];
    state.panelSettings.active_kimi_code_environment_id = "custom";

    const normalized = normalizeStatePaths(state);

    expect(normalized.configPath).toBe("~/.kimi-code-switch-gui/.env/custom/config.toml");
    expect(normalized.profilesPath).toBe("");
    expect(normalized.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/custom/mcp.json");
  });

  it("loads config and MCP from the active Kimi Code environment", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_kimi_code_environment_id = "work"
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
[[kimi_code_environments]]
id = "work"
name = "Work"
homePath = "~/.kimi-code-work"
`,
      "~/.kimi-code-switch-gui/.env/work/config.toml": `
profile_label = "Work Env"
default_model = "test-model"
[providers.test]
type = "openai"
base_url = "https://api.test.com"
api_key = "sk-test"
[models.test-model]
provider = "test"
model = "gpt-4"
max_context_size = 8192
`,
      "~/.kimi-code-switch-gui/.env/work/mcp.json": buildMcpConfigDocument({
        mcpServers: {
          filesystem: {
            enabled: true,
            transport: "stdio",
            url: "",
            headers: {},
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: {},
          },
        },
      }),
    });

    const state = await loadAppState(files);

    expect(state.panelSettings.active_kimi_code_environment_id).toBe("work");
    expect(state.configPath).toBe("~/.kimi-code-switch-gui/.env/work/config.toml");
    expect(state.mcpConfigPath).toBe("~/.kimi-code-switch-gui/.env/work/mcp.json");
    expect(state.profiles.default.label).toBe("Work Env");
    expect(state.mcpConfig.mcpServers.filesystem).toBeDefined();
  });

  it("does not leak legacy global profiles or MCP servers into a new Kimi Code environment", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_profile = "old"
active_kimi_code_environment_id = "env-2"
[profiles.old]
label = "Old Env"
default_model = "old-provider/old-model"
default_thinking = true
[mcp_servers.old-server]
transport = "stdio"
command = "old-command"
args = []
env = {}
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
[[kimi_code_environments]]
id = "env-2"
name = "New Env"
homePath = "~/.kimi-code-2"
`,
      "~/.kimi-code-switch-gui/.env/env-2/config.toml": `
profile_label = "New Env"
default_model = "new-provider/new-model"
[providers.new-provider]
type = "openai"
base_url = "https://api.new.test"
api_key = "sk-new"
[models."new-provider/new-model"]
provider = "new-provider"
model = "new-model"
max_context_size = 8192
`,
    });

    const state = await loadAppState(files);

    expect(Object.keys(state.profiles)).toEqual(["default"]);
    expect(state.profiles.default.label).toBe("New Env");
    expect(state.profiles.default.default_model).toBe("new-provider/new-model");
    expect(state.mcpConfig.mcpServers["old-server"]).toBeUndefined();
  });

  it("loads an empty model configuration for a new Kimi Code environment with empty config", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_profile = "old"
active_kimi_code_environment_id = "env-2"
[profiles.old]
label = "Old Env"
default_model = "old-provider/old-model"
default_thinking = true
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
[[kimi_code_environments]]
id = "env-2"
name = "New Env"
homePath = "~/.kimi-code-2"
`,
      "~/.kimi-code-switch-gui/.env/env-2/config.toml": `
profile_label = ""
default_model = ""
models = { }
providers = { }
`,
    });

    const state = await loadAppState(files);

    expect(state.mainConfig.models).toEqual({});
    expect(state.mainConfig.providers).toEqual({});
    expect(state.profiles).toEqual({});
    expect(state.activeProfile).toBe("");
  });

  it("uses a copied environment main config when the new environment config file is empty", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_kimi_code_environment_id = "env-2"
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
[[kimi_code_environments]]
id = "env-2"
name = "Copied Env"
homePath = "~/.kimi-code-2"
[kimi_code_environments.mainConfig]
profile_label = "Copied Profile"
default_model = "copy-provider/copy-model"
default_thinking = true
default_yolo = false
default_plan_mode = false
default_editor = ""
theme = "dark"
show_thinking_stream = false
merge_all_available_skills = false
hooks = []
[kimi_code_environments.mainConfig.providers.copy-provider]
type = "openai"
base_url = "https://api.copy.test"
api_key = "sk-copy"
[kimi_code_environments.mainConfig.models."copy-provider/copy-model"]
provider = "copy-provider"
model = "copy-model"
max_context_size = 8192
capabilities = ["completion"]
`,
      "~/.kimi-code-switch-gui/.env/env-2/config.toml": `
profile_label = ""
default_model = ""
models = { }
providers = { }
`,
    });

    const state = await loadAppState(files);

    expect(state.mainConfig.providers["copy-provider"].base_url).toBe("https://api.copy.test");
    expect(state.mainConfig.models["copy-provider/copy-model"].provider).toBe("copy-provider");
    expect(state.profiles.default.label).toBe("Copied Profile");
    expect(state.profiles.default.default_model).toBe("copy-provider/copy-model");
  });

  it("drops stale empty default profile snapshots from empty Kimi Code environments", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_kimi_code_environment_id = "env-2"
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
[[kimi_code_environments]]
id = "env-2"
name = "New Env"
homePath = "~/.kimi-code-2"
activeProfile = "default"
profiles = { default = { label = "Default", default_model = "", default_thinking = true, default_yolo = false, default_plan_mode = false, default_editor = "", theme = "dark", show_thinking_stream = false, merge_all_available_skills = false } }
`,
      "~/.kimi-code-switch-gui/.env/env-2/config.toml": `
profile_label = ""
default_model = ""
models = { }
providers = { }
`,
    });

    const state = await loadAppState(files);

    expect(state.profiles).toEqual({});
    expect(state.activeProfile).toBe("");
  });

  it("keeps legacy global profiles and MCP servers for the default Kimi Code environment", async () => {
    const files = createMemoryFs({
      "~/.kimi-code-switch-gui/config.panel.toml": `
config_target = "kimi-code"
active_profile = "old"
active_kimi_code_environment_id = "default"
[profiles.old]
label = "Old Env"
default_model = "old-provider/old-model"
default_thinking = true
[mcp_servers.old-server]
transport = "stdio"
command = "old-command"
args = []
env = {}
[[kimi_code_environments]]
id = "default"
name = "Default"
homePath = "~/.kimi-code"
`,
      "~/.kimi-code-switch-gui/.env/default/config.toml": `
[providers.old-provider]
type = "openai"
base_url = "https://api.old.test"
api_key = "sk-old"
[models."old-provider/old-model"]
provider = "old-provider"
model = "old-model"
max_context_size = 8192
`,
    });

    const state = await loadAppState(files);

    expect(state.activeProfile).toBe("old");
    expect(state.profiles.old.label).toBe("Old Env");
    expect(state.mcpConfig.mcpServers["old-server"]).toBeDefined();
  });

  it("stores main config, profiles and MCP servers in the active Kimi Code environment snapshot", () => {
    const state = createState();
    state.panelSettings.kimi_code_environments = [
      {
        id: "default",
        name: "Default",
        homePath: "~/.kimi-code",
      },
      {
        id: "work",
        name: "Work",
        homePath: "~/.kimi-code-work",
      },
    ];
    state.panelSettings.active_kimi_code_environment_id = "work";

    const normalized = normalizeStatePaths(state);
    const workEnvironment = normalized.panelSettings.kimi_code_environments?.find((environment) => environment.id === "work");

    expect(workEnvironment?.profiles?.default.default_model).toBe("kimi_gateway/kimi-k2.5");
    expect(workEnvironment?.mainConfig?.providers.kimi_gateway.base_url).toBe("https://example.test/v1");
    expect(workEnvironment?.mainConfig?.models["kimi_gateway/kimi-k2.5"].model).toBe("kimi-k2.5");
    expect(workEnvironment?.activeProfile).toBe("default");
    expect(workEnvironment?.mcpServers?.context7.transport).toBe("streamable-http");
    expect(normalized.panelSettings.profiles.default.default_model).toBe("kimi_gateway/kimi-k2.5");
  });

  it("does not create a kimi-code profiles file when saving", async () => {
    const state = createState();
    state.configTarget = "kimi-code";
    state.configPath = "~/.kimi-code-switch-gui/.env/default/config.toml";
    state.profilesPath = "~/.kimi-code-switch-gui/.env/default/config.profiles.toml";
    const files = createMemoryFs({});
    await saveAppState(files, state);
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.toml"]).toBeDefined();
    expect(files.store["~/.kimi-code-switch-gui/.env/default/config.profiles.toml"]).toBeUndefined();
    expect(files.store["/tmp/config.panel.toml"]).toContain("active_profile");
  });

  it("persists configTarget in panelSettings", () => {
    const settings = createDefaultPanelSettings("/tmp/config.toml", "/tmp/panel.toml");

    const doc = buildPanelSettingsDocument(settings);
    expect(doc).toContain('config_target = "kimi-code"');
  });
});
